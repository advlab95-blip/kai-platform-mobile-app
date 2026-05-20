-- =====================================================================
-- Cleanup: orphan institutes created before admin-ops Edge Function
-- =====================================================================
-- Background:
--   Prior client code (services/api.ts) relied on `supabaseAdmin` — the
--   service_role client — to create institutes, schools, and admin auth
--   users. In production builds that client is intentionally null (the
--   service_role key must never ship inside a mobile APK). As a result:
--
--   - createInstitute: threw "Service role key غير متوفر" → no row written
--   - createSchool:    partially ran — inserted into institutes/stages/
--                      grades/subjects, then silently skipped the auth-user
--                      provisioning step. The institute shows up in the
--                      admin list with no admin account and no code.
--
-- This migration removes those orphan institute rows so the admin UI stops
-- showing dead entries with `undefined` codes. Safe because the institute
-- has zero enrollments and zero user data attached.
-- =====================================================================

-- Hard-require both safety conditions before deleting any row:
--   1. No active institute admin enrollment exists for the institute.
--   2. No users are enrolled in the institute at all (any role).
-- If either check fails, the row is kept — operator can inspect manually.

BEGIN;

WITH orphans AS (
  SELECT i.id
  FROM institutes i
  WHERE NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.institute_id = i.id
      AND e.role = 'institute'
      AND e.status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM enrollments e2
    WHERE e2.institute_id = i.id
  )
)
-- Dependent child rows first (FKs often CASCADE but we delete explicitly
-- for visibility — if CASCADE is in place these are no-ops).
DELETE FROM grades   WHERE institute_id IN (SELECT id FROM orphans);

WITH orphans AS (
  SELECT i.id FROM institutes i
  WHERE NOT EXISTS (SELECT 1 FROM enrollments e
                    WHERE e.institute_id = i.id AND e.role = 'institute' AND e.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.institute_id = i.id)
)
DELETE FROM stages   WHERE institute_id IN (SELECT id FROM orphans);

WITH orphans AS (
  SELECT i.id FROM institutes i
  WHERE NOT EXISTS (SELECT 1 FROM enrollments e
                    WHERE e.institute_id = i.id AND e.role = 'institute' AND e.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.institute_id = i.id)
)
DELETE FROM subjects WHERE institute_id IN (SELECT id FROM orphans);

WITH orphans AS (
  SELECT i.id FROM institutes i
  WHERE NOT EXISTS (SELECT 1 FROM enrollments e
                    WHERE e.institute_id = i.id AND e.role = 'institute' AND e.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.institute_id = i.id)
)
DELETE FROM classes  WHERE institute_id IN (SELECT id FROM orphans);

-- Finally, the institute row itself.
WITH orphans AS (
  SELECT i.id FROM institutes i
  WHERE NOT EXISTS (SELECT 1 FROM enrollments e
                    WHERE e.institute_id = i.id AND e.role = 'institute' AND e.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.institute_id = i.id)
)
DELETE FROM institutes WHERE id IN (SELECT id FROM orphans);

COMMIT;
