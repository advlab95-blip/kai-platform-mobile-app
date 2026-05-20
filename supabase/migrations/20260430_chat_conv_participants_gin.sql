-- Add GIN index on chat_conversations.participants so .contains() lookups stop seq-scanning.
-- Triggered by an audit of the broadcast prefetch path: fanning out a broadcast to N recipients
-- needs to find the existing 1:1 conversation for each pair, and without this index every send
-- pays for a full table scan once the table grows past a few thousand rows.

CREATE INDEX IF NOT EXISTS idx_chat_conversations_participants_gin
  ON public.chat_conversations USING GIN (participants);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_institute_updated
  ON public.chat_conversations (institute_id, updated_at DESC);
