-- ═══════════════════════════════════════════════════════
-- RLS Lockdown v2 — Based on ACTUAL table columns
-- Date: 2026-04-16
-- ═══════════════════════════════════════════════════════

-- Helper functions
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════
-- ATTENDANCE (columns: id, timetable_id, student_id, date, status, justification_text, created_at, branch_id)
-- NO institute_id — use student_id
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "attendance_permissive" ON attendance;
DROP POLICY IF EXISTS "attendance_read" ON attendance;
DROP POLICY IF EXISTS "attendance_write" ON attendance;
DROP POLICY IF EXISTS "attendance_update" ON attendance;

CREATE POLICY "attendance_read" ON attendance FOR SELECT USING (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher', 'parent')
);
CREATE POLICY "attendance_write" ON attendance FOR INSERT WITH CHECK (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY "attendance_update" ON attendance FOR UPDATE USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- CLASSES (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "classes_permissive" ON classes;
DROP POLICY IF EXISTS "classes_read" ON classes;
DROP POLICY IF EXISTS "classes_write" ON classes;

CREATE POLICY "classes_read" ON classes FOR SELECT USING (
  institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "classes_write" ON classes FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- MANUAL_GRADES (has institute_id + student_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "manual_grades_permissive" ON manual_grades;
DROP POLICY IF EXISTS "manual_grades_read" ON manual_grades;
DROP POLICY IF EXISTS "manual_grades_write" ON manual_grades;

CREATE POLICY "manual_grades_read" ON manual_grades FOR SELECT USING (
  student_id = auth.uid()
  OR institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "manual_grades_write" ON manual_grades FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- PAYMENTS (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "payments_permissive" ON payments;
DROP POLICY IF EXISTS "payments_read" ON payments;
DROP POLICY IF EXISTS "payments_write" ON payments;

CREATE POLICY "payments_read" ON payments FOR SELECT USING (
  student_id = auth.uid()
  OR institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "payments_write" ON payments FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- PARENT_CHILD (columns: parent_id, student_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "parent_child_permissive" ON parent_child;
DROP POLICY IF EXISTS "parent_child_read" ON parent_child;
DROP POLICY IF EXISTS "parent_child_write" ON parent_child;

CREATE POLICY "parent_child_read" ON parent_child FOR SELECT USING (
  parent_id = auth.uid() OR student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute')
);
CREATE POLICY "parent_child_write" ON parent_child FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- MEDICAL_RECORDS (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "medical_records_permissive" ON medical_records;
DROP POLICY IF EXISTS "medical_records_read" ON medical_records;
DROP POLICY IF EXISTS "medical_records_write" ON medical_records;

CREATE POLICY "medical_records_read" ON medical_records FOR SELECT USING (
  student_id = auth.uid()
  OR institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "medical_records_write" ON medical_records FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'medical')
);

-- ═══════════════════════════════════════════════════
-- CAFETERIA (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "cafeteria_items_permissive" ON cafeteria_items;
DROP POLICY IF EXISTS "cafeteria_items_read" ON cafeteria_items;
DROP POLICY IF EXISTS "cafeteria_items_write" ON cafeteria_items;
DROP POLICY IF EXISTS "cafeteria_orders_permissive" ON cafeteria_orders;
DROP POLICY IF EXISTS "cafeteria_orders_read" ON cafeteria_orders;
DROP POLICY IF EXISTS "cafeteria_orders_write" ON cafeteria_orders;

CREATE POLICY "cafeteria_items_read" ON cafeteria_items FOR SELECT USING (
  institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "cafeteria_items_write" ON cafeteria_items FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'cafeteria')
);
CREATE POLICY "cafeteria_orders_read" ON cafeteria_orders FOR SELECT USING (
  institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "cafeteria_orders_write" ON cafeteria_orders FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'cafeteria', 'student')
);

-- ═══════════════════════════════════════════════════
-- TASKS (NO institute_id — has teacher_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "tasks_permissive" ON tasks;
DROP POLICY IF EXISTS "tasks_read" ON tasks;
DROP POLICY IF EXISTS "tasks_write" ON tasks;

CREATE POLICY "tasks_read" ON tasks FOR SELECT USING (
  teacher_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'student', 'teacher')
);
CREATE POLICY "tasks_write" ON tasks FOR ALL USING (
  teacher_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- TASK_SUBMISSIONS (NO institute_id — has student_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "task_submissions_permissive" ON task_submissions;
DROP POLICY IF EXISTS "task_submissions_read" ON task_submissions;
DROP POLICY IF EXISTS "task_submissions_write" ON task_submissions;

CREATE POLICY "task_submissions_read" ON task_submissions FOR SELECT USING (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY "task_submissions_write" ON task_submissions FOR INSERT WITH CHECK (
  student_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- STUDENT_CLASSES (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "student_classes_permissive" ON student_classes;
DROP POLICY IF EXISTS "student_classes_read" ON student_classes;
DROP POLICY IF EXISTS "student_classes_write" ON student_classes;

CREATE POLICY "student_classes_read" ON student_classes FOR SELECT USING (
  student_id = auth.uid()
  OR institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "student_classes_write" ON student_classes FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- TEACHER_ASSIGNMENTS (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "teacher_assignments_permissive" ON teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_read" ON teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_write" ON teacher_assignments;

CREATE POLICY "teacher_assignments_read" ON teacher_assignments FOR SELECT USING (
  teacher_id = auth.uid()
  OR institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "teacher_assignments_write" ON teacher_assignments FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- STUDENT_FEES (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "student_fees_permissive" ON student_fees;
DROP POLICY IF EXISTS "student_fees_read" ON student_fees;
DROP POLICY IF EXISTS "student_fees_write" ON student_fees;

CREATE POLICY "student_fees_read" ON student_fees FOR SELECT USING (
  student_id = auth.uid()
  OR student_id IN (SELECT student_id FROM parent_child WHERE parent_id = auth.uid())
  OR public.get_user_role() IN ('admin', 'institute')
);
CREATE POLICY "student_fees_write" ON student_fees FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- LEAVE_REQUESTS (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "leave_requests_permissive" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_read" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_write" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update" ON leave_requests;

CREATE POLICY "leave_requests_read" ON leave_requests FOR SELECT USING (
  requested_by = auth.uid()
  OR institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "leave_requests_write" ON leave_requests FOR INSERT WITH CHECK (
  requested_by = auth.uid() OR public.get_user_role() IN ('admin', 'institute')
);
CREATE POLICY "leave_requests_update" ON leave_requests FOR UPDATE USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- VOICE_MESSAGES (NO institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "voice_messages_permissive" ON voice_messages;
DROP POLICY IF EXISTS "voice_messages_read" ON voice_messages;
DROP POLICY IF EXISTS "voice_messages_write" ON voice_messages;

CREATE POLICY "voice_messages_read" ON voice_messages FOR SELECT USING (
  sender_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute', 'student', 'teacher')
);
CREATE POLICY "voice_messages_write" ON voice_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
);

-- ═══════════════════════════════════════════════════
-- MESSAGES (NO institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "messages_permissive" ON messages;
DROP POLICY IF EXISTS "messages_read" ON messages;
DROP POLICY IF EXISTS "messages_write" ON messages;

CREATE POLICY "messages_read" ON messages FOR SELECT USING (
  sender_id = auth.uid() OR receiver_id = auth.uid() OR public.get_user_role() = 'admin'
);
CREATE POLICY "messages_write" ON messages FOR INSERT WITH CHECK (sender_id = auth.uid());

-- ═══════════════════════════════════════════════════
-- LIVE_STREAMS (NO institute_id — has teacher_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "live_streams_permissive" ON live_streams;
DROP POLICY IF EXISTS "live_streams_read" ON live_streams;
DROP POLICY IF EXISTS "live_streams_write" ON live_streams;

CREATE POLICY "live_streams_read" ON live_streams FOR SELECT USING (
  teacher_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute', 'student', 'teacher')
);
CREATE POLICY "live_streams_write" ON live_streams FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- GALLERIES (NO institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "galleries_permissive" ON galleries;
DROP POLICY IF EXISTS "galleries_read" ON galleries;
DROP POLICY IF EXISTS "galleries_write" ON galleries;

CREATE POLICY "galleries_read" ON galleries FOR SELECT USING (true);
CREATE POLICY "galleries_write" ON galleries FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);

-- ═══════════════════════════════════════════════════
-- TIMETABLES (has institute_id)
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "timetables_permissive" ON timetables;
DROP POLICY IF EXISTS "timetables_read" ON timetables;
DROP POLICY IF EXISTS "timetables_write" ON timetables;

CREATE POLICY "timetables_read" ON timetables FOR SELECT USING (
  institute_id IN (SELECT institute_id FROM enrollments WHERE user_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "timetables_write" ON timetables FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ═══════════════════════════════════════════════════
-- FEATURE_FLAGS
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "feature_flags_permissive" ON feature_flags;

-- ═══════════════════════════════════════════════════
-- AI TABLES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "ai_usage_log_permissive" ON ai_usage_log;
DROP POLICY IF EXISTS "ai_content_cache_permissive" ON ai_content_cache;
DROP POLICY IF EXISTS "ai_conversations_permissive" ON ai_conversations;
DROP POLICY IF EXISTS "ai_messages_permissive" ON ai_messages;
DROP POLICY IF EXISTS "ai_usage_own" ON ai_usage_log;
DROP POLICY IF EXISTS "ai_cache_all" ON ai_content_cache;
DROP POLICY IF EXISTS "ai_conv_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_msg_own" ON ai_messages;

CREATE POLICY "ai_usage_own" ON ai_usage_log FOR ALL USING (user_id = auth.uid() OR public.get_user_role() = 'admin');
CREATE POLICY "ai_cache_all" ON ai_content_cache FOR ALL USING (true);
CREATE POLICY "ai_conv_own" ON ai_conversations FOR ALL USING (student_id = auth.uid() OR public.get_user_role() = 'admin');
CREATE POLICY "ai_msg_own" ON ai_messages FOR ALL USING (
  conversation_id IN (SELECT id FROM ai_conversations WHERE student_id = auth.uid())
  OR public.get_user_role() = 'admin'
);
