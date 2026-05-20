-- ═══════════════════════════════════════════════════════════════════════════
-- 20260418_performance_indexes.sql  (most defensive version)
-- ═══════════════════════════════════════════════════════════════════════════
-- Every index is wrapped in its own DO block with an EXCEPTION handler.
-- If any index fails (missing column, missing table, anything), we log a
-- NOTICE and move on — ALL OTHER indexes still get built.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Enrollments ──────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_enrollments_institute_role ON enrollments(institute_id, role);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_enrollments_institute_role: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id, institute_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_enrollments_user: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id) WHERE class_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_enrollments_class: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_enrollments_section ON enrollments(section_id) WHERE section_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_enrollments_section: %', SQLERRM; END $$;


-- ─── student_classes ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_student_classes_student ON student_classes(student_id, institute_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_student_classes_student: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_student_classes_class ON student_classes(class_id, institute_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_student_classes_class: %', SQLERRM; END $$;


-- ─── teacher_assignments ─────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_assignments(teacher_id, institute_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_teacher_assignments_teacher: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class ON teacher_assignments(class_id) WHERE class_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_teacher_assignments_class: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_teacher_assignments_section ON teacher_assignments(section_id) WHERE section_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_teacher_assignments_section: %', SQLERRM; END $$;


-- ─── videos ──────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_videos_teacher_created ON videos(teacher_id, created_at DESC) WHERE is_archived = false;
EXCEPTION WHEN others THEN
  -- Try again without the WHERE clause in case is_archived doesn't exist on this schema
  BEGIN CREATE INDEX IF NOT EXISTS idx_videos_teacher_created ON videos(teacher_id, created_at DESC);
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_videos_teacher_created: %', SQLERRM; END;
END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_videos_class ON videos(class_id) WHERE class_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_videos_class: %', SQLERRM; END $$;


-- ─── galleries ───────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_galleries_teacher_created ON galleries(teacher_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_galleries_teacher_created: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_galleries_institute ON galleries(institute_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_galleries_institute: %', SQLERRM; END $$;


-- ─── materials ───────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_materials_teacher ON materials(teacher_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_materials_teacher: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_materials_institute ON materials(institute_id, type) WHERE is_archived = false;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_materials_institute: %', SQLERRM; END $$;


-- ─── exams ───────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacher_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_exams_teacher: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class_id, status) WHERE class_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_exams_class: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_exams_section ON exams(section_id, status) WHERE section_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_exams_section: %', SQLERRM; END $$;


-- ─── exam_sessions ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_exam_sessions_student ON exam_sessions(student_id, exam_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_exam_sessions_student: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam ON exam_sessions(exam_id, status);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_exam_sessions_exam: %', SQLERRM; END $$;


-- ─── assignments ─────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_assignments_teacher: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, is_published) WHERE class_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_assignments_class: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON assignment_submissions(student_id, assignment_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_assignment_submissions_student: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_task_submissions_student ON task_submissions(student_id, task_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_task_submissions_student: %', SQLERRM; END $$;


-- ─── tasks ───────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tasks_teacher ON tasks(teacher_id, status, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_tasks_teacher: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tasks_class ON tasks(class_id, status) WHERE class_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_tasks_class: %', SQLERRM; END $$;


-- ─── notifications ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_notifications_recipient: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_notifications_institute_role ON notifications(institute_id, recipient_role, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_notifications_institute_role: %', SQLERRM; END $$;


-- ─── attendance (institute_id may not exist on every schema) ─────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id, institute_id, date);
EXCEPTION WHEN others THEN
  -- Fallback: index without institute_id
  BEGIN CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id, date);
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_attendance_student: %', SQLERRM; END;
END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_attendance_institute_date ON attendance(institute_id, date DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_attendance_institute_date: %', SQLERRM; END $$;


-- ─── manual_grades ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_manual_grades_student ON manual_grades(student_id, category_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_manual_grades_student: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_manual_grades_institute_category ON manual_grades(institute_id, category_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_manual_grades_institute_category: %', SQLERRM; END $$;


-- ─── announcements ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_announcements_institute ON announcements(institute_id, target_role, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_announcements_institute: %', SQLERRM; END $$;


-- ─── cafeteria ───────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cafeteria_orders_institute_status ON cafeteria_orders(institute_id, status, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_cafeteria_orders_institute_status: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cafeteria_items_institute ON cafeteria_items(institute_id) WHERE is_available = true;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_cafeteria_items_institute: %', SQLERRM; END $$;


-- ─── messages ────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_messages_sender: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_messages_receiver: %', SQLERRM; END $$;


-- ─── parent_child ────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_parent_child_parent ON parent_child(parent_id, student_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_parent_child_parent: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_parent_child_student ON parent_child(student_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_parent_child_student: %', SQLERRM; END $$;


-- ─── chat_locks ──────────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_chat_locks_teacher_student ON chat_locks(teacher_id, student_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_chat_locks_teacher_student: %', SQLERRM; END $$;


-- ─── content_views ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_content_views_item ON content_views(content_type, content_id);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_content_views_item: %', SQLERRM; END $$;


-- ─── admin_audit_log ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_log(actor_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_admin_audit_actor: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_admin_audit_institute ON admin_audit_log(institute_id, created_at DESC) WHERE institute_id IS NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_admin_audit_institute: %', SQLERRM; END $$;


-- ─── voice_messages ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_voice_messages_institute ON voice_messages(institute_id, created_at DESC);
EXCEPTION WHEN others THEN RAISE NOTICE 'skip idx_voice_messages_institute: %', SQLERRM; END $$;
