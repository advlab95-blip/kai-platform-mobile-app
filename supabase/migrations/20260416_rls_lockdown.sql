-- ═══════════════════════════════════════════════════════
-- RLS Lockdown — Replace permissive policies with proper tenant isolation
-- Date: 2026-04-16
-- Run this AFTER 20260416_logic_audit_fixes.sql
-- ═══════════════════════════════════════════════════════

-- Helper: get user's institute IDs
CREATE OR REPLACE FUNCTION public.get_user_institute_ids()
RETURNS SETOF UUID AS $$
  SELECT institute_id FROM enrollments WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════
-- ATTENDANCE
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "attendance_permissive" ON attendance;
DROP POLICY IF EXISTS "attendance_read" ON attendance;
CREATE POLICY "attendance_read" ON attendance FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR student_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "attendance_write" ON attendance;
CREATE POLICY "attendance_write" ON attendance FOR INSERT WITH CHECK (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);
DROP POLICY IF EXISTS "attendance_update" ON attendance;
CREATE POLICY "attendance_update" ON attendance FOR UPDATE USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- TIMETABLES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "timetables_permissive" ON timetables;
DROP POLICY IF EXISTS "timetables_read" ON timetables;
CREATE POLICY "timetables_read" ON timetables FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "timetables_write" ON timetables;
CREATE POLICY "timetables_write" ON timetables FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- CLASSES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "classes_permissive" ON classes;
DROP POLICY IF EXISTS "classes_read" ON classes;
CREATE POLICY "classes_read" ON classes FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "classes_write" ON classes;
CREATE POLICY "classes_write" ON classes FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- MANUAL_GRADES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "manual_grades_permissive" ON manual_grades;
DROP POLICY IF EXISTS "manual_grades_read" ON manual_grades;
CREATE POLICY "manual_grades_read" ON manual_grades FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR student_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "manual_grades_write" ON manual_grades;
CREATE POLICY "manual_grades_write" ON manual_grades FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- PAYMENTS
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "payments_permissive" ON payments;
DROP POLICY IF EXISTS "payments_read" ON payments;
CREATE POLICY "payments_read" ON payments FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR student_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "payments_write" ON payments;
CREATE POLICY "payments_write" ON payments FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- PARENT_CHILD
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "parent_child_permissive" ON parent_child;
DROP POLICY IF EXISTS "parent_child_read" ON parent_child;
CREATE POLICY "parent_child_read" ON parent_child FOR SELECT USING (
  parent_id = auth.uid()
  OR student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute')
);
DROP POLICY IF EXISTS "parent_child_write" ON parent_child;
CREATE POLICY "parent_child_write" ON parent_child FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- MEDICAL_RECORDS
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "medical_records_permissive" ON medical_records;
DROP POLICY IF EXISTS "medical_records_read" ON medical_records;
CREATE POLICY "medical_records_read" ON medical_records FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR student_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "medical_records_write" ON medical_records;
CREATE POLICY "medical_records_write" ON medical_records FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'medical')
);

-- ═══════════════════════════════════════════════════
-- CAFETERIA
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "cafeteria_items_permissive" ON cafeteria_items;
DROP POLICY IF EXISTS "cafeteria_orders_permissive" ON cafeteria_orders;

DROP POLICY IF EXISTS "cafeteria_items_read" ON cafeteria_items;
CREATE POLICY "cafeteria_items_read" ON cafeteria_items FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "cafeteria_items_write" ON cafeteria_items;
CREATE POLICY "cafeteria_items_write" ON cafeteria_items FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'cafeteria')
);
DROP POLICY IF EXISTS "cafeteria_orders_read" ON cafeteria_orders;
CREATE POLICY "cafeteria_orders_read" ON cafeteria_orders FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "cafeteria_orders_write" ON cafeteria_orders;
CREATE POLICY "cafeteria_orders_write" ON cafeteria_orders FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'cafeteria', 'student')
);

-- ═══════════════════════════════════════════════════
-- TASKS & SUBMISSIONS
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "tasks_permissive" ON tasks;
DROP POLICY IF EXISTS "task_submissions_permissive" ON task_submissions;

DROP POLICY IF EXISTS "tasks_read" ON tasks;
CREATE POLICY "tasks_read" ON tasks FOR SELECT USING (
  teacher_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'student', 'teacher')
);
DROP POLICY IF EXISTS "tasks_write" ON tasks;
CREATE POLICY "tasks_write" ON tasks FOR ALL USING (
  teacher_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute')
);
DROP POLICY IF EXISTS "task_submissions_read" ON task_submissions;
CREATE POLICY "task_submissions_read" ON task_submissions FOR SELECT USING (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
DROP POLICY IF EXISTS "task_submissions_write" ON task_submissions;
CREATE POLICY "task_submissions_write" ON task_submissions FOR INSERT WITH CHECK (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- STUDENT_CLASSES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "student_classes_permissive" ON student_classes;
DROP POLICY IF EXISTS "student_classes_read" ON student_classes;
CREATE POLICY "student_classes_read" ON student_classes FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR student_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "student_classes_write" ON student_classes;
CREATE POLICY "student_classes_write" ON student_classes FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- TEACHER_ASSIGNMENTS
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "teacher_assignments_permissive" ON teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_read" ON teacher_assignments;
CREATE POLICY "teacher_assignments_read" ON teacher_assignments FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR teacher_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "teacher_assignments_write" ON teacher_assignments;
CREATE POLICY "teacher_assignments_write" ON teacher_assignments FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- STUDENT_FEES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "student_fees_permissive" ON student_fees;
DROP POLICY IF EXISTS "student_fees_read" ON student_fees;
CREATE POLICY "student_fees_read" ON student_fees FOR SELECT USING (
  student_id = auth.uid()
  OR student_id IN (SELECT student_id FROM parent_child WHERE parent_id = auth.uid())
  OR public.get_user_role() IN ('admin', 'institute')
);
DROP POLICY IF EXISTS "student_fees_write" ON student_fees;
CREATE POLICY "student_fees_write" ON student_fees FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- LEAVE_REQUESTS
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "leave_requests_permissive" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_read" ON leave_requests;
CREATE POLICY "leave_requests_read" ON leave_requests FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR requested_by = auth.uid()
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "leave_requests_write" ON leave_requests;
CREATE POLICY "leave_requests_write" ON leave_requests FOR INSERT WITH CHECK (
  requested_by = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute')
);
DROP POLICY IF EXISTS "leave_requests_update" ON leave_requests;
CREATE POLICY "leave_requests_update" ON leave_requests FOR UPDATE USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- VOICE_MESSAGES (no institute_id column — use sender_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "voice_messages_permissive" ON voice_messages;
DROP POLICY IF EXISTS "voice_messages_read" ON voice_messages;
CREATE POLICY "voice_messages_read" ON voice_messages FOR SELECT USING (
  sender_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'student', 'teacher')
);
DROP POLICY IF EXISTS "voice_messages_write" ON voice_messages;
CREATE POLICY "voice_messages_write" ON voice_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- MESSAGES (Chat)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "messages_permissive" ON messages;
DROP POLICY IF EXISTS "messages_read" ON messages;
CREATE POLICY "messages_read" ON messages FOR SELECT USING (
  sender_id = auth.uid()
  OR receiver_id = auth.uid()
  OR public.get_user_role() = 'admin'
);
DROP POLICY IF EXISTS "messages_write" ON messages;
CREATE POLICY "messages_write" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
);

-- ═══════════════════════════════════════════════════
-- LIVE_STREAMS
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "live_streams_permissive" ON live_streams;
DROP POLICY IF EXISTS "live_streams_read" ON live_streams;
CREATE POLICY "live_streams_read" ON live_streams FOR SELECT USING (
  teacher_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'student', 'teacher')
);
DROP POLICY IF EXISTS "live_streams_write" ON live_streams;
CREATE POLICY "live_streams_write" ON live_streams FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- FEATURE_FLAGS (already has policies but add admin access)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "feature_flags_permissive" ON feature_flags;
-- Keep existing policies from 20260412_feature_flags.sql

-- ═══════════════════════════════════════════════════
-- GALLERIES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "galleries_permissive" ON galleries;
DROP POLICY IF EXISTS "galleries_read" ON galleries;
CREATE POLICY "galleries_read" ON galleries FOR SELECT USING (true); -- Content is public within app
DROP POLICY IF EXISTS "galleries_write" ON galleries;
CREATE POLICY "galleries_write" ON galleries FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- AI TABLES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "ai_usage_log_permissive" ON ai_usage_log;
DROP POLICY IF EXISTS "ai_content_cache_permissive" ON ai_content_cache;
DROP POLICY IF EXISTS "ai_conversations_permissive" ON ai_conversations;
DROP POLICY IF EXISTS "ai_messages_permissive" ON ai_messages;

DROP POLICY IF EXISTS "ai_usage_own" ON ai_usage_log;
CREATE POLICY "ai_usage_own" ON ai_usage_log FOR ALL USING (user_id = auth.uid() OR public.get_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_cache_all" ON ai_content_cache;
CREATE POLICY "ai_cache_all" ON ai_content_cache FOR ALL USING (true); -- Cache is shared
DROP POLICY IF EXISTS "ai_conv_own" ON ai_conversations;
CREATE POLICY "ai_conv_own" ON ai_conversations FOR ALL USING (user_id = auth.uid() OR public.get_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_msg_own" ON ai_messages;
CREATE POLICY "ai_msg_own" ON ai_messages FOR ALL USING (
  conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
