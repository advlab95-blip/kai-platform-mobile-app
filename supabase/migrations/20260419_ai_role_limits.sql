-- ═══════════════════════════════════════════════════
-- AI Role-Based Daily Limits (per institute × role × feature)
-- Admin controls: how many times a student/teacher can use each AI feature per day
-- ═══════════════════════════════════════════════════

-- 1. Main table
CREATE TABLE IF NOT EXISTS institute_ai_role_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  feature TEXT NOT NULL CHECK (feature IN ('chat', 'summary', 'quiz', 'study_guide', 'mindmap')),
  daily_limit INT NOT NULL DEFAULT 5 CHECK (daily_limit >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institute_id, role, feature)
);

CREATE INDEX IF NOT EXISTS idx_ai_role_limits_lookup
  ON institute_ai_role_limits (institute_id, role, feature);

-- 2. RLS: admins write everything, institute members read their own
ALTER TABLE institute_ai_role_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS airl_admin_all ON institute_ai_role_limits;
DROP POLICY IF EXISTS airl_read_own ON institute_ai_role_limits;

CREATE POLICY airl_admin_all ON institute_ai_role_limits
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY airl_read_own ON institute_ai_role_limits
  FOR SELECT TO authenticated
  USING (institute_id IN (SELECT public.get_user_institute_ids()));

-- 3. Seed defaults for all existing institutes (5 features × 2 roles = 10 rows per institute)
INSERT INTO institute_ai_role_limits (institute_id, role, feature, daily_limit)
SELECT i.id, r.role, f.feature,
  CASE WHEN r.role = 'teacher' THEN 15 ELSE 10 END AS daily_limit
FROM institutes i
CROSS JOIN (VALUES ('student'), ('teacher')) r(role)
CROSS JOIN (VALUES ('chat'), ('summary'), ('quiz'), ('study_guide'), ('mindmap')) f(feature)
ON CONFLICT (institute_id, role, feature) DO NOTHING;

-- 4. Auto-seed trigger for new institutes
CREATE OR REPLACE FUNCTION seed_ai_role_limits_for_institute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO institute_ai_role_limits (institute_id, role, feature, daily_limit)
  SELECT NEW.id, r.role, f.feature,
    CASE WHEN r.role = 'teacher' THEN 15 ELSE 10 END
  FROM (VALUES ('student'), ('teacher')) r(role)
  CROSS JOIN (VALUES ('chat'), ('summary'), ('quiz'), ('study_guide'), ('mindmap')) f(feature)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_ai_role_limits ON institutes;
CREATE TRIGGER trg_seed_ai_role_limits
  AFTER INSERT ON institutes
  FOR EACH ROW
  EXECUTE FUNCTION seed_ai_role_limits_for_institute();

-- 5. RPC: monthly usage report per institute (for admin reports screen)
CREATE OR REPLACE FUNCTION get_institute_ai_monthly_report(
  p_institute_id UUID,
  p_year INT,
  p_month INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- Only admin can call this
  IF public.get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_start_date := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');
  v_end_date := v_start_date + INTERVAL '1 month';

  WITH logs AS (
    SELECT * FROM ai_requests_log
    WHERE institute_id = p_institute_id
      AND created_at >= v_start_date
      AND created_at < v_end_date
  ),
  totals AS (
    SELECT
      COUNT(*)::INT AS total_requests,
      COALESCE(SUM(input_tokens), 0)::BIGINT AS total_input_tokens,
      COALESCE(SUM(output_tokens), 0)::BIGINT AS total_output_tokens,
      COALESCE(SUM(total_cost_usd), 0)::NUMERIC(12,4) AS total_cost_usd,
      COALESCE(SUM(total_cost_iqd), 0)::NUMERIC(12,2) AS total_cost_iqd,
      COALESCE(SUM(savings_from_cache_usd), 0)::NUMERIC(12,4) AS total_savings_usd,
      COUNT(*) FILTER (WHERE used_cache)::INT AS cached_requests
    FROM logs
  ),
  by_feature AS (
    SELECT jsonb_object_agg(feature, jsonb_build_object(
      'requests', cnt,
      'cost_usd', cost,
      'input_tokens', input_tok,
      'output_tokens', output_tok
    )) AS data
    FROM (
      SELECT feature,
        COUNT(*)::INT AS cnt,
        COALESCE(SUM(total_cost_usd), 0)::NUMERIC(12,4) AS cost,
        COALESCE(SUM(input_tokens), 0)::BIGINT AS input_tok,
        COALESCE(SUM(output_tokens), 0)::BIGINT AS output_tok
      FROM logs
      GROUP BY feature
    ) s
  ),
  by_role AS (
    SELECT jsonb_object_agg(user_role, jsonb_build_object(
      'requests', cnt,
      'cost_usd', cost
    )) AS data
    FROM (
      SELECT user_role,
        COUNT(*)::INT AS cnt,
        COALESCE(SUM(total_cost_usd), 0)::NUMERIC(12,4) AS cost
      FROM logs
      GROUP BY user_role
    ) s
  ),
  top_users AS (
    SELECT jsonb_agg(row_to_json(u) ORDER BY u.requests DESC) AS data
    FROM (
      SELECT l.user_id,
        l.user_role,
        COUNT(*)::INT AS requests,
        COALESCE(SUM(l.total_cost_usd), 0)::NUMERIC(12,4) AS cost,
        (SELECT full_name FROM users WHERE id = l.user_id) AS user_name
      FROM logs l
      GROUP BY l.user_id, l.user_role
      ORDER BY COUNT(*) DESC
      LIMIT 10
    ) u
  ),
  timeline AS (
    SELECT jsonb_agg(row_to_json(d) ORDER BY d.day) AS data
    FROM (
      SELECT DATE(created_at) AS day,
        COUNT(*)::INT AS requests,
        COALESCE(SUM(total_cost_usd), 0)::NUMERIC(12,4) AS cost
      FROM logs
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    ) d
  )
  SELECT jsonb_build_object(
    'institute_id', p_institute_id,
    'year', p_year,
    'month', p_month,
    'totals', to_jsonb(totals.*),
    'by_feature', COALESCE(by_feature.data, '{}'::jsonb),
    'by_role', COALESCE(by_role.data, '{}'::jsonb),
    'top_users', COALESCE(top_users.data, '[]'::jsonb),
    'timeline', COALESCE(timeline.data, '[]'::jsonb)
  ) INTO v_result
  FROM totals, by_feature, by_role, top_users, timeline;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_institute_ai_monthly_report(UUID, INT, INT) TO authenticated;
