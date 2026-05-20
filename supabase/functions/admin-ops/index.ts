//x
// Supabase Edge Function: admin-ops
//
// Server-side admin operations that used to run with supabaseAdmin on the
// client. Moving these here means the service_role key stays in Supabase
// Secrets — never bundled into the mobile APK.
//
// Supported actions (body.action):
//   - create_institute         { name, city, adminId }
//   - create_school            { name, city, adminId }
//   - create_user              { code, role, fullName, instituteId, childrenIds?, classIds? }
//   - reset_user_code          { userId, newCode, reason? }
//   - reset_institute_code     { instituteId, newCode }
//   - change_institute_code    { instituteId, newCode }   (alias of reset_institute_code)
//   - get_institute_admin_code { instituteId }
//   - delete_user              { userId }
//   - freeze_user              { userId }
//   - unfreeze_user            { userId }
//   - bulk_create_teachers     { teachers, institutionId, institutionType, createdBy }
//   - bulk_create_students     { students, parents, institutionId, institutionType, createdBy }
//
// Auth model:
//   Caller must present a valid Supabase JWT. The function resolves the caller
//   from the JWT (not from any client-supplied field) and authorizes based on
//   enrollments.role ∈ {admin, institute}:
//     - role='admin' (platform admin): can operate on any institute
//     - role='institute': can only operate on their own institute
//   Any other role is rejected.
//
// Invocation (from the app):
//   supabase.functions.invoke('admin-ops', { body: { action, ... } })

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { safeError } from '../_shared/safeError.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

const DEFAULT_SUBJECTS = [
  'رياضيات', 'اللغة العربية', 'اللغة الإنكليزية', 'العلوم',
  'الفيزياء', 'الكيمياء', 'الأحياء', 'التاريخ', 'الجغرافيا',
  'التربية الإسلامية', 'التربية الوطنية', 'التربية الفنية',
  'التربية الرياضية', 'الحاسوب', 'الاقتصاد', 'الأدب العربي',
];
const DEFAULT_CLASSES = ['Group A', 'Group B', 'Group C', 'Group D', 'Group E'];
const SCHOOL_STAGES = [
  { name: 'الابتدائية', order: 1, grades: ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'] },
  { name: 'المتوسطة', order: 2, grades: ['الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'] },
  { name: 'الإعدادية', order: 3, grades: ['الرابع الإعدادي', 'الخامس الإعدادي', 'السادس الإعدادي'] },
];
const SCHOOL_SUBJECTS = [
  'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنكليزية', 'الرياضيات',
  'العلوم', 'الفيزياء', 'الكيمياء', 'الأحياء', 'التاريخ', 'الجغرافيا',
  'التربية الوطنية', 'الحاسوب', 'التربية الرياضية', 'التربية الفنية',
];

interface CallerCtx {
  userId: string;
  role: string;             // 'admin' | 'institute' | ...
  instituteId: string | null;
}

async function resolveCaller(req: Request, serviceClient: SupabaseClient): Promise<CallerCtx> {
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) throw new Error('غير مصرح — توكن مفقود');

  // Use the user's JWT to resolve their identity (authoritative, signed).
  const { data: userRes, error: userErr } = await serviceClient.auth.getUser(jwt);
  if (userErr || !userRes?.user) throw new Error('غير مصرح — توكن غير صالح');

  const userId = userRes.user.id;

  // Resolve role + institute from enrollments (service role bypasses RLS).
  // Prefer an 'admin' enrollment (platform admin) if one exists — else the
  // first active enrollment (institute/teacher/etc).
  const { data: rows } = await serviceClient
    .from('enrollments')
    .select('role, institute_id, status')
    .eq('user_id', userId)
    .eq('status', 'active');

  const enrollments = (rows || []) as Array<{ role: string; institute_id: string | null }>;
  // Platform admin: `role='admin'` AND `institute_id IS NULL`. The NULL check
  // is critical — without it, an institute-scoped row that mistakenly has
  // role='admin' (orphan migration data, manual SQL slip) would silently
  // elevate the caller to platform admin.
  const platformAdmin = enrollments.find((r) => r.role === 'admin' && r.institute_id === null);
  if (platformAdmin) {
    return { userId, role: 'admin', instituteId: null };
  }
  const instituteAdmin = enrollments.find((r) => r.role === 'institute');
  if (instituteAdmin) {
    return { userId, role: 'institute', instituteId: instituteAdmin.institute_id };
  }
  // Other roles can also be reflected (never authorized for admin ops below).
  const first = enrollments[0];
  return { userId, role: first?.role || 'none', instituteId: first?.institute_id || null };
}

function gateAdmin(caller: CallerCtx, targetInstituteId: string | null) {
  if (caller.role === 'admin') return; // platform admin: anywhere
  if (caller.role === 'institute') {
    if (targetInstituteId && caller.instituteId !== targetInstituteId) {
      throw new Error('غير مصرح — لا يمكنك إدارة مؤسسة أخرى');
    }
    return;
  }
  throw new Error('غير مصرح — صلاحيات إدارية مطلوبة');
}

function normalizeCode(raw: string): string {
  return (raw || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function codeToEmail(code: string): string {
  return `${code.toLowerCase()}@kaiplatform.app`;
}

// UUID validation — used to gate any client-supplied "id" before it is passed
// to PostgREST or used in string interpolation. A bare length check (>= 36)
// passed garbage like "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

// ───────────────────────────────────────────────────────────────────────
// Action handlers
// ───────────────────────────────────────────────────────────────────────

async function createInstitute(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { name: string; city: string; adminId?: string },
) {
  // Only platform admin can create new institutes.
  if (caller.role !== 'admin') throw new Error('غير مصرح — المدير العام فقط ينشئ مؤسسات');

  const name = (body.name || '').trim();
  const city = (body.city || '').trim();
  if (!name) throw new Error('اسم المؤسسة مطلوب');

  const { data: inst, error: instErr } = await svc
    .from('institutes')
    .insert({ name, city, admin_id: (isUuid(body.adminId) ? body.adminId : caller.userId), type: 'institute' })
    .select()
    .single();
  if (instErr) throw new Error(instErr.message);

  const { data: generatedCode, error: genErr } = await svc.rpc('generate_unique_code', { p_length: 6 });
  if (genErr || !generatedCode) {
    await svc.from('institutes').delete().eq('id', inst.id);
    throw new Error('فشل توليد رمز الإدارة: ' + (genErr?.message || 'unknown'));
  }

  const code = generatedCode as string;
  const email = codeToEmail(code);

  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email, password: code.toUpperCase(), email_confirm: true,
  });
  if (authErr) {
    await svc.from('institutes').delete().eq('id', inst.id);
    throw new Error('فشل إنشاء حساب الإدارة: ' + authErr.message);
  }

  if (authData.user) {
    const { error: codeErr } = await svc.rpc('register_user_code', {
      p_user_id: authData.user.id,
      p_code: code,
      p_institute_id: inst.id,
    });
    if (codeErr) {
      await svc.auth.admin.deleteUser(authData.user.id).catch(() => {});
      await svc.from('institutes').delete().eq('id', inst.id);
      throw new Error('فشل تسجيل الرمز: ' + codeErr.message);
    }
    // institute_id on the users row is consumed by the legacy
    // assertCallerCanAdminInstitute gate in services/api.ts — if it's NULL,
    // the admin can't manage their own institute. Enrollments is still the
    // source of truth, but the mirror is load-bearing here.
    await svc.from('users').insert({
      id: authData.user.id, role: 'institute', full_name: `إدارة ${name}`, institute_id: inst.id,
    });
    await svc.from('enrollments').insert({
      user_id: authData.user.id, institute_id: inst.id, role: 'institute', status: 'active',
    });
  }

  await svc.from('classes').insert(
    DEFAULT_CLASSES.map((n) => ({ name: n, institute_id: inst.id })),
  );
  await svc.from('subjects').insert(
    DEFAULT_SUBJECTS.map((n) => ({ institute_id: inst.id, name: n })),
  );

  return { ...inst, adminCode: code };
}

async function createSchool(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { name: string; city: string; adminId?: string; stages?: string[] },
) {
  if (caller.role !== 'admin') throw new Error('غير مصرح — المدير العام فقط ينشئ مدارس');

  const name = (body.name || '').trim();
  const city = (body.city || '').trim();
  if (!name) throw new Error('اسم المدرسة مطلوب');

  // Filter stages to those the admin actually picked. Falls back to all stages
  // (legacy behavior) if body.stages is omitted or empty.
  const picked = Array.isArray(body.stages) && body.stages.length > 0
    ? SCHOOL_STAGES.filter((s) => body.stages!.includes(s.name))
    : SCHOOL_STAGES;
  if (picked.length === 0) throw new Error('اختر مرحلة واحدة على الأقل');

  const { data: school, error } = await svc
    .from('institutes')
    .insert({ name, city, admin_id: (body.adminId && body.adminId.length >= 36 ? body.adminId : caller.userId), type: 'school' })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Pre-populate stages + grades (only the ones the admin picked).
  for (const s of picked) {
    const { data: stage } = await svc
      .from('stages')
      .insert({ institute_id: school.id, name: s.name, order_num: s.order })
      .select()
      .single();
    if (stage) {
      const gradeRows = s.grades.map((g, i) => ({
        stage_id: stage.id, institute_id: school.id, name: g, order_num: i + 1,
      }));
      await svc.from('grades').insert(gradeRows);
    }
  }

  await svc.from('subjects').insert(
    SCHOOL_SUBJECTS.map((n) => ({ institute_id: school.id, name: n })),
  );

  // Generate admin code + auth user (same pattern as createInstitute).
  const { data: generatedCode, error: genErr } = await svc.rpc('generate_unique_code', { p_length: 6 });
  if (genErr || !generatedCode) {
    // Don't rollback — structure already exists. Operator can assign code later.
    return { ...school, adminCode: null, warning: 'فشل توليد الرمز — حاول تعيينه يدوياً' };
  }

  const code = generatedCode as string;
  const email = codeToEmail(code);
  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email, password: code.toUpperCase(), email_confirm: true,
  });
  if (authErr || !authData.user) {
    return { ...school, adminCode: null, warning: 'فشل إنشاء حساب الإدارة: ' + (authErr?.message || 'unknown') };
  }

  const { error: codeErr } = await svc.rpc('register_user_code', {
    p_user_id: authData.user.id,
    p_code: code,
    p_institute_id: school.id,
  });
  if (codeErr) {
    await svc.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return { ...school, adminCode: null, warning: 'فشل تسجيل الرمز: ' + codeErr.message };
  }

  // Mirror institute_id on users row — see note in createInstitute above.
  await svc.from('users').insert({
    id: authData.user.id, role: 'institute', full_name: `إدارة ${name}`, institute_id: school.id,
  });
  await svc.from('enrollments').insert({
    user_id: authData.user.id, institute_id: school.id, role: 'institute', status: 'active',
  });

  return { ...school, adminCode: code };
}

async function createUser(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: {
    code: string; role: string; fullName: string; instituteId: string;
    childrenIds?: string[]; classIds?: string[];
  },
) {
  gateAdmin(caller, body.instituteId || null);

  const normalizedCode = normalizeCode(body.code);
  // Supabase Auth requires password >= 6 chars; login code IS the password, so enforce 6.
  if (normalizedCode.length < 6) throw new Error('الرمز قصير جداً — 6 أحرف على الأقل');
  const email = codeToEmail(normalizedCode);
  const fullName = (body.fullName || '').trim();
  if (!fullName) throw new Error('الاسم مطلوب');
  if (!body.role) throw new Error('الدور مطلوب');

  const ALLOWED_ROLES = new Set([
    'student', 'teacher', 'parent', 'institute', 'institute_admin', 'cafeteria', 'medical',
  ]);
  if (!ALLOWED_ROLES.has(body.role)) {
    throw new Error('دور غير مسموح');
  }
  if (body.instituteId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.instituteId)) {
    throw new Error('معرّف المعهد غير صالح');
  }

  // Uniqueness pre-check (belt-and-suspenders with Auth).
  const { data: isAvailable } = await svc.rpc('check_code_available', { p_code: normalizedCode });
  if (isAvailable === false) throw new Error('هذا الرمز مستخدم بالفعل — اختر رمزاً آخر');

  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email, password: normalizedCode, email_confirm: true,
  });
  if (authError) {
    if (authError.message?.includes('already')) throw new Error('هذا الرمز مستخدم بالفعل');
    throw new Error(authError.message);
  }
  const userId = authData.user?.id;
  if (!userId) throw new Error('فشل إنشاء الحساب');

  const { error: codeErr } = await svc.rpc('register_user_code', {
    p_user_id: userId,
    p_code: normalizedCode,
    p_institute_id: body.instituteId || null,
  });
  if (codeErr) {
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error('فشل تسجيل الرمز — ' + codeErr.message);
  }

  // Mirror institute_id onto the users row when an institute is being assigned.
  // This makes upload-media's institute resolver hit the fast path (users
  // table lookup) instead of relying on the enrollments fallback, which has
  // bitten cafeteria-role avatar uploads in the past (see save_profile_pic
  // migration). For platform-admin paths body.instituteId is null and we
  // leave users.institute_id null on purpose.
  const { error: profileError } = await svc.from('users').insert({
    id: userId,
    role: body.role,
    full_name: fullName,
    institute_id: body.instituteId || null,
  });
  if (profileError) {
    await svc.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  if (body.instituteId) {
    // Detect school + resolve section/grade when classIds actually contain section IDs
    // (new hierarchical schema). This ensures students appear in classes.tsx which reads
    // from sections/grades, not the legacy classes table.
    let sectionId: string | null = null;
    let gradeId: string | null = null;
    let legacyClassId: string | null = body.classIds?.[0] || null;

    if (body.role === 'student' && body.classIds && body.classIds.length > 0) {
      const { data: inst } = await svc
        .from('institutes').select('type').eq('id', body.instituteId).maybeSingle();
      const isSchool = (inst as any)?.type === 'school';
      if (isSchool) {
        const firstId = body.classIds[0];
        const { data: secRow } = await svc
          .from('sections').select('id, grade_id, name')
          .eq('id', firstId).eq('institute_id', body.instituteId).maybeSingle();
        if (secRow) {
          sectionId = (secRow as any).id;
          gradeId = (secRow as any).grade_id;
          // Bridge to legacy classes table for backward compat with teacher links
          const { data: gradeRow } = await svc
            .from('grades').select('name').eq('id', gradeId).maybeSingle();
          const sectionName = (secRow as any).name as string | undefined;
          const gradeName = (gradeRow as any)?.name as string | undefined;
          if (sectionName && gradeName) {
            const gradeKeyword = gradeName.trim().split(/\s+/)[0];
            const { data: candidates } = await svc
              .from('classes').select('id, name').eq('institute_id', body.instituteId);
            const match = (candidates || []).find((c: any) => {
              const n = c.name as string;
              return n.includes(gradeKeyword) && n.trim().endsWith(sectionName.trim());
            });
            legacyClassId = match ? match.id : null;
          } else {
            legacyClassId = null;
          }
        }
      }
    }

    const enrollmentRow: any = {
      user_id: userId,
      institute_id: body.instituteId,
      role: body.role,
      class_id: legacyClassId,
      status: 'active',
    };
    if (sectionId) enrollmentRow.section_id = sectionId;
    if (gradeId) enrollmentRow.grade_id = gradeId;
    await svc.from('enrollments').insert(enrollmentRow);
  }

  // student_classes is a STUDENT-only link table. Writing into it for a
  // teacher / parent / staff role makes them appear as a "student" of that
  // class everywhere downstream (getTeacherAssignmentsResolved pulls these
  // rows as legacy assignments, so a teacher ends up seeing the class they
  // were supposed to TEACH show up a second time under their own students
  // list with the wrong subject/grade). Gate by role.
  if (body.role === 'student' && body.classIds && body.classIds.length > 0 && body.instituteId) {
    // student_classes (legacy) — only insert rows that map to actual legacy class IDs.
    // For schools with new hierarchical schema, classIds are section IDs so we skip.
    const { data: inst } = await svc
      .from('institutes').select('type').eq('id', body.instituteId).maybeSingle();
    const isSchool = (inst as any)?.type === 'school';
    if (!isSchool) {
      const rows = body.classIds.map((cid) => ({
        student_id: userId, class_id: cid, institute_id: body.instituteId,
      }));
      await svc.from('student_classes').insert(rows).then(() => {}, () => {});
    } else {
      // For schools: resolve each section→legacy class if bridged, then dual-write
      const { data: sections } = await svc
        .from('sections').select('id, grade_id, name')
        .in('id', body.classIds).eq('institute_id', body.instituteId);
      const sectionRows = (sections as any[]) || [];
      if (sectionRows.length > 0) {
        const gradeIds = [...new Set(sectionRows.map((s) => s.grade_id))];
        const { data: grades } = await svc
          .from('grades').select('id, name').in('id', gradeIds);
        const gradeMap = new Map<string, string>();
        for (const g of ((grades as any[]) || [])) gradeMap.set(g.id, g.name);
        const { data: candidates } = await svc
          .from('classes').select('id, name').eq('institute_id', body.instituteId);
        const legacyRows: Array<{ student_id: string; class_id: string; institute_id: string }> = [];
        for (const s of sectionRows) {
          const gradeName = gradeMap.get(s.grade_id);
          if (!gradeName) continue;
          const gradeKeyword = gradeName.trim().split(/\s+/)[0];
          const match = (candidates || []).find((c: any) => {
            const n = c.name as string;
            return n.includes(gradeKeyword) && n.trim().endsWith((s.name as string).trim());
          });
          if (match) legacyRows.push({
            student_id: userId, class_id: match.id, institute_id: body.instituteId,
          });
        }
        if (legacyRows.length > 0) {
          await svc.from('student_classes').insert(legacyRows).then(() => {}, () => {});
        }
      }
    }
  }

  if (body.role === 'parent' && body.childrenIds?.length) {
    for (const childId of body.childrenIds) {
      await svc.from('parent_child').upsert(
        { parent_id: userId, student_id: childId },
        { onConflict: 'parent_id,student_id' },
      );
    }
  }

  return { userId, code: normalizedCode };
}

async function resetUserCode(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { userId: string; newCode: string; reason?: string },
) {
  if (!body.userId) throw new Error('userId مطلوب');
  const { data: enr } = await svc
    .from('enrollments')
    .select('institute_id')
    .eq('user_id', body.userId)
    .limit(1)
    .maybeSingle();
  const targetInstitute = (enr as any)?.institute_id || null;
  gateAdmin(caller, targetInstitute);

  const safeCode = normalizeCode(body.newCode);
  // Supabase Auth requires password >= 6 chars; login code IS the password, so enforce 6.
  if (safeCode.length < 6) throw new Error('الرمز قصير جداً — 6 أحرف على الأقل');
  const email = codeToEmail(safeCode);

  // Pre-check 1: capture the previous code so we can roll back user_codes if the
  // subsequent auth update fails (otherwise user_codes would say "new" while
  // auth.users still holds the old password — the bug behind "code reset shows
  // success but the old code keeps working").
  const { data: prevCodeRow } = await svc
    .from('user_codes')
    .select('code')
    .eq('user_id', body.userId)
    .maybeSingle();
  const previousCode = (prevCodeRow as any)?.code || null;

  // Pre-check 2: bail out early with a clean Arabic message if the new code is
  // already taken by ANOTHER user. Without this, we'd let rotate_user_code or
  // updateUserById throw an English uniqueness-violation that the outer
  // categorizer can't translate, leaving the admin staring at a generic 500.
  if (previousCode !== safeCode) {
    const { data: isAvailable } = await svc.rpc('check_code_available', { p_code: safeCode });
    if (isAvailable === false) {
      throw new Error('هذا الرمز مستخدم بالفعل من قبل مستخدم آخر — اختر رمزاً مختلفاً');
    }
  }

  const { error: rpcErr } = await svc.rpc('rotate_user_code', {
    p_user_id: body.userId,
    p_new_code: safeCode,
    p_changed_by: caller.userId,
    p_reason: body.reason || 'admin_reset',
  });
  if (rpcErr) {
    const msg = rpcErr.message || '';
    if (msg.includes('مستخدم من قبل') || msg.includes('duplicate') || msg.includes('unique')) {
      throw new Error('هذا الرمز مستخدم بالفعل من قبل مستخدم آخر');
    }
    throw new Error(msg || 'فشل تحديث الرمز');
  }

  const { error: authErr } = await svc.auth.admin.updateUserById(body.userId, {
    email, password: safeCode, email_confirm: true,
  });
  if (authErr) {
    // Revert user_codes so the row stays consistent with the auth password.
    if (previousCode) {
      await svc.rpc('rotate_user_code', {
        p_user_id: body.userId,
        p_new_code: previousCode,
        p_changed_by: caller.userId,
        p_reason: 'auth_update_failed_rollback',
      }).catch(() => {});
    }
    const msg = authErr.message || '';
    const lower = msg.toLowerCase();
    if (lower.includes('already') || lower.includes('duplicate') || lower.includes('email')) {
      throw new Error('هذا الرمز مستخدم بالفعل في النظام — اختر رمزاً آخر');
    }
    if (lower.includes('pwned') || lower.includes('leaked') || lower.includes('compromised')) {
      throw new Error('هذا الرمز ضعيف ومسرّب على الإنترنت — اختر رمزاً أقوى (مثل KAI2026)');
    }
    if (lower.includes('weak') || lower.includes('password should') || lower.includes('password must')) {
      throw new Error('الرمز ضعيف جداً — استخدم مزيج من الأحرف والأرقام (مثل KAI2026)');
    }
    if (lower.includes('rate limit') || lower.includes('too many')) {
      throw new Error('محاولات كثيرة جداً — انتظر دقيقة ثم حاول ثانية');
    }
    // Prefix with Arabic so the outer categorizer passes it through instead of
    // masking it as a generic 500 internal error.
    throw new Error(`فشل تحديث حساب التحقق: ${msg}`);
  }

  // Revoke all refresh tokens so old code stops working immediately.
  await svc.auth.admin.signOut(body.userId, 'global').catch(() => {});

  return { success: true, newCode: safeCode };
}

async function resetInstituteCode(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { instituteId: string; newCode: string },
) {
  if (!body.instituteId) throw new Error('instituteId مطلوب');
  gateAdmin(caller, body.instituteId);

  const { data: enrollments } = await svc
    .from('enrollments')
    .select('user_id')
    .eq('institute_id', body.instituteId)
    .eq('role', 'institute')
    .eq('status', 'active');

  if (!enrollments?.length) throw new Error('حساب إدارة المؤسسة غير موجود');
  const adminUserId = enrollments[0].user_id;

  // Reuse the rotate flow for correctness (updates user_codes + history).
  return await resetUserCode(svc, caller, {
    userId: adminUserId,
    newCode: body.newCode,
    reason: 'institute_code_reset',
  });
}

async function getInstituteAdminCode(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { instituteId: string },
) {
  if (!body.instituteId) throw new Error('instituteId مطلوب');
  gateAdmin(caller, body.instituteId);

  const { data: enrollments } = await svc
    .from('enrollments')
    .select('user_id')
    .eq('institute_id', body.instituteId)
    .eq('role', 'institute')
    .eq('status', 'active');

  if (!enrollments?.length) return { code: null };
  const { data } = await svc.auth.admin.getUserById(enrollments[0].user_id);
  const email = data?.user?.email || '';
  return { code: email.replace('@kaiplatform.app', '').toUpperCase() || null };
}

async function deleteAuthUser(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { userId: string },
) {
  if (!body.userId) throw new Error('userId مطلوب');
  if (body.userId === caller.userId) throw new Error('لا يمكنك حذف حسابك');

  // Resolve target's institute to gate the caller.
  const { data: enr } = await svc
    .from('enrollments')
    .select('institute_id')
    .eq('user_id', body.userId)
    .limit(1)
    .maybeSingle();
  gateAdmin(caller, (enr as any)?.institute_id || null);

  // Delete the auth user — FK cascades clean up user_codes / etc.
  const { error } = await svc.auth.admin.deleteUser(body.userId);
  if (error && !error.message?.includes('not found')) {
    throw new Error(error.message);
  }
  return { success: true };
}

async function freezeAuthUser(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { userId: string },
) {
  if (!body.userId) throw new Error('userId مطلوب');
  const { data: enr } = await svc
    .from('enrollments')
    .select('institute_id')
    .eq('user_id', body.userId)
    .limit(1)
    .maybeSingle();
  gateAdmin(caller, (enr as any)?.institute_id || null);

  // Ban for ~100 years + revoke all refresh tokens so the session dies now.
  const { error } = await svc.auth.admin.updateUserById(body.userId, {
    ban_duration: '876000h',
  });
  if (error) throw new Error(error.message);
  await svc.auth.admin.signOut(body.userId, 'global').catch(() => {});
  return { success: true };
}

async function unfreezeAuthUser(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { userId: string },
) {
  if (!body.userId) throw new Error('userId مطلوب');
  const { data: enr } = await svc
    .from('enrollments')
    .select('institute_id')
    .eq('user_id', body.userId)
    .limit(1)
    .maybeSingle();
  gateAdmin(caller, (enr as any)?.institute_id || null);

  const { error } = await svc.auth.admin.updateUserById(body.userId, {
    ban_duration: 'none',
  });
  if (error) throw new Error(error.message);
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────
// Bulk creation helpers (server-side equivalents of the old client helpers)
// ───────────────────────────────────────────────────────────────────────

type LookupTable = 'subjects' | 'stages' | 'grades' | 'sections' | 'classes';

/** Resolve-or-create a row in a lookup table scoped to an institute. Cached
 * per-call to avoid re-querying the same name repeatedly inside the loop. */
async function resolveOrCreate(
  svc: SupabaseClient,
  table: LookupTable,
  name: string,
  instituteId: string,
  extra: Record<string, any> = {},
  cache?: Map<string, string>,
): Promise<string> {
  const key = `${table}::${JSON.stringify(extra)}::${name.toLowerCase()}`;
  if (cache?.has(key)) return cache.get(key)!;

  let q = svc.from(table).select('id').eq('institute_id', instituteId).eq('name', name);
  for (const [k, v] of Object.entries(extra)) {
    if (v) q = q.eq(k, v);
  }
  const { data: existing } = await q.maybeSingle();
  if (existing && (existing as any).id) {
    cache?.set(key, (existing as any).id);
    return (existing as any).id;
  }

  const { data: created, error } = await svc
    .from(table)
    .insert({ name, institute_id: instituteId, ...extra })
    .select('id')
    .single();
  if (error || !created) {
    throw new Error(`فشل إنشاء ${table}: ${error?.message || 'غير معروف'} (${name})`);
  }
  cache?.set(key, (created as any).id);
  return (created as any).id;
}

/** Create auth user + register code + insert users-row. Mirrors the old
 * client `_bulkCreateAuthUser` exactly. Caller is already authorized. */
async function bulkCreateAuthUser(
  svc: SupabaseClient,
  code: string,
  fullName: string,
  role: string,
  instituteId: string,
  phone?: string,
): Promise<{ userId: string; code: string }> {
  const normalized = normalizeCode(code);
  // Auth password >= 6 chars; the login code IS the password.
  if (normalized.length < 6) throw new Error('الرمز قصير جداً — 6 أحرف على الأقل');
  const email = codeToEmail(normalized);

  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email, password: normalized, email_confirm: true,
    user_metadata: phone ? { phone } : {},
  });
  if (authError || !authData?.user?.id) {
    throw new Error(authError?.message || 'فشل إنشاء الحساب');
  }
  const userId = authData.user.id;

  const { error: codeErr } = await svc.rpc('register_user_code', {
    p_user_id: userId, p_code: normalized, p_institute_id: instituteId || null,
  });
  if (codeErr) {
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error('فشل تسجيل الرمز — ' + codeErr.message);
  }

  const { error: profileError } = await svc
    .from('users').insert({ id: userId, role, full_name: fullName, phone: phone || null });
  if (profileError) {
    await svc.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }
  return { userId, code: normalized };
}

/** Best-effort audit log entry. Mirrors api.logAdminAction. Failures are swallowed
 * so the bulk job continues — audit isn't worth aborting user creation for. */
async function logAdminAction(svc: SupabaseClient, data: {
  actorId: string; actorRole: string; action: string; targetType: string;
  targetId?: string; targetName?: string; instituteId?: string;
  metadata?: Record<string, any>;
}) {
  try {
    await svc.from('admin_audit_log').insert({
      actor_id: data.actorId,
      actor_role: data.actorRole,
      action: data.action,
      target_type: data.targetType,
      target_id: data.targetId || null,
      target_name: data.targetName || null,
      institute_id: data.instituteId || null,
      metadata: data.metadata || {},
    });
  } catch { /* best-effort */ }
}

interface BulkTeacherInput {
  full_name: string;
  phone: string;
  code: string;
  assignments: Array<{
    subject: string;
    class_name?: string;
    section?: string;
    level?: string;
    group?: string;
  }>;
}

async function bulkCreateTeachers(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: {
    teachers: BulkTeacherInput[];
    institutionId: string;
    institutionType: 'school' | 'institute';
    createdBy: string;
  },
) {
  if (!body.institutionId) throw new Error('institutionId مطلوب');
  if (!Array.isArray(body.teachers)) throw new Error('teachers مطلوب');
  // Defense in depth: gate caller against the target institute.
  // Platform admin: any. Institute admin: only their own institute.
  gateAdmin(caller, body.institutionId);

  const { teachers, institutionId, institutionType, createdBy } = body;
  const created: Array<{ name: string; code: string; assignments: string; userId: string }> = [];
  const failed: Array<{ name: string; reason: string }> = [];
  const cache = new Map<string, string>();

  // For schools we create a single default stage to hang grades off of.
  let defaultStageId: string | null = null;
  if (institutionType === 'school') {
    defaultStageId = await resolveOrCreate(svc, 'stages', 'المرحلة الدراسية', institutionId, {}, cache);
  }

  for (const t of teachers) {
    try {
      const { userId } = await bulkCreateAuthUser(svc, t.code, t.full_name, 'teacher', institutionId, t.phone);

      // Primary enrollment so the teacher shows up in the tenant's user list.
      await svc.from('enrollments').insert({
        user_id: userId, institute_id: institutionId, role: 'teacher',
      });

      const assignmentLabels: string[] = [];
      for (const a of (t.assignments || [])) {
        const subjectId = await resolveOrCreate(svc, 'subjects', a.subject, institutionId, {}, cache);
        const assignmentRow: any = { teacher_id: userId, institute_id: institutionId, subject_id: subjectId };

        if (institutionType === 'school') {
          if (!a.class_name || !a.section) continue;
          const gradeId = await resolveOrCreate(svc, 'grades', a.class_name, institutionId,
            { stage_id: defaultStageId }, cache);
          const sectionId = await resolveOrCreate(svc, 'sections', a.section, institutionId,
            { grade_id: gradeId }, cache);
          assignmentRow.section_id = sectionId;
          assignmentLabels.push(`${a.subject}: ${a.class_name} ${a.section}`);
        } else {
          if (!a.level || !a.group) continue;
          const stageId = await resolveOrCreate(svc, 'stages', a.level, institutionId, {}, cache);
          // Compose class name so same group label under different level/subject stays unique.
          const composedName = `${a.level} - ${a.subject} - ${a.group}`;
          const classId = await resolveOrCreate(svc, 'classes', composedName, institutionId, {}, cache);
          assignmentRow.class_id = classId;
          // stage_id kept on teacher_assignments if column exists; ignored otherwise.
          assignmentRow.stage_id = stageId;
          assignmentLabels.push(`${a.subject}: ${a.level} - ${a.group}`);
        }

        // teacher_assignments may not have stage_id — retry without it if insert fails.
        const { error: taErr } = await svc.from('teacher_assignments').insert(assignmentRow);
        if (taErr && assignmentRow.stage_id) {
          delete assignmentRow.stage_id;
          await svc.from('teacher_assignments').insert(assignmentRow);
        }
      }

      await logAdminAction(svc, {
        actorId: createdBy, actorRole: 'admin',
        action: 'bulk_create_teacher', targetType: 'user',
        targetId: userId, targetName: t.full_name, instituteId: institutionId,
        metadata: { code: t.code, phone: t.phone, assignments: assignmentLabels },
      });

      created.push({ name: t.full_name, code: t.code, assignments: assignmentLabels.join('، '), userId });
    } catch (e: any) {
      failed.push({ name: t.full_name, reason: e?.message || String(e) });
    }
  }

  return { created, failed };
}

interface BulkStudentInput {
  full_name: string;
  code: string;
  class_name?: string;
  section?: string;
  level?: string;
  subject?: string;
  group?: string;
  parent_phone: string;
  parent_name: string;
}

interface BulkParentInput {
  full_name: string;
  phone: string;
  code: string;
  children: string[];
}

async function bulkCreateStudents(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: {
    students: BulkStudentInput[];
    parents: BulkParentInput[];
    institutionId: string;
    institutionType: 'school' | 'institute';
    createdBy: string;
  },
) {
  if (!body.institutionId) throw new Error('institutionId مطلوب');
  if (!Array.isArray(body.students)) throw new Error('students مطلوب');
  if (!Array.isArray(body.parents)) throw new Error('parents مطلوب');
  // Defense in depth: gate caller against the target institute.
  gateAdmin(caller, body.institutionId);

  const { students, parents, institutionId, institutionType, createdBy } = body;
  const cache = new Map<string, string>();

  const studentsCreated: Array<{ name: string; code: string; class: string; userId: string }> = [];
  const studentsFailed: Array<{ name: string; reason: string }> = [];
  const parentsCreated: Array<{ name: string; code: string; children: string[]; phone: string; userId: string }> = [];
  const parentsFailed: Array<{ name: string; reason: string; phone: string }> = [];

  let defaultStageId: string | null = null;
  if (institutionType === 'school') {
    defaultStageId = await resolveOrCreate(svc, 'stages', 'المرحلة الدراسية', institutionId, {}, cache);
  }

  // Map parent_phone → new student user ids so we can wire parent_child links.
  const phoneToStudentIds = new Map<string, string[]>();

  // ── 1. Students ────────────────────────────────────────
  for (const s of students) {
    try {
      const { userId } = await bulkCreateAuthUser(svc, s.code, s.full_name, 'student', institutionId);

      let classIdForEnrollment: string | null = null;
      let sectionIdForEnrollment: string | null = null;
      let gradeIdForEnrollment: string | null = null;
      let classLabel = '';

      if (institutionType === 'school') {
        if (!s.class_name || !s.section) throw new Error('الصف/الشعبة مفقود');
        gradeIdForEnrollment = await resolveOrCreate(svc, 'grades', s.class_name, institutionId,
          { stage_id: defaultStageId }, cache);
        sectionIdForEnrollment = await resolveOrCreate(svc, 'sections', s.section, institutionId,
          { grade_id: gradeIdForEnrollment }, cache);
        classLabel = `${s.class_name} - ${s.section}`;
      } else {
        if (!s.level || !s.subject || !s.group) throw new Error('المرحلة/المادة/الكروب مفقود');
        const composedName = `${s.level} - ${s.subject} - ${s.group}`;
        classIdForEnrollment = await resolveOrCreate(svc, 'classes', composedName, institutionId, {}, cache);
        // Ensure subject and stage exist (used by teacher join lookups).
        await resolveOrCreate(svc, 'subjects', s.subject, institutionId, {}, cache);
        await resolveOrCreate(svc, 'stages', s.level, institutionId, {}, cache);
        classLabel = `${s.level} - ${s.group}`;
      }

      const enrollmentRow: any = {
        user_id: userId, institute_id: institutionId, role: 'student',
        class_id: classIdForEnrollment || sectionIdForEnrollment,
        section_id: sectionIdForEnrollment,
        grade_id: gradeIdForEnrollment,
      };
      const { error: enrErr } = await svc.from('enrollments').insert(enrollmentRow);
      if (enrErr) {
        // Retry without optional columns if the schema doesn't have them.
        await svc.from('enrollments').insert({
          user_id: userId, institute_id: institutionId, role: 'student',
          class_id: classIdForEnrollment || sectionIdForEnrollment,
        });
      }

      const scClassId = classIdForEnrollment || sectionIdForEnrollment;
      if (scClassId) {
        try {
          await svc.from('student_classes').insert({
            student_id: userId, class_id: scClassId, institute_id: institutionId,
          });
        } catch { /* table may use different shape on older installs */ }
      }

      // Track for parent linking.
      const arr = phoneToStudentIds.get(s.parent_phone) || [];
      arr.push(userId);
      phoneToStudentIds.set(s.parent_phone, arr);

      await logAdminAction(svc, {
        actorId: createdBy, actorRole: 'admin',
        action: 'bulk_create_student', targetType: 'user',
        targetId: userId, targetName: s.full_name, instituteId: institutionId,
        metadata: { code: s.code, class: classLabel, parent_phone: s.parent_phone },
      });

      studentsCreated.push({ name: s.full_name, code: s.code, class: classLabel, userId });
    } catch (e: any) {
      studentsFailed.push({ name: s.full_name, reason: e?.message || String(e) });
    }
  }

  // ── 2. Parents ─────────────────────────────────────────
  for (const p of parents) {
    try {
      const { userId } = await bulkCreateAuthUser(svc, p.code, p.full_name, 'parent', institutionId, p.phone);

      await svc.from('enrollments').insert({
        user_id: userId, institute_id: institutionId, role: 'parent',
      });

      const childIds = phoneToStudentIds.get(p.phone) || [];
      for (const childId of childIds) {
        try {
          await svc.from('parent_child').upsert(
            { parent_id: userId, student_id: childId },
            { onConflict: 'parent_id,student_id' },
          );
        } catch { /* best-effort */ }
      }

      await logAdminAction(svc, {
        actorId: createdBy, actorRole: 'admin',
        action: 'bulk_create_parent', targetType: 'user',
        targetId: userId, targetName: p.full_name, instituteId: institutionId,
        metadata: { code: p.code, phone: p.phone, children_count: childIds.length },
      });

      parentsCreated.push({ name: p.full_name, code: p.code, children: p.children, phone: p.phone, userId });
    } catch (e: any) {
      parentsFailed.push({ name: p.full_name, phone: p.phone, reason: e?.message || String(e) });
    }
  }

  return { studentsCreated, studentsFailed, parentsCreated, parentsFailed };
}

// ───────────────────────────────────────────────────────────────────────
// Simple CSV-shaped bulk import (Phase 3B)
// ───────────────────────────────────────────────────────────────────────
//
// Powers the paste-CSV flow on (institute)/bulk-import.tsx. The richer
// bulkCreateTeachers / bulkCreateStudents handlers above assume curated input
// (assignments, parent links, etc.); this one accepts the lowest-common-denominator
// rows the CSV form actually provides — full_name, role, code, optional phone,
// optional class_id — and creates auth user + profile + enrollment for each.
//
// Per-row failures don't abort the batch; the caller gets a structured report.

interface BulkSimpleRow {
  idx: number;
  full_name: string;
  role: 'student' | 'teacher' | 'parent';
  code: string;
  phone?: string;
  class_id?: string;
}

async function bulkImportSimple(
  svc: SupabaseClient,
  caller: CallerCtx,
  body: { institutionId: string; rows: BulkSimpleRow[]; createdBy?: string },
) {
  if (!body.institutionId) throw new Error('institutionId مطلوب');
  if (!Array.isArray(body.rows)) throw new Error('rows مطلوب');
  gateAdmin(caller, body.institutionId);

  const ALLOWED_ROLES = new Set(['student', 'teacher', 'parent']);
  // Hard cap so a runaway client can't tie up the function for minutes.
  const MAX_ROWS = 500;
  if (body.rows.length > MAX_ROWS) {
    throw new Error(`عدد الصفوف يتجاوز الحد المسموح (${MAX_ROWS})`);
  }

  const created: Array<{ idx: number; full_name: string; userId: string; code: string }> = [];
  const failed: Array<{ idx: number; full_name: string; reason: string }> = [];

  for (const row of body.rows) {
    try {
      const fullName = (row.full_name || '').trim();
      if (!fullName) throw new Error('الاسم مطلوب');
      if (!ALLOWED_ROLES.has(row.role)) throw new Error('دور غير مسموح');

      const { userId, code } = await bulkCreateAuthUser(
        svc, row.code, fullName, row.role, body.institutionId, row.phone,
      );

      // Mirror institute_id onto the users row so downstream resolvers (avatar
      // uploads, push targeting) hit the fast path. Same pattern as createUser.
      await svc.from('users').update({ institute_id: body.institutionId }).eq('id', userId);

      const enrollmentRow: any = {
        user_id: userId, institute_id: body.institutionId, role: row.role,
      };
      // Legacy classes table — optional. Section/grade linkage for schools is
      // a richer flow handled by the dedicated bulk handlers; CSV import keeps
      // it simple and skips class assignment unless the validate RPC already
      // resolved a class_id for this row.
      if (row.class_id) enrollmentRow.class_id = row.class_id;
      await svc.from('enrollments').insert(enrollmentRow);

      await logAdminAction(svc, {
        actorId: body.createdBy || caller.userId,
        actorRole: 'admin',
        action: 'bulk_import_simple',
        targetType: 'user',
        targetId: userId,
        targetName: fullName,
        instituteId: body.institutionId,
        metadata: { role: row.role, code, idx: row.idx },
      });

      created.push({ idx: row.idx, full_name: fullName, userId, code });
    } catch (e: any) {
      failed.push({ idx: row.idx, full_name: row.full_name || '—', reason: e?.message || String(e) });
    }
  }

  return { total: body.rows.length, created, failed };
}

// ───────────────────────────────────────────────────────────────────────
// Router
// ───────────────────────────────────────────────────────────────────────

// Per-action rate limit caps. Keys are action strings; values are
// [max calls, window seconds]. Actions not listed get the default below.
// Limits are per-caller (resolved from JWT, not body).
const RATE_LIMITS: Record<string, [number, number]> = {
  create_user:           [10, 60],     // 10/min — single creation
  bulk_create_teachers:  [3,  300],    // 3 per 5min — heavy job
  bulk_create_students:  [3,  300],    // 3 per 5min — heavy job
  bulk_import_simple:    [5,  300],    // 5 per 5min — CSV paste import
  create_institute:      [5,  3600],   // 5/hour — platform admin only
  create_school:         [5,  3600],
  reset_user_code:       [20, 60],     // 20/min — admin rotating codes
  reset_institute_code:  [5,  60],
  change_institute_code: [5,  60],
  delete_user:           [20, 60],
  freeze_user:           [30, 60],
  unfreeze_user:         [30, 60],
  get_institute_admin_code: [60, 60],
};
const DEFAULT_RATE_LIMIT: [number, number] = [60, 60];

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const svc = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const action = body?.action as string | undefined;
  if (!action) {
    return new Response(JSON.stringify({ error: 'action_required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let caller: CallerCtx;
  try {
    caller = await resolveCaller(req, svc);
  } catch (e: any) {
    return new Response(JSON.stringify(safeError(e, 'admin-ops:auth', 'unauthorized')), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Rate limit per-caller per-action. Caller is resolved from JWT above so the
  // identifier can't be spoofed. Fail-closed: if RPC errors, treat as denied.
  const [max, windowSecs] = RATE_LIMITS[action] || DEFAULT_RATE_LIMIT;
  const rlKey = `admin-ops:${action}`;
  const allowed = await enforceRateLimit(svc, rlKey, caller.userId, max, windowSecs);
  if (!allowed) {
    return new Response(
      JSON.stringify(safeError(new Error('rate_limited'), { scope: rlKey, callerId: caller.userId }, 'rate_limited')),
      { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  try {
    let result: any;
    switch (action) {
      case 'create_institute':
        result = await createInstitute(svc, caller, body);
        break;
      case 'create_school':
        result = await createSchool(svc, caller, body);
        break;
      case 'create_user':
        result = await createUser(svc, caller, body);
        break;
      case 'reset_user_code':
        result = await resetUserCode(svc, caller, body);
        break;
      case 'reset_institute_code':
      case 'change_institute_code':
        result = await resetInstituteCode(svc, caller, body);
        break;
      case 'get_institute_admin_code':
        result = await getInstituteAdminCode(svc, caller, body);
        break;
      case 'delete_user':
        result = await deleteAuthUser(svc, caller, body);
        break;
      case 'freeze_user':
        result = await freezeAuthUser(svc, caller, body);
        break;
      case 'unfreeze_user':
        result = await unfreezeAuthUser(svc, caller, body);
        break;
      case 'bulk_create_teachers':
        result = await bulkCreateTeachers(svc, caller, body);
        break;
      case 'bulk_create_students':
        result = await bulkCreateStudents(svc, caller, body);
        break;
      case 'bulk_import_simple':
        result = await bulkImportSimple(svc, caller, body);
        break;
      default:
        return new Response(JSON.stringify({ error: `unknown_action:${action}`, code: 'invalid_input' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
    }
    return new Response(JSON.stringify({ data: result }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    // Categorize common errors into public codes. For non-internal codes we
    // ALSO pass the original Arabic message through — but ONLY when the
    // message starts with an Arabic character. Postgres/Auth/system errors
    // are always English, so this gate ensures we never leak DB hints
    // (e.g. "relation users not found", "duplicate key value") to clients.
    // Defense-in-depth: even an internal Arabic translation drift can't
    // accidentally expose tenant data because the safeError mask kicks in.
    const msg = e?.message || '';
    const ARABIC_START = /^[\u0600-\u06FF]/; // Arabic block (Mushaf + Supplement)
    const isOurArabicMessage = ARABIC_START.test(msg);

    let code: 'unauthorized' | 'forbidden' | 'invalid_input' | 'conflict' | 'not_found' | 'internal' = 'internal';
    let status = 500;
    if (msg.startsWith('غير مصرح')) {
      code = msg.includes('صلاحيات') ? 'forbidden' : 'unauthorized';
      status = code === 'forbidden' ? 403 : 401;
    } else if (msg.includes('مطلوب') || msg.includes('قصير') || msg.includes('غير صالح')) {
      code = 'invalid_input';
      status = 400;
    } else if (msg.includes('مستخدم بالفعل') || msg.includes('مستخدم من قبل')) {
      code = 'conflict';
      status = 409;
    } else if (msg.includes('غير موجود')) {
      code = 'not_found';
      status = 404;
    } else if (msg.startsWith('فشل') || msg.startsWith('الرمز')) {
      // Surface action-level failures (e.g. "فشل تحديث حساب التحقق: <auth msg>")
      // and weak-password rejections so the admin sees the actual reason instead
      // of a generic "حاول ثانية". Treated as 400 since they're client-fixable.
      code = 'invalid_input';
      status = 400;
    }

    // Pass through only when (a) we have a known non-internal code AND
    // (b) the message demonstrably started with Arabic — meaning it was
    // thrown by our own code, not by Postgres/Auth/Deno.
    if (code !== 'internal' && isOurArabicMessage) {
      console.error(`[admin-ops:${action}] caller=${caller.userId}`, msg);
      return new Response(
        JSON.stringify({ error: msg, code }),
        { status, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }
    // Fallback: mask the message (covers internal errors AND English/system
    // errors that happened to trip a keyword check above).
    return new Response(
      JSON.stringify(safeError(e, { scope: `admin-ops:${action}`, callerId: caller.userId }, code)),
      { status, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
