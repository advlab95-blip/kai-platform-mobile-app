-- Per-user UI preferences (services grid design, etc.)
-- Each admin picks the visual style for their own services page. Preference
-- is scoped to user_id only: a single admin managing multiple institutes sees
-- the same style everywhere (simpler UX than per-institute prefs).

CREATE TABLE IF NOT EXISTS user_ui_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  services_design TEXT NOT NULL DEFAULT 'classic_grid'
    CHECK (services_design IN ('classic_grid', 'ios_list')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_ui_prefs ENABLE ROW LEVEL SECURITY;

-- A user can read their own prefs row.
DROP POLICY IF EXISTS "ui_prefs_self_read" ON user_ui_prefs;
CREATE POLICY "ui_prefs_self_read" ON user_ui_prefs
  FOR SELECT USING (auth.uid() = user_id);

-- A user can insert/update their own prefs row.
DROP POLICY IF EXISTS "ui_prefs_self_write" ON user_ui_prefs;
CREATE POLICY "ui_prefs_self_write" ON user_ui_prefs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ui_prefs_self_update" ON user_ui_prefs;
CREATE POLICY "ui_prefs_self_update" ON user_ui_prefs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Touch updated_at on write
CREATE OR REPLACE FUNCTION touch_user_ui_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_ui_prefs_updated_at ON user_ui_prefs;
CREATE TRIGGER trg_user_ui_prefs_updated_at
  BEFORE UPDATE ON user_ui_prefs
  FOR EACH ROW EXECUTE FUNCTION touch_user_ui_prefs_updated_at();
