-- ═══════════════════════════════════════════════════════
-- Fix: Announcements + Notifications + Users RLS
-- Date: 2026-04-15
-- Run this in Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════

-- ── Announcements ──
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select_policy" ON announcements;
DROP POLICY IF EXISTS "announcements_insert_policy" ON announcements;
DROP POLICY IF EXISTS "Users can view announcements from their institution" ON announcements;
DROP POLICY IF EXISTS "Allow select for own institution" ON announcements;
DROP POLICY IF EXISTS "announcements_select_own_institution" ON announcements;
DROP POLICY IF EXISTS "announcements_insert_own_institution" ON announcements;
DROP POLICY IF EXISTS "announcements_update_own_institution" ON announcements;
DROP POLICY IF EXISTS "announcements_delete_own_institution" ON announcements;

CREATE POLICY "announcements_select_own_institution" ON announcements
FOR SELECT USING (
  institute_id IS NULL
  OR institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
);

CREATE POLICY "announcements_insert_own_institution" ON announcements
FOR INSERT WITH CHECK (
  institute_id IS NULL
  OR institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
);

CREATE POLICY "announcements_update_own_institution" ON announcements
FOR UPDATE USING (
  institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
);

CREATE POLICY "announcements_delete_own_institution" ON announcements
FOR DELETE USING (
  institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
);

-- ── Notifications ──
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;

CREATE POLICY "notifications_select_own" ON notifications
FOR SELECT USING (
  recipient_id = auth.uid()
  OR (
    institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  )
);

CREATE POLICY "notifications_update_own" ON notifications
FOR UPDATE USING (recipient_id = auth.uid());

-- ══════════════════════════════════
-- NOTE: Application-level filtering is ALSO enforced in api.ts
-- as defense-in-depth. Both RLS and code-level filters protect data.
-- ══════════════════════════════════
