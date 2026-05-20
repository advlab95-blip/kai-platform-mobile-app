-- ═══════════════════════════════════════════════════════════════════════════
-- 20260419_performance_indexes_10k.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Composite indexes for 10K-user scale. Every RLS subquery and hot-path
-- SELECT filter should hit an index. All indexes are idempotent.
--
-- DEFENSIVE: every index is wrapped in a column-existence check so this
-- migration is safe against schema variants (dev/prod drift, removed columns,
-- old snapshots). Any missing table/column is silently skipped instead of
-- aborting the whole migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: run a CREATE INDEX only if every listed column exists on the table.
-- Usage inline per-section below via DO $$ blocks.

-- ═══ notifications ═════════════════════════════════════════════════════════
DO $$
DECLARE
  has_recipient_id boolean;
  has_is_read boolean;
  has_created_at boolean;
  has_recipient_role boolean;
  has_institute_id boolean;
  has_sender_id boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='recipient_id') INTO has_recipient_id;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='is_read') INTO has_is_read;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='created_at') INTO has_created_at;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='recipient_role') INTO has_recipient_role;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='institute_id') INTO has_institute_id;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='sender_id') INTO has_sender_id;

  IF has_recipient_id AND has_is_read AND has_created_at THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
             ON notifications(recipient_id, is_read, created_at DESC)';
  END IF;

  IF has_recipient_role AND has_institute_id AND has_created_at THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_role_institute
             ON notifications(recipient_role, institute_id, created_at DESC)';
  ELSIF has_recipient_role AND has_created_at THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_role
             ON notifications(recipient_role, created_at DESC)';
  END IF;

  IF has_sender_id AND has_created_at THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_sender
             ON notifications(sender_id, created_at DESC)';
  END IF;
END $$;


-- ═══ attendance ════════════════════════════════════════════════════════════
DO $$
DECLARE
  has_student_id boolean;
  has_date boolean;
  has_institute_id boolean;
  has_class_id boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance') THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='student_id') INTO has_student_id;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='date') INTO has_date;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='institute_id') INTO has_institute_id;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='class_id') INTO has_class_id;

  IF has_student_id AND has_date THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_student_date
             ON attendance(student_id, date DESC)';
  END IF;

  IF has_institute_id AND has_date THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_institute_date
             ON attendance(institute_id, date)';
  END IF;

  IF has_class_id AND has_date THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_class_date
             ON attendance(class_id, date)';
  END IF;
END $$;


-- ═══ exam_submissions ══════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exam_submissions') THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_submissions' AND column_name='student_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_submissions' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_exam_submissions_student_status
             ON exam_submissions(student_id, status)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_submissions' AND column_name='exam_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_submissions' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_status
             ON exam_submissions(exam_id, status)';
  END IF;
END $$;


-- ═══ chat_messages / messages ══════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='class_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_chat_messages_class_created
               ON chat_messages(class_id, created_at DESC)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='sender_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
               ON chat_messages(sender_id, created_at DESC)';
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='sender_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='receiver_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver_created
               ON messages(sender_id, receiver_id, created_at DESC)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='receiver_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='is_read')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_receiver_read
               ON messages(receiver_id, is_read, created_at DESC)';
    END IF;
  END IF;
END $$;


-- ═══ ai_usage_log ══════════════════════════════════════════════════════════
DO $$
DECLARE
  has_user_id boolean;
  has_feature boolean;
  has_created_at boolean;
  has_institute_id boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_usage_log') THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ai_usage_log' AND column_name='user_id') INTO has_user_id;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ai_usage_log' AND column_name='feature') INTO has_feature;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ai_usage_log' AND column_name='created_at') INTO has_created_at;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ai_usage_log' AND column_name='institute_id') INTO has_institute_id;

  IF has_user_id AND has_feature AND has_created_at THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_feature_created
             ON ai_usage_log(user_id, feature, created_at DESC)';
  END IF;

  IF has_institute_id AND has_created_at THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_usage_log_institute_created
             ON ai_usage_log(institute_id, created_at DESC)';
  END IF;
END $$;


-- ═══ videos ════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'videos') THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='videos' AND column_name='teacher_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='videos' AND column_name='created_at') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='videos' AND column_name='is_archived') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_videos_teacher_archived
               ON videos(teacher_id, is_archived, created_at DESC)';
    ELSE
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_videos_teacher_created
               ON videos(teacher_id, created_at DESC)';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='videos' AND column_name='class_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='videos' AND column_name='created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_videos_class_created
             ON videos(class_id, created_at DESC)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='videos' AND column_name='institute_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='videos' AND column_name='created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_videos_institute_created
             ON videos(institute_id, created_at DESC)';
  END IF;
END $$;


-- ═══ tasks ═════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='class_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tasks_class_created
             ON tasks(class_id, created_at DESC)';
  END IF;
END $$;


-- ═══ enrollments — RLS helper hot path ═════════════════════════════════════
DO $$
DECLARE
  has_user_id boolean;
  has_status boolean;
  has_institute_id boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enrollments') THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='user_id') INTO has_user_id;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='status') INTO has_status;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='institute_id') INTO has_institute_id;

  IF has_user_id AND has_status THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_enrollments_user_status
             ON enrollments(user_id, status)';
  ELSIF has_user_id THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_enrollments_user
             ON enrollments(user_id)';
  END IF;

  IF has_institute_id AND has_status THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_enrollments_institute_status
             ON enrollments(institute_id, status)';
  ELSIF has_institute_id THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_enrollments_institute
             ON enrollments(institute_id)';
  END IF;
END $$;


-- ═══ parent_child ══════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parent_child') THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='parent_child' AND column_name='parent_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_parent_child_parent ON parent_child(parent_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='parent_child' AND column_name='student_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_parent_child_student ON parent_child(student_id)';
  END IF;
END $$;


-- ═══ timetables ════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'timetables') THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='timetables' AND column_name='class_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='timetables' AND column_name='day_of_week')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='timetables' AND column_name='start_time') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_timetables_class_day
             ON timetables(class_id, day_of_week, start_time)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='timetables' AND column_name='teacher_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='timetables' AND column_name='day_of_week') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_timetables_teacher_day
             ON timetables(teacher_id, day_of_week)';
  END IF;
END $$;


-- ═══ assignments + submissions ═════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assignments') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='class_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_assignments_class_created
               ON assignments(class_id, created_at DESC)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='teacher_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_assignments_teacher_created
               ON assignments(teacher_id, created_at DESC)';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assignment_submissions') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='student_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='status') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_status
               ON assignment_submissions(student_id, status)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='assignment_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='status') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_status
               ON assignment_submissions(assignment_id, status)';
    END IF;
  END IF;
END $$;


-- ═══ announcements ═════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'announcements')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='announcements' AND column_name='institute_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='announcements' AND column_name='created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_announcements_institute_created
             ON announcements(institute_id, created_at DESC)';
  END IF;
END $$;


-- ═══ system_settings ═══════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_settings')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_settings' AND column_name='key') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_system_settings_key
             ON system_settings(key)';
  END IF;
END $$;


-- ═══ live_streams ══════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'live_streams') THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_streams' AND column_name='class_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_streams' AND column_name='status')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_streams' AND column_name='started_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_live_streams_class_status
             ON live_streams(class_id, status, started_at DESC)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_streams' AND column_name='teacher_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_streams' AND column_name='status')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_streams' AND column_name='started_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_live_streams_teacher_status
             ON live_streams(teacher_id, status, started_at DESC)';
  END IF;
END $$;
