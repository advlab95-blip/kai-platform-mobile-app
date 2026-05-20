-- ============================================================================
-- Image messages inside class_chat_messages
-- ----------------------------------------------------------------------------
-- Adds image_url column so teachers (and students, when allowed) can attach a
-- picture to a class-chat thread. Uploaded image lives on Bunny CDN; the URL is
-- stored here. type='image' marks the row.
--
-- Multi-tenant safety: existing RLS policies on class_chat_messages gate by
-- institute_id and chat membership; adding a nullable column does not weaken
-- that guarantee.
-- ============================================================================

ALTER TABLE public.class_chat_messages
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.class_chat_messages.image_url IS
  'Bunny CDN URL for type=image messages. NULL for text/voice messages.';
