-- Mirror every section into the classes table using the SAME id.
--
-- Why: galleries/videos/materials/tasks all have FK constraints on class_id
-- pointing at classes(id). Schools don't populate the classes table by
-- default — they use sections — so teacher_assignments.class_id (set by
-- 20260519_teacher_assignments_normalize.sql to section_id) would violate
-- the FK at write time.
--
-- This migration creates a one-to-one mirror so the FK resolves while
-- preserving the conceptual model (admins still manage sections in the UI;
-- the classes row is purely a tenant-boundary anchor).
--
-- Naming: "<grade name> — <section name>" so any UI that surfaces class_name
-- (e.g. notifications context, exports) shows something meaningful.
--
-- Idempotent: safe to re-run; NOT EXISTS guard prevents duplicate keys.

INSERT INTO classes (id, institute_id, name)
SELECT
  sec.id,
  sec.institute_id,
  COALESCE(g.name, '') || ' — ' || sec.name
FROM sections sec
LEFT JOIN grades g ON g.id = sec.grade_id
WHERE NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = sec.id);
