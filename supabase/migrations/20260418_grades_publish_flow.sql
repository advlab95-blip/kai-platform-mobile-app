-- ============================================================
-- Grades Publish Flow
-- Adds is_published + published_at to manual_grades so students
-- and parents only see grades after the teacher explicitly publishes them.
-- Existing rows default to published=true (historical grades shouldn't disappear).
-- New rows default to published=false (teacher must publish explicitly).
-- ============================================================

ALTER TABLE manual_grades
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Backfill: mark all existing rows as published so we don't hide historical data
-- from students when the migration runs on a production DB.
UPDATE manual_grades
  SET is_published = true, published_at = COALESCE(updated_at, entered_at, now())
  WHERE is_published = false AND entered_at < now();

CREATE INDEX IF NOT EXISTS idx_grades_published ON manual_grades(is_published)
  WHERE is_published = true;

-- ── RLS tightening — students/parents only see published rows ──
-- Previous student/parent read policies were too permissive (they could see drafts).
-- Replace with gated versions. Teachers still see everything (they own the data).

DROP POLICY IF EXISTS grades_student_read ON manual_grades;
CREATE POLICY grades_student_read ON manual_grades FOR SELECT
  USING (student_id = auth.uid() AND is_published = true);

DROP POLICY IF EXISTS grades_parent_read ON manual_grades;
CREATE POLICY grades_parent_read ON manual_grades FOR SELECT
  USING (
    is_published = true
    AND student_id IN (
      SELECT pc.student_id FROM parent_child pc WHERE pc.parent_id = auth.uid()
    )
  );

COMMENT ON COLUMN manual_grades.is_published IS
  'Teacher must explicitly publish for students/parents to see. Default false.';
