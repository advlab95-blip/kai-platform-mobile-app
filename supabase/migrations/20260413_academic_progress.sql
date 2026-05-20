-- ═══════════════════════════════════════════════════
-- Academic Progress Tracking
-- Feature Flag: academic_progress
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS academic_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'semester',
  start_date DATE,
  end_date DATE,
  academic_year TEXT,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grade_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  student_id UUID NOT NULL,
  subject_id UUID,
  subject_name TEXT NOT NULL,
  period_id UUID REFERENCES academic_periods(id),
  score NUMERIC(5, 2),
  max_score NUMERIC(5, 2) DEFAULT 100,
  grade_letter TEXT,
  teacher_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  student_id UUID NOT NULL,
  period_id UUID REFERENCES academic_periods(id),
  gpa NUMERIC(4, 2),
  rank INT,
  total_students INT,
  strengths TEXT,
  weaknesses TEXT,
  recommendations TEXT,
  generated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grades_student ON grade_entries (student_id);
CREATE INDEX IF NOT EXISTS idx_grades_inst ON grade_entries (institute_id);
CREATE INDEX IF NOT EXISTS idx_reports_student ON academic_reports (student_id);

ALTER TABLE academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY ap_all ON academic_periods FOR ALL USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY ge_admin ON grade_entries FOR ALL USING (public.get_user_role() IN ('admin', 'institute', 'teacher'));
CREATE POLICY ge_student ON grade_entries FOR SELECT USING (student_id = auth.uid());
CREATE POLICY ar_admin ON academic_reports FOR ALL USING (public.get_user_role() IN ('admin', 'institute', 'teacher'));
CREATE POLICY ar_student ON academic_reports FOR SELECT USING (student_id = auth.uid());

INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'academic_progress', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order) VALUES ('academic_progress', 'التطور الأكاديمي', 'تتبع الدرجات والمعدلات والتقارير', 'academic', 'trending-up', '#3B82F6', ARRAY['admin','institute','teacher','student','parent'], '{}'::jsonb, false, 22) ON CONFLICT (feature_key) DO NOTHING;
