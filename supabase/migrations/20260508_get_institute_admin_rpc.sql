-- ═══════════════════════════════════════════════════════════════════════════
-- 20260508_get_institute_admin_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Lookup the institute admin for a given institute_id from any authenticated
-- role (parent, student, teacher). Without this RPC, parents calling
-- `getAdminByInstitute` hit `enrollments` RLS which scopes parents to
-- enrollments where user_id = auth.uid() — so the admin's enrollment row is
-- invisible and the lookup silently returns null. That manifested in the
-- "تعذّر العثور على إدارة المؤسسة" alert when a parent tapped "تواصل مع
-- إدارة المعهد".
--
-- This function is SECURITY DEFINER so it can read the privileged enrollment +
-- users rows after gating on:
--   1. caller is signed in (auth.uid() not null)
--   2. caller is a member of `p_institute_id` (active enrollment) — so the
--      admin's identity isn't exposed cross-tenant.
--
-- Role resolution order:
--   1. 'institute'        — canonical (matches today's RPC convention)
--   2. 'institute_admin'  — legacy fallback for old enrollments
--   3. 'admin'            — only when the row is scoped to this institute
--                           (platform admins have institute_id NULL and are
--                           excluded by the institute_id filter).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_institute_admin(
  p_institute_id UUID
) RETURNS TABLE (id UUID, full_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_belongs BOOLEAN := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized: not signed in';
  END IF;
  IF p_institute_id IS NULL THEN
    RAISE EXCEPTION 'p_institute_id is required';
  END IF;

  -- Multi-tenant gate — caller must be enrolled in this institute. Platform
  -- admins are allowed through (no enrollment requirement) so the platform
  -- console can still query any institute.
  SELECT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.user_id = v_caller
      AND e.institute_id = p_institute_id
      AND e.status = 'active'
  ) INTO v_caller_belongs;

  IF NOT v_caller_belongs THEN
    -- Platform admin bypass (role='admin'/'platform_admin' with no institute scope).
    IF NOT EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = v_caller
        AND u.role IN ('admin','platform_admin')
        AND u.institute_id IS NULL
    ) AND NOT EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.user_id = v_caller
        AND e.role IN ('admin','platform_admin')
        AND e.status = 'active'
        AND e.institute_id IS NULL
    ) THEN
      RAISE EXCEPTION 'unauthorized: caller is not a member of institute %', p_institute_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT u.id, u.full_name
  FROM enrollments e
  JOIN users u ON u.id = e.user_id
  WHERE e.institute_id = p_institute_id
    AND e.status = 'active'
    AND e.role IN ('institute', 'institute_admin', 'admin')
  ORDER BY
    -- Prefer the canonical 'institute' role, then the legacy fallbacks.
    CASE e.role
      WHEN 'institute' THEN 0
      WHEN 'institute_admin' THEN 1
      WHEN 'admin' THEN 2
      ELSE 3
    END,
    e.created_at ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_institute_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_institute_admin(UUID) TO authenticated;
