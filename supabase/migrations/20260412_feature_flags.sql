-- ═══════════════════════════════════════════════════
-- Feature Flags System
-- Controls which features are available per institute/school
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Feature Flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institute_id, feature_key)
);

-- 2. Feature flags change log (audit trail)
CREATE TABLE IF NOT EXISTS feature_flags_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  old_value BOOLEAN,
  new_value BOOLEAN NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS Policies
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Admin can read/write all
CREATE POLICY ff_admin_all ON feature_flags FOR ALL USING (
  public.get_user_role() = 'admin'
);

-- Institute can read their own flags
CREATE POLICY ff_institute_read ON feature_flags FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
);

-- Teachers/Students can read their institute flags
CREATE POLICY ff_user_read ON feature_flags FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
);

ALTER TABLE feature_flags_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ffl_admin ON feature_flags_log FOR ALL USING (
  public.get_user_role() = 'admin'
);
CREATE POLICY ffl_institute_read ON feature_flags_log FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
);

-- 4. Seed default feature flags for ALL existing institutes
-- These are the NEW features that need toggle control
INSERT INTO feature_flags (institute_id, feature_key, is_enabled)
SELECT i.id, f.key, false
FROM institutes i
CROSS JOIN (VALUES
  ('attendance_qr'),
  ('interactive_schedule'),
  ('electronic_assignments'),
  ('exam_system'),
  ('exam_content_protection'),
  ('certificates'),
  ('parent_teacher_chat'),
  ('ai_student_chatbot'),
  ('ai_auto_grading'),
  ('ai_predictive_analysis'),
  ('ai_study_plan'),
  ('ai_teacher_assistant')
) AS f(key)
ON CONFLICT (institute_id, feature_key) DO NOTHING;

-- 5. Function to auto-seed flags for new institutes
CREATE OR REPLACE FUNCTION seed_feature_flags_for_institute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO feature_flags (institute_id, feature_key, is_enabled)
  VALUES
    (NEW.id, 'attendance_qr', false),
    (NEW.id, 'interactive_schedule', false),
    (NEW.id, 'electronic_assignments', false),
    (NEW.id, 'exam_system', false),
    (NEW.id, 'exam_content_protection', false),
    (NEW.id, 'certificates', false),
    (NEW.id, 'parent_teacher_chat', false),
    (NEW.id, 'ai_student_chatbot', false),
    (NEW.id, 'ai_auto_grading', false),
    (NEW.id, 'ai_predictive_analysis', false),
    (NEW.id, 'ai_study_plan', false),
    (NEW.id, 'ai_teacher_assistant', false)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger: auto-seed on new institute creation
DROP TRIGGER IF EXISTS trg_seed_feature_flags ON institutes;
CREATE TRIGGER trg_seed_feature_flags
  AFTER INSERT ON institutes
  FOR EACH ROW
  EXECUTE FUNCTION seed_feature_flags_for_institute();
