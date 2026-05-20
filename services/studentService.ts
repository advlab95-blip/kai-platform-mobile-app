// studentService — student-facing reads for personal data screens.
// Kept separate from api.ts so the student-tier surface stays self-contained
// and bandwidth-bounded. All queries are studentId-scoped (defense-in-depth
// on top of RLS).

import { supabase } from './supabase';

// ───────────────────────── Attendance ─────────────────────────────────
export interface AttendanceRow {
  id: string;
  date: string;
  status: string;
  justification_text: string | null;
  timetable_id: string | null;
}

const ATTENDANCE_COLS = 'id, date, status, justification_text, timetable_id';

export async function getMyAttendanceHistory(
  studentId: string,
  opts?: { from?: string; to?: string; limit?: number },
): Promise<AttendanceRow[]> {
  let q = supabase
    .from('attendance')
    .select(ATTENDANCE_COLS)
    .eq('student_id', studentId)
    .order('date', { ascending: false })
    .limit(opts?.limit ?? 365);
  if (opts?.from) q = q.gte('date', opts.from);
  if (opts?.to) q = q.lte('date', opts.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as AttendanceRow[]) || [];
}

// ───────────────────────── Behavior notes ─────────────────────────────
export interface MyBehaviorNote {
  id: string;
  sentiment: 'positive' | 'neutral' | 'warning' | 'negative';
  category: string | null;
  note: string;
  created_at: string;
}

const MY_BEHAVIOR_COLS = 'id, sentiment, category, note, created_at';

/** Only notes the teacher chose to share (visible_to_parent=true). RLS already
 *  scopes to the student's own rows; the `eq('visible_to_parent', true)`
 *  filter here keeps internal notes hidden client-side as a second guard. */
export async function getMyBehaviorNotes(studentId: string): Promise<MyBehaviorNote[]> {
  const { data, error } = await supabase
    .from('behavior_notes')
    .select(MY_BEHAVIOR_COLS)
    .eq('student_id', studentId)
    .eq('visible_to_parent', true)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as MyBehaviorNote[]) || [];
}

// ───────────────────────── Fees + payments ────────────────────────────
export interface MyFeeRow {
  id: string;
  total_amount: number;
  discount: number;
  final_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
  academic_year: string | null;
  created_at: string;
}

export interface MyPaymentRow {
  id: string;
  student_fee_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  receipt_number: string | null;
  receipt_pdf_url: string | null;
  notes: string | null;
}

const MY_FEE_COLS =
  'id, total_amount, discount, final_amount, paid_amount, remaining_amount, ' +
  'status, academic_year, created_at';

const MY_PAYMENT_COLS =
  'id, student_fee_id, amount, payment_date, payment_method, ' +
  'receipt_number, receipt_pdf_url, notes';

export async function getMyFees(studentId: string): Promise<MyFeeRow[]> {
  const { data, error } = await supabase
    .from('student_fees')
    .select(MY_FEE_COLS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as unknown as MyFeeRow[]) || [];
}

export async function getMyPayments(studentFeeIds: string[]): Promise<MyPaymentRow[]> {
  if (studentFeeIds.length === 0) return [];
  const { data, error } = await supabase
    .from('fee_payments')
    .select(MY_PAYMENT_COLS)
    .in('student_fee_id', studentFeeIds)
    .order('payment_date', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as MyPaymentRow[]) || [];
}

// ───────────────────────── Academic calendar (read-only) ──────────────
export interface CalendarEventPublic {
  id: string;
  title: string;
  description: string | null;
  category: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
}

const CAL_PUBLIC_COLS =
  'id, title, description, category, start_date, end_date, all_day, ' +
  'start_time, end_time, color';

export async function getCalendarEventsForStudent(
  instituteId: string,
  opts?: { from?: string; to?: string },
): Promise<CalendarEventPublic[]> {
  let q = supabase
    .from('academic_calendar_events')
    .select(CAL_PUBLIC_COLS)
    .eq('institute_id', instituteId)
    .order('start_date')
    .limit(365);
  if (opts?.from) q = q.gte('start_date', opts.from);
  if (opts?.to) q = q.lte('end_date', opts.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as CalendarEventPublic[]) || [];
}
