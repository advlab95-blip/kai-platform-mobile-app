/**
 * Query Optimizer — Column selection presets
 * Using specific columns instead of select('*') saves 30-50% bandwidth
 */

// Instead of select('*'), use these presets
export const SELECT = {
  // User — only what's needed for display
  userBasic: 'id, full_name, role',
  userProfile: 'id, full_name, role, email, phone, is_frozen, created_at',

  // Institute
  instituteBasic: 'id, name, type, city',
  instituteFull: 'id, name, type, city, admin_id, logo_url, stamp_url, signature_url, created_at',

  // Enrollment
  enrollment: 'id, user_id, institute_id, role, class_id, status',

  // Notification — skip heavy fields
  notification: 'id, title, message, sender_role, sender_name, recipient_role, recipient_id, type, is_read, created_at, institute_id',

  // Announcement
  announcement: 'id, title, content, target_role, institute_id, created_at',

  // Timetable
  timetable: 'id, class_id, teacher_id, subject, day_of_week, start_time, end_time, room',

  // Exam — skip heavy questions JSON for lists
  examList: 'id, title, teacher_id, class_id, institute_id, total_points, duration_minutes, status, created_at',
  examFull: '*', // Need questions for taking exam

  // Video — skip heavy metadata
  videoList: 'id, title, teacher_id, bunny_video_id, duration, created_at, is_archived, is_hidden',

  // Certificate
  certificate: 'id, title, type, description, student_id, institute_id, issued_at, is_revoked, template_id, data',

  // Grade
  grade: 'id, student_id, teacher_id, category_id, subject, score, max_score, class_id, entered_at',
} as const;
