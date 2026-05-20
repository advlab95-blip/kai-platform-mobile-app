-- Migration: add materials.type column + exam live grading infrastructure
-- Context: `materials` table was missing `type` column, causing PDF uploads to fail silently.
-- Also establishes schema/RPCs for the live exam timer + auto-grading feature.

-- ──────────────────────────────────────────────────────────
-- 1. materials.type — used to distinguish PDF / video / etc.
-- ──────────────────────────────────────────────────────────
ALTER TABLE materials ADD COLUMN IF NOT EXISTS type text DEFAULT 'material';
CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);

-- Backfill any rows that were meant to be PDFs (they had cover_url but no explicit type)
UPDATE materials SET type = 'pdf' WHERE type = 'material' AND cover_url IS NOT NULL AND cover_url LIKE '%.pdf%';

-- ──────────────────────────────────────────────────────────
-- 2. exam_sessions — ensure status column supports the new flow
-- ──────────────────────────────────────────────────────────
-- Existing statuses likely: in_progress, submitted. Add 'auto_submitted', 'graded' safely.
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS auto_submitted_at timestamptz;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS graded_at timestamptz;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS grade_published_at timestamptz;

-- ──────────────────────────────────────────────────────────
-- 3. RPC: auto_grade_exam — server-side grading of all submitted sessions
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_grade_exam(p_exam_id uuid)
RETURNS TABLE(session_id uuid, student_id uuid, score int, max_score int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_questions jsonb;
  v_total_points int;
  v_session record;
  v_answer jsonb;
  v_question jsonb;
  v_score int;
  v_q_index int;
BEGIN
  -- Load exam
  SELECT questions::jsonb, total_points INTO v_questions, v_total_points
  FROM exams WHERE id = p_exam_id;

  IF v_questions IS NULL THEN
    RAISE EXCEPTION 'Exam % not found', p_exam_id;
  END IF;

  -- Grade each session that hasn't been graded yet
  FOR v_session IN
    SELECT id, student_id, answers::jsonb AS answers
    FROM exam_sessions
    WHERE exam_id = p_exam_id AND graded_at IS NULL
  LOOP
    v_score := 0;
    -- Iterate each question and compare stored answer
    FOR v_q_index IN 0..(jsonb_array_length(v_questions) - 1) LOOP
      v_question := v_questions->v_q_index;
      v_answer := v_session.answers->v_q_index;
      -- MCQ: compare answer (number) to correctIndex
      IF v_question->>'type' = 'mcq' THEN
        IF (v_answer)::text IS NOT NULL AND (v_answer)::text::int = (v_question->>'correctIndex')::int THEN
          v_score := v_score + COALESCE((v_question->>'points')::int, 0);
        END IF;
      -- True/False: compare boolean
      ELSIF v_question->>'type' = 'tf' THEN
        IF (v_answer)::text::boolean = (v_question->>'correctAnswer')::boolean THEN
          v_score := v_score + COALESCE((v_question->>'points')::int, 0);
        END IF;
      END IF;
    END LOOP;

    -- Update session with graded score
    UPDATE exam_sessions
    SET score = v_score, max_score = v_total_points, graded_at = now(), status = 'graded'
    WHERE id = v_session.id;

    session_id := v_session.id;
    student_id := v_session.student_id;
    score := v_score;
    max_score := v_total_points;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_grade_exam(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────
-- 4. RPC: publish_exam_grades — mark grades as visible to students + notify
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION publish_exam_grades(p_exam_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
  v_exam record;
  v_session record;
BEGIN
  SELECT title, institute_id, teacher_id INTO v_exam FROM exams WHERE id = p_exam_id;

  UPDATE exam_sessions
  SET grade_published_at = now()
  WHERE exam_id = p_exam_id AND graded_at IS NOT NULL AND grade_published_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Create notifications for each student
  FOR v_session IN
    SELECT student_id, score, max_score FROM exam_sessions
    WHERE exam_id = p_exam_id AND grade_published_at IS NOT NULL
  LOOP
    INSERT INTO notifications (sender_role, sender_id, recipient_role, recipient_id, institute_id, title, message, type, is_read)
    VALUES ('teacher', v_exam.teacher_id, 'student', v_session.student_id, v_exam.institute_id,
            'درجة الامتحان', v_exam.title || ' — درجتك: ' || v_session.score || '/' || v_session.max_score,
            'grade', false);
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION publish_exam_grades(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────
-- 5. RPC: auto_submit_expired_exam — called by teacher when timer ends
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_submit_expired_exam(p_exam_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE exam_sessions
  SET status = 'submitted', auto_submitted_at = now(), submitted_at = now()
  WHERE exam_id = p_exam_id
    AND status IN ('in_progress', 'started')
    AND auto_submitted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_submit_expired_exam(uuid) TO authenticated, service_role;
