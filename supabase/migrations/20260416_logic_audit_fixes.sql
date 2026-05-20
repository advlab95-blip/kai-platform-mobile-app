-- ═══════════════════════════════════════════════════════
-- Logic Audit Fixes — Phase 1+2
-- Date: 2026-04-16
-- ═══════════════════════════════════════════════════════

-- ── Fix 1: Grade score validation (defense-in-depth) ──
DO $$ BEGIN
  ALTER TABLE manual_grades ADD CONSTRAINT chk_score_positive CHECK (score >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Fix 5: Installments — restrict access ──
-- Drop permissive policy if exists
DROP POLICY IF EXISTS "installments_all" ON installments;
DROP POLICY IF EXISTS "inst_all" ON installments;

-- Admin/institute can manage
DROP POLICY IF EXISTS "installments_manage" ON installments;
CREATE POLICY "installments_manage" ON installments
FOR ALL USING (
  EXISTS (SELECT 1 FROM enrollments WHERE user_id = auth.uid() AND role IN ('admin', 'institute'))
);

-- Students/parents can read their own
CREATE POLICY "installments_read_own" ON installments
FOR SELECT USING (
  student_fee_id IN (
    SELECT id FROM student_fees WHERE student_id = auth.uid()
    OR student_id IN (SELECT student_id FROM parent_child WHERE parent_id = auth.uid())
  )
);

-- ── Fix 12: Notifications cross-tenant ──
DROP POLICY IF EXISTS "notifications_read" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;

CREATE POLICY "notifications_read_v2" ON notifications
FOR SELECT USING (
  recipient_id = auth.uid()
  OR sender_id = auth.uid()
  OR (
    recipient_role IN ((SELECT role FROM users WHERE id = auth.uid()), 'all')
    AND (
      institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
      OR institute_id IS NULL
    )
  )
);

CREATE POLICY "notifications_insert_v2" ON notifications
FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  OR EXISTS (SELECT 1 FROM enrollments WHERE user_id = auth.uid() AND role IN ('admin', 'institute'))
);

-- ── Fix 17: Configurable pass threshold ──
DO $$ BEGIN
  ALTER TABLE institutes ADD COLUMN IF NOT EXISTS pass_threshold NUMERIC DEFAULT 50;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Fix 14: School days per institute ──
DO $$ BEGIN
  ALTER TABLE institutes ADD COLUMN IF NOT EXISTS school_days JSONB DEFAULT '[6,0,1,2,3,4]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Fix: AI feature target (teachers/students/both) ──
DO $$ BEGIN
  ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS target_roles JSONB DEFAULT '["teacher","student"]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Fix 26: Fee amount validation ──
DO $$ BEGIN
  ALTER TABLE student_fees ADD CONSTRAINT chk_fee_amounts
    CHECK (remaining_amount >= 0 AND paid_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
FOR UPDATE USING (recipient_id = auth.uid());
