-- ═══════════════════════════════════════════════════
-- Enhanced Exam System (8 question types)
-- Feature Flag: exam_system
-- ═══════════════════════════════════════════════════

-- 1. Exam sessions (student takes exam)
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL,
  student_id UUID NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'in_progress',
  device_info TEXT,
  score INT,
  max_score INT,
  feedback TEXT,
  graded_by UUID,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exam_id, student_id)
);
-- Status: in_progress, submitted, graded, returned

-- 2. Exam answers (per question per session)
CREATE TABLE IF NOT EXISTS exam_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_index INT NOT NULL,
  answer JSONB,
  score INT,
  feedback TEXT,
  answered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, question_index)
);

-- 3. Add enhanced fields to exams table
ALTER TABLE exams ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_results BOOLEAN DEFAULT true;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS time_per_question INT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS passing_score INT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS instructions TEXT;

-- 4. RLS
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY es_read ON exam_sessions FOR SELECT USING (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher', 'parent')
);
CREATE POLICY es_write ON exam_sessions FOR ALL USING (
  student_id = auth.uid() OR public.get_user_role() IN ('admin', 'teacher')
);

ALTER TABLE exam_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY ea_all ON exam_answers FOR ALL USING (true) WITH CHECK (true);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student ON exam_sessions (student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_session ON exam_answers (session_id);
