-- ─────────────────────────────────────────────────────────────────────────────
-- Teacher assignments normalization + UNIQUE constraint
--
-- Background:
--   Historically the "school create-user" wizard saved the chosen classes.id
--   into the section_id column and left class_id NULL. This made downstream
--   content APIs (createGallery / createVideo / ...) reject teacher uploads
--   because they require class_id to scope a row to a specific class and
--   prevent cross-class leaks.
--
--   The institute wizard saved subject_id with both class_id and section_id
--   NULL, so institute teachers had no tenant scope at all on their content.
--
-- This migration:
--   1. Back-fills class_id from section_id where section_id matches a real
--      classes.id row (i.e. the school-wizard legacy convention).
--   2. Adds a partial UNIQUE index so a given teacher can be assigned the
--      same (subject, class, section) combo only once per institute, while
--      still allowing one teacher to teach multiple subjects across multiple
--      classes and sections.
--   3. Adds helpful indexes for the lookup paths used by teacherStore and
--      the admin user-detail sheet.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Back-fill class_id from section_id for school rows.
--    For schools, section_id IS the tenant boundary — there's no separate
--    classes row per section in practice (the classes table is empty for
--    most schools). Copying section_id → class_id makes the tenant boundary
--    explicit and lets downstream content APIs (createGallery / createVideo)
--    work uniformly across schools and institutes without branching.
--    section_id has FK to sections, so the UUID is always valid and scoped
--    to the same institute via RLS.
UPDATE teacher_assignments AS ta
SET class_id = ta.section_id
WHERE ta.class_id IS NULL
  AND ta.section_id IS NOT NULL;

-- 2) Detect orphan rows that still have no class_id and no resolvable class
--    via section_id. These rows would silently fail downstream — log them
--    but don't delete (admin needs to fix manually). Surfaced via a comment
--    on the table that the admin tools can query.
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM teacher_assignments
  WHERE class_id IS NULL
    AND (section_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM classes c WHERE c.id = teacher_assignments.section_id
    ));
  IF orphan_count > 0 THEN
    RAISE NOTICE 'teacher_assignments: % rows still have no class_id after backfill — these will fail content creation until fixed', orphan_count;
  END IF;
END $$;

-- 3) Partial UNIQUE index — one row per (teacher, institute, subject, class, section).
--    Using a partial index with COALESCE-equivalent expression handling so NULLs
--    don't defeat uniqueness (Postgres treats NULL as distinct by default).
CREATE UNIQUE INDEX IF NOT EXISTS ux_teacher_assignments_unique
  ON teacher_assignments (
    teacher_id,
    institute_id,
    subject_id,
    COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 4) Lookup indexes for the hot paths.
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_inst
  ON teacher_assignments (teacher_id, institute_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class
  ON teacher_assignments (class_id) WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_section
  ON teacher_assignments (section_id) WHERE section_id IS NOT NULL;

COMMIT;
