-- Restore EXECUTE grants on admin_ads RLS helper functions.
--
-- Why: The ads_select_visible / ads_insert_authorized / ads_update_authorized /
-- ads_delete_authorized policies on public.admin_ads call public._is_platform_admin
-- and public._is_institute_admin inline. A later migration recreated these
-- functions (CREATE OR REPLACE) without re-granting EXECUTE to `authenticated`,
-- leaving them with only postgres+service_role privileges.
--
-- Symptom: students/teachers/parents hitting api.getActiveAds() or
-- api.incrementAdViews() got "permission denied for function _is_platform_admin"
-- and the ads feed silently returned []. Verified in production logcat.
--
-- This migration is idempotent — GRANT is no-op if already present.

GRANT EXECUTE ON FUNCTION public._is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._is_institute_admin(uuid, uuid) TO authenticated;
