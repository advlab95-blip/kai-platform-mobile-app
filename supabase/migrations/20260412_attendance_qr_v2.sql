-- ═══════════════════════════════════════════════════
-- Enhanced QR Attendance System (Institutes Only)
-- Feature Flag: attendance_qr
-- ═══════════════════════════════════════════════════

-- 1. QR Sessions (server-managed)
CREATE TABLE IF NOT EXISTS attendance_qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  qr_token TEXT NOT NULL UNIQUE,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. QR Scans (with anti-cheat)
CREATE TABLE IF NOT EXISTS attendance_qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES attendance_qr_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  student_name TEXT,
  institute_id UUID NOT NULL,
  scanned_at TIMESTAMPTZ DEFAULT now(),
  device_info TEXT,
  -- Prevent duplicate: one scan per student per session
  UNIQUE(session_id, student_id)
);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_qr_sessions_active ON attendance_qr_sessions (institute_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_qr_scans_date ON attendance_qr_scans (institute_id, scanned_at);

-- 4. RLS Policies
ALTER TABLE attendance_qr_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY qrs_admin ON attendance_qr_sessions FOR ALL USING (
  public.get_user_role() = 'admin'
);
CREATE POLICY qrs_institute ON attendance_qr_sessions FOR ALL USING (
  institute_id IN (SELECT public.get_user_institute_ids())
);

ALTER TABLE attendance_qr_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY qrscan_admin ON attendance_qr_scans FOR ALL USING (
  public.get_user_role() = 'admin'
);
CREATE POLICY qrscan_institute ON attendance_qr_scans FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
);
CREATE POLICY qrscan_student_insert ON attendance_qr_scans FOR INSERT WITH CHECK (
  student_id = auth.uid()
);

-- 5. Auto-expire old sessions (function)
CREATE OR REPLACE FUNCTION expire_qr_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE attendance_qr_sessions SET is_active = false WHERE expires_at < now() AND is_active = true;
$$;

-- 6. Validate QR scan (server-side function)
CREATE OR REPLACE FUNCTION validate_qr_scan(
  p_token TEXT,
  p_student_id UUID,
  p_student_name TEXT,
  p_institute_id UUID,
  p_device_info TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_result JSONB;
BEGIN
  -- Expire old sessions first
  PERFORM expire_qr_sessions();

  -- Find active session with this token
  SELECT * INTO v_session FROM attendance_qr_sessions
    WHERE qr_token = p_token AND is_active = true AND expires_at > now()
    LIMIT 1;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'رمز QR غير صالح أو منتهي الصلاحية');
  END IF;

  -- Check institute match
  IF v_session.institute_id != p_institute_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الرمز لا يخص معهدك');
  END IF;

  -- Check duplicate (UNIQUE constraint will also catch this)
  IF EXISTS (SELECT 1 FROM attendance_qr_scans WHERE session_id = v_session.id AND student_id = p_student_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم تسجيل حضورك مسبقاً لهذه الجلسة');
  END IF;

  -- Insert scan
  INSERT INTO attendance_qr_scans (session_id, student_id, student_name, institute_id, device_info)
  VALUES (v_session.id, p_student_id, p_student_name, p_institute_id, p_device_info);

  RETURN jsonb_build_object('success', true, 'message', 'تم تسجيل الحضور بنجاح');
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم تسجيل حضورك مسبقاً');
END;
$$;
