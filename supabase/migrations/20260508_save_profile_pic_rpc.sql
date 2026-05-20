-- =============================================================================
-- Migration: 20260508_save_profile_pic_rpc.sql
-- Purpose : Bulletproof avatar update path for ALL roles, esp. cafeteria.
--
-- Problem (P2 bug):
--   Cafeteria-role users get an upload error when changing their avatar from
--   HomeHero. Other roles (admin/parent/student/teacher) succeed using the
--   same `useProfilePic` hook.
--
-- Root causes (each independently sufficient):
--
--   1) `users.institute_id` is NULL for non-admin roles.
--      `admin-ops:create_user` inserts a `users` row with only {id, role,
--      full_name} — institute_id is left NULL. The `upload-media` edge
--      function falls back to `enrollments` to resolve the tenant, which
--      *should* work, but any deviation (status<>'active', NULL institute_id
--      on enrollment, missing enrollments row) flips the function to a 403
--      `no_institute`. Cafeteria users are seeded with no client-side
--      verification of the enrollments row.
--
--   2) `users` UPDATE RLS (`users_v3_self_update`) requires that the
--      caller's `users` row be readable + that role/institute_id/is_frozen
--      stay unchanged. The policy itself is correct, but a bare client-side
--      `update().eq('id', ...)` with no `.select()` silently affects 0 rows
--      when RLS rejects. `services/api.ts:saveProfilePic` never noticed the
--      0-row result and treated it as success — masking any RLS regression.
--
--   3) Edge cases (missing users row, partial seed) silently no-op.
--
-- Fix:
--   - SECURITY DEFINER RPC `save_profile_pic(p_user_id, p_url)` that:
--       * Verifies caller owns the target user_id (auth.uid() = p_user_id).
--       * Updates ONLY `avatar_url`. Cannot escalate role/institute_id.
--       * Returns the affected row count so the client can detect 0 rows.
--   - Backfill `users.institute_id` from `enrollments` for any user that has
--     a single non-NULL institute_id in enrollments AND a NULL on users.
--     This makes the upload-media fast-path (#1) work for legacy seeds.
--
-- Idempotent: CREATE OR REPLACE on the function; backfill is a guarded UPDATE.
-- Multi-tenant: function only touches the caller's own row; backfill does not
-- change institute_id where it is already set, and only copies a single
-- definitive value (rejects users with multiple distinct institute_ids).
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------------------
-- 1. RPC: save_profile_pic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_profile_pic(
  p_user_id UUID,
  p_url     TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_count  INTEGER;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  -- Caller can only update their own avatar. No admin override here — admins
  -- updating other users' avatars should go through a separate admin RPC.
  IF v_caller IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden: cannot update another user''s avatar';
  END IF;

  -- Trivial size cap to prevent storing accidental garbage. Real validation
  -- (extension allowlist, size, etc.) happens in upload-media before we ever
  -- get here. This is a belt-and-suspenders sanity check.
  IF p_url IS NULL OR length(p_url) < 4 OR length(p_url) > 2048 THEN
    RAISE EXCEPTION 'invalid_url';
  END IF;

  UPDATE public.users
     SET avatar_url = p_url,
         updated_at = NOW()
   WHERE id = v_caller;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    -- No row at all — should never happen for an authenticated user, but
    -- surface it explicitly so the client can show a sensible message.
    RAISE EXCEPTION 'user_row_missing';
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_profile_pic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_profile_pic(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_profile_pic(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.save_profile_pic(UUID, TEXT) IS
  'Updates the caller''s users.avatar_url. SECURITY DEFINER, ownership-checked. Returns row count.';

-- -----------------------------------------------------------------------------
-- 2. Backfill users.institute_id from enrollments where unambiguous.
--    Targets users (esp. cafeteria/medical/teacher/parent) seeded WITHOUT
--    institute_id on the users row but with a single active enrollment.
--    Skips:
--      - rows that already have institute_id set
--      - users with multiple distinct active institute_ids (parents linked
--        to multiple institutes — backfilling either one would be wrong)
--      - platform admins (role='admin' AND no enrollment institute_id) —
--        upload-media handles them via the synthetic 'platform' tenant.
-- -----------------------------------------------------------------------------
WITH single_inst AS (
  SELECT
    e.user_id,
    MIN(e.institute_id) AS institute_id
  FROM public.enrollments e
  WHERE e.institute_id IS NOT NULL
    AND (e.status IS NULL OR e.status = 'active')
  GROUP BY e.user_id
  HAVING COUNT(DISTINCT e.institute_id) = 1
)
UPDATE public.users u
   SET institute_id = s.institute_id
  FROM single_inst s
 WHERE u.id = s.user_id
   AND u.institute_id IS NULL
   AND u.role <> 'admin';

COMMIT;
