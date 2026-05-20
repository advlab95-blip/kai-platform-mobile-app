-- Update publish_exam_grades to also notify parents of each student.
--
-- WHY
-- ───
-- Original RPC (20260416_add_materials_type_and_exam_grading.sql) only inserts
-- a notification for the student. Parents have no signal that a grade landed,
-- so they had to ask the student or open the parent app blindly. CLAUDE.md
-- §"Multi-Role" rule: every action with a sender + receiver must be wired on
-- BOTH sides. We were missing the parent side.
--
-- WHAT CHANGES
-- ────────────
-- Same logic, plus a second INSERT loop that copies each grade into a
-- notification addressed to every parent linked to the student via
-- parent_child. Idempotent: re-running publish only emits notifications for
-- newly-published rows (the WHERE clause excludes already-published sessions
-- before the UPDATE). Cross-tenant safe: parents are filtered by the same
-- institute_id as the exam.

CREATE OR REPLACE FUNCTION publish_exam_grades(p_exam_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_exam record;
  v_session record;
  v_parent record;
BEGIN
  SELECT title, institute_id, teacher_id INTO v_exam FROM exams WHERE id = p_exam_id;
  IF v_exam.institute_id IS NULL THEN
    RAISE EXCEPTION 'exam not found';
  END IF;

  -- Authorization: only the owning teacher (or institute admins) may publish.
  IF NOT EXISTS (
    SELECT 1 FROM enrollments
    WHERE user_id = auth.uid()
      AND institute_id = v_exam.institute_id
      AND status = 'active'
      AND (role IN ('admin','institute_admin') OR auth.uid() = v_exam.teacher_id)
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE exam_sessions
  SET grade_published_at = now()
  WHERE exam_id = p_exam_id AND graded_at IS NOT NULL AND grade_published_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Notify each student whose grade was just published, then notify every
  -- linked parent. Two passes keep the SQL straightforward and let parents
  -- receive a clearer copy ("درجة ابنك/ابنتك") instead of the student's copy.
  FOR v_session IN
    SELECT es.student_id, es.score, es.max_score, u.full_name AS student_name
    FROM exam_sessions es
    LEFT JOIN users u ON u.id = es.student_id
    WHERE es.exam_id = p_exam_id AND es.grade_published_at IS NOT NULL
  LOOP
    INSERT INTO notifications (sender_role, sender_id, recipient_role, recipient_id, institute_id, title, message, type, is_read)
    VALUES (
      'teacher', v_exam.teacher_id, 'student', v_session.student_id, v_exam.institute_id,
      'درجة الامتحان',
      v_exam.title || ' — درجتك: ' || v_session.score || '/' || v_session.max_score,
      'grade', false
    );

    -- Parent notifications — one per linked parent. parent_child uses
    -- (parent_id, student_id) per services/api.ts:1246. Parents must also be
    -- enrolled in the same institute (defense-in-depth against legacy rows
    -- pointing to other tenants).
    FOR v_parent IN
      SELECT pc.parent_id
      FROM parent_child pc
      JOIN enrollments e
        ON e.user_id = pc.parent_id
       AND e.institute_id = v_exam.institute_id
       AND e.status = 'active'
      WHERE pc.student_id = v_session.student_id
    LOOP
      INSERT INTO notifications (sender_role, sender_id, recipient_role, recipient_id, institute_id, title, message, type, is_read)
      VALUES (
        'teacher', v_exam.teacher_id, 'parent', v_parent.parent_id, v_exam.institute_id,
        'درجة ابنك/ابنتك',
        COALESCE(v_session.student_name, 'الطالب') || ' — ' || v_exam.title || ': ' || v_session.score || '/' || v_session.max_score,
        'grade', false
      );
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION publish_exam_grades(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION publish_exam_grades(uuid) TO authenticated, service_role;
