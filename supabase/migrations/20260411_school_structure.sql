-- ═══════════════════════════════════════════════════
-- School Structure: Stages, Grades, Sections, Subjects, Teacher Assignments
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Add type to institutes (school vs institute)
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'institute';
DO $$ BEGIN
  ALTER TABLE institutes ADD CONSTRAINT institutes_type_check CHECK (type IN ('institute', 'school'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Stages (مراحل — for schools only)
CREATE TABLE IF NOT EXISTS stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_num INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Grades (صفوف — within stages)
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_num INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Sections (شعب — within grades)
CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Subjects (مواد دراسية)
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Teacher Assignments (ربط الأستاذ بالمواد والشعب/الكروبات)
CREATE TABLE IF NOT EXISTS teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,   -- for schools
  class_id UUID,                                                 -- for institutes (groups)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Student section enrollment (for schools)
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS section_id UUID;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS grade_id UUID;

-- 8. RLS policies (permissive for now)
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY stages_permissive ON stages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY grades_permissive ON grades FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY sections_permissive ON sections FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY subjects_permissive ON subjects FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ta_permissive ON teacher_assignments FOR ALL USING (true) WITH CHECK (true);
