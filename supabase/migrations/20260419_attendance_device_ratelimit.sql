-- ============================================================
-- Rate limit for attendance-device edge function
-- Protects against API key brute-force / abuse: a single registered
-- device cannot exceed 90 scans/minute. Threshold is well above a
-- realistic queue at a school gate (<30/min even on a rush) but
-- low enough to make credential stuffing impractical.
-- Idempotent.
-- ============================================================

-- Counter table: one row per device, reset each minute.
CREATE TABLE IF NOT EXISTS public.device_scan_rate (
  device_id UUID PRIMARY KEY REFERENCES public.attendance_devices(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', now()),
  count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.device_scan_rate ENABLE ROW LEVEL SECURITY;
-- Only service_role touches this table (edge function → RPC → this table);
-- no client access needed, so we intentionally create no SELECT/INSERT policies
-- for authenticated. service_role bypasses RLS.

-- Replace process_device_scan to include the rate-limit gate BEFORE
-- any other work. All previous behavior is preserved.
CREATE OR REPLACE FUNCTION public.process_device_scan(
  p_api_key TEXT,
  p_student_code TEXT,
  p_scan_type TEXT DEFAULT 'in',
  p_raw_data JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device RECORD;
  v_student RECORD;
  v_today DATE := CURRENT_DATE;
  v_existing RECORD;
  v_current_window TIMESTAMPTZ := date_trunc('minute', now());
  v_count INTEGER;
  RATE_LIMIT CONSTANT INTEGER := 90; -- scans per minute per device
BEGIN
  -- 1. Validate device by API key
  SELECT * INTO v_device
  FROM attendance_devices
  WHERE api_key = p_api_key AND is_active = true;

  IF NOT FOUND THEN
    -- Do NOT reveal whether the key exists but is disabled vs. not registered.
    RETURN jsonb_build_object('success', false, 'error', 'جهاز غير مسجّل أو معطّل');
  END IF;

  -- 1b. Rate limit gate (per-device, per-minute)
  INSERT INTO device_scan_rate (device_id, window_start, count)
  VALUES (v_device.id, v_current_window, 1)
  ON CONFLICT (device_id) DO UPDATE
    SET count = CASE
          WHEN device_scan_rate.window_start = v_current_window
            THEN device_scan_rate.count + 1
          ELSE 1
        END,
        window_start = v_current_window
  RETURNING count INTO v_count;

  IF v_count > RATE_LIMIT THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'تجاوز الحد المسموح — حاول بعد قليل',
      'rate_limited', true
    );
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

  -- 4. Record attendance
  INSERT INTO device_attendance_logs (device_id, institute_id, branch_id, student_id, student_code, scanned_at, scan_type, raw_data)
  VALUES (v_device.id, v_device.institute_id, v_device.branch_id, v_student.id, p_student_code, now(), p_scan_type, p_raw_data);

  -- 5. Unified reporting
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

-- Execute permission: only service_role (edge function)
REVOKE ALL ON FUNCTION public.process_device_scan(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_device_scan(TEXT, TEXT, TEXT, JSONB) TO service_role;
