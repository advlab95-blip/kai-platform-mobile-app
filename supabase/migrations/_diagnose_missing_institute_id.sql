-- DIAGNOSTIC ONLY — run this first, paste the result back.
-- It lists which of the tables referenced by the v3 migration are MISSING
-- an institute_id column in the live database.
--
-- Expected result: every one of these tables should return has_institute_id=true.
-- Any row with has_institute_id=false tells us exactly where the v3 migration
-- is failing.

WITH expected(table_name) AS (
  VALUES
    ('users'),
    ('enrollments'),
    ('grade_entries'),
    ('attendance'),
    ('exams'),
    ('parent_child'),       -- expected FALSE (no column by design)
    ('certificates'),
    ('stages'),
    ('grades'),
    ('sections'),
    ('subjects'),
    ('teacher_assignments'),
    ('student_classes')
)
SELECT
  e.table_name,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = e.table_name
  ) AS table_exists,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name  = e.table_name
      AND c.column_name = 'institute_id'
  ) AS has_institute_id
FROM expected e
ORDER BY e.table_name;
