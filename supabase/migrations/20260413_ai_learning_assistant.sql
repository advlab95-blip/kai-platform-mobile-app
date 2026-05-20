-- ═══════════════════════════════════════════════════
-- AI Learning Assistant — 5 features with cost tracking
-- Feature Flags: ai_chat_docs, ai_summaries, ai_quiz_gen, ai_study_guide, ai_mindmap
-- ═══════════════════════════════════════════════════

-- 1. AI Features Config (per institution)
CREATE TABLE IF NOT EXISTS ai_features_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  chat_daily_limit INT DEFAULT 5,
  summary_daily_limit INT DEFAULT 5,
  quiz_daily_limit INT DEFAULT 5,
  study_guide_daily_limit INT DEFAULT 5,
  mindmap_daily_limit INT DEFAULT 5,
  monthly_budget_usd NUMERIC(10, 2) DEFAULT 100,
  alert_at_percentage INT DEFAULT 80,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institute_id)
);

-- 2. AI Requests Log (detailed cost tracking)
CREATE TABLE IF NOT EXISTS ai_requests_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  feature TEXT NOT NULL,
  model_used TEXT DEFAULT 'claude-haiku-4-5',
  content_id UUID,
  content_type TEXT,
  input_tokens INT NOT NULL DEFAULT 0,
  cached_input_tokens INT DEFAULT 0,
  cache_creation_tokens INT DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  input_cost_usd NUMERIC(10, 6) DEFAULT 0,
  cached_cost_usd NUMERIC(10, 6) DEFAULT 0,
  output_cost_usd NUMERIC(10, 6) DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  total_cost_iqd NUMERIC(10, 2) DEFAULT 0,
  savings_from_cache_usd NUMERIC(10, 6) DEFAULT 0,
  used_cache BOOLEAN DEFAULT false,
  duration_ms INT,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_req_inst ON ai_requests_log (institute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_req_user ON ai_requests_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_req_feature ON ai_requests_log (feature);

-- 3. AI Daily Usage (rate limiting)
CREATE TABLE IF NOT EXISTS ai_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  institute_id UUID NOT NULL,
  feature TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INT DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, feature, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage2 ON ai_daily_usage (user_id, usage_date);

-- 4. AI Monthly Usage (monitoring)
CREATE TABLE IF NOT EXISTS ai_monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  user_id UUID,
  year_num INT NOT NULL,
  month_num INT NOT NULL,
  total_requests INT DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_cost_usd NUMERIC(10, 4) DEFAULT 0,
  total_savings_usd NUMERIC(10, 4) DEFAULT 0,
  chat_count INT DEFAULT 0,
  summary_count INT DEFAULT 0,
  quiz_count INT DEFAULT 0,
  study_guide_count INT DEFAULT 0,
  mindmap_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institute_id, user_id, year_num, month_num)
);

-- 5. AI Content Cache
CREATE TABLE IF NOT EXISTS ai_content_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL,
  content_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  token_count INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  use_count INT DEFAULT 0
);

-- 6. RLS
ALTER TABLE ai_features_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY afc_read ON ai_features_config FOR SELECT USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY afc_write ON ai_features_config FOR ALL USING (public.get_user_role() = 'admin');

ALTER TABLE ai_requests_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY arl_admin ON ai_requests_log FOR SELECT USING (public.get_user_role() IN ('admin', 'institute'));
CREATE POLICY arl_own ON ai_requests_log FOR SELECT USING (user_id = auth.uid());
CREATE POLICY arl_insert ON ai_requests_log FOR INSERT WITH CHECK (true);

ALTER TABLE ai_daily_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY adu_all ON ai_daily_usage FOR ALL USING (true);

ALTER TABLE ai_monthly_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY amu_read ON ai_monthly_usage FOR SELECT USING (public.get_user_role() IN ('admin', 'institute'));
CREATE POLICY amu_insert ON ai_monthly_usage FOR INSERT WITH CHECK (true);

ALTER TABLE ai_content_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY acc_all ON ai_content_cache FOR ALL USING (true);

-- 7. Default config for existing institutes
INSERT INTO ai_features_config (institute_id)
SELECT id FROM institutes
ON CONFLICT (institute_id) DO NOTHING;

-- 8. Feature Flags (5 separate AI features)
INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'ai_chat_docs', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'ai_summaries', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'ai_quiz_gen', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'ai_study_guide', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'ai_mindmap', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;

-- 9. Available Features catalog
INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order) VALUES
('ai_chat_docs', 'محادثة مع المحتوى', 'اسأل AI عن أي محتوى دراسي', 'ai', 'chatbubble-ellipses', '#8B5CF6', ARRAY['student','teacher'], '{}'::jsonb, false, 30),
('ai_summaries', 'ملخصات ذكية', 'توليد ملخصات للدروس والمحتوى', 'ai', 'document-text', '#3B82F6', ARRAY['student','teacher'], '{}'::jsonb, false, 31),
('ai_quiz_gen', 'توليد أسئلة', 'توليد أسئلة مراجعة من المحتوى', 'ai', 'help-circle', '#F59E0B', ARRAY['student','teacher'], '{}'::jsonb, false, 32),
('ai_study_guide', 'دليل مذاكرة', 'دليل مذاكرة شامل مولّد بالـ AI', 'ai', 'map', '#10B981', ARRAY['student'], '{}'::jsonb, false, 33),
('ai_mindmap', 'خرائط ذهنية', 'خرائط ذهنية بصرية من المحتوى', 'ai', 'git-network', '#EC4899', ARRAY['student','teacher'], '{}'::jsonb, false, 34)
ON CONFLICT (feature_key) DO NOTHING;

-- 10. Auto-seed trigger for new institutes
CREATE OR REPLACE FUNCTION seed_ai_config_for_institute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO ai_features_config (institute_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO feature_flags (institute_id, feature_key, is_enabled) VALUES
    (NEW.id, 'ai_chat_docs', false),
    (NEW.id, 'ai_summaries', false),
    (NEW.id, 'ai_quiz_gen', false),
    (NEW.id, 'ai_study_guide', false),
    (NEW.id, 'ai_mindmap', false)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_ai_config ON institutes;
CREATE TRIGGER trg_seed_ai_config
  AFTER INSERT ON institutes
  FOR EACH ROW
  EXECUTE FUNCTION seed_ai_config_for_institute();
