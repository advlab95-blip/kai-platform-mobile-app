-- ═══════════════════════════════════════════════════
-- Performance Indexes for 20,000+ users
-- ═══════════════════════════════════════════════════

-- Enrollments (most queried table)
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments (user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_institute ON enrollments (institute_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_role ON enrollments (institute_id, role);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments (class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_section ON enrollments (section_id);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_frozen ON users (is_frozen) WHERE is_frozen = true;

-- Videos
CREATE INDEX IF NOT EXISTS idx_videos_teacher ON videos (teacher_id);
CREATE INDEX IF NOT EXISTS idx_videos_archived ON videos (is_archived) WHERE is_archived = true;
CREATE INDEX IF NOT EXISTS idx_videos_hidden ON videos (is_hidden) WHERE is_hidden = true;

-- Materials
CREATE INDEX IF NOT EXISTS idx_materials_teacher ON materials (teacher_id);
CREATE INDEX IF NOT EXISTS idx_materials_institute ON materials (institute_id);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_institute ON attendance (institute_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (date);

-- Assignments
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments (class_id);
CREATE INDEX IF NOT EXISTS idx_assignment_subs_student ON assignment_submissions (student_id);

-- Exams
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams (teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_class ON exams (class_id);
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams (status);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications (recipient_role);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications (is_read) WHERE is_read = false;

-- Announcements
CREATE INDEX IF NOT EXISTS idx_announcements_institute ON announcements (institute_id);
CREATE INDEX IF NOT EXISTS idx_announcements_role ON announcements (target_role);

-- Teacher assignments
CREATE INDEX IF NOT EXISTS idx_teacher_asgn_teacher ON teacher_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_asgn_inst ON teacher_assignments (institute_id);
CREATE INDEX IF NOT EXISTS idx_teacher_asgn_section ON teacher_assignments (section_id);
CREATE INDEX IF NOT EXISTS idx_teacher_asgn_class ON teacher_assignments (class_id);

-- Student classes
CREATE INDEX IF NOT EXISTS idx_student_classes_student ON student_classes (student_id);
CREATE INDEX IF NOT EXISTS idx_student_classes_inst ON student_classes (institute_id);

-- Feature flags
CREATE INDEX IF NOT EXISTS idx_feature_flags_inst ON feature_flags (institute_id);

-- Timetables
CREATE INDEX IF NOT EXISTS idx_timetables_class ON timetables (class_id);
CREATE INDEX IF NOT EXISTS idx_timetables_teacher ON timetables (teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetables_institute ON timetables (institute_id);

-- Certificates
CREATE INDEX IF NOT EXISTS idx_certs_student ON certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_certs_institute ON certificates (institute_id);
