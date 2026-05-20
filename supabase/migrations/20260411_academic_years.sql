-- ═══════════════════════════════════════════════════
-- Academic Years + Enrollment Lifecycle Management
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Academic Years table
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- e.g. '2025-2026'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one current year per institute
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_year
  ON academic_years (institute_id) WHERE is_current = true;

-- 2. Enrollment extensions
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS class_id UUID;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS transferred_from UUID;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS frozen_by UUID;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add created_at/updated_at if not exist
DO $$ BEGIN
  ALTER TABLE enrollments ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE enrollments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add status constraint
DO $$ BEGIN
  ALTER TABLE enrollments ADD CONSTRAINT enrollments_status_check
    CHECK (status IN ('active','frozen','archived','transferred','graduated'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. User freeze flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT false;

-- 4. Backfill existing enrollments
UPDATE enrollments SET status = 'active' WHERE status IS NULL;

-- 5. Enrollment history audit table
CREATE TABLE IF NOT EXISTS enrollment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Student-Classes junction (multi-class enrollment)
CREATE TABLE IF NOT EXISTS student_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  class_id UUID NOT NULL,
  institute_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, class_id)
);

-- 7. RLS policies
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY ay_permissive ON academic_years FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE enrollment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY eh_permissive ON enrollment_history FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE student_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sc_permissive ON student_classes FOR ALL USING (true) WITH CHECK (true);
