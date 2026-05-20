-- ═══════════════════════════════════════════════════
-- Chat System v2 (Teacher ↔ Parent)
-- Feature Flag: parent_teacher_chat
-- ═══════════════════════════════════════════════════

-- 1. Conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  participants UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Messages
CREATE TABLE IF NOT EXISTS chat_messages_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  -- types: text, image, file
  file_url TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_conv ON chat_messages_v2 (conversation_id, sent_at);

-- 3. RLS
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_access ON chat_conversations FOR ALL USING (
  auth.uid() = ANY(participants) OR public.get_user_role() = 'admin'
);

ALTER TABLE chat_messages_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY cm_read ON chat_messages_v2 FOR SELECT USING (
  conversation_id IN (SELECT id FROM chat_conversations WHERE auth.uid() = ANY(participants))
  OR public.get_user_role() = 'admin'
);
CREATE POLICY cm_insert ON chat_messages_v2 FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute')
);
