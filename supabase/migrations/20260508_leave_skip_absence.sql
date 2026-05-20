-- ═══════════════════════════════════════════════════
-- Patch: notify_absent_students() must skip students covered by an approved
-- leave_request OR who already have an 'excused' attendance row for the day.
--
-- Why this change is needed:
--   1. The original function (20260427_absence_notifications.sql) only
--      excluded students with attendance.status IN ('present','late'). A
--      student with status='excused' (auto-created by approveLeaveRequest in
--      services/api.ts) would still match the "no present row" loop and get
--      flagged absent + a parent push notification. That violates the rule:
--          "On approved day: must NOT mark absent + must NOT send absence
--           notification."
--   2. Even if the excused row had been included, a race where the absence
--      job runs BEFORE the admin approves leave (or excused row insert
--      partially fails) would still wrongly notify. So we add a second check:
--      a direct leave_requests lookup with status='approved' covering the
--      target date.
--
-- This migration is ADDITIVE — it replaces the function body but the
-- signature and grants stay identical, so no caller breaks. Pre-existing
-- behaviour (admin auth check, idempotency on duplicate absent rows, dry-run
-- mode, no-parent counter, return shape) is preserved verbatim.
--
-- NOTE (pre-existing, NOT fixed here): the function checks role IN
-- ('admin','institute_admin') but the canonical role in `enrollments` is
-- 'institute' (memory: project_kai_mobile, archive #1). This means the
-- function currently rejects institute admins. Flagged separately — fixing
-- it requires confirmation from the user since it touches an auth gate.
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_absent_students(
  p_institute_id uuid,
  p_school_day date DEFAULT CURRENT_DATE,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_marked int := 0;
  v_notified int := 0;
  v_already_marked int := 0;
  v_no_parent int := 0;
  v_skipped_leave int := 0;
  r record;
  rp record;
  v_parent_count int;
BEGIN
  -- AuthZ — only admin or institute admin of this institute may run
  SELECT role INTO v_caller_role
  FROM enrollments
  WHERE user_id = auth.uid()
    AND status = 'active'
    AND (institute_id = p_institute_id OR institute_id IS NULL)
    AND role IN ('admin','institute_admin')
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'unauthorized: only institute admins may run absence detection';
  END IF;

  -- Iterate students enrolled in this institute who have NO 'present'/'late'/
  -- 'excused' row for the day AND who are NOT covered by an approved leave
  -- request that spans the target school day.
  FOR r IN
    SELECT DISTINCT sc.student_id, u.full_name
    FROM student_classes sc
    JOIN classes c ON c.id = sc.class_id
    JOIN users u ON u.id = sc.student_id
    WHERE c.institute_id = p_institute_id
      AND NOT EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.student_id = sc.student_id
          AND a.date = p_school_day
          -- 'excused' added so an existing excused row (created by
          -- approveLeaveRequest) suppresses both the absent insert AND the
          -- parent notification.
          AND a.status IN ('present','late','excused')
      )
      AND NOT EXISTS (
        -- Belt-and-suspenders: even if the excused row was never written,
        -- the source-of-truth is an approved leave_request covering the day.
        SELECT 1 FROM leave_requests lr
        WHERE lr.subject_id = sc.student_id
          AND lr.subject_type = 'student'
          AND lr.status = 'approved'
          AND p_school_day BETWEEN lr.start_date
                              AND COALESCE(lr.end_date, lr.start_date)
      )
  LOOP
    -- Skip if already marked absent for this day (idempotent)
    IF EXISTS (
      SELECT 1 FROM attendance a
      WHERE a.student_id = r.student_id
        AND a.date = p_school_day
        AND a.status = 'absent'
    ) THEN
      v_already_marked := v_already_marked + 1;
      CONTINUE;
    END IF;

    IF NOT p_dry_run THEN
      INSERT INTO attendance (student_id, date, status, institute_id)
      VALUES (r.student_id, p_school_day, 'absent', p_institute_id);
    END IF;

    v_marked := v_marked + 1;

    -- Notify each parent of this student
    v_parent_count := 0;
    FOR rp IN
      SELECT pc.parent_id
      FROM parent_child pc
      WHERE pc.student_id = r.student_id
    LOOP
      IF NOT p_dry_run THEN
        INSERT INTO notifications (
          recipient_id, recipient_role, sender_id, sender_role,
          type, category, title, message, metadata, is_read, institute_id
        ) VALUES (
          rp.parent_id, 'parent',
          auth.uid(), 'admin',
          'attendance_absent', 'academic',
          'تنبيه غياب',
          'ابنك / ابنتك سُجّل غياب اليوم ' || to_char(p_school_day, 'YYYY-MM-DD'),
          jsonb_build_object('school_day', p_school_day, 'institute_id', p_institute_id, 'student_id', r.student_id),
          false, p_institute_id
        );
      END IF;
      v_parent_count := v_parent_count + 1;
      v_notified := v_notified + 1;
    END LOOP;
    IF v_parent_count = 0 THEN
      v_no_parent := v_no_parent + 1;
    END IF;
  END LOOP;

  -- For visibility: count how many students were skipped because of approved
  -- leave (helps admins debug "why is X not marked absent?").
  SELECT COUNT(DISTINCT sc.student_id) INTO v_skipped_leave
  FROM student_classes sc
  JOIN classes c ON c.id = sc.class_id
  WHERE c.institute_id = p_institute_id
    AND EXISTS (
      SELECT 1 FROM leave_requests lr
      WHERE lr.subject_id = sc.student_id
        AND lr.subject_type = 'student'
        AND lr.status = 'approved'
        AND p_school_day BETWEEN lr.start_date
                            AND COALESCE(lr.end_date, lr.start_date)
    );

  RETURN jsonb_build_object(
    'success', true,
    'school_day', p_school_day,
    'institute_id', p_institute_id,
    'dry_run', p_dry_run,
    'students_marked_absent', v_marked,
    'already_marked_absent', v_already_marked,
    'parent_notifications_inserted', v_notified,
    'students_without_parents', v_no_parent,
    'students_on_approved_leave', v_skipped_leave
  );
END $$;

-- Grants stay identical to the original migration.
REVOKE EXECUTE ON FUNCTION notify_absent_students(uuid, date, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION notify_absent_students(uuid, date, boolean) TO authenticated;

-- Index that the new WHERE clause depends on. Without this the leave-coverage
-- subquery does a full scan of leave_requests for every student in the loop.
-- Composite index on (subject_id, status, start_date, end_date) supports the
-- exact filter we use.
CREATE INDEX IF NOT EXISTS idx_leave_requests_subject_status_dates
  ON leave_requests (subject_id, status, start_date, end_date);
