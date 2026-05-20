-- ═══════════════════════════════════════════════════════════════════════════
-- 20260508_delete_institute_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Hardens deleteInstitute against unauthorized destructive use. Previously the
-- mobile client called supabase.from('institutes').delete().eq('id', ...) with
-- no role check beyond RLS; if an RLS policy ever loosened (or a service-role
-- key leaked) any authenticated user could nuke an institute.
--
-- This RPC moves the role/tenant gate server-side: the caller must hold an
-- active 'admin'/'institute_admin' enrollment for the target institute, OR be
-- a platform admin (role='admin' with institute_id IS NULL). The function runs
-- as SECURITY DEFINER so it can bypass RLS for the actual delete only AFTER
-- the gate passes.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_institute(
  p_institute_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_platform_admin BOOLEAN := false;
  v_is_institute_admin BOOLEAN := false;
  v_inst_name TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized: not signed in';
  END IF;
  IF p_institute_id IS NULL THEN
    RAISE EXCEPTION 'p_institute_id is required';
  END IF;

  -- Platform admin: role='admin' with institute_id IS NULL in users table,
  -- OR an active enrollment with role='platform_admin'/role='admin' and
  -- institute_id IS NULL.
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = v_caller
      AND u.role IN ('admin','platform_admin')
      AND u.institute_id IS NULL
  ) INTO v_is_platform_admin;

  IF NOT v_is_platform_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.user_id = v_caller
        AND e.role IN ('admin','institute','platform_admin')
        AND e.status = 'active'
        AND e.institute_id IS NULL
    ) INTO v_is_platform_admin;
  END IF;

  -- Institute admin of THIS institute (active enrollment).
  SELECT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.user_id = v_caller
      AND e.institute_id = p_institute_id
      AND e.role IN ('admin','institute')
      AND e.status = 'active'
  ) INTO v_is_institute_admin;

  IF NOT (v_is_platform_admin OR v_is_institute_admin) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an admin of institute %', p_institute_id;
  END IF;

  -- Capture name for the response so the client can audit.
  SELECT name INTO v_inst_name FROM institutes WHERE id = p_institute_id;

  -- Delete the institute. ON DELETE CASCADE on FK columns + the heavy data
  -- cleanup that the client still does (which is non-destructive without an
  -- institute row anyway, since RLS scopes by institute_id) handles the rest.
  --
  -- We do NOT cascade-delete users/enrollments here — that's mode-dependent
  -- and stays in the client wrapper, gated on the same caller identity.
  DELETE FROM institutes WHERE id = p_institute_id;

  RETURN json_build_object(
    'success', true,
    'institute_id', p_institute_id,
    'institute_name', v_inst_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_institute(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_institute(UUID) TO authenticated;
