-- ============================================================
-- Chat retention update: 6 months → 3 months
-- User requested shorter retention for storage/privacy reasons.
-- Re-applies cleanup_old_messages() with the new interval.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM messages           WHERE created_at < NOW() - INTERVAL '3 months';
  DELETE FROM chat_messages_v2   WHERE sent_at    < NOW() - INTERVAL '3 months';
  DELETE FROM notifications      WHERE created_at < NOW() - INTERVAL '3 months' AND is_read = true;
  DELETE FROM ai_messages        WHERE created_at < NOW() - INTERVAL '3 months';
END;
$$;

-- Drop empty chat_conversations whose last message was more than 3 months ago.
-- Runs after the messages purge so orphan conversations get cleaned in the same pass.
CREATE OR REPLACE FUNCTION public.cleanup_old_conversations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM chat_conversations
  WHERE id NOT IN (SELECT DISTINCT conversation_id FROM chat_messages_v2 WHERE conversation_id IS NOT NULL)
    AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '3 months';
END;
$$;

-- Re-schedule (idempotent: unschedule existing job if present, then add).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-messages') THEN
      PERFORM cron.unschedule('cleanup-old-messages');
    END IF;
    PERFORM cron.schedule(
      'cleanup-old-messages',
      '0 3 * * *',
      $cron$
        SELECT public.cleanup_old_messages();
        SELECT public.cleanup_old_conversations();
      $cron$
    );
  END IF;
END $$;
