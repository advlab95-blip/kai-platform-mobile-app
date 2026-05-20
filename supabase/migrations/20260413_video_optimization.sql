-- ═══════════════════════════════════════════════════
-- Video Optimization: Watch Logs, Access Tokens, Columns
-- ═══════════════════════════════════════════════════

-- 1. Add missing columns to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_seconds INT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS file_size_mb NUMERIC(10, 2);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS resolution TEXT DEFAULT '720p';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS views_count INT DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS institute_id UUID;

-- 2. Video watch logs
CREATE TABLE IF NOT EXISTS video_watch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID,
  student_id UUID NOT NULL,
  video_id UUID NOT NULL,
  watched_at TIMESTAMPTZ DEFAULT now(),
  duration_watched_seconds INT DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  played_from TEXT DEFAULT 'stream',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watch_logs_student ON video_watch_logs (student_id, watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_logs_video ON video_watch_logs (video_id);

-- 3. Video access tokens (for secure playback)
CREATE TABLE IF NOT EXISTS video_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  video_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tokens_expiry ON video_access_tokens (expires_at) WHERE used_at IS NULL;

-- 4. RLS
ALTER TABLE video_watch_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY vwl_read ON video_watch_logs FOR SELECT USING (
  student_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY vwl_insert ON video_watch_logs FOR INSERT WITH CHECK (true);

ALTER TABLE video_access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY vat_read ON video_access_tokens FOR SELECT USING (
  student_id = auth.uid() OR public.get_user_role() = 'admin'
);
CREATE POLICY vat_insert ON video_access_tokens FOR INSERT WITH CHECK (true);

-- 5. Increment views count
CREATE OR REPLACE FUNCTION increment_video_views(p_video_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE videos SET views_count = COALESCE(views_count, 0) + 1 WHERE id = p_video_id;
$$;
