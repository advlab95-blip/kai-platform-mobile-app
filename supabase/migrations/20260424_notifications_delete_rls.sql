-- ════════════════════════════════════════════════════════════
-- RLS: allow users to delete their OWN notifications
-- ════════════════════════════════════════════════════════════
-- Previously only SELECT and UPDATE were permitted on notifications.
-- Without a DELETE policy, user-initiated deletes (swipe-to-delete,
-- "mark all as read" clear-out) silently failed for everyone except
-- service-role callers — which pushed the app to ship admin keys to
-- the client. This policy restores least-privilege: each user may
-- delete only rows addressed to them.

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;

CREATE POLICY "notifications_delete_own" ON notifications
FOR DELETE USING (
  recipient_id = auth.uid()
);
