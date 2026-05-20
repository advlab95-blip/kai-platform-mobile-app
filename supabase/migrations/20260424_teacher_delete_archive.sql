-- Preserve teacher content when an institute admin deletes the teacher.
-- Content goes into the platform-admin archive (is_archived=true) with the
-- original name retained so admins can restore or reassign later.
--
-- Without this migration, deleting a teacher either cascade-deletes their
-- videos/materials (losing content) or fails the FK (blocking the delete).

-- 1. Columns for archive provenance
ALTER TABLE videos ADD COLUMN IF NOT EXISTS original_teacher_name TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS original_teacher_name TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- 2. Relax teacher_id FK → SET NULL on user deletion so content survives
DO $$ BEGIN
  ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_teacher_id_fkey;
  ALTER TABLE videos ADD CONSTRAINT videos_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'videos FK update skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_teacher_id_fkey;
  ALTER TABLE materials ADD CONSTRAINT materials_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'materials FK update skipped: %', SQLERRM;
END $$;

-- 3. Ensure institute_id exists so the admin archive can filter by institute
-- even after teacher_id is NULLed out.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES institutes(id) ON DELETE SET NULL;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES institutes(id) ON DELETE SET NULL;

-- Backfill institute_id on existing content from the teacher's enrollment.
-- Safe to re-run; only touches rows where institute_id is still NULL.
UPDATE videos v
SET institute_id = e.institute_id
FROM enrollments e
WHERE v.teacher_id = e.user_id
  AND e.role = 'teacher'
  AND v.institute_id IS NULL;

UPDATE materials m
SET institute_id = e.institute_id
FROM enrollments e
WHERE m.teacher_id = e.user_id
  AND e.role = 'teacher'
  AND m.institute_id IS NULL;

-- 4. Index so archive queries by institute stay fast
CREATE INDEX IF NOT EXISTS idx_videos_institute_archived
  ON videos(institute_id, is_archived, archived_at DESC)
  WHERE is_archived = true;
CREATE INDEX IF NOT EXISTS idx_materials_institute_archived
  ON materials(institute_id, is_archived, archived_at DESC)
  WHERE is_archived = true;
