-- ═══════════════════════════════════════════════════════════════════
-- HASH LOGIN CODES — 2026-05-08
-- ═══════════════════════════════════════════════════════════════════
-- Defense-in-depth for the user_codes table. The plaintext column
-- (user_codes.code) is still required because Supabase Auth uses it as
-- the password and our login flow depends on it. We add a bcrypt hash
-- column so future readers (admin UIs, exports, audit consumers) can
-- verify a code without ever seeing plaintext, and we expose two
-- SECURITY DEFINER RPCs:
--
--   • verify_login_code(p_code, p_user_id) — constant-time-ish compare
--     via crypt(); returns boolean. No row data exposed to caller.
--   • reset_login_code(p_user_id) — generates a fresh unique code,
--     rotates it through the existing rotate_user_code path, and
--     returns the plaintext ONCE to the caller. Caller MUST be an
--     institute admin within the target user's institute (or platform
--     admin). RLS on user_codes already blocks reads of plaintext for
--     UI consumers; this RPC is the only sanctioned way to learn a
--     code, and only at reset time.
--
-- The plaintext `code` column is intentionally NOT dropped here —
-- doing so would break Auth login until we migrate every login path
-- to verify_login_code + custom session minting. That's a follow-up.
-- For now: plaintext stays in the DB but is hidden from every UI.
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. SCHEMA ────────────────────────────────────────────────────
ALTER TABLE public.user_codes
  ADD COLUMN IF NOT EXISTS login_code_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_user_codes_user_id ON public.user_codes(user_id);

-- ── 2. TRIGGER: auto-hash on insert/update ───────────────────────
CREATE OR REPLACE FUNCTION public.user_codes_hash_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code IS NOT NULL AND (
       TG_OP = 'INSERT'
    OR NEW.code IS DISTINCT FROM OLD.code
    OR NEW.login_code_hash IS NULL
  ) THEN
    NEW.login_code_hash := crypt(NEW.code, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_codes_hash ON public.user_codes;
CREATE TRIGGER user_codes_hash
  BEFORE INSERT OR UPDATE ON public.user_codes
  FOR EACH ROW EXECUTE FUNCTION public.user_codes_hash_trigger();

-- ── 3. BACKFILL existing rows ────────────────────────────────────
UPDATE public.user_codes
   SET login_code_hash = crypt(code, gen_salt('bf'))
 WHERE login_code_hash IS NULL
   AND code IS NOT NULL;

-- ── 4. RPC: verify_login_code ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_login_code(
  p_code    TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash       TEXT;
  v_normalized TEXT;
BEGIN
  IF p_code IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;
  v_normalized := upper(regexp_replace(p_code, '[^a-zA-Z0-9]', '', 'g'));
  IF char_length(v_normalized) < 4 THEN
    RETURN false;
  END IF;

  SELECT login_code_hash INTO v_hash
    FROM public.user_codes
   WHERE user_id = p_user_id
     AND is_active = true
   LIMIT 1;

  IF v_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN crypt(v_normalized, v_hash) = v_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_login_code(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login_code(TEXT, UUID) TO service_role, authenticated;

-- ── 5. RPC: reset_login_code ─────────────────────────────────────
-- Generates a fresh unique code and rotates it for the target user.
-- Returns plaintext ONCE — caller is expected to display it then
-- discard. Caller authorization:
--   • platform admin (users.role = 'admin'); OR
--   • institute admin enrolled in the SAME institute as the target.
-- Cross-institute resets are denied even for institute admins.
CREATE OR REPLACE FUNCTION public.reset_login_code(
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        UUID := auth.uid();
  v_caller_role   TEXT;
  v_target_inst   UUID;
  v_caller_inst   UUID;
  v_new_code      TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.enrollments
   WHERE user_id = v_caller
     AND status = 'active'
   ORDER BY (institute_id IS NULL) DESC
   LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_caller_role NOT IN ('admin', 'institute') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_caller_role = 'institute' THEN
    SELECT institute_id INTO v_target_inst
      FROM public.enrollments
     WHERE user_id = p_user_id
     LIMIT 1;
    SELECT institute_id INTO v_caller_inst
      FROM public.enrollments
     WHERE user_id = v_caller
       AND role = 'institute'
       AND status = 'active'
     LIMIT 1;

    IF v_target_inst IS NULL OR v_caller_inst IS NULL OR v_target_inst <> v_caller_inst THEN
      RAISE EXCEPTION 'cross_tenant_denied';
    END IF;
  END IF;

  v_new_code := public.generate_unique_code(8);

  PERFORM public.rotate_user_code(
    p_user_id,
    v_new_code,
    v_caller,
    'admin_reset_via_reset_login_code'
  );

  RETURN v_new_code;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_login_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_login_code(UUID) TO authenticated, service_role;

-- ── 6. NOTES ─────────────────────────────────────────────────────
-- Follow-up (NOT in this migration — Auth depends on plaintext today):
--   1. Migrate all login flows to verify_login_code + custom session.
--   2. Drop user_codes.code column.
--   3. Remove plaintext from admin-ops.reset_user_code path; only the
--      bulk-create flow legitimately needs to surface plaintext to the
--      caller, and only the once-after-creation envelope.
