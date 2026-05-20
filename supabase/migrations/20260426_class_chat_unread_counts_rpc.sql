-- ============================================================================
-- Migration: add_class_chat_unread_counts_rpc
-- Date    : 2026-04-26
-- Purpose : Replace N+1 client-side loop in api.getClassChatUnreadCounts with
--           a single round-trip RPC. A teacher with 20 chats was triggering 20
--           COUNT(*) queries per page load — bandwidth + latency disaster.
--
-- Multi-tenant safety:
--   - SECURITY DEFINER bypasses RLS, so we MUST enforce access in-function.
--   - We only return counts for chat_ids the caller actually has access to:
--       * Teacher: owns the chat (class_chats.teacher_id = p_user_id), OR
--       * Student: enrolled in the chat's section_id (active enrollment) OR
--                  member of the chat's class_id (student_classes).
--   - Chats outside the caller's institute are filtered out automatically by
--     the access check (enrollments / student_classes are scoped per-institute).
--
-- Index note:
--   Required for performance: class_chat_messages (chat_id, sent_at DESC).
--   See bottom of file — created if missing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_class_chat_unread_counts(
    p_user_id  uuid,
    p_chat_ids uuid[]
)
RETURNS TABLE (
    chat_id      uuid,
    unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH input_chats AS (
        SELECT unnest(coalesce(p_chat_ids, ARRAY[]::uuid[])) AS id
    ),
    -- Authorize: only chats the user actually belongs to.
    accessible_chats AS (
        SELECT cc.id, cc.section_id, cc.class_id, cc.teacher_id
        FROM   class_chats cc
        JOIN   input_chats ic ON ic.id = cc.id
        WHERE  cc.teacher_id = p_user_id
           OR  EXISTS (
                  SELECT 1 FROM enrollments e
                  WHERE  e.user_id     = p_user_id
                    AND  e.section_id  = cc.section_id
                    AND  e.status      = 'active'
               )
           OR  EXISTS (
                  SELECT 1 FROM student_classes sc
                  WHERE  sc.student_id = p_user_id
                    AND  sc.class_id   = cc.class_id
               )
    ),
    last_reads AS (
        SELECT r.chat_id, r.last_read_at
        FROM   class_chat_reads r
        WHERE  r.user_id = p_user_id
          AND  r.chat_id IN (SELECT id FROM accessible_chats)
    )
    SELECT
        ac.id AS chat_id,
        COUNT(m.id)::bigint AS unread_count
    FROM   accessible_chats ac
    LEFT   JOIN last_reads          lr ON lr.chat_id = ac.id
    LEFT   JOIN class_chat_messages m  ON m.chat_id  = ac.id
                                       AND m.sender_id <> p_user_id
                                       AND m.sent_at  > COALESCE(lr.last_read_at, '1970-01-01'::timestamptz)
    GROUP BY ac.id;
$$;

REVOKE ALL ON FUNCTION public.get_class_chat_unread_counts(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_chat_unread_counts(uuid, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_class_chat_unread_counts(uuid, uuid[]) IS
'Bulk unread-count for class chats. Replaces N+1 per-chat COUNT queries. '
'SECURITY DEFINER + explicit ACL: teacher must own the chat, student must be '
'enrolled in section_id or member of class_id. Returns one row per accessible chat.';

-- Performance: ensure the count predicate is index-supported.
CREATE INDEX IF NOT EXISTS idx_class_chat_messages_chat_sent
    ON public.class_chat_messages (chat_id, sent_at DESC);

-- Helps the last_reads lookup (composite, user-scoped).
CREATE INDEX IF NOT EXISTS idx_class_chat_reads_user_chat
    ON public.class_chat_reads (user_id, chat_id);
