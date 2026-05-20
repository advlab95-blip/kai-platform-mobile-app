-- ═══════════════════════════════════════════════════
-- AI Features: Chatbot, Auto-Grading, Analysis, Study Plans, Teacher Assistant
-- Feature Flags: ai_student_chatbot, ai_auto_grading, ai_predictive_analysis, ai_study_plan, ai_teacher_assistant
-- ═══════════════════════════════════════════════════

-- 1. AI Conversations (Student Chatbot)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  institute_id UUID NOT NULL,
  title TEXT DEFAULT 'محادثة جديدة',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. AI Messages
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Student Analyses (Predictive)
CREATE TABLE IF NOT EXISTS student_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  institute_id UUID NOT NULL,
  analysis_type TEXT DEFAULT 'weekly',
  data JSONB NOT NULL,
  -- data: { strengths, weaknesses, predictions, recommendations, charts }
  generated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Study Plans
CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  institute_id UUID NOT NULL,
  title TEXT NOT NULL,
  plan_data JSONB NOT NULL,
  -- plan_data: { weeks: [{ day, subjects: [{ name, duration, tasks }] }] }
  status TEXT DEFAULT 'active',
  generated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. AI Usage tracking (rate limiting)
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  institute_id UUID NOT NULL,
  feature TEXT NOT NULL,
  -- feature: chatbot, auto_grade, analysis, study_plan, teacher_assistant
  tokens_used INT DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily ON ai_usage_log (user_id, feature, created_at);

-- 6. RLS
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY aic_access ON ai_conversations FOR ALL USING (
  student_id = auth.uid() OR public.get_user_role() = 'admin'
);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY aim_access ON ai_messages FOR ALL USING (
  conversation_id IN (SELECT id FROM ai_conversations WHERE student_id = auth.uid())
  OR public.get_user_role() = 'admin'
);

ALTER TABLE student_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY sa_read ON student_analyses FOR SELECT USING (
  student_id = auth.uid()
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() IN ('admin', 'parent')
);
CREATE POLICY sa_write ON student_analyses FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_access ON study_plans FOR ALL USING (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher', 'parent')
);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY aul_read ON ai_usage_log FOR SELECT USING (
  user_id = auth.uid() OR public.get_user_role() = 'admin'
);
CREATE POLICY aul_insert ON ai_usage_log FOR INSERT WITH CHECK (true);
