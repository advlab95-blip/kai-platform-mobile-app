-- ═══════════════════════════════════════════════════════════════════════════
-- 20260419 — Add metadata column to notifications + admin notification policy
-- ═══════════════════════════════════════════════════════════════════════════
-- Rationale: super admins need to receive notifications when any institute
-- creates a new user. Carry structured context (new user id, role, institute)
-- in a JSONB metadata column so the admin UI can render it without extra joins.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add metadata column (nullable — existing rows stay unaffected)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- 2. Ensure admin can read notifications even without enrollment.
--    The existing notifications_read_v2 policy requires institute_id to be in
--    the user's enrollments or NULL. Super admins have no enrollments, so they
--    rely on the institute_id IS NULL branch — which already works. No policy
--    change needed, but we double-check admin fallback via the original policy.
--    (Defensive) If an older restrictive policy exists, this keeps admin access:
DROP POLICY IF EXISTS notifications_admin_read ON public.notifications;
CREATE POLICY notifications_admin_read ON public.notifications
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 3. Index on type for faster admin queries filtering by admin_user_created
CREATE INDEX IF NOT EXISTS idx_notifications_type_created
  ON public.notifications(type, created_at DESC)
  WHERE type = 'admin_user_created';
