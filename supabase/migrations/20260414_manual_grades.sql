-- ============================================================
-- Manual Grades System — Teachers enter grades for external exams
-- Types: monthly, midterm, final, oral, practical, homework, other
-- ============================================================

-- Grade categories definition
CREATE TABLE IF NOT EXISTS grade_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. "امتحان شهري أول", "نصف السنة"
  type TEXT NOT NULL DEFAULT 'monthly', -- monthly, midterm, final, oral, practical, homework, other
  max_score NUMERIC NOT NULL DEFAULT 100,
  weight NUMERIC DEFAULT 1, -- weight for final average calculation
  academic_year TEXT, -- e.g. "2025-2026"
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institute_id, name, academic_year)
);

-- Individual student grades
CREATE TABLE IF NOT EXISTS manual_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES grade_categories(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id),
  teacher_id UUID NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  class_id UUID, -- class or section
  score NUMERIC NOT NULL,
  max_score NUMERIC NOT NULL DEFAULT 100,
  notes TEXT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE(category_id, student_id, subject) -- one grade per student per subject per category
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_grades_institute ON manual_grades(institute_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON manual_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_teacher ON manual_grades(teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_category ON manual_grades(category_id);
CREATE INDEX IF NOT EXISTS idx_grades_class ON manual_grades(class_id);
CREATE INDEX IF NOT EXISTS idx_grade_cats_institute ON grade_categories(institute_id);

-- RLS
ALTER TABLE grade_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_grades ENABLE ROW LEVEL SECURITY;

-- Categories: admin/institute manage, teachers read
CREATE POLICY grade_cats_admin ON grade_categories FOR ALL
  USING (public.get_user_role() IN ('admin', 'institute'));

CREATE POLICY grade_cats_read ON grade_categories FOR SELECT
  USING (institute_id IN (SELECT e.institute_id FROM enrollments e WHERE e.user_id = auth.uid()));

-- Grades: teacher inserts/updates own, student reads own, parent reads children, admin reads all
CREATE POLICY grades_teacher_write ON manual_grades FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY grades_student_read ON manual_grades FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY grades_parent_read ON manual_grades FOR SELECT
  USING (student_id IN (SELECT pc.student_id FROM parent_child pc WHERE pc.parent_id = auth.uid()));

CREATE POLICY grades_admin_read ON manual_grades FOR SELECT
  USING (public.get_user_role() IN ('admin', 'institute'));
