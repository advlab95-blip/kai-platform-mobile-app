-- ═══════════════════════════════════════════════════
-- Electronic Assignments System
-- Feature Flag: electronic_assignments
-- ═══════════════════════════════════════════════════

-- 1. Assignments (الواجبات)
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  class_id UUID,
  section_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  max_score INT DEFAULT 100,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  allow_late BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Assignment Questions (أسئلة الواجب)
CREATE TABLE IF NOT EXISTS assignment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'short_answer',
  content TEXT NOT NULL,
  image_url TEXT,
  options JSONB,
  correct_answer TEXT,
  points INT DEFAULT 10,
  order_num INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Supported types: mcq, multi_select, true_false, fill_blank, short_answer, essay

-- 3. Assignment Submissions (تسليمات الطلاب)
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  status TEXT DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  score INT,
  feedback TEXT,
  graded_by UUID,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);

-- Status: draft, submitted, graded, returned

-- 4. Assignment Answers (إجابات الطالب)
CREATE TABLE IF NOT EXISTS assignment_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES assignment_questions(id) ON DELETE CASCADE,
  answer TEXT,
  file_url TEXT,
  score INT,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(submission_id, question_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_assignments_inst ON assignments (institute_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions (student_id, assignment_id);

-- 6. RLS
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY asgn_read ON assignments FOR SELECT USING (
  teacher_id = auth.uid()
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY asgn_write ON assignments FOR ALL USING (
  teacher_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute')
);

ALTER TABLE assignment_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY aq_all ON assignment_questions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY asub_read ON assignment_submissions FOR SELECT USING (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher', 'parent')
);
CREATE POLICY asub_write ON assignment_submissions FOR ALL USING (
  student_id = auth.uid() OR public.get_user_role() IN ('admin', 'teacher')
);

ALTER TABLE assignment_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY aa_all ON assignment_answers FOR ALL USING (true) WITH CHECK (true);
