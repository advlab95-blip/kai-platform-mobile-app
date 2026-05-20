-- ═══════════════════════════════════════════════════
-- Behavior & Discipline System
-- Feature Flag: behavior_system
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS behavior_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'positive',
  points INT DEFAULT 1,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS behavior_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  category_id UUID REFERENCES behavior_categories(id),
  type TEXT NOT NULL,
  points INT NOT NULL,
  description TEXT,
  recorded_by UUID NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_behavior_student ON behavior_records (student_id);
CREATE INDEX IF NOT EXISTS idx_behavior_inst ON behavior_records (institute_id);

ALTER TABLE behavior_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY bc_all ON behavior_categories FOR ALL USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY br_all2 ON behavior_records FOR ALL USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY br_student ON behavior_records FOR SELECT USING (student_id = auth.uid());

INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'behavior_system', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order) VALUES ('behavior_system', 'السلوك والانضباط', 'تتبع نقاط السلوك الإيجابي والسلبي', 'academic', 'star', '#F59E0B', ARRAY['admin','institute','teacher','student','parent'], '{}'::jsonb, false, 20) ON CONFLICT (feature_key) DO NOTHING;
