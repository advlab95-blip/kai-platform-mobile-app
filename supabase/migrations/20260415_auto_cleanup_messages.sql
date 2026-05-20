-- ============================================================
-- Auto-cleanup: Delete messages older than 6 months
-- Run this as a Supabase Cron Job (pg_cron)
-- ============================================================

-- Function to delete old messages
CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete messages older than 6 months
  DELETE FROM messages WHERE created_at < NOW() - INTERVAL '6 months';

  -- Delete chat_messages_v2 older than 6 months
  DELETE FROM chat_messages_v2 WHERE sent_at < NOW() - INTERVAL '6 months';

  -- Delete old notifications older than 3 months
  DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '3 months' AND is_read = true;

  -- Delete old AI messages older than 6 months
  DELETE FROM ai_messages WHERE created_at < NOW() - INTERVAL '6 months';
END;
$$;

-- Schedule: Run every day at 3:00 AM
-- NOTE: Enable pg_cron extension first in Supabase Dashboard → Database → Extensions
-- Then run:
-- SELECT cron.schedule('cleanup-old-messages', '0 3 * * *', 'SELECT public.cleanup_old_messages()');
