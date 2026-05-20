-- ═══════════════════════════════════════════════════
-- Exam Content Protection System
-- Feature Flag: exam_content_protection
-- ═══════════════════════════════════════════════════

-- 1. Exam audit log (tracks suspicious behavior)
CREATE TABLE IF NOT EXISTS exam_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  exam_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  -- event types: screenshot_attempt, screen_record, tab_switch, copy_attempt, app_background, device_change
  device_info TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_audit ON exam_audit_log (session_id, event_type);

ALTER TABLE exam_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY eal_read ON exam_audit_log FOR SELECT USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY eal_insert ON exam_audit_log FOR INSERT WITH CHECK (true);

-- 2. Add protection fields to exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS protection_enabled BOOLEAN DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT true;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS block_screenshots BOOLEAN DEFAULT true;

-- 3. Increment suspicious events RPC
CREATE OR REPLACE FUNCTION increment_suspicious_events(p_session_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE exam_sessions SET suspicious_events = COALESCE(suspicious_events, 0) + 1 WHERE id = p_session_id;
$$;

-- 4. Add device tracking to exam_sessions
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS suspicious_events INT DEFAULT 0;
