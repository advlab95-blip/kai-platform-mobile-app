// Shared types + pure helpers for the Institute Classes screen.
// No state, no I/O — safe for any consumer.

export interface StageRow { id: string; name: string; order_num?: number }
export interface GradeRow { id: string; name: string; stage_id: string; order_num?: number }
export interface SectionRow { id: string; name: string; grade_id: string; student_count?: number }

export interface UserLite {
  id: string;
  full_name: string;
  code?: string | null;
  subjects?: string[];
}

export interface StudentDetail {
  loading: boolean;
  grades: Array<{ subject_name?: string; score: number; max_score?: number; created_at?: string }>;
  attendance: { percentage: number; present: number; late: number; absent: number; excused: number; total: number };
  avgGrade: number;
}

export type ActionType = 'reset-code' | 'transfer-section' | 'transfer-grade' | null;

export function emptyAttendance() {
  return { percentage: 0, present: 0, late: 0, absent: 0, excused: 0, total: 0 };
}
