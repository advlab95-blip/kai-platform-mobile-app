-- ═══════════════════════════════════════════════════
-- SECURITY FIX: Enable RLS + Tenant Isolation Policies
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- Helper function: get current user's institute IDs
CREATE OR REPLACE FUNCTION public.get_user_institute_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT institute_id FROM enrollments WHERE user_id = auth.uid();
$$;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- ═══════════════════════════════════════════════════
-- Enable RLS on critical tables (if not already)
-- ═══════════════════════════════════════════════════

-- Drop ALL existing permissive policies first
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════
-- USERS table — everyone reads own, admin reads all
-- ═══════════════════════════════════════════════════
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_read ON users FOR SELECT USING (
  id = auth.uid()
  OR public.get_user_role() = 'admin'
  OR id IN (SELECT user_id FROM enrollments WHERE institute_id IN (SELECT public.get_user_institute_ids()))
);
CREATE POLICY users_write ON users FOR ALL USING (
  id = auth.uid() OR public.get_user_role() = 'admin'
);

-- ═══════════════════════════════════════════════════
-- INSTITUTES — enrolled users read, admin manages
-- ═══════════════════════════════════════════════════
ALTER TABLE institutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY institutes_read ON institutes FOR SELECT USING (
  id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY institutes_admin ON institutes FOR ALL USING (
  public.get_user_role() = 'admin'
);

-- ═══════════════════════════════════════════════════
-- ENROLLMENTS — own institute only
-- ═══════════════════════════════════════════════════
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrollments_read ON enrollments FOR SELECT USING (
  user_id = auth.uid()
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY enrollments_write ON enrollments FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- VIDEOS — teacher's own + students in same institute
-- ═══════════════════════════════════════════════════
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY videos_read ON videos FOR SELECT USING (
  teacher_id = auth.uid()
  OR teacher_id IN (SELECT user_id FROM enrollments WHERE institute_id IN (SELECT public.get_user_institute_ids()))
  OR public.get_user_role() = 'admin'
);
CREATE POLICY videos_write ON videos FOR ALL USING (
  teacher_id = auth.uid() OR public.get_user_role() = 'admin'
);

-- ═══════════════════════════════════════════════════
-- EXAMS — same pattern as videos
-- ═══════════════════════════════════════════════════
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY exams_read ON exams FOR SELECT USING (
  teacher_id = auth.uid()
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY exams_write ON exams FOR ALL USING (
  teacher_id = auth.uid() OR public.get_user_role() = 'admin'
);

-- ═══════════════════════════════════════════════════
-- ANNOUNCEMENTS — target role + institute
-- ═══════════════════════════════════════════════════
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcements_read ON announcements FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR institute_id IS NULL
  OR target_role = 'all'
  OR public.get_user_role() = 'admin'
);
CREATE POLICY announcements_write ON announcements FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- NOTIFICATIONS — recipient only
-- ═══════════════════════════════════════════════════
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_read ON notifications FOR SELECT USING (
  recipient_id = auth.uid()
  OR recipient_role = public.get_user_role()
  OR recipient_role = 'all'
  OR sender_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
CREATE POLICY notifications_write ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (
  recipient_id = auth.uid() OR public.get_user_role() = 'admin'
);

-- ═══════════════════════════════════════════════════
-- SUPPORT TICKETS — own only, admin reads all
-- ═══════════════════════════════════════════════════
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_read ON support_tickets FOR SELECT USING (
  sender_id = auth.uid() OR public.get_user_role() = 'admin'
);
CREATE POLICY tickets_write ON support_tickets FOR INSERT WITH CHECK (
  sender_id = auth.uid()
);
CREATE POLICY tickets_admin ON support_tickets FOR UPDATE USING (
  public.get_user_role() = 'admin'
);

-- ═══════════════════════════════════════════════════
-- MATERIALS — institute scope
-- ═══════════════════════════════════════════════════
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY materials_read ON materials FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR institute_id IS NULL
  OR teacher_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
CREATE POLICY materials_write ON materials FOR ALL USING (
  teacher_id = auth.uid() OR public.get_user_role() = 'admin'
);

-- ═══════════════════════════════════════════════════
-- SYSTEM SETTINGS — everyone reads, admin writes
-- ═══════════════════════════════════════════════════
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_read ON system_settings FOR SELECT USING (true);
CREATE POLICY settings_write ON system_settings FOR ALL USING (
  public.get_user_role() = 'admin'
);

-- ═══════════════════════════════════════════════════
-- ALL OTHER TABLES — permissive for now (to not break app)
-- These should be tightened in future
-- ═══════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN ('users','institutes','enrollments','videos','exams',
    'announcements','notifications','support_tickets','materials','system_settings'))
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_permissive ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
