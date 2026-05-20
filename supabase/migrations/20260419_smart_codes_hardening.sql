-- ═══════════════════════════════════════════════════════════════════
-- SMART CODES HARDENING — 2026-04-19
-- ═══════════════════════════════════════════════════════════════════
-- Fixes 3 critical issues reported by user:
--   1. Two users can currently end up with the same code (no DB UNIQUE
--      constraint — relied only on Supabase Auth email uniqueness).
--   2. Code generation has no pre-check for duplicates.
--   3. When a code is rotated, the OLD code still works until tokens
--      expire (no session revocation).
--
-- This migration:
--   • Creates `user_codes` table with GLOBAL UNIQUE constraint on code
--   • Creates `user_codes_history` for audit trail
--   • Provides atomic RPCs for code generation and rotation
--   • Backfills existing users from auth.users emails
--   • Session revocation is handled in api.ts (auth.admin.signOut)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. TABLE: user_codes ─────────────────────────────────────────
-- One active code per user. Global UNIQUE(code) prevents collisions.
CREATE TABLE IF NOT EXISTS public.user_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  institute_id  UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_codes_code_unique UNIQUE (code),
  CONSTRAINT user_codes_code_length CHECK (char_length(code) >= 4 AND char_length(code) <= 32),
  CONSTRAINT user_codes_code_alphanumeric CHECK (code ~ '^[A-Z0-9]+$')
);

COMMENT ON TABLE public.user_codes IS
  'Active login code per user. UNIQUE(code) enforced at DB level (not just Auth).';

-- ── 2. TABLE: user_codes_history ─────────────────────────────────
-- Append-only audit trail. Every rotation/change appended.
CREATE TABLE IF NOT EXISTS public.user_codes_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  old_code      TEXT,
  new_code      TEXT NOT NULL,
  changed_by    UUID,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason        TEXT DEFAULT 'manual_rotation'
);

COMMENT ON TABLE public.user_codes_history IS
  'Append-only audit trail of all code changes. Never updated.';

-- ── 3. INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_codes_code ON public.user_codes(code);
CREATE INDEX IF NOT EXISTS idx_user_codes_institute ON public.user_codes(institute_id);
CREATE INDEX IF NOT EXISTS idx_user_codes_active ON public.user_codes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_codes_history_user ON public.user_codes_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_codes_history_changed_at ON public.user_codes_history(changed_at DESC);

-- ── 4. TRIGGER: normalize code (uppercase + update timestamp) ────
CREATE OR REPLACE FUNCTION public.user_codes_normalize_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.code := upper(NEW.code);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_codes_normalize ON public.user_codes;
CREATE TRIGGER user_codes_normalize
  BEFORE INSERT OR UPDATE ON public.user_codes
  FOR EACH ROW EXECUTE FUNCTION public.user_codes_normalize_trigger();

-- ── 5. RLS POLICIES ──────────────────────────────────────────────
ALTER TABLE public.user_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_codes_history ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies from prior attempts
DROP POLICY IF EXISTS user_codes_read ON public.user_codes;
DROP POLICY IF EXISTS user_codes_history_read ON public.user_codes_history;

-- user_codes: user sees own, admin/institute sees their tenant
CREATE POLICY user_codes_read ON public.user_codes FOR SELECT USING (
  user_id = auth.uid()
  OR public.get_user_role() = 'admin'
  OR (
    public.get_user_role() IN ('institute', 'admin')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
);

-- history: admin/institute only (sensitive audit data)
CREATE POLICY user_codes_history_read ON public.user_codes_history FOR SELECT USING (
  public.get_user_role() = 'admin'
  OR (
    public.get_user_role() = 'institute'
    AND user_id IN (
      SELECT user_id FROM public.enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
);

-- Writes restricted to service_role via RPCs (no INSERT/UPDATE/DELETE policy)
-- SECURITY DEFINER functions below handle writes with proper validation.

-- ── 6. RPC: generate_unique_code ─────────────────────────────────
-- Server-side generation with atomic uniqueness check.
-- Retries up to 20 times (32^8 ≈ 1.1 trillion combos, collision vanishingly rare).
CREATE OR REPLACE FUNCTION public.generate_unique_code(p_length INT DEFAULT 8)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code     TEXT;
  v_attempts INT := 0;
  v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I, O, 0, 1 (ambiguous)
  v_len      INT := length(v_chars);
  i          INT;
BEGIN
  IF p_length < 4 OR p_length > 32 THEN
    RAISE EXCEPTION 'طول الرمز يجب أن يكون بين 4 و 32 حرف';
  END IF;

  LOOP
    v_code := '';
    FOR i IN 1..p_length LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * v_len)::int, 1);
    END LOOP;

    -- Atomic existence check — if no row, this code is free
    PERFORM 1 FROM public.user_codes WHERE code = v_code LIMIT 1;
    IF NOT FOUND THEN
      RETURN v_code;
    END IF;

    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'تعذر توليد رمز فريد — حاول زيادة الطول';
    END IF;
  END LOOP;
END;
$$;

-- ── 7. RPC: register_user_code ───────────────────────────────────
-- Called by api.ts AFTER auth user is created. Atomic insert with UNIQUE check.
-- Returns the normalized code on success; raises on conflict.
CREATE OR REPLACE FUNCTION public.register_user_code(
  p_user_id      UUID,
  p_code         TEXT,
  p_institute_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := upper(regexp_replace(p_code, '[^a-zA-Z0-9]', '', 'g'));

  IF char_length(v_normalized) < 4 THEN
    RAISE EXCEPTION 'الرمز قصير جداً — 4 أحرف على الأقل';
  END IF;

  -- UPSERT: if user already has a code, replace it (idempotent on retries).
  -- UNIQUE(code) catches cross-user collisions.
  INSERT INTO public.user_codes (user_id, code, institute_id, is_active)
  VALUES (p_user_id, v_normalized, p_institute_id, true)
  ON CONFLICT (user_id) DO UPDATE
    SET code = EXCLUDED.code,
        institute_id = EXCLUDED.institute_id,
        is_active = true,
        updated_at = NOW();

  RETURN v_normalized;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'هذا الرمز مستخدم من قبل مستخدم آخر';
END;
$$;

-- ── 8. RPC: rotate_user_code ─────────────────────────────────────
-- Atomic code change + history logging.
-- Session revocation done in api.ts via auth.admin.signOut.
CREATE OR REPLACE FUNCTION public.rotate_user_code(
  p_user_id    UUID,
  p_new_code   TEXT,
  p_changed_by UUID DEFAULT NULL,
  p_reason     TEXT DEFAULT 'manual_rotation'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_code    TEXT;
  v_normalized  TEXT;
  v_institute   UUID;
BEGIN
  v_normalized := upper(regexp_replace(p_new_code, '[^a-zA-Z0-9]', '', 'g'));

  IF char_length(v_normalized) < 4 THEN
    RAISE EXCEPTION 'الرمز قصير جداً — 4 أحرف على الأقل';
  END IF;

  -- Get current code for history
  SELECT code, institute_id INTO v_old_code, v_institute
    FROM public.user_codes
    WHERE user_id = p_user_id;

  -- Reject if new code already used by a different user
  IF EXISTS (
    SELECT 1 FROM public.user_codes
    WHERE code = v_normalized AND user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'هذا الرمز مستخدم من قبل مستخدم آخر';
  END IF;

  -- Log history BEFORE update (so on error we don't lose audit trail)
  INSERT INTO public.user_codes_history (user_id, old_code, new_code, changed_by, reason)
  VALUES (p_user_id, v_old_code, v_normalized, p_changed_by, p_reason);

  -- Update or insert (handles backfilled users that don't have a row yet)
  INSERT INTO public.user_codes (user_id, code, institute_id, is_active)
  VALUES (p_user_id, v_normalized, v_institute, true)
  ON CONFLICT (user_id) DO UPDATE
    SET code = EXCLUDED.code, updated_at = NOW(), is_active = true;

  RETURN v_normalized;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'هذا الرمز مستخدم من قبل مستخدم آخر';
END;
$$;

-- ── 9. RPC: check_code_available ─────────────────────────────────
-- Lightweight availability check for admin UI (non-authoritative —
-- final check is at rotate/register time).
CREATE OR REPLACE FUNCTION public.check_code_available(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := upper(regexp_replace(p_code, '[^a-zA-Z0-9]', '', 'g'));
  IF char_length(v_normalized) < 4 THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (SELECT 1 FROM public.user_codes WHERE code = v_normalized);
END;
$$;

-- ── 10. BACKFILL: populate user_codes from existing auth.users ───
-- Extracts codes from emails matching `XXXX@kaiplatform.app`.
-- Runs once; subsequent inserts via register_user_code RPC.
DO $$
BEGIN
  INSERT INTO public.user_codes (user_id, code, institute_id, is_active)
  SELECT
    au.id,
    upper(split_part(au.email, '@', 1)),
    (SELECT e.institute_id FROM public.enrollments e WHERE e.user_id = au.id LIMIT 1),
    true
  FROM auth.users au
  WHERE au.email LIKE '%@kaiplatform.app'
    AND char_length(split_part(au.email, '@', 1)) >= 4
    AND split_part(au.email, '@', 1) ~ '^[a-zA-Z0-9]+$'
    AND NOT EXISTS (SELECT 1 FROM public.user_codes uc WHERE uc.user_id = au.id)
  ON CONFLICT (code) DO NOTHING;  -- skip any pre-existing collisions (log separately)
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Backfill partial — check for code collisions: %', SQLERRM;
END $$;

-- ── 11. GRANTS ───────────────────────────────────────────────────
-- Service role calls all RPCs from api.ts
GRANT EXECUTE ON FUNCTION public.generate_unique_code(INT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.register_user_code(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_user_code(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_code_available(TEXT) TO service_role, authenticated;

-- ── 12. VERIFICATION QUERIES (for manual testing) ────────────────
-- SELECT count(*) FROM public.user_codes;  -- should match auth.users with @kaiplatform.app emails
-- SELECT public.generate_unique_code(8);   -- should return fresh 8-char code
-- SELECT public.check_code_available('TESTCODE');  -- true if not taken
