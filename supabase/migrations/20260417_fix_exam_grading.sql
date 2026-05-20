-- Fix auto_grade_exam to read answers from exam_answers (not session.answers),
-- resolve ambiguous student_id, and compare text answers to options[correctIndex].

DROP FUNCTION IF EXISTS auto_grade_exam(uuid);

CREATE OR REPLACE FUNCTION auto_grade_exam(p_exam_id uuid)
RETURNS TABLE(out_session_id uuid, out_student_id uuid, out_score int, out_max_score int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_questions jsonb;
  v_total_points int;
  v_session record;
  v_question jsonb;
  v_score int;
  v_q_index int;
  v_correct_text text;
  v_correct_bool boolean;
  v_answer_text text;
BEGIN
  SELECT questions::jsonb, total_points INTO v_questions, v_total_points
  FROM exams WHERE id = p_exam_id;
  IF v_questions IS NULL THEN
    RAISE EXCEPTION 'Exam % not found', p_exam_id;
  END IF;

  FOR v_session IN
    SELECT id AS sid, student_id AS stid
    FROM exam_sessions
    WHERE exam_id = p_exam_id
      AND (submitted_at IS NOT NULL OR auto_submitted_at IS NOT NULL)
      AND graded_at IS NULL
  LOOP
    v_score := 0;

    FOR v_q_index IN 0..(jsonb_array_length(v_questions) - 1) LOOP
      v_question := v_questions->v_q_index;

      SELECT answer::text INTO v_answer_text
      FROM exam_answers
      WHERE session_id = v_session.sid AND question_index = v_q_index
      LIMIT 1;

      IF v_answer_text IS NULL THEN CONTINUE; END IF;
      -- Strip surrounding JSON quotes if answer stored as JSON string
      v_answer_text := trim(both '"' from v_answer_text);

      IF v_question->>'type' = 'mcq' THEN
        v_correct_text := v_question->'options'->>(v_question->>'correctIndex')::int;
        IF v_answer_text = v_correct_text THEN
          v_score := v_score + COALESCE((v_question->>'points')::int, 0);
        END IF;
      ELSIF v_question->>'type' = 'tf' THEN
        -- TF stores correctAnswer (bool) and options[0]=صح, options[1]=خطأ
        v_correct_text := v_question->'options'->>(CASE WHEN (v_question->>'correctAnswer')::boolean THEN 0 ELSE 1 END);
        IF v_answer_text = v_correct_text THEN
          v_score := v_score + COALESCE((v_question->>'points')::int, 0);
        END IF;
      END IF;
    END LOOP;

    UPDATE exam_sessions
    SET score = v_score, max_score = v_total_points, graded_at = now(), status = 'graded'
    WHERE id = v_session.sid;

    out_session_id := v_session.sid;
    out_student_id := v_session.stid;
    out_score := v_score;
    out_max_score := v_total_points;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_grade_exam(uuid) TO authenticated, service_role;
