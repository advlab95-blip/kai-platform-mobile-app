-- ═══════════════════════════════════════════════════════════════════════════
-- 20260427_scale_indexes_100k.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose : Add composite + descending indexes that the hot list/feed/report
--           queries will rely on once any single tenant crosses ~100k rows.
--           Matches access patterns currently in the app:
--
--             notifications  → recipient_id feed ordered by created_at DESC
--             videos         → list per institute, newest first
--             materials      → list per institute, newest first
--             attendance     → daily reports per student / per institute
--             class_chat_msg → chat history pagination by sent_at DESC
--             assignments    → upcoming due lists per institute
--
-- Style    : Each index wrapped in its own DO $$ block with EXCEPTION handler
--            so a missing column or table never aborts the whole migration
--            (same pattern as 20260418_performance_indexes.sql and
--            20260419_performance_indexes_10k.sql).
--
-- Idempotent: All CREATE INDEX statements use IF NOT EXISTS — safe to re-run.
--
-- Reversible: Each index can be dropped with `DROP INDEX IF EXISTS <name>;`.
--             Indexes are additive — they do not change schema or data.
--
-- Notes on column-name drift vs spec:
--   * notifications has `recipient_id` (NOT user_id) — verified in
--     20260421_push_notifications.sql. We index recipient_id.
--   * class_chat_messages timestamp column is `sent_at` (NOT created_at) —
--     verified in 20260426_class_chat_unread_counts_rpc.sql. We index sent_at.
--
-- Concurrency note:
--   Supabase migrations run in a transaction, so CREATE INDEX CONCURRENTLY
--   cannot be used here. On a 100k-row table the locking window is short
--   (sub-second per index), but if a target table is already much larger
--   when this lands, prefer running each CREATE INDEX CONCURRENTLY manually
--   from the SQL editor on production and then mark this migration applied.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── notifications ────────────────────────────────────────────────────────
-- Optimizes: SELECT … FROM notifications ORDER BY created_at DESC LIMIT N
-- (admin / global recent feed; small but frequent).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_notifications_created
    ON notifications (created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_notifications_created: %', SQLERRM; END $$;

-- Optimizes: SELECT … FROM notifications WHERE recipient_id = $1
--            ORDER BY created_at DESC LIMIT N OFFSET M
-- (per-user notification feed — the highest-volume query in the app).
-- NOTE: column is `recipient_id` in this schema (see 20260421_push_notifications.sql),
-- not `user_id`. We use the real column name.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications (recipient_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_notifications_recipient_created: %', SQLERRM; END $$;


-- ─── videos ──────────────────────────────────────────────────────────────
-- Optimizes: SELECT … FROM videos WHERE institute_id = $1
--            ORDER BY created_at DESC LIMIT N
-- (institute-scoped video library list — every teacher/student opening videos).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_videos_institute_created
    ON videos (institute_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_videos_institute_created: %', SQLERRM; END $$;


-- ─── materials ───────────────────────────────────────────────────────────
-- Optimizes: SELECT … FROM materials WHERE institute_id = $1
--            ORDER BY created_at DESC LIMIT N
-- (institute-scoped study-material list — same pattern as videos).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_materials_institute_created
    ON materials (institute_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_materials_institute_created: %', SQLERRM; END $$;


-- ─── attendance ──────────────────────────────────────────────────────────
-- Optimizes: SELECT … FROM attendance WHERE student_id = $1
--            ORDER BY date DESC LIMIT N
-- (per-student attendance history — opened daily by parents / students).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_attendance_student_date_desc
    ON attendance (student_id, date DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_attendance_student_date_desc: %', SQLERRM; END $$;

-- Optimizes: SELECT … FROM attendance WHERE institute_id = $1
--            ORDER BY date DESC LIMIT N
-- (institute-wide daily attendance reports for admins).
-- NOTE: an institute_id-only index already exists with ascending date
-- (idx_attendance_institute_date in 20260418_performance_indexes.sql);
-- this descending variant is what reverse-pagination reports actually need.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_attendance_institute_date_desc
    ON attendance (institute_id, date DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_attendance_institute_date_desc: %', SQLERRM; END $$;


-- ─── class_chat_messages ─────────────────────────────────────────────────
-- Optimizes: SELECT … FROM class_chat_messages WHERE chat_id = $1
--            ORDER BY sent_at DESC LIMIT N
-- (chat history infinite-scroll — most expensive query as chats grow).
-- NOTE: timestamp column is `sent_at`, not `created_at` (verified in
-- 20260426_class_chat_unread_counts_rpc.sql). An identical index already
-- exists there (idx_class_chat_messages_chat_sent); IF NOT EXISTS makes
-- this a no-op rather than an error if applied a second time.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_class_chat_messages_chat_sent
    ON class_chat_messages (chat_id, sent_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_class_chat_messages_chat_sent: %', SQLERRM; END $$;


-- ─── assignments ─────────────────────────────────────────────────────────
-- Optimizes: SELECT … FROM assignments WHERE institute_id = $1
--            ORDER BY due_date DESC LIMIT N
-- (institute admin / teacher "upcoming assignments" lists).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_assignments_institute_due
    ON assignments (institute_id, due_date DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_assignments_institute_due: %', SQLERRM; END $$;
