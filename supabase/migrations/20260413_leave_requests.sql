-- ═══════════════════════════════════════════════════
-- Leave Requests System
-- Feature Flag: leave_requests
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  branch_id UUID,
  requested_by UUID NOT NULL,
  requester_role TEXT NOT NULL,
  subject_id UUID NOT NULL,
  subject_type TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TEXT,
  reason TEXT NOT NULL,
  attachment_url TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_inst ON leave_requests (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_subject ON leave_requests (subject_id);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY lr_admin ON leave_requests FOR ALL USING (public.get_user_role() IN ('admin', 'institute'));
CREATE POLICY lr_own ON leave_requests FOR SELECT USING (requested_by = auth.uid());
CREATE POLICY lr_insert ON leave_requests FOR INSERT WITH CHECK (requested_by = auth.uid());

INSERT INTO feature_flags (institute_id, feature_key, is_enabled)
SELECT id, 'leave_requests', false FROM institutes
ON CONFLICT (institute_id, feature_key) DO NOTHING;

INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order)
VALUES ('leave_requests', 'الاستئذان والإجازات', 'طلبات استئذان وإجازات إلكترونية', 'communication', 'exit-outline', '#F59E0B', ARRAY['admin','institute','parent','teacher'], '{}'::jsonb, false, 18)
ON CONFLICT (feature_key) DO NOTHING;
