-- ═══════════════════════════════════════════════════
-- Multi-Branch System
-- Feature Flag: multi_branch
-- ═══════════════════════════════════════════════════

-- 1. Branches table
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  manager_name TEXT,
  is_main BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institute_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_institution ON branches(institute_id);

-- 2. Branch managers
CREATE TABLE IF NOT EXISTS branch_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'branch_admin',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

-- 3. Add branch_id to main tables
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS branch_id UUID;

-- 4. Branch transfer log
CREATE TABLE IF NOT EXISTS branch_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_branch_id UUID REFERENCES branches(id),
  to_branch_id UUID NOT NULL REFERENCES branches(id),
  transferred_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Auto-create default branch for existing institutes
INSERT INTO branches (institute_id, name, code, is_main, is_active)
SELECT id, name, 'MAIN', true, true FROM institutes
ON CONFLICT (institute_id, code) DO NOTHING;

-- 6. Link existing enrollments to default branch
UPDATE enrollments SET branch_id = (
  SELECT b.id FROM branches b WHERE b.institute_id = enrollments.institute_id AND b.is_main = true LIMIT 1
) WHERE branch_id IS NULL;

-- 7. RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY br_read ON branches FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY br_write ON branches FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

ALTER TABLE branch_managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY bm_read ON branch_managers FOR SELECT USING (
  user_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute')
);
CREATE POLICY bm_write ON branch_managers FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

ALTER TABLE branch_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_all ON branch_transfers FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- 8. Add multi_branch to feature_flags for all institutes
INSERT INTO feature_flags (institute_id, feature_key, is_enabled)
SELECT id, 'multi_branch', false FROM institutes
ON CONFLICT (institute_id, feature_key) DO NOTHING;

-- 9. Add to available_features catalog
INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order)
VALUES ('multi_branch', 'الفروع المتعددة', 'إدارة عدة فروع للمؤسسة الواحدة', 'admin', 'business', '#4F46E5', ARRAY['admin','institute'], '{"admin":"/(admin)/branches","institute":"/(institute)/branches"}', false, 16)
ON CONFLICT (feature_key) DO NOTHING;
