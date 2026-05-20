-- ═══════════════════════════════════════════════════
-- Events & Activities System
-- Feature Flag: events_system
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'activity',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT,
  max_participants INT,
  cover_image_url TEXT,
  is_published BOOLEAN DEFAULT false,
  target_roles TEXT[] DEFAULT ARRAY['student'],
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'registered',
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS event_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ev_read ON events FOR SELECT USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY ev_write ON events FOR ALL USING (public.get_user_role() IN ('admin', 'institute', 'teacher'));
CREATE POLICY er_all ON event_registrations FOR ALL USING (true);
CREATE POLICY ep_all ON event_photos FOR ALL USING (true);

INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'events_system', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order) VALUES ('events_system', 'الفعاليات والأنشطة', 'إدارة الفعاليات المدرسية والتسجيل', 'academic', 'flag', '#EC4899', ARRAY['admin','institute','teacher','student','parent'], '{}'::jsonb, false, 21) ON CONFLICT (feature_key) DO NOTHING;
