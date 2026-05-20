-- ═══════════════════════════════════════════════════════════════════════════
-- 20260512_chat_3month_retention.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 3-month retention for chat traffic. Product decision (2026-05-08):
--   "اريد المحادثه تنحذف كل 3 اشهر"
--
-- Scope of deletion (chat traffic only — voice/text inside conversations):
--   • public.messages              — 1:1 institute admin <-> teacher/parent chat
--                                     (sender_id, receiver_id, content, audio_url, …)
--   • public.chat_messages_v2      — BroadcastHub-style 1:1 conversations
--                                     (conversation_id, sender_id, content, audio_url, …)
--   • public.class_chat_messages   — teacher <-> class group chat
--                                     (chat_id, sender_id, content, audio_url, …)
--
-- We do NOT delete:
--   • notifications, announcements, exam submissions, attendance, grades,
--     materials, payments — these are not "chat" rows.
--   • chat_conversations / class_chats — the container rows stay so the user
--     can reuse the conversation after the messages roll off; the cleanup
--     just empties the message history older than 90 days.
--
-- Multi-tenant safety:
--   Each of the targeted tables already carries institute_id (or, for
--   chat_messages_v2 / class_chat_messages, joins through chat_conversations /
--   class_chats which carry institute_id). The retention job is a blind
--   time-window delete — no tenant filter needed because we delete equally
--   across all institutes on the same SLA, and there is no risk of leaking
--   data: rows are removed, not exposed.
--
-- Idempotent & re-runnable: the function uses `WHERE created_at < cutoff`
-- (or `sent_at` where that's the column name), so re-running the same day is
-- a no-op once today's cutoff has been processed.
--
-- This migration is intentionally **not applied** until product confirms.
-- Apply with:   psql ... -f 20260512_chat_3month_retention.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Cleanup function — runs as SECURITY DEFINER so the cron job (which runs
--    as the `supabase_admin` role without a session) can still bypass RLS on
--    the chat tables. The function takes no parameters; the cutoff is hard-
--    coded to 90 days so the contract is auditable.
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
RETURNS TABLE (
  table_name TEXT,
  rows_deleted BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - interval '90 days';
  v_deleted BIGINT;
BEGIN
  -- ── messages (1:1 admin-style chat) ─────────────────────────────────────
  DELETE FROM public.messages
   WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  table_name := 'messages';
  rows_deleted := v_deleted;
  RETURN NEXT;

  -- ── chat_messages_v2 (BroadcastHub-style 1:1 conversations) ─────────────
  -- Column is `sent_at` here, NOT created_at — see schema in api.sendChatMessage2.
  -- Guard with `to_regclass` so partial deployments (without v2 tables) skip
  -- gracefully instead of aborting the whole cleanup.
  IF to_regclass('public.chat_messages_v2') IS NOT NULL THEN
    DELETE FROM public.chat_messages_v2
     WHERE sent_at < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    v_deleted := 0;
  END IF;
  table_name := 'chat_messages_v2';
  rows_deleted := v_deleted;
  RETURN NEXT;

  -- ── class_chat_messages (teacher <-> class group chats) ─────────────────
  -- Column is also `sent_at` (see api.sendClassChatMessage).
  IF to_regclass('public.class_chat_messages') IS NOT NULL THEN
    DELETE FROM public.class_chat_messages
     WHERE sent_at < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    v_deleted := 0;
  END IF;
  table_name := 'class_chat_messages';
  rows_deleted := v_deleted;
  RETURN NEXT;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_chat_messages() IS
  'Hard-deletes chat messages older than 90 days from messages, chat_messages_v2, '
  'and class_chat_messages. Scheduled daily via pg_cron (see job below). '
  'Container rows (chat_conversations, class_chats) are left intact so the '
  'conversation can be resumed after history rolls off.';

-- 2. pg_cron job — runs once a day at 02:30 UTC (low-traffic window for the
--    Iraq region the platform serves). pg_cron must be enabled at the
--    project level (Supabase enables it by default on paid plans). If the
--    extension is missing we still create the function above so it can be
--    invoked manually until cron is enabled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any previous run of this job with the same name so the
    -- migration is idempotent (Supabase migrations re-run on every deploy).
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'chat_retention_90d';

    PERFORM cron.schedule(
      'chat_retention_90d',
      '30 2 * * *',               -- daily at 02:30 UTC
      'SELECT public.cleanup_old_chat_messages();'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — function exists but no cron job scheduled. '
                 'Enable pg_cron in the Supabase dashboard (Database -> Extensions) '
                 'and re-run this migration to schedule the daily cleanup.';
  END IF;
END $$;

-- 3. Grant — let the service role (used by Edge Functions) invoke the cleanup
--    manually if we ever want to trigger it on-demand from an admin tool.
GRANT EXECUTE ON FUNCTION public.cleanup_old_chat_messages() TO service_role;

-- 4. Sanity check (optional): run it once at migration time so the first
--    cleanup happens immediately instead of waiting for the next 02:30 UTC.
-- SELECT * FROM public.cleanup_old_chat_messages();
