-- Ensure the `payments` table exposes a payment_method column. The client
-- (api.makeStudentPayment) writes 'cash' on every row; without this column
-- PostgREST rejects the insert with a schema-cache error.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';

COMMENT ON COLUMN payments.payment_method IS
  'Payment channel — cash/bank/card/etc. Defaults to cash for manual entries.';

-- ── Soften the register_user_code error leak ─────────────────────
-- Old wording "هذا الرمز مستخدم من قبل مستخدم آخر" confirmed to the caller
-- that the code already belonged to someone — a username oracle. Replace it
-- with a generic rejection that does not disclose whether a user exists.

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
    RAISE EXCEPTION 'الرمز غير متاح — جرّب رمز آخر';
END;
$$;

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

  SELECT code, institute_id INTO v_old_code, v_institute
    FROM public.user_codes
    WHERE user_id = p_user_id;

  IF EXISTS (
    SELECT 1 FROM public.user_codes
    WHERE code = v_normalized AND user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'الرمز غير متاح — جرّب رمز آخر';
  END IF;

  INSERT INTO public.user_codes_history (user_id, old_code, new_code, changed_by, reason)
  VALUES (p_user_id, v_old_code, v_normalized, p_changed_by, p_reason);

  UPDATE public.user_codes
    SET code = v_normalized,
        updated_at = NOW()
    WHERE user_id = p_user_id;

  RETURN v_normalized;
END;
$$;
