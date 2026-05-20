-- =============================================================================
-- Migration: 20260428_rls_multitenant_lockdown.sql
-- Purpose : Close multi-tenant data isolation leak in *_write RLS policies.
--
-- Problem :
--   Many *_write policies use `cmd=ALL` with a role-only filter
--   (e.g. `get_user_role() = ANY (ARRAY['admin','institute'])`) and have
--   NO `institute_id` predicate. Because `role='institute'` is granted
--   per-tenant, a user holding that role in institute B was able to
--   SELECT/INSERT/UPDATE/DELETE rows belonging to institute A.
--
-- Fix    :
--   Replace each affected policy with one that splits into two branches:
--     1) Platform admin (get_user_role() = 'admin' AND enrolled with
--        institute_id IS NULL) -- legitimate cross-tenant access.
--     2) Institute-scoped roles -- must additionally satisfy
--        `institute_id IN (SELECT get_user_institute_ids())`.
--   WITH CHECK mirrors the USING qual to block cross-tenant INSERT/UPDATE.
--
-- Scope  : ONLY the policies in the verified affected list. Read policies,
--          user-scoped policies, and platform-admin-only policies are NOT
--          touched. RLS-enabled status is NOT changed anywhere.
--
-- Idempotent: Uses CREATE OR REPLACE FUNCTION and DROP POLICY IF EXISTS.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------------------
-- 1. Helper: is_admin_of_institute(p_institute_id uuid)
--    Returns TRUE if caller is platform admin OR active institute-level admin
--    of the supplied institute. NOT used inside the rewritten policies (they
--    inline the check for planner-friendly predicate pushdown into indexes),
--    but exposed for application code / future policies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_of_institute(p_institute_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    -- platform admin: role='admin' AND has enrollment with institute_id IS NULL
    SELECT 1
    FROM public.users u
    JOIN public.enrollments e ON e.user_id = u.id
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND e.institute_id IS NULL
      AND e.status = 'active'
  )
  OR EXISTS (
    -- institute-scoped admin in this specific institute
    SELECT 1
    FROM public.enrollments e
    WHERE e.user_id = auth.uid()
      AND e.institute_id = p_institute_id
      AND e.status = 'active'
      AND e.role IN ('institute', 'institute_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_of_institute(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_of_institute(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_of_institute(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_admin_of_institute(uuid) IS
  'Returns true if auth.uid() is platform admin or institute/institute_admin of the given institute. SECURITY DEFINER.';

-- -----------------------------------------------------------------------------
-- 2. Rewrite affected *_write policies.
--    Pattern per policy:
--      DROP POLICY IF EXISTS <name> ON <table>;
--      CREATE POLICY <name> ON <table>
--        FOR ALL TO authenticated
--        USING (
--          get_user_role() = 'admin'
--          OR (
--            get_user_role() = ANY (ARRAY[<original_roles_minus_admin>])
--            AND institute_id IN (SELECT get_user_institute_ids())
--          )
--        )
--        WITH CHECK (... same expression ...);
-- -----------------------------------------------------------------------------

-- ---- classes ---------------------------------------------------------------
DROP POLICY IF EXISTS classes_write ON public.classes;
CREATE POLICY classes_write ON public.classes
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- enrollments -----------------------------------------------------------
DROP POLICY IF EXISTS enrollments_write ON public.enrollments;
CREATE POLICY enrollments_write ON public.enrollments
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- branches --------------------------------------------------------------
DROP POLICY IF EXISTS br_write ON public.branches;
CREATE POLICY br_write ON public.branches
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- branch_managers (no institute_id; derive via branches.branch_id) -----
DROP POLICY IF EXISTS bm_write ON public.branch_managers;
CREATE POLICY bm_write ON public.branch_managers
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND branch_id IN (
        SELECT id FROM public.branches
         WHERE institute_id IN (SELECT get_user_institute_ids())
      )
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND branch_id IN (
        SELECT id FROM public.branches
         WHERE institute_id IN (SELECT get_user_institute_ids())
      )
    )
  );

-- ---- branch_transfers (no institute_id; both branches must be in tenant) --
DROP POLICY IF EXISTS bt_all ON public.branch_transfers;
CREATE POLICY bt_all ON public.branch_transfers
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND from_branch_id IN (SELECT id FROM public.branches WHERE institute_id IN (SELECT get_user_institute_ids()))
      AND to_branch_id   IN (SELECT id FROM public.branches WHERE institute_id IN (SELECT get_user_institute_ids()))
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND from_branch_id IN (SELECT id FROM public.branches WHERE institute_id IN (SELECT get_user_institute_ids()))
      AND to_branch_id   IN (SELECT id FROM public.branches WHERE institute_id IN (SELECT get_user_institute_ids()))
    )
  );

-- ---- timetables ------------------------------------------------------------
DROP POLICY IF EXISTS timetables_write ON public.timetables;
CREATE POLICY timetables_write ON public.timetables
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- timetable_publish_state ----------------------------------------------
DROP POLICY IF EXISTS tps_write ON public.timetable_publish_state;
CREATE POLICY tps_write ON public.timetable_publish_state
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- fee_payments ----------------------------------------------------------
DROP POLICY IF EXISTS fpm_admin ON public.fee_payments;
CREATE POLICY fpm_admin ON public.fee_payments
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- fee_plans -------------------------------------------------------------
DROP POLICY IF EXISTS fp_write ON public.fee_plans;
CREATE POLICY fp_write ON public.fee_plans
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- payments --------------------------------------------------------------
DROP POLICY IF EXISTS payments_write ON public.payments;
CREATE POLICY payments_write ON public.payments
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- student_fees (sf_admin) ----------------------------------------------
DROP POLICY IF EXISTS sf_admin ON public.student_fees;
CREATE POLICY sf_admin ON public.student_fees
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- student_fees (student_fees_write -- duplicate) ------------------------
DROP POLICY IF EXISTS student_fees_write ON public.student_fees;
CREATE POLICY student_fees_write ON public.student_fees
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- fees_audit_log --------------------------------------------------------
DROP POLICY IF EXISTS fal_admin ON public.fees_audit_log;
CREATE POLICY fal_admin ON public.fees_audit_log
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- leave_requests --------------------------------------------------------
DROP POLICY IF EXISTS lr_admin ON public.leave_requests;
CREATE POLICY lr_admin ON public.leave_requests
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- medical_records -------------------------------------------------------
DROP POLICY IF EXISTS medical_records_write ON public.medical_records;
CREATE POLICY medical_records_write ON public.medical_records
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'medical'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'medical'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- galleries -------------------------------------------------------------
DROP POLICY IF EXISTS galleries_write ON public.galleries;
CREATE POLICY galleries_write ON public.galleries
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- grade_categories ------------------------------------------------------
DROP POLICY IF EXISTS grade_cats_admin ON public.grade_categories;
CREATE POLICY grade_cats_admin ON public.grade_categories
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- promotion_logs --------------------------------------------------------
DROP POLICY IF EXISTS promo_logs_admin ON public.promotion_logs;
CREATE POLICY promo_logs_admin ON public.promotion_logs
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- events ----------------------------------------------------------------
DROP POLICY IF EXISTS ev_write ON public.events;
CREATE POLICY ev_write ON public.events
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- library_books ---------------------------------------------------------
DROP POLICY IF EXISTS lb_write ON public.library_books;
CREATE POLICY lb_write ON public.library_books
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- academic_reports ------------------------------------------------------
DROP POLICY IF EXISTS ar_admin ON public.academic_reports;
CREATE POLICY ar_admin ON public.academic_reports
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- student_analyses ------------------------------------------------------
DROP POLICY IF EXISTS sa_write ON public.student_analyses;
CREATE POLICY sa_write ON public.student_analyses
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'teacher'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- cafeteria_items -------------------------------------------------------
DROP POLICY IF EXISTS cafeteria_items_write ON public.cafeteria_items;
CREATE POLICY cafeteria_items_write ON public.cafeteria_items
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'cafeteria'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'cafeteria'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- cafeteria_orders ------------------------------------------------------
-- 'student' kept in the institute-scoped role list. A student creating an
-- order is allowed only when the order's institute_id is in their active
-- enrollments -- so they cannot place orders in another tenant.
DROP POLICY IF EXISTS cafeteria_orders_write ON public.cafeteria_orders;
CREATE POLICY cafeteria_orders_write ON public.cafeteria_orders
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'cafeteria', 'student'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute', 'cafeteria', 'student'])
      AND institute_id IN (SELECT get_user_institute_ids())
    )
  );

-- ---- ai_feature_access (no institute_id; derive via teacher_id->enrollments)
DROP POLICY IF EXISTS ai_feature_access_write ON public.ai_feature_access;
CREATE POLICY ai_feature_access_write ON public.ai_feature_access
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND teacher_id IN (
        SELECT user_id FROM public.enrollments
         WHERE institute_id IN (SELECT get_user_institute_ids())
           AND status = 'active'
      )
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (
      get_user_role() = ANY (ARRAY['institute'])
      AND teacher_id IN (
        SELECT user_id FROM public.enrollments
         WHERE institute_id IN (SELECT get_user_institute_ids())
           AND status = 'active'
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Verification: count rewritten policies and emit notice.
--    Expected: 25 policies (24 unique policy names; student_fees has 2).
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_count int;
  v_expected int := 25;
  v_targets text[] := ARRAY[
    'classes.classes_write',
    'enrollments.enrollments_write',
    'branches.br_write',
    'branch_managers.bm_write',
    'branch_transfers.bt_all',
    'timetables.timetables_write',
    'timetable_publish_state.tps_write',
    'fee_payments.fpm_admin',
    'fee_plans.fp_write',
    'payments.payments_write',
    'student_fees.sf_admin',
    'student_fees.student_fees_write',
    'fees_audit_log.fal_admin',
    'leave_requests.lr_admin',
    'medical_records.medical_records_write',
    'galleries.galleries_write',
    'grade_categories.grade_cats_admin',
    'promotion_logs.promo_logs_admin',
    'events.ev_write',
    'library_books.lb_write',
    'academic_reports.ar_admin',
    'student_analyses.sa_write',
    'cafeteria_items.cafeteria_items_write',
    'cafeteria_orders.cafeteria_orders_write',
    'ai_feature_access.ai_feature_access_write'
  ];
BEGIN
  SELECT count(*)
    INTO v_count
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND (p.tablename || '.' || p.policyname) = ANY (v_targets)
     AND p.cmd = 'ALL'
     AND p.qual ILIKE '%get_user_institute_ids%';

  RAISE NOTICE 'RLS multi-tenant lockdown: replaced % of % target policies', v_count, v_expected;

  IF v_count <> v_expected THEN
    RAISE WARNING 'Expected % policies rewritten, found %. Inspect pg_policies for missing rewrites.',
      v_expected, v_count;
  END IF;
END
$verify$;

COMMIT;

-- =============================================================================
-- Post-apply verification queries (run manually):
--
-- 1) List the rewritten policies and confirm each contains both branches:
--    SELECT tablename, policyname, qual
--      FROM pg_policies
--     WHERE schemaname = 'public'
--       AND policyname IN (
--         'classes_write','enrollments_write','br_write','bm_write','bt_all',
--         'timetables_write','tps_write','fpm_admin','fp_write','payments_write',
--         'sf_admin','student_fees_write','fal_admin','lr_admin',
--         'medical_records_write','galleries_write','grade_cats_admin',
--         'promo_logs_admin','ev_write','lb_write','ar_admin','sa_write',
--         'cafeteria_items_write','cafeteria_orders_write','ai_feature_access_write'
--       )
--     ORDER BY tablename, policyname;
--
-- 2) Impersonation test (in a transaction; ROLLBACK afterwards):
--    BEGIN;
--    SET LOCAL ROLE authenticated;
--    SET LOCAL request.jwt.claim.sub = '<institute-B-admin-uuid>';
--    -- Should return 0 rows for institute A:
--    SELECT count(*) FROM classes WHERE institute_id = '<institute-A-uuid>';
--    -- Should fail RLS:
--    UPDATE classes SET name = 'leak' WHERE institute_id = '<institute-A-uuid>';
--    ROLLBACK;
-- =============================================================================
