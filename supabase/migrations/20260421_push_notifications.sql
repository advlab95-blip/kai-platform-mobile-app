-- =====================================================================
-- Phase 4.1 — Push notifications + notification center schema
-- =====================================================================
-- This migration is ADDITIVE ONLY. It does not touch the existing
-- `push_tokens` or `notifications` tables beyond adding one optional
-- column. Two net-new tables are introduced for per-institute settings
-- and a category taxonomy used by the notification center UI.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Add `category` column to existing notifications table (if missing).
--    Drives the tab filter in NotificationCenter. Mapping from `type`
--    is handled by trigger below so existing rows get backfilled.
-- ---------------------------------------------------------------------
DO $push_mig$
DECLARE
  has_notifications BOOLEAN;
  has_category BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_name='notifications' AND table_schema='public') INTO has_notifications;
  IF NOT has_notifications THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='notifications' AND column_name='category') INTO has_category;
  IF NOT has_category THEN
    EXECUTE $ddl$
      ALTER TABLE public.notifications
        ADD COLUMN category TEXT
          CHECK (category IN ('academic','financial','admin','urgent','social'))
    $ddl$;
  END IF;
END
$push_mig$;

-- Backfill `category` from existing `type` values.
-- Only runs once since it only updates rows where category IS NULL.
DO $backfill$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='notifications' AND column_name='category') THEN
    UPDATE public.notifications
    SET category = CASE
      WHEN type IN ('grade','exam','assignment','attendance','absence') THEN 'academic'
      WHEN type IN ('fee','payment','installment')                       THEN 'financial'
      WHEN type IN ('announcement','admin_user_created','ad')            THEN 'admin'
      WHEN type IN ('medical','emergency','urgent')                      THEN 'urgent'
      WHEN type IN ('message','chat')                                    THEN 'social'
      ELSE 'admin'
    END
    WHERE category IS NULL;
  END IF;
END
$backfill$;

-- Helpful index for the center's "unread" filter + recent ordering.
DO $idx$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='notifications' AND column_name='recipient_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
             ON public.notifications (recipient_id, is_read, created_at DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='notifications' AND column_name='category') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_category
             ON public.notifications (recipient_id, category, created_at DESC)';
  END IF;
END
$idx$;

-- ---------------------------------------------------------------------
-- 2) Institute-level notification settings.
--    Institute admins toggle which event types produce a push for their
--    institute. Triggers (see 20260421_push_triggers.sql) read this table
--    before invoking send-push.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_notification_settings (
  institute_id UUID PRIMARY KEY REFERENCES public.institutes(id) ON DELETE CASCADE,
  notify_attendance   BOOLEAN DEFAULT TRUE,
  notify_grades       BOOLEAN DEFAULT TRUE,
  notify_assignments  BOOLEAN DEFAULT TRUE,
  notify_fees         BOOLEAN DEFAULT TRUE,
  notify_admin_ads    BOOLEAN DEFAULT TRUE,
  notify_messages     BOOLEAN DEFAULT TRUE,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.institution_notification_settings ENABLE ROW LEVEL SECURITY;

-- Read: any member of the institute can read (used by client to know what's on)
DROP POLICY IF EXISTS "ins_notif_settings_read" ON public.institution_notification_settings;
CREATE POLICY "ins_notif_settings_read"
  ON public.institution_notification_settings
  FOR SELECT
  USING (
    institute_id IN (
      SELECT institute_id FROM public.enrollments
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Write: institute admins / platform admins only.
DROP POLICY IF EXISTS "ins_notif_settings_write" ON public.institution_notification_settings;
CREATE POLICY "ins_notif_settings_write"
  ON public.institution_notification_settings
  FOR ALL
  USING (
    institute_id IN (
      SELECT institute_id FROM public.enrollments
      WHERE user_id = auth.uid()
        AND status = 'active'
        AND role IN ('admin','institute')
    )
  )
  WITH CHECK (
    institute_id IN (
      SELECT institute_id FROM public.enrollments
      WHERE user_id = auth.uid()
        AND status = 'active'
        AND role IN ('admin','institute')
    )
  );

-- Convenience: lookup helper used by triggers.
CREATE OR REPLACE FUNCTION public.notification_type_enabled(
  p_institute_id UUID,
  p_type TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row
  FROM public.institution_notification_settings
  WHERE institute_id = p_institute_id;

  -- Default ON if settings row not present yet (opt-out model).
  IF v_row IS NULL THEN RETURN TRUE; END IF;

  RETURN CASE
    WHEN p_type IN ('attendance','absence')            THEN v_row.notify_attendance
    WHEN p_type IN ('grade','exam')                    THEN v_row.notify_grades
    WHEN p_type = 'assignment'                         THEN v_row.notify_assignments
    WHEN p_type IN ('fee','payment','installment')     THEN v_row.notify_fees
    WHEN p_type IN ('announcement','ad')               THEN v_row.notify_admin_ads
    WHEN p_type IN ('message','chat')                  THEN v_row.notify_messages
    ELSE TRUE
  END;
END
$fn$;

REVOKE ALL ON FUNCTION public.notification_type_enabled(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.notification_type_enabled(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Seed defaults for every existing institute (idempotent).
-- ---------------------------------------------------------------------
INSERT INTO public.institution_notification_settings (institute_id)
SELECT id FROM public.institutes
ON CONFLICT (institute_id) DO NOTHING;

COMMENT ON TABLE public.institution_notification_settings IS
  'Phase 4 — per-institute toggles for automated push triggers. Default-on; institute admins may opt out.';
