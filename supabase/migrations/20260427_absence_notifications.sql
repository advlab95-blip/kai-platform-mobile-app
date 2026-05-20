-- ═══════════════════════════════════════════════════
-- Daily Absence Detection + Parent Notifications
-- Identifies students with no 'present' attendance row for a given day,
-- inserts an 'absent' attendance row, and notifies parents.
-- Designed to be called manually by admin or scheduled via pg_cron.
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

  -- Iterate students enrolled in this institute who have NO 'present' row for the day
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
          AND a.status IN ('present','late')
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
      -- Insert absent row (matches existing attendance table schema)
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

  RETURN jsonb_build_object(
    'success', true,
    'school_day', p_school_day,
    'institute_id', p_institute_id,
    'dry_run', p_dry_run,
    'students_marked_absent', v_marked,
    'already_marked_absent', v_already_marked,
    'parent_notifications_inserted', v_notified,
    'students_without_parents', v_no_parent
  );
END $$;

REVOKE EXECUTE ON FUNCTION notify_absent_students(uuid, date, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION notify_absent_students(uuid, date, boolean) TO authenticated;

-- ═══════════════════════════════════════════════════
-- Daily wrapper: loops all institutes (for cron-driven runs)
-- Caller must be platform admin (or service role).
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_absent_students_all_institutes(
  p_school_day date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  r record;
  v_is_platform_admin boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM enrollments
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND institute_id IS NULL
      AND status = 'active'
  ) INTO v_is_platform_admin;

  IF NOT v_is_platform_admin THEN
    RAISE EXCEPTION 'unauthorized: only platform admin may run all-institutes detection';
  END IF;

  FOR r IN SELECT id FROM institutes LOOP
    BEGIN
      v_one := notify_absent_students(r.id, p_school_day, false);
      v_results := v_results || jsonb_build_array(v_one);
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'institute_id', r.id, 'error', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'school_day', p_school_day, 'results', v_results);
END $$;

REVOKE EXECUTE ON FUNCTION notify_absent_students_all_institutes(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION notify_absent_students_all_institutes(date) TO authenticated;
