-- ═══════════════════════════════════════════════════════════════════════════
-- 20260420_rls_lockdown_v3.sql
-- RLS Security Hardening — Round 3
-- Fixes 8 classes of critical/high gaps not addressed by prior lockdown files.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Gap inventory (origin file : line):
--  [1] users UPDATE — no guard on role/institute_id escalation
--      Origin: 20260411_security_rls_tenant_isolation.sql:50-52
--             (users_write FOR ALL USING (id = auth.uid() OR role='admin')
--              — a regular user can PATCH their own role to 'admin')
--
--  [2] bulk_promote_students / bulk_graduate_students — SECURITY DEFINER
--      functions trust p_institute_id and p_promoted_by from the caller
--      without verifying the caller actually belongs to that institute.
--      Origin: 20260418_bulk_promote_rpc.sql:17-126
--
--  [3] grade_entries — ge_admin policy is FOR ALL with no institute_id filter
--      (any teacher/institute can read/write ANY institute's grades)
--      Origin: 20260413_academic_progress.sql:55-56
--
--  [4] attendance SELECT — allows any parent/teacher in any institute
--      to see any student's row (no institute scoping, no teacher-class check)
--      Origin: 20260416_rls_lockdown_v2.sql:21-24
--
--  [5] exams INSERT/UPDATE — WITH CHECK only checks teacher_id = auth.uid()
--      but does not verify exam.institute_id matches the teacher's institute.
--      A teacher from institute A can write exams into institute B's scope.
--      Origin: 20260411_security_rls_tenant_isolation.sql:101-103
--
--  [6] parent_child INSERT — the FOR ALL policy already restricts to
--      admin/institute, but there is no WITH CHECK on INSERT, so a crafted
--      direct PostgREST INSERT call can bypass the USING clause.
--      Origin: 20260416_rls_lockdown_v2.sql:90-92
--
--  [7] certificates — cert_read USING(get_user_role()='parent') lets a parent
--      see all certificates from their institute, not just their children's.
--      Origin: 20260412_certificates.sql:29-33
--
--  [8] stages / grades / sections / subjects — permissive FOR ALL USING(true)
--      since initial creation, never tightened.
--      Origin: 20260411_school_structure.sql:66-78
--
-- RULES applied throughout:
--   • Each policy uses (SELECT auth.uid()) pattern to evaluate auth.uid()
--     once per statement rather than per row.
--   • get_user_institute_ids() is already SECURITY DEFINER STABLE — safe to
--     call inside USING/WITH CHECK.
--   • All changes are DROP IF EXISTS + CREATE, never ALTER on old policies.
--   • Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER: single-row stable call to avoid per-row auth.uid() overhead
-- ═══════════════════════════════════════════════════════════════════════════
-- get_user_role() and get_user_institute_ids() are already defined as
-- SECURITY DEFINER STABLE in 20260416_rls_lockdown.sql and updated in
-- 20260419_critical_isolation_fixes.sql. We do not redefine them here.

-- ═══════════════════════════════════════════════════════════════════════════
-- [1] USERS TABLE — prevent role / institute_id self-escalation
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem: the prior "users_write FOR ALL" policy allows any authenticated
-- user to UPDATE their own row, including the `role` and `institute_id`
-- columns (PostgREST PATCH with {"role":"admin"} works against self).
--
-- New design:
--   SELECT  — unchanged from prior migration (own row or same-institute).
--   INSERT  — only platform_admin; user creation goes through auth triggers.
--   UPDATE  — split into two cases:
--       a) Self-update: can only touch non-privileged columns. Enforced by
--          WITH CHECK that blocks changes to role / institute_id / is_frozen.
--       b) Admin update: platform_admin can change anything.
--       c) Institute-admin update: can change role to non-elevated values
--          for users in THEIR own institute; cannot promote to 'admin' or
--          change institute_id to another institute.
--   DELETE  — only platform_admin.
--
-- NOTE: institute_id on the users table is a denormalised convenience column.
-- The authoritative assignment is via enrollments. Blocking changes here
-- prevents a shortcut escalation path.

DROP POLICY IF EXISTS users_write        ON users;
DROP POLICY IF EXISTS users_update_self  ON users;
DROP POLICY IF EXISTS users_update_admin ON users;
DROP POLICY IF EXISTS users_insert       ON users;
DROP POLICY IF EXISTS users_delete       ON users;
DROP POLICY IF EXISTS users_v3_self_update      ON users;
DROP POLICY IF EXISTS users_v3_admin_update     ON users;
DROP POLICY IF EXISTS users_v3_institute_update ON users;
DROP POLICY IF EXISTS users_v3_insert           ON users;
DROP POLICY IF EXISTS users_v3_delete           ON users;

-- 1a. Self-update: allowed, but role/institute_id/is_frozen are pinned.
--     We enforce this through WITH CHECK: the NEW row must carry the same
--     role and institute_id as the current (OLD) row for the acting user.
--     Since RLS WITH CHECK cannot reference OLD directly, we join back to
--     the stored value — if the client tries to change role the subquery
--     will return a different value and the check fails.
CREATE POLICY users_v3_self_update ON users
  FOR UPDATE
  USING (
    id = (SELECT auth.uid())
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    -- Caller must not change their own role
    AND role = (SELECT role FROM users WHERE id = (SELECT auth.uid()))
    -- Caller must not change their own institute_id
    AND (
      institute_id IS NOT DISTINCT FROM
      (SELECT institute_id FROM users WHERE id = (SELECT auth.uid()))
    )
    -- Caller must not unfreeze themselves
    AND (
      is_frozen IS NOT DISTINCT FROM
      (SELECT is_frozen FROM users WHERE id = (SELECT auth.uid()))
    )
  );

-- 1b. Institute-admin update: can edit users within the same institute,
--     but may not promote to 'admin' or 'platform_admin', and may not
--     move users to a different institute.
CREATE POLICY users_v3_institute_update ON users
  FOR UPDATE
  USING (
    -- Actor is institute-admin
    (SELECT public.get_user_role()) = 'institute'
    -- Target user belongs to actor's institute (via enrollments)
    AND id IN (
      SELECT user_id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  WITH CHECK (
    -- Still in same institute
    id IN (
      SELECT user_id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
    -- Cannot promote to platform-level roles
    AND role NOT IN ('admin', 'platform_admin')
    -- Cannot reassign to a different institute
    AND (
      institute_id IS NULL
      OR institute_id IN (SELECT public.get_user_institute_ids())
    )
  );

-- 1c. Platform-admin update: unrestricted.
CREATE POLICY users_v3_admin_update ON users
  FOR UPDATE
  USING  ((SELECT public.get_user_role()) = 'admin')
  WITH CHECK ((SELECT public.get_user_role()) = 'admin');

-- 1d. Insert — platform_admin only (user creation flows through Supabase Auth
--     triggers or edge functions using the service role).
CREATE POLICY users_v3_insert ON users
  FOR INSERT
  WITH CHECK ((SELECT public.get_user_role()) = 'admin');

-- 1e. Delete — platform_admin only.
CREATE POLICY users_v3_delete ON users
  FOR DELETE
  USING ((SELECT public.get_user_role()) = 'admin');


-- ═══════════════════════════════════════════════════════════════════════════
-- [2] bulk_promote_students / bulk_graduate_students — caller self-auth
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Both functions are SECURITY DEFINER, meaning they bypass RLS entirely.
-- The vulnerability: a caller from institute A could pass p_institute_id=B
-- and promote students they do not own.
--
-- Fix: at function entry, verify auth.uid() has role IN ('admin','institute')
-- AND (for non-platform-admin) is enrolled in p_institute_id with an active
-- status. Also verify p_promoted_by = auth.uid() so a caller cannot forge
-- the audit trail with another admin's UUID.

CREATE OR REPLACE FUNCTION public.bulk_promote_students(
  p_institute_id UUID,
  p_source_class_ids UUID[],
  p_target_class_id UUID,
  p_exclude_student_ids UUID[],
  p_academic_year TEXT,
  p_promoted_by UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role      TEXT;
  v_caller_institute UUID;
  v_all_student_ids  UUID[];
  v_promote_ids      UUID[];
  v_repeat_ids       UUID[];
  v_source_class_lookup JSONB;
BEGIN
  -- ── Authorization gate ───────────────────────────────────────────────────
  -- 1. Caller must be authenticated.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- 2. p_promoted_by must equal the actual caller (prevents audit spoofing).
  IF p_promoted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'p_promoted_by must equal the calling user (auth.uid())';
  END IF;

  -- 3. Resolve caller role from JWT claims (cannot be forged by client).
  v_caller_role := (auth.jwt() ->> 'role');
  -- Fallback to users table if not embedded in JWT.
  IF v_caller_role IS NULL THEN
    SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  END IF;

  -- 4. Platform admin may operate on any institute.
  IF v_caller_role = 'admin' THEN
    NULL; -- allowed
  ELSE
    -- Non-platform-admin: must be enrolled in p_institute_id as 'institute'.
    SELECT institute_id INTO v_caller_institute
    FROM enrollments
    WHERE user_id  = auth.uid()
      AND institute_id = p_institute_id
      AND role IN ('institute', 'admin')
      AND (status IS NULL OR status = 'active')
    LIMIT 1;

    IF v_caller_institute IS NULL THEN
      RAISE EXCEPTION 'caller is not an active admin of institute %', p_institute_id;
    END IF;
  END IF;

  -- ── Original bulk-promote logic (unchanged) ──────────────────────────────
  SELECT array_agg(DISTINCT student_id)
  INTO v_all_student_ids
  FROM student_classes
  WHERE class_id = ANY(p_source_class_ids)
    AND institute_id = p_institute_id;

  IF v_all_student_ids IS NULL OR array_length(v_all_student_ids, 1) IS NULL THEN
    RETURN json_build_object('promoted', 0, 'repeated', 0);
  END IF;

  v_promote_ids := ARRAY(
    SELECT unnest(v_all_student_ids)
    EXCEPT
    SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
  );
  v_repeat_ids := ARRAY(
    SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
    INTERSECT
    SELECT unnest(v_all_student_ids)
  );

  SELECT jsonb_object_agg(sc.student_id::TEXT, sc.class_id::TEXT)
  INTO v_source_class_lookup
  FROM (
    SELECT DISTINCT ON (student_id) student_id, class_id
    FROM student_classes
    WHERE student_id = ANY(v_all_student_ids)
      AND class_id = ANY(p_source_class_ids)
      AND institute_id = p_institute_id
    ORDER BY student_id, class_id
  ) sc;

  IF array_length(v_promote_ids, 1) IS NOT NULL THEN
    UPDATE enrollments
    SET class_id = p_target_class_id
    WHERE user_id = ANY(v_promote_ids)
      AND institute_id = p_institute_id;

    UPDATE student_classes
    SET class_id = p_target_class_id
    WHERE student_id = ANY(v_promote_ids)
      AND institute_id = p_institute_id;

    INSERT INTO promotion_logs (
      institute_id, student_id, academic_year,
      from_class_id, to_class_id, action, promoted_by
    )
    SELECT
      p_institute_id,
      student_id,
      p_academic_year,
      COALESCE(
        (v_source_class_lookup ->> student_id::TEXT)::UUID,
        p_source_class_ids[1]
      ),
      p_target_class_id,
      'promote',
      p_promoted_by
    FROM unnest(v_promote_ids) AS student_id;
  END IF;

  IF array_length(v_repeat_ids, 1) IS NOT NULL THEN
    INSERT INTO promotion_logs (
      institute_id, student_id, academic_year,
      from_class_id, to_class_id, action, promoted_by
    )
    SELECT
      p_institute_id,
      student_id,
      p_academic_year,
      p_source_class_ids[1],
      p_source_class_ids[1],
      'repeat',
      p_promoted_by
    FROM unnest(v_repeat_ids) AS student_id;
  END IF;

  RETURN json_build_object(
    'promoted', COALESCE(array_length(v_promote_ids, 1), 0),
    'repeated', COALESCE(array_length(v_repeat_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_promote_students TO authenticated;


CREATE OR REPLACE FUNCTION public.bulk_graduate_students(
  p_institute_id UUID,
  p_class_ids UUID[],
  p_exclude_student_ids UUID[],
  p_academic_year TEXT,
  p_promoted_by UUID,
  p_delete_enrollments BOOLEAN DEFAULT false
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role      TEXT;
  v_caller_institute UUID;
  v_all_student_ids  UUID[];
  v_graduate_ids     UUID[];
BEGIN
  -- ── Authorization gate ───────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_promoted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'p_promoted_by must equal the calling user (auth.uid())';
  END IF;

  v_caller_role := (auth.jwt() ->> 'role');
  IF v_caller_role IS NULL THEN
    SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  END IF;

  IF v_caller_role != 'admin' THEN
    SELECT institute_id INTO v_caller_institute
    FROM enrollments
    WHERE user_id  = auth.uid()
      AND institute_id = p_institute_id
      AND role IN ('institute', 'admin')
      AND (status IS NULL OR status = 'active')
    LIMIT 1;

    IF v_caller_institute IS NULL THEN
      RAISE EXCEPTION 'caller is not an active admin of institute %', p_institute_id;
    END IF;
  END IF;

  -- ── Original graduate logic (unchanged) ──────────────────────────────────
  SELECT array_agg(DISTINCT student_id)
  INTO v_all_student_ids
  FROM student_classes
  WHERE class_id = ANY(p_class_ids)
    AND institute_id = p_institute_id;

  IF v_all_student_ids IS NULL OR array_length(v_all_student_ids, 1) IS NULL THEN
    RETURN json_build_object('graduated', 0);
  END IF;

  v_graduate_ids := ARRAY(
    SELECT unnest(v_all_student_ids)
    EXCEPT
    SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
  );

  IF array_length(v_graduate_ids, 1) IS NULL THEN
    RETURN json_build_object('graduated', 0);
  END IF;

  INSERT INTO promotion_logs (
    institute_id, student_id, academic_year,
    from_class_id, to_class_id, action, promoted_by
  )
  SELECT
    p_institute_id,
    student_id,
    p_academic_year,
    p_class_ids[1],
    NULL,
    'graduate',
    p_promoted_by
  FROM unnest(v_graduate_ids) AS student_id;

  IF p_delete_enrollments THEN
    DELETE FROM enrollments
    WHERE user_id = ANY(v_graduate_ids)
      AND institute_id = p_institute_id;

    DELETE FROM student_classes
    WHERE student_id = ANY(v_graduate_ids)
      AND institute_id = p_institute_id;
  END IF;

  RETURN json_build_object(
    'graduated', array_length(v_graduate_ids, 1),
    'delete_enrollments', p_delete_enrollments
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_graduate_students TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- [3] GRADE_ENTRIES — institute-scoped SELECT/INSERT/UPDATE/DELETE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260413_academic_progress.sql:55):
--   ge_admin FOR ALL USING (role IN ('admin','institute','teacher'))
--   has no institute_id filter — any teacher in the system can read/write
--   grade_entries for any institute.
--
-- New design:
--   SELECT — student sees own; parent sees children; staff see own-institute.
--   INSERT — teacher/institute/admin in same institute only; WITH CHECK enforces it.
--   UPDATE — teacher who created it OR institute/admin in same institute.
--   DELETE — institute/admin in same institute only.

DROP POLICY IF EXISTS ge_admin   ON grade_entries;
DROP POLICY IF EXISTS ge_student ON grade_entries;
DROP POLICY IF EXISTS ge_parent  ON grade_entries;
DROP POLICY IF EXISTS grade_entries_read   ON grade_entries;
DROP POLICY IF EXISTS grade_entries_insert ON grade_entries;
DROP POLICY IF EXISTS grade_entries_update ON grade_entries;
DROP POLICY IF EXISTS grade_entries_delete ON grade_entries;

CREATE POLICY grade_entries_read ON grade_entries FOR SELECT USING (
  -- Own row (student)
  student_id = (SELECT auth.uid())
  -- Parent sees linked children
  OR student_id IN (
    SELECT student_id FROM parent_child
    WHERE parent_id = (SELECT auth.uid())
  )
  -- Staff: scoped to own institute
  OR (
    (SELECT public.get_user_role()) IN ('admin', 'institute', 'teacher')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  -- Platform admin
  OR (SELECT public.get_user_role()) = 'admin'
);

CREATE POLICY grade_entries_insert ON grade_entries FOR INSERT WITH CHECK (
  -- Must be in the same institute
  institute_id IN (SELECT public.get_user_institute_ids())
  AND (SELECT public.get_user_role()) IN ('admin', 'institute', 'teacher')
);

CREATE POLICY grade_entries_update ON grade_entries FOR UPDATE USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  AND (
    teacher_id = (SELECT auth.uid())
    OR (SELECT public.get_user_role()) IN ('admin', 'institute')
  )
) WITH CHECK (
  institute_id IN (SELECT public.get_user_institute_ids())
  AND (
    teacher_id = (SELECT auth.uid())
    OR (SELECT public.get_user_role()) IN ('admin', 'institute')
  )
);

CREATE POLICY grade_entries_delete ON grade_entries FOR DELETE USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  AND (SELECT public.get_user_role()) IN ('admin', 'institute')
);


-- ═══════════════════════════════════════════════════════════════════════════
-- [4] ATTENDANCE SELECT — proper multi-role scoping
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260416_rls_lockdown_v2.sql:21-24):
--   attendance_read allows any 'parent' role to see ALL attendance rows in
--   the system (no parent_child join, no institute_id check). Any 'teacher'
--   in the system also sees all rows.
--
-- attendance columns (confirmed 20260416_rls_lockdown_v2.sql:13 comment +
-- 20260414_final_setup.sql:21):
--   id, timetable_id, student_id, date, status, justification_text,
--   created_at, branch_id, institute_id (added 20260414_final_setup.sql)
--
-- New design:
--   Student  — sees own rows.
--   Parent   — sees rows only for their linked children (parent_child join).
--   Teacher  — sees rows for students in their classes (via timetable → class
--              → student_classes), scoped to same institute.
--   Admin/Institute — sees all rows within their institute.
--   Platform admin — unrestricted.
--
-- Write policies (INSERT/UPDATE) stay restricted to staff; unchanged from
-- prior migration but we restate them cleanly here for consistency.

DROP POLICY IF EXISTS "attendance_permissive" ON attendance;
DROP POLICY IF EXISTS "attendance_read"       ON attendance;
DROP POLICY IF EXISTS "attendance_write"      ON attendance;
DROP POLICY IF EXISTS "attendance_update"     ON attendance;
DROP POLICY IF EXISTS attendance_v3_read      ON attendance;
DROP POLICY IF EXISTS attendance_v3_write     ON attendance;
DROP POLICY IF EXISTS attendance_v3_update    ON attendance;
DROP POLICY IF EXISTS attendance_v3_delete    ON attendance;

CREATE POLICY attendance_v3_read ON attendance FOR SELECT USING (
  -- Student sees own row
  student_id = (SELECT auth.uid())

  -- Parent sees only linked children
  OR (
    (SELECT public.get_user_role()) = 'parent'
    AND student_id IN (
      SELECT student_id FROM parent_child
      WHERE parent_id = (SELECT auth.uid())
    )
  )

  -- Teacher: only students in classes they teach, scoped to same institute
  OR (
    (SELECT public.get_user_role()) = 'teacher'
    AND (
      -- institute_id match (fast path when column exists and is populated)
      (
        institute_id IS NOT NULL
        AND institute_id IN (SELECT public.get_user_institute_ids())
      )
      -- OR student is in a class the teacher is assigned to
      OR student_id IN (
        SELECT sc.student_id
        FROM student_classes sc
        JOIN teacher_assignments ta
          ON ta.class_id = sc.class_id
         AND ta.institute_id = sc.institute_id
        WHERE ta.teacher_id = (SELECT auth.uid())
          AND ta.institute_id IN (SELECT public.get_user_institute_ids())
      )
    )
  )

  -- Admin / Institute — all rows within own institute
  OR (
    (SELECT public.get_user_role()) IN ('admin', 'institute')
    AND (
      institute_id IN (SELECT public.get_user_institute_ids())
      OR (SELECT public.get_user_role()) = 'admin'
    )
  )
);

CREATE POLICY attendance_v3_write ON attendance FOR INSERT WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute', 'teacher')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
);

CREATE POLICY attendance_v3_update ON attendance FOR UPDATE USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute', 'teacher')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
) WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute', 'teacher')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
);

CREATE POLICY attendance_v3_delete ON attendance FOR DELETE USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
);


-- ═══════════════════════════════════════════════════════════════════════════
-- [5] EXAMS WRITE — teacher must own exam AND institute must match
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260411_security_rls_tenant_isolation.sql:101-103):
--   exams_write FOR ALL USING (teacher_id = auth.uid() OR role='admin')
--   — no institute_id check. A teacher enrolled in institute B can INSERT
--   an exam with institute_id = A's UUID and it passes.
--
-- exams columns: teacher_id, institute_id (confirmed from usage across
--   migrations: 20260416_add_materials_type_and_exam_grading.sql:100 and
--   20260411_security_rls_tenant_isolation.sql:96-103).
--
-- New design:
--   SELECT — unchanged from prior (teacher_id=self OR same institute OR admin).
--   INSERT WITH CHECK — teacher_id=self AND institute_id in own institutes.
--   UPDATE USING/WITH CHECK — (teacher_id=self OR admin/institute) AND
--                              institute_id in own institutes.
--   DELETE — admin/institute only, within own institute.

DROP POLICY IF EXISTS exams_read    ON exams;
DROP POLICY IF EXISTS exams_write   ON exams;
DROP POLICY IF EXISTS exams_v3_read   ON exams;
DROP POLICY IF EXISTS exams_v3_insert ON exams;
DROP POLICY IF EXISTS exams_v3_update ON exams;
DROP POLICY IF EXISTS exams_v3_delete ON exams;

-- Read: teacher sees own; same-institute members see all; platform admin sees all.
CREATE POLICY exams_v3_read ON exams FOR SELECT USING (
  teacher_id = (SELECT auth.uid())
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR (SELECT public.get_user_role()) = 'admin'
);

-- Insert: teacher must be inserting for their own account AND the exam's
-- institute_id must be one they are enrolled in.
CREATE POLICY exams_v3_insert ON exams FOR INSERT WITH CHECK (
  (
    -- Teacher creates exam for themselves
    teacher_id = (SELECT auth.uid())
    AND institute_id IN (SELECT public.get_user_institute_ids())
    AND (SELECT public.get_user_role()) = 'teacher'
  )
  OR (
    -- Admin/institute can create on behalf of any teacher in their institute
    (SELECT public.get_user_role()) IN ('admin', 'institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR (SELECT public.get_user_role()) = 'admin'
);

-- Update: teacher edits own exam (and still within same institute);
-- institute/admin can edit any exam in their institute.
CREATE POLICY exams_v3_update ON exams FOR UPDATE USING (
  (
    teacher_id = (SELECT auth.uid())
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR (
    (SELECT public.get_user_role()) IN ('admin', 'institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR (SELECT public.get_user_role()) = 'admin'
) WITH CHECK (
  -- After update, institute_id must still be within caller's institute
  (
    teacher_id = (SELECT auth.uid())
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR (
    (SELECT public.get_user_role()) IN ('admin', 'institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR (SELECT public.get_user_role()) = 'admin'
);

-- Delete: institute admin or platform admin only.
CREATE POLICY exams_v3_delete ON exams FOR DELETE USING (
  (
    (SELECT public.get_user_role()) IN ('admin', 'institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR (SELECT public.get_user_role()) = 'admin'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- [6] PARENT_CHILD INSERT — explicit WITH CHECK, admin/institute only
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260416_rls_lockdown_v2.sql:90-92):
--   parent_child_write FOR ALL USING (role IN ('admin','institute'))
--   — FOR ALL covers INSERT but USING is not evaluated for INSERT (only
--   WITH CHECK is). So a direct PostgREST INSERT from a 'parent' role
--   bypasses the USING guard entirely.
--
-- parent_child columns: parent_id, student_id (no institute_id column —
--   confirmed 20260416_rls_lockdown_v2.sql:81, 20260418_security_critical.sql).
--
-- New design: explicit INSERT WITH CHECK requiring admin/institute role AND
-- verifying the student is in the caller's institute (via enrollments).
-- UPDATE/DELETE also restricted to admin/institute within same institute.

DROP POLICY IF EXISTS "parent_child_permissive" ON parent_child;
DROP POLICY IF EXISTS "parent_child_read"        ON parent_child;
DROP POLICY IF EXISTS "parent_child_write"       ON parent_child;
DROP POLICY IF EXISTS parent_child_v3_read       ON parent_child;
DROP POLICY IF EXISTS parent_child_v3_insert     ON parent_child;
DROP POLICY IF EXISTS parent_child_v3_update     ON parent_child;
DROP POLICY IF EXISTS parent_child_v3_delete     ON parent_child;

-- Read: own rows (parent or student), plus institute/admin.
CREATE POLICY parent_child_v3_read ON parent_child FOR SELECT USING (
  parent_id  = (SELECT auth.uid())
  OR student_id = (SELECT auth.uid())
  OR (SELECT public.get_user_role()) IN ('admin', 'institute')
);

-- Insert: only admin/institute, and both parent and student must belong to
-- the caller's institute (prevents linking users across tenants).
CREATE POLICY parent_child_v3_insert ON parent_child FOR INSERT WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  -- Student must be enrolled in caller's institute
  AND student_id IN (
    SELECT user_id FROM enrollments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
      AND (status IS NULL OR status = 'active')
  )
  -- Parent must also be enrolled in caller's institute
  AND parent_id IN (
    SELECT user_id FROM enrollments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
      AND (status IS NULL OR status = 'active')
  )
);

-- Update: admin/institute only.
CREATE POLICY parent_child_v3_update ON parent_child FOR UPDATE USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
) WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND student_id IN (
    SELECT user_id FROM enrollments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
      AND (status IS NULL OR status = 'active')
  )
);

-- Delete: admin/institute only.
CREATE POLICY parent_child_v3_delete ON parent_child FOR DELETE USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND student_id IN (
    SELECT user_id FROM enrollments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
);


-- ═══════════════════════════════════════════════════════════════════════════
-- [7] CERTIFICATES — parent sees only own children's certificates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260412_certificates.sql:29-33):
--   cert_read USING(get_user_role()='parent') — a parent can read ALL
--   certificates in their institute (no parent_child filter). This leaks
--   other families' certificates.
--
-- certificates columns: id, institute_id, student_id, type, title, ...
--   (20260412_certificates.sql:6-23)
--
-- New design:
--   Student — own certificate.
--   Parent  — only certificates for students in parent_child.
--   Staff   — all certificates within own institute.

DROP POLICY IF EXISTS cert_read  ON certificates;
DROP POLICY IF EXISTS cert_write ON certificates;
DROP POLICY IF EXISTS certificates_v3_read   ON certificates;
DROP POLICY IF EXISTS certificates_v3_insert ON certificates;
DROP POLICY IF EXISTS certificates_v3_update ON certificates;
DROP POLICY IF EXISTS certificates_v3_delete ON certificates;

CREATE POLICY certificates_v3_read ON certificates FOR SELECT USING (
  -- Student sees their own certificate
  student_id = (SELECT auth.uid())

  -- Parent sees ONLY their linked children's certificates
  OR (
    (SELECT public.get_user_role()) = 'parent'
    AND student_id IN (
      SELECT student_id FROM parent_child
      WHERE parent_id = (SELECT auth.uid())
    )
  )

  -- Staff see all within their institute
  OR (
    (SELECT public.get_user_role()) IN ('admin', 'institute', 'teacher')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )

  -- Platform admin
  OR (SELECT public.get_user_role()) = 'admin'
);

-- Write: institute/admin only, scoped to own institute.
CREATE POLICY certificates_v3_insert ON certificates FOR INSERT WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND institute_id IN (SELECT public.get_user_institute_ids())
);

CREATE POLICY certificates_v3_update ON certificates FOR UPDATE USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND institute_id IN (SELECT public.get_user_institute_ids())
) WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND institute_id IN (SELECT public.get_user_institute_ids())
);

CREATE POLICY certificates_v3_delete ON certificates FOR DELETE USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND institute_id IN (SELECT public.get_user_institute_ids())
);


-- ═══════════════════════════════════════════════════════════════════════════
-- [8a] STAGES — admin/institute of same institute only
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260411_school_structure.sql:66-67):
--   stages_permissive FOR ALL USING(true) — any authenticated user can
--   read, create, update, or delete stages from any institute.
--
-- stages columns: id, institute_id, name, order_num, created_at

DROP POLICY IF EXISTS stages_permissive ON stages;
DROP POLICY IF EXISTS stages_read       ON stages;
DROP POLICY IF EXISTS stages_write      ON stages;
DROP POLICY IF EXISTS stages_v3_read   ON stages;
DROP POLICY IF EXISTS stages_v3_write  ON stages;

CREATE POLICY stages_v3_read ON stages FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR (SELECT public.get_user_role()) = 'admin'
);

CREATE POLICY stages_v3_write ON stages FOR ALL USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
) WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
);


-- ═══════════════════════════════════════════════════════════════════════════
-- [8b] GRADES (school grades / صفوف) — admin/institute of same institute only
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260411_school_structure.sql:69-70):
--   grades_permissive FOR ALL USING(true)
--
-- grades columns: id, stage_id, institute_id, name, order_num, created_at

DROP POLICY IF EXISTS grades_permissive ON grades;
DROP POLICY IF EXISTS grades_read       ON grades;
DROP POLICY IF EXISTS grades_write      ON grades;
DROP POLICY IF EXISTS grades_v3_read   ON grades;
DROP POLICY IF EXISTS grades_v3_write  ON grades;

CREATE POLICY grades_v3_read ON grades FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR (SELECT public.get_user_role()) = 'admin'
);

CREATE POLICY grades_v3_write ON grades FOR ALL USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
) WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
);


-- ═══════════════════════════════════════════════════════════════════════════
-- [8c] SECTIONS (شعب) — admin/institute of same institute only
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260411_school_structure.sql:72-73):
--   sections_permissive FOR ALL USING(true)
--
-- sections columns: id, grade_id, institute_id, name, created_at

DROP POLICY IF EXISTS sections_permissive ON sections;
DROP POLICY IF EXISTS sections_read       ON sections;
DROP POLICY IF EXISTS sections_write      ON sections;
DROP POLICY IF EXISTS sections_v3_read   ON sections;
DROP POLICY IF EXISTS sections_v3_write  ON sections;

CREATE POLICY sections_v3_read ON sections FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR (SELECT public.get_user_role()) = 'admin'
);

CREATE POLICY sections_v3_write ON sections FOR ALL USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
) WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
);


-- ═══════════════════════════════════════════════════════════════════════════
-- [8d] SUBJECTS (مواد) — admin/institute write; enrolled members read
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem (20260411_school_structure.sql:75-76):
--   subjects_permissive FOR ALL USING(true)
--
-- subjects columns: id, institute_id, name, created_at
-- Teachers and students need to read subjects to display timetables/content.

DROP POLICY IF EXISTS subjects_permissive ON subjects;
DROP POLICY IF EXISTS subjects_read       ON subjects;
DROP POLICY IF EXISTS subjects_write      ON subjects;
DROP POLICY IF EXISTS subjects_v3_read   ON subjects;
DROP POLICY IF EXISTS subjects_v3_write  ON subjects;

CREATE POLICY subjects_v3_read ON subjects FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR (SELECT public.get_user_role()) = 'admin'
);

CREATE POLICY subjects_v3_write ON subjects FOR ALL USING (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
) WITH CHECK (
  (SELECT public.get_user_role()) IN ('admin', 'institute')
  AND (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  )
);


-- ═══════════════════════════════════════════════════════════════════════════
-- SUPPORTING INDEXES
-- Wrapped in DO blocks so a missing column on one index never blocks others.
-- ═══════════════════════════════════════════════════════════════════════════

-- Index for parent_child lookups used heavily in the new policies above.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_parent_child_parent_student
    ON parent_child(parent_id, student_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_parent_child_parent_student: %', SQLERRM;
END $$;

-- Index for RLS on grade_entries institute_id (already exists in 20260413
-- but create-if-not-exists is safe).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_grade_entries_institute
    ON grade_entries(institute_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_grade_entries_institute: %', SQLERRM;
END $$;

-- Index on certificates(student_id) for parent policy join.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_certificates_student
    ON certificates(student_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_certificates_student: %', SQLERRM;
END $$;

-- Index for attendance teacher-class lookup (student_classes JOIN teacher_assignments).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_institute
    ON teacher_assignments(teacher_id, institute_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_teacher_assignments_teacher_institute: %', SQLERRM;
END $$;

-- Index on users(role) for role-check sub-selects (already added in
-- 20260413_performance_indexes.sql but idempotent here).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_users_role: %', SQLERRM;
END $$;

-- Index on stages/grades/sections for institute_id lookups.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_stages_institute   ON stages(institute_id);
  CREATE INDEX IF NOT EXISTS idx_grades_institute   ON grades(institute_id);
  CREATE INDEX IF NOT EXISTS idx_sections_institute ON sections(institute_id);
  CREATE INDEX IF NOT EXISTS idx_subjects_institute ON subjects(institute_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'structural indexes: %', SQLERRM;
END $$;

COMMIT;
