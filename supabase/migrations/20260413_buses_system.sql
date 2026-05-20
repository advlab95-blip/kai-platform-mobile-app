-- ═══════════════════════════════════════════════════
-- Buses & Transport System
-- Feature Flag: buses_management
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS buses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  bus_number TEXT NOT NULL,
  driver_name TEXT,
  driver_phone TEXT,
  capacity INT DEFAULT 40,
  plate_number TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bus_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id UUID NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'morning',
  stops JSONB DEFAULT '[]',
  departure_time TEXT,
  arrival_time TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bus_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  bus_id UUID NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  route_id UUID REFERENCES bus_routes(id),
  institute_id UUID NOT NULL,
  pickup_stop TEXT,
  dropoff_stop TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, bus_id)
);

CREATE TABLE IF NOT EXISTS bus_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id UUID NOT NULL,
  student_id UUID NOT NULL,
  route_id UUID,
  date DATE DEFAULT CURRENT_DATE,
  boarded_at TIMESTAMPTZ,
  dropped_at TIMESTAMPTZ,
  status TEXT DEFAULT 'boarded',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY bus_all ON buses FOR ALL USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY br_all ON bus_routes FOR ALL USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY ba_all ON bus_assignments FOR ALL USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY bat_all ON bus_attendance FOR ALL USING (true);

INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'buses_management', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order) VALUES ('buses_management', 'الباصات والنقل', 'إدارة باصات المدرسة والمسارات', 'admin', 'bus', '#4F46E5', ARRAY['admin','institute','parent'], '{}'::jsonb, false, 19) ON CONFLICT (feature_key) DO NOTHING;
