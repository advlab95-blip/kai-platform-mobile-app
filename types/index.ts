export type RoleId = 'admin' | 'institute' | 'teacher' | 'student' | 'parent' | 'cafeteria' | 'medical';

export interface User {
  id: string;
  full_name: string;
  role: RoleId;
  is_frozen?: boolean;
  phone?: string;
  created_at: string;
}

export interface Institute {
  id: string;
  name: string;
  city: string;
  type?: 'institute' | 'school';
  admin_id: string;
  created_at: string;
}

export interface Enrollment {
  id: string;
  user_id: string;
  institute_id: string;
  role: RoleId;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target_role: string;
  institute_id: string | null;
  created_at: string;
  // Optional — present once the popup migration is applied. When true, the
  // announcement also surfaces as a centered modal popup on next app open
  // (one-shot per user, dismissal tracked in announcement_dismissals).
  is_popup?: boolean;
  expires_at?: string | null;
}

export interface AdminAd {
  id: string;
  owner_institute_id: string | null;
  created_by: string | null;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
  target_institutes: string[];
  is_active: boolean;
  starts_at: string;
  expires_at: string | null;
  views_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAdInput {
  title: string;
  body?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  target_institutes?: string[];
  is_active?: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
}

export type NotificationCategory = 'academic' | 'financial' | 'admin' | 'urgent' | 'social';

export interface Notification {
  id: string;
  sender_role: string;
  sender_id: string;
  sender_name: string;
  recipient_role: string;
  recipient_id: string | null;
  title: string;
  message: string;
  type: string;
  category?: NotificationCategory | null;
  data?: Record<string, any> | null;
  is_read: boolean;
  institute_id?: string | null;
  created_at: string;
}

export interface Timetable {
  id: string;
  class_id: string;
  teacher_id: string;
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string;
}

export interface Exam {
  id: string;
  title: string;
  teacher_id: string;
  class_id: string;
  institute_id: string;
  questions: string;
  total_points: number;
  duration_minutes: number;
  status: string;
  created_at: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  timetable_id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'justified';
}

export interface Payment {
  id: string;
  student_id: string;
  institute_id: string;
  amount: number;
  title: string;
  paid_at: string;
}

export interface AuthSession {
  userId: string;
  role: RoleId;
  userName: string;
  email: string;
}

// ── Academic Year & Enrollment Lifecycle ──

export type EnrollmentStatus = 'active' | 'frozen' | 'archived' | 'transferred' | 'graduated';

export interface AcademicYear {
  id: string;
  institute_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
}

export interface PromotionEntry {
  studentId: string;
  studentName: string;
  currentEnrollmentId: string;
  currentClassId: string;
  currentClassName: string;
  action: 'promote' | 'repeat' | 'graduate';
  targetClassId?: string;
  targetClassName?: string;
}

// ── Dashboard RPC payloads (Phase 3) ──────────────────────────────────
export type ProgressPeriod = 'week' | 'month' | 'semester' | 'year';

export interface AttendanceDay {
  date: string;
  present: number;
  absent: number;
}

export interface DashboardStats {
  total_students: number;
  total_teachers: number;
  today_attendance: {
    present: number;
    absent: number;
    late: number;
    total: number;
  };
  attendance_history: AttendanceDay[];
  fees: {
    expected: number;
    collected: number;
    remaining: number;
    overdue_count: number;
  };
  alerts: {
    chronic_absent: Array<{ student_id: string; full_name: string; absences: number }>;
    overdue_fees: number;
  };
  generated_at: string;
}

export interface SubjectProgress {
  subject_name: string;
  avg_pct: number | null;
  entries: number;
  prior_pct: number | null;
  trend: 'up' | 'down' | 'flat';
}

export interface StudentProgress {
  period: ProgressPeriod;
  since: string;
  subjects: SubjectProgress[];
  overall_avg: number | null;
  attendance: {
    pct: number | null;
    total_days: number;
    absent_days: number;
  };
  generated_at: string;
}

export interface PlatformInstituteSummary {
  institute_id: string;
  name: string;
  students: number;
  teachers: number;
}
