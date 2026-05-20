/**
 * 🌱 سكريبت بيانات تجريبية لـ kai-mobile
 * يُشغّل بـ: npx ts-node scripts/seed-test-data.ts
 * أو: npx tsx scripts/seed-test-data.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mrytoccwpgcyirjrpanu.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_ROLE_KEY) {
  console.error('❌ يجب تعيين SUPABASE_SERVICE_ROLE_KEY');
  console.error('شغّل هيج: SUPABASE_SERVICE_ROLE_KEY=your_key npx tsx scripts/seed-test-data.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helper: إنشاء مستخدم ──
async function createUser(code: string, fullName: string, role: string, instituteId: string, classId?: string) {
  const email = `${code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@kaiplatform.app`;

  // Check if user already exists
  const { data: existing } = await supabase.from('users').select('id').eq('full_name', fullName).limit(1);
  if (existing && existing.length > 0) {
    console.log(`  ⏭️  ${fullName} موجود مسبقاً`);
    return existing[0].id;
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: code.toUpperCase(),
    email_confirm: true,
  });

  if (authError) {
    if (authError.message?.includes('already')) {
      console.log(`  ⏭️  ${code} — الكود مستخدم مسبقاً`);
      // Get existing user
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const found = existingUsers?.users?.find(u => u.email === email);
      return found?.id || null;
    }
    console.error(`  ❌ فشل إنشاء ${fullName}: ${authError.message}`);
    return null;
  }

  const userId = authData.user?.id;
  if (!userId) return null;

  // Profile
  await supabase.from('users').insert({ id: userId, role, full_name: fullName });

  // Enrollment
  await supabase.from('enrollments').insert({
    user_id: userId, institute_id: instituteId, role,
    class_id: classId || null,
  });

  // Student-class link
  if (role === 'student' && classId) {
    await supabase.from('student_classes').insert({
      student_id: userId, class_id: classId, institute_id: instituteId,
    }).catch(() => {});
  }

  console.log(`  ✅ ${fullName} (${role}) — كود: ${code}`);
  return userId;
}

// ── Main ──
async function seed() {
  console.log('🌱 بدء إنشاء البيانات التجريبية...\n');

  // ═══════════════════════════════════════
  // 1. المؤسسة
  // ═══════════════════════════════════════
  console.log('📌 1. إنشاء المؤسسة...');
  let instituteId: string;

  const { data: existingInst } = await supabase
    .from('institutes')
    .select('id')
    .eq('name', 'مدرسة الاختبار النموذجية')
    .limit(1);

  if (existingInst && existingInst.length > 0) {
    instituteId = existingInst[0].id;
    console.log(`  ⏭️  المؤسسة موجودة: ${instituteId}`);
  } else {
    const { data: inst, error } = await supabase
      .from('institutes')
      .insert({
        name: 'مدرسة الاختبار النموذجية',
        type: 'school',
        city: 'بغداد',
        phone: '07701234567',
      })
      .select()
      .single();
    if (error) { console.error('❌ فشل إنشاء المؤسسة:', error.message); return; }
    instituteId = inst.id;
    console.log(`  ✅ المؤسسة: ${instituteId}`);
  }

  // ═══════════════════════════════════════
  // 2. الصفوف
  // ═══════════════════════════════════════
  console.log('\n📌 2. إنشاء الصفوف...');
  const classNames = ['الصف الأول', 'الصف الثاني', 'الصف الثالث', 'الصف الرابع'];
  const classIds: string[] = [];

  for (const name of classNames) {
    const { data: existing } = await supabase
      .from('classes')
      .select('id')
      .eq('name', name)
      .eq('institute_id', instituteId)
      .limit(1);

    if (existing && existing.length > 0) {
      classIds.push(existing[0].id);
      console.log(`  ⏭️  ${name} موجود`);
    } else {
      const { data, error } = await supabase
        .from('classes')
        .insert({ name, institute_id: instituteId })
        .select()
        .single();
      if (error) { console.error(`  ❌ ${name}: ${error.message}`); continue; }
      classIds.push(data.id);
      console.log(`  ✅ ${name}`);
    }
  }

  // ═══════════════════════════════════════
  // 3. المستخدمون
  // ═══════════════════════════════════════
  console.log('\n📌 3. إنشاء المستخدمين...');

  // Admin
  const adminId = await createUser('TEST01', 'أحمد المدير (اختبار)', 'admin', instituteId);

  // Institute manager
  const instManagerId = await createUser('TEST02', 'محمد المدير العام (اختبار)', 'institute', instituteId);

  // Teachers (3)
  const teacherIds: (string | null)[] = [];
  const teachers = [
    { code: 'TEST10', name: 'أستاذ علي (اختبار)' },
    { code: 'TEST11', name: 'أستاذة فاطمة (اختبار)' },
    { code: 'TEST12', name: 'أستاذ حسن (اختبار)' },
  ];
  for (const t of teachers) {
    const id = await createUser(t.code, t.name, 'teacher', instituteId);
    teacherIds.push(id);
  }

  // Students (10)
  const studentIds: (string | null)[] = [];
  for (let i = 1; i <= 10; i++) {
    const code = `TEST${20 + i}`;
    const classId = classIds[(i - 1) % classIds.length]; // توزيع على الصفوف
    const id = await createUser(code, `طالب ${i} (اختبار)`, 'student', instituteId, classId);
    studentIds.push(id);
  }

  // Parents (5) — كل ولي أمر مرتبط بـ 2 طلاب
  const parentIds: (string | null)[] = [];
  for (let i = 1; i <= 5; i++) {
    const code = `TEST${40 + i}`;
    const id = await createUser(code, `ولي أمر ${i} (اختبار)`, 'parent', instituteId);
    parentIds.push(id);

    // ربط بالطلاب
    if (id) {
      const childIdx1 = (i - 1) * 2;
      const childIdx2 = (i - 1) * 2 + 1;
      if (studentIds[childIdx1]) {
        await supabase.from('parent_child').upsert(
          { parent_id: id, student_id: studentIds[childIdx1] },
          { onConflict: 'parent_id,student_id' }
        ).catch(() => {});
      }
      if (studentIds[childIdx2]) {
        await supabase.from('parent_child').upsert(
          { parent_id: id, student_id: studentIds[childIdx2] },
          { onConflict: 'parent_id,student_id' }
        ).catch(() => {});
      }
    }
  }

  // Cafeteria
  await createUser('TEST50', 'مسؤول الكافتيريا (اختبار)', 'cafeteria', instituteId);

  // Medical
  await createUser('TEST51', 'الطبيب (اختبار)', 'medical', instituteId);

  // ═══════════════════════════════════════
  // 4. Feature Flags — تفعيل كل الميزات
  // ═══════════════════════════════════════
  console.log('\n📌 4. تفعيل Feature Flags...');
  const featureKeys = [
    'attendance_qr', 'interactive_schedule', 'electronic_assignments',
    'exam_system', 'certificates', 'parent_teacher_chat',
    'ai_student_chatbot', 'ai_teacher_assistant', 'live_streaming',
    'multi_branch', 'leave_requests', 'fees_management',
    'content_management', 'voice_messages', 'admin_parent_chat',
    'ai_pdf_chat', 'cafeteria', 'medical_records', 'device_attendance',
  ];

  for (const key of featureKeys) {
    await supabase.from('feature_flags').upsert(
      { institute_id: instituteId, feature_key: key, is_enabled: true },
      { onConflict: 'institute_id,feature_key' }
    ).catch(() => {});
  }
  console.log(`  ✅ تفعيل ${featureKeys.length} ميزة`);

  // ═══════════════════════════════════════
  // 5. إعلانات تجريبية
  // ═══════════════════════════════════════
  console.log('\n📌 5. إنشاء إعلانات...');
  const announcements = [
    { title: 'مرحباً بكم', content: 'أهلاً بكم في مدرسة الاختبار النموذجية', target_role: 'all' },
    { title: 'اجتماع أولياء الأمور', content: 'يوم الخميس القادم الساعة 4 عصراً', target_role: 'parent' },
    { title: 'امتحانات نهاية الفصل', content: 'تبدأ الامتحانات يوم الأحد القادم', target_role: 'student' },
  ];
  for (const a of announcements) {
    await supabase.from('announcements').insert({
      ...a, institute_id: instituteId,
    }).catch(() => {});
  }
  console.log(`  ✅ ${announcements.length} إعلانات`);

  // ═══════════════════════════════════════
  // 6. جدول دراسي بسيط
  // ═══════════════════════════════════════
  console.log('\n📌 6. إنشاء جدول دراسي...');
  const subjects = ['رياضيات', 'علوم', 'عربي', 'إنجليزي', 'إسلامية', 'اجتماعيات'];
  const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'];
  let ttCount = 0;

  for (const classId of classIds.slice(0, 2)) { // أول صفين فقط
    for (let day = 0; day < 5; day++) {
      for (let i = 0; i < Math.min(subjects.length, timeSlots.length); i++) {
        const teacherId = teacherIds[i % teacherIds.length];
        if (!teacherId) continue;
        await supabase.from('timetable').upsert({
          institute_id: instituteId,
          class_id: classId,
          teacher_id: teacherId,
          subject: subjects[i],
          day_of_week: day,
          start_time: timeSlots[i],
          end_time: `${parseInt(timeSlots[i]) + 1}:00`.padStart(5, '0'),
          room: `قاعة ${i + 1}`,
        }, { onConflict: 'institute_id,class_id,day_of_week,start_time' }).catch(() => {});
        ttCount++;
      }
    }
  }
  console.log(`  ✅ ${ttCount} حصة`);

  // ═══════════════════════════════════════
  // 7. ملخص
  // ═══════════════════════════════════════
  console.log('\n═══════════════════════════════════════');
  console.log('🎉 تم إنشاء البيانات التجريبية بنجاح!');
  console.log('═══════════════════════════════════════');
  console.log('\n📋 بيانات الدخول:');
  console.log('┌──────────┬────────────────────────────────┬──────────┐');
  console.log('│ الدور     │ الاسم                          │ الكود    │');
  console.log('├──────────┼────────────────────────────────┼──────────┤');
  console.log('│ admin    │ أحمد المدير                    │ TEST01   │');
  console.log('│ institute│ محمد المدير العام               │ TEST02   │');
  console.log('│ teacher  │ أستاذ علي                      │ TEST10   │');
  console.log('│ teacher  │ أستاذة فاطمة                   │ TEST11   │');
  console.log('│ teacher  │ أستاذ حسن                      │ TEST12   │');
  console.log('│ student  │ طالب 1-10                      │ TEST21-30│');
  console.log('│ parent   │ ولي أمر 1-5                    │ TEST41-45│');
  console.log('│ cafeteria│ مسؤول الكافتيريا               │ TEST50   │');
  console.log('│ medical  │ الطبيب                         │ TEST51   │');
  console.log('└──────────┴────────────────────────────────┴──────────┘');
  console.log(`\n🏫 المؤسسة: مدرسة الاختبار النموذجية (${instituteId})`);
}

seed().catch(err => {
  console.error('❌ خطأ:', err.message);
  process.exit(1);
});
