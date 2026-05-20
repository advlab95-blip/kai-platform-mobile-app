-- =============================================================================
-- Smoke test: section-level content scoping
-- Run via Supabase SQL editor as the project owner.
-- Verifies the RLS policies will hide cross-section content.
-- =============================================================================

\echo '=== 1. Schema check: section_id columns ==='
SELECT
  table_name,
  bool_or(column_name = 'section_id') as has_section_id
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('videos','materials','tasks','galleries','ai_lessons','assignments','exams')
GROUP BY table_name
ORDER BY table_name;

\echo ''
\echo '=== 2. Policy check: SELECT policies must reference section_id ==='
SELECT
  tablename,
  policyname,
  CASE WHEN qual ~ 'section_id' THEN 'SECTION_AWARE ✅' ELSE 'MISSING ❌' END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('videos','materials','tasks','galleries','ai_lessons','assignments','exams')
  AND cmd = 'SELECT'
ORDER BY tablename;

\echo ''
\echo '=== 3. Multi-permissive check: should be zero ==='
SELECT
  tablename, cmd, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

\echo ''
\echo '=== 4. Unwrapped auth.uid(): should be zero ==='
SELECT COUNT(*) as unwrapped_auth_count
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (qual ~ 'auth\.(uid|jwt|role)\(\)' AND qual !~ '\(\s*SELECT\s+auth\.')
    OR (with_check ~ 'auth\.(uid|jwt|role)\(\)' AND with_check !~ '\(\s*SELECT\s+auth\.')
  );

\echo ''
\echo '=== 5. Unindexed foreign keys: should be zero ==='
SELECT COUNT(*) as unindexed_fk_count
FROM pg_constraint c
WHERE contype = 'f'
  AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND (i.indkey::int[])[0:array_length(c.conkey,1)-1] = c.conkey::int[]
  );

\echo ''
\echo '=== 6. Cron jobs: should show 4 active jobs ==='
SELECT jobname, schedule, active FROM cron.job ORDER BY jobid;

\echo ''
\echo '=== 7. anon-callable SECURITY DEFINER: should only be verify_login_code + check_code_available ==='
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;

\echo ''
\echo '=== 8. RLS coverage: all public tables must have RLS enabled ==='
SELECT
  COUNT(*) FILTER (WHERE c.relrowsecurity = false) as tables_without_rls,
  COUNT(*) FILTER (WHERE c.relrowsecurity = true) as tables_with_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
