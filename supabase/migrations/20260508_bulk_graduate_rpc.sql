-- ═══════════════════════════════════════════════════════════════════════════
-- 20260508_bulk_graduate_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Fixes a sequencing bug in bulkGraduateStudents: the original flow called
-- bulk_graduate_students() (which DELETE-d enrollments) and then iterated
-- deleteUser() per student. deleteUser() looks up each user's institute via
-- the enrollments table — which had just been deleted — so the per-user
-- institute resolution failed and the auth gate refused or mis-scoped.
--
-- This RPC does the whole graduate flow atomically inside one transaction:
--   1. Verify the caller is an active admin of the institute.
--   2. Capture the list of student_ids belonging to the target classes.
--   3. Insert promotion_logs entries (graduate / repeat).
--   4. If p_delete_accounts: soft-delete the related rows in user-owned tables
--      (matching what services/api.ts deleteUser does), then delete enrollments
--      and the users row.
--
-- Auth.users (the Supabase auth row) still has to be deleted from the client
-- via supabaseAdmin.auth.admin.deleteUser — Postgres can't reach into the
-- auth schema from a regular RPC. The returned student_ids array tells the
-- client which auth rows to clean up.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bulk_graduate_students_v2(
  p_institute_id UUID,
  p_class_ids UUID[],
  p_exclude_student_ids UUID[],
  p_academic_year TEXT,
  p_promoted_by UUID,
  p_delete_accounts BOOLEAN DEFAULT false
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_platform_admin BOOLEAN := false;
  v_is_institute_admin BOOLEAN := false;
  v_all_student_ids UUID[];
  v_graduate_ids UUID[];
  v_repeat_ids UUID[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized: not signed in';
  END IF;
  IF p_institute_id IS NULL OR p_class_ids IS NULL OR array_length(p_class_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_institute_id and p_class_ids are required';
  END IF;

  -- Caller authorization: platform admin OR institute admin of p_institute_id.
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = v_caller
      AND u.role IN ('admin','platform_admin')
      AND u.institute_id IS NULL
  ) INTO v_is_platform_admin;

  SELECT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.user_id = v_caller
      AND e.institute_id = p_institute_id
      AND e.role IN ('admin','institute')
      AND e.status = 'active'
  ) INTO v_is_institute_admin;

  IF NOT (v_is_platform_admin OR v_is_institute_admin) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an admin of institute %', p_institute_id;
  END IF;

  -- Collect every distinct student in the target classes (scoped to institute).
  SELECT array_agg(DISTINCT student_id)
  INTO v_all_student_ids
  FROM student_classes
  WHERE class_id = ANY(p_class_ids)
    AND institute_id = p_institute_id;

  IF v_all_student_ids IS NULL OR array_length(v_all_student_ids, 1) IS NULL THEN
    RETURN json_build_object('graduated', 0, 'student_ids', '[]'::jsonb);
  END IF;

  v_graduate_ids := ARRAY(
    SELECT unnest(v_all_student_ids)
    EXCEPT
    SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
  );
  v_repeat_ids := ARRAY(
    SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
    INTERSECT
    SELECT unnest(v_all_student_ids)
  );

  IF array_length(v_graduate_ids, 1) IS NULL THEN
    RETURN json_build_object('graduated', 0, 'student_ids', '[]'::jsonb);
  END IF;

  -- Promotion log (graduate)
  INSERT INTO promotion_logs (
    institute_id, student_id, academic_year,
    from_class_id, to_class_id, action, promoted_by
  )
  SELECT
    p_institute_id, student_id, p_academic_year,
    p_class_ids[1], NULL, 'graduate', p_promoted_by
  FROM unnest(v_graduate_ids) AS student_id;

  -- Promotion log (repeat)
  IF array_length(v_repeat_ids, 1) IS NOT NULL THEN
    INSERT INTO promotion_logs (
      institute_id, student_id, academic_year,
      from_class_id, to_class_id, action, promoted_by
    )
    SELECT
      p_institute_id, student_id, p_academic_year,
      p_class_ids[1], p_class_ids[1], 'repeat', p_promoted_by
    FROM unnest(v_repeat_ids) AS student_id;
  END IF;

  IF p_delete_accounts THEN
    -- Wipe user-owned data BEFORE removing enrollments. The order matches
    -- services/api.ts deleteUser() so FK constraints with ON DELETE RESTRICT
    -- don't block the final users row delete.
    DELETE FROM exam_answers WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM exam_sessions WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM exam_submissions WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM assignment_submissions WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM task_submissions WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM manual_grades WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM attendance WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM attendance_qr_scans WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM student_fees WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM medical_records WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM parent_child WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM student_classes WHERE student_id = ANY(v_graduate_ids);
    DELETE FROM notifications
      WHERE recipient_id = ANY(v_graduate_ids)
         OR sender_id = ANY(v_graduate_ids);
    DELETE FROM messages
      WHERE sender_id = ANY(v_graduate_ids)
         OR receiver_id = ANY(v_graduate_ids);
    DELETE FROM user_codes WHERE user_id = ANY(v_graduate_ids);
    DELETE FROM enrollments WHERE user_id = ANY(v_graduate_ids);
    DELETE FROM users WHERE id = ANY(v_graduate_ids);
  END IF;

  RETURN json_build_object(
    'graduated', COALESCE(array_length(v_graduate_ids, 1), 0),
    'repeated', COALESCE(array_length(v_repeat_ids, 1), 0),
    'deleted_accounts', p_delete_accounts,
    'student_ids', to_jsonb(v_graduate_ids)
  );

EXCEPTION
  -- Some user-owned tables may legitimately not exist in older databases.
  -- Re-raise so the migration author can debug, but tag the context.
  WHEN undefined_table THEN
    RAISE NOTICE 'bulk_graduate_students_v2: skipped missing table — %', SQLERRM;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_graduate_students_v2(UUID, UUID[], UUID[], TEXT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_graduate_students_v2(UUID, UUID[], UUID[], TEXT, UUID, BOOLEAN) TO authenticated;
