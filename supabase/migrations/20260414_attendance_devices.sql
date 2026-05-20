-- ============================================================
-- Attendance Devices — Fingerprint/Biometric Device Integration
-- Supports multi-tenant: each device belongs to one institute
-- ============================================================

-- Devices registry
CREATE TABLE IF NOT EXISTS attendance_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, -- optional: link to specific branch
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'fingerprint', -- fingerprint, face, card
  api_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  location_description TEXT, -- e.g. "البوابة الرئيسية"
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- Device attendance logs (separate from QR scans)
CREATE TABLE IF NOT EXISTS device_attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES attendance_devices(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES users(id),
  student_code TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scan_type TEXT NOT NULL DEFAULT 'in', -- in, out
  raw_data JSONB, -- raw data from device for debugging
  UNIQUE(device_id, student_id, scanned_at) -- prevent exact duplicates
);

-- Helper function for date extraction (must be IMMUTABLE for index)
CREATE OR REPLACE FUNCTION public.to_date_immutable(ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$ SELECT ts::date; $$;

-- Prevent duplicate attendance per student per day per device
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_attendance_daily
  ON device_attendance_logs (device_id, student_id, public.to_date_immutable(scanned_at), scan_type);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_device_attendance_institute ON device_attendance_logs(institute_id);
CREATE INDEX IF NOT EXISTS idx_device_attendance_date ON device_attendance_logs(scanned_at);
CREATE INDEX IF NOT EXISTS idx_device_attendance_student ON device_attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_devices_institute ON attendance_devices(institute_id);
CREATE INDEX IF NOT EXISTS idx_devices_branch ON attendance_devices(branch_id);
CREATE INDEX IF NOT EXISTS idx_devices_api_key ON attendance_devices(api_key);
CREATE INDEX IF NOT EXISTS idx_device_logs_branch ON device_attendance_logs(branch_id);

-- ── RLS Policies ──

ALTER TABLE attendance_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_attendance_logs ENABLE ROW LEVEL SECURITY;

-- Devices: admin can manage, institute staff can view their own
CREATE POLICY devices_admin ON attendance_devices FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY devices_institute_read ON attendance_devices FOR SELECT
  USING (
    institute_id IN (
      SELECT e.institute_id FROM enrollments e WHERE e.user_id = auth.uid()
    )
  );

-- Logs: admin full access, institute staff read their own, student reads own
CREATE POLICY device_logs_admin ON device_attendance_logs FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY device_logs_institute_read ON device_attendance_logs FOR SELECT
  USING (
    institute_id IN (
      SELECT e.institute_id FROM enrollments e WHERE e.user_id = auth.uid()
    )
  );

CREATE POLICY device_logs_student_read ON device_attendance_logs FOR SELECT
  USING (student_id = auth.uid());

-- Allow Edge Function to insert via service role (no RLS check needed for service_role)

-- ── Validation Function for Device Scans ──

CREATE OR REPLACE FUNCTION public.process_device_scan(
  p_api_key TEXT,
  p_student_code TEXT,
  p_scan_type TEXT DEFAULT 'in',
  p_raw_data JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
  v_student RECORD;
  v_today DATE := CURRENT_DATE;
  v_existing RECORD;
BEGIN
  -- 1. Validate device by API key
  SELECT * INTO v_device
  FROM attendance_devices
  WHERE api_key = p_api_key AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'جهاز غير مسجّل أو معطّل');
  END IF;

  -- Update heartbeat
  UPDATE attendance_devices SET last_heartbeat = now() WHERE id = v_device.id;

  -- 2. Find student by code in same institute
  SELECT u.id, u.full_name INTO v_student
  FROM users u
  JOIN enrollments e ON e.user_id = u.id
  WHERE u.full_name IS NOT NULL
    AND e.institute_id = v_device.institute_id
    AND e.role = 'student'
    AND (e.status = 'active' OR e.status IS NULL)
    -- Match by code: check if the user's email prefix matches the student code
    AND EXISTS (
      SELECT 1 FROM auth.users au
      WHERE au.id = u.id
      AND UPPER(SPLIT_PART(au.email, '@', 1)) = UPPER(p_student_code)
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'رمز الطالب غير موجود بهذه المؤسسة');
  END IF;

  -- 3. Check for duplicate today
  SELECT * INTO v_existing
  FROM device_attendance_logs
  WHERE device_id = v_device.id
    AND student_id = v_student.id
    AND scanned_at::date = v_today
    AND scan_type = p_scan_type;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'message', 'الطالب مسجّل حضوره مسبقاً اليوم',
      'student_name', v_student.full_name
    );
  END IF;

  -- 4. Record attendance (with branch if device has one)
  INSERT INTO device_attendance_logs (device_id, institute_id, branch_id, student_id, student_code, scanned_at, scan_type, raw_data)
  VALUES (v_device.id, v_device.institute_id, v_device.branch_id, v_student.id, p_student_code, now(), p_scan_type, p_raw_data);

  -- 5. Also insert into attendance table for unified reporting
  INSERT INTO attendance (student_id, date, status, institute_id)
  VALUES (v_student.id, v_today, 'present', v_device.institute_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'student_name', v_student.full_name,
    'institute_id', v_device.institute_id,
    'scanned_at', now()
  );
END;
$$;
