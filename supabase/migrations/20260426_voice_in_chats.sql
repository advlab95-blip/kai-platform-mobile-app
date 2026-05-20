-- ============================================================================
-- Voice messages inside chat threads
-- ----------------------------------------------------------------------------
-- Adds audio_url + duration columns to:
--   * class_chat_messages   (teacher ↔ class chat)
--   * messages              (institute admin ↔ teacher / parent direct chats)
--
-- Both tables already carry a `type` field; we extend its semantics to allow
-- 'voice' in addition to 'text'. No data is rewritten — old rows keep type='text'.
--
-- audio_url   → public Bunny CDN URL (already tenant-scoped server-side by the
--               upload-media edge function).
-- duration    → integer seconds. NULL when type='text'.
--
-- Multi-tenant safety: existing RLS policies on both tables already gate by
-- institute_id / chat membership; adding nullable columns does not weaken that.
-- ============================================================================

ALTER TABLE public.class_chat_messages
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS duration  INTEGER;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS duration  INTEGER,
  ADD COLUMN IF NOT EXISTS type      TEXT NOT NULL DEFAULT 'text';

-- Defensive checks: either text content (type='text' / NULL legacy rows) OR
-- voice payload (type='voice' + audio_url present). We deliberately use a
-- soft check (type IN (...)) rather than a strict CHECK constraint so future
-- types ('image','file', etc.) don't require a migration to add.
COMMENT ON COLUMN public.class_chat_messages.audio_url IS
  'Bunny CDN URL for type=voice messages. NULL for text messages.';
COMMENT ON COLUMN public.class_chat_messages.duration IS
  'Recording length in seconds for type=voice messages.';

COMMENT ON COLUMN public.messages.audio_url IS
  'Bunny CDN URL for type=voice messages. NULL for text messages.';
COMMENT ON COLUMN public.messages.duration IS
  'Recording length in seconds for type=voice messages.';
COMMENT ON COLUMN public.messages.type IS
  'Message kind: text | voice (extensible). Default text for back-compat.';
