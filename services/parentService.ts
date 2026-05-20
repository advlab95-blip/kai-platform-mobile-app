// parentService — parent-facing reads for child-scoped data.
// All queries are studentId-scoped (the child's id). RLS already restricts
// rows to the parent via parent_child links — these helpers add an explicit
// .eq filter as defense-in-depth and keep bandwidth bounded.

import { supabase } from './supabase';

// ───────────────────────── Behavior notes (visible) ──────────────────
export interface ChildBehaviorNote {
  id: string;
  student_id: string;
  sentiment: 'positive' | 'neutral' | 'warning' | 'negative';
  category: string | null;
  note: string;
  created_at: string;
}

const CHILD_BEHAVIOR_COLS = 'id, student_id, sentiment, category, note, created_at';

export async function getChildBehaviorNotes(studentId: string): Promise<ChildBehaviorNote[]> {
  const { data, error } = await supabase
    .from('behavior_notes')
    .select(CHILD_BEHAVIOR_COLS)
    .eq('student_id', studentId)
    .eq('visible_to_parent', true)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as ChildBehaviorNote[]) || [];
}

// ───────────────────────── Fees + payments ────────────────────────────
export interface ChildFeeRow {
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

export interface ChildPaymentRow {
  id: string;
  student_fee_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  receipt_number: string | null;
  receipt_pdf_url: string | null;
  notes: string | null;
}

const FEE_COLS =
  'id, total_amount, discount, final_amount, paid_amount, remaining_amount, ' +
  'status, academic_year, created_at';

const PAYMENT_COLS =
  'id, student_fee_id, amount, payment_date, payment_method, ' +
  'receipt_number, receipt_pdf_url, notes';

export async function getChildFees(studentId: string): Promise<ChildFeeRow[]> {
  const { data, error } = await supabase
    .from('student_fees')
    .select(FEE_COLS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as unknown as ChildFeeRow[]) || [];
}

export async function getChildPayments(studentFeeIds: string[]): Promise<ChildPaymentRow[]> {
  if (studentFeeIds.length === 0) return [];
  const { data, error } = await supabase
    .from('fee_payments')
    .select(PAYMENT_COLS)
    .in('student_fee_id', studentFeeIds)
    .order('payment_date', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as ChildPaymentRow[]) || [];
}

// ───────────────────────── Assignments (child-scoped) ─────────────────
export interface ChildAssignmentRow {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  due_date: string | null;
  max_score: number | null;
  created_at: string;
  // submission status derived from joined task row
  submission_status: 'pending' | 'submitted' | 'late' | 'graded';
  submitted_at: string | null;
  score: number | null;
}

/** Reads assignments visible to the child via existing RLS on assignments +
 *  joins each one with the student's own task row (submission status).
 *  Falls back to "pending" when no task row exists yet. */
export async function getChildAssignments(
  studentId: string,
  instituteId: string,
): Promise<ChildAssignmentRow[]> {
  // 1. Pull assignments — bounded to the child's institute, capped at 200.
  const { data: assigns, error: aErr } = await supabase
    .from('assignments')
    .select('id, title, description, subject, due_date, max_score, created_at, class_id')
    .eq('institute_id', instituteId)
    .order('due_date', { ascending: false, nullsFirst: false })
    .limit(200);
  if (aErr) throw aErr;
  const assignments = (assigns as any[]) || [];
  if (assignments.length === 0) return [];

  // 2. Pull child's tasks for those assignments — single batched fetch.
  const ids = assignments.map((a) => a.id);
  const { data: tasks, error: tErr } = await supabase
    .from('tasks')
    .select('assignment_id, status, submitted_at, score')
    .eq('student_id', studentId)
    .in('assignment_id', ids)
    .limit(500);
  if (tErr) throw tErr;
  const byAssignment = new Map<string, any>();
  for (const t of (tasks as any[]) || []) byAssignment.set(t.assignment_id, t);

  // 3. Merge.
  const now = Date.now();
  return assignments.map((a) => {
    const tr = byAssignment.get(a.id);
    let status: ChildAssignmentRow['submission_status'] = 'pending';
    if (tr) {
      if (tr.score != null) status = 'graded';
      else if (tr.submitted_at) status = 'submitted';
    } else if (a.due_date && new Date(a.due_date).getTime() < now) {
      status = 'late';
    }
    return {
      id: a.id,
      title: a.title || 'واجب',
      description: a.description,
      subject: a.subject,
      due_date: a.due_date,
      max_score: a.max_score,
      created_at: a.created_at,
      submission_status: status,
      submitted_at: tr?.submitted_at || null,
      score: tr?.score != null ? Number(tr.score) : null,
    };
  });
}

// ───────────────────────── Academic calendar (read-only) ──────────────
export interface ChildCalendarEvent {
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

const CAL_COLS =
  'id, title, description, category, start_date, end_date, all_day, ' +
  'start_time, end_time, color';

export async function getChildCalendarEvents(instituteId: string): Promise<ChildCalendarEvent[]> {
  const { data, error } = await supabase
    .from('academic_calendar_events')
    .select(CAL_COLS)
    .eq('institute_id', instituteId)
    .order('start_date')
    .limit(365);
  if (error) throw error;
  return (data as unknown as ChildCalendarEvent[]) || [];
}

// ───────────────────────── Parent meetings ────────────────────────────
export interface ParentMeeting {
  id: string;
  institute_id: string;
  title: string;
  agenda: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_url: string | null;
  audience: string; // 'all' | 'grade' | 'section' | 'specific'
  created_at: string;
  my_rsvp?: 'attending' | 'maybe' | 'declined' | null;
}

const MEETING_COLS =
  'id, institute_id, title, agenda, scheduled_at, duration_minutes, ' +
  'location, meeting_url, audience, created_at';

export async function getMyParentMeetings(
  parentId: string,
  instituteIds: string[],
): Promise<ParentMeeting[]> {
  if (instituteIds.length === 0) return [];
  // 1. Pull meetings for the child's institute(s).
  const { data: meetings, error } = await supabase
    .from('parent_meetings')
    .select(MEETING_COLS)
    .in('institute_id', instituteIds)
    .order('scheduled_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const list = (meetings as any[]) || [];
  if (list.length === 0) return [];

  // 2. Pull RSVPs for this parent in one shot.
  const { data: rsvps } = await supabase
    .from('parent_meeting_rsvps')
    .select('meeting_id, response')
    .eq('parent_id', parentId)
    .in('meeting_id', list.map((m) => m.id))
    .limit(200);
  const byMeeting = new Map<string, string>();
  for (const r of (rsvps as any[]) || []) byMeeting.set(r.meeting_id, r.response);

  return list.map((m) => ({
    ...(m as ParentMeeting),
    my_rsvp: (byMeeting.get(m.id) as any) || null,
  }));
}

export async function setMeetingRsvp(
  meetingId: string,
  parentId: string,
  response: 'attending' | 'maybe' | 'declined',
): Promise<void> {
  const { error } = await supabase
    .from('parent_meeting_rsvps')
    .upsert(
      { meeting_id: meetingId, parent_id: parentId, response, responded_at: new Date().toISOString() },
      { onConflict: 'meeting_id,parent_id' },
    );
  if (error) throw error;
}

// ───────────────────────── Permission slips ───────────────────────────
export interface PermissionSlip {
  id: string;
  institute_id: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string | null;
  deadline: string;
  fee_amount: number | null;
  created_at: string;
}

export interface MyPermissionSlipResponse {
  slip_id: string;
  student_id: string;
  response: 'approved' | 'declined' | null;
  responded_at: string | null;
}

const SLIP_COLS =
  'id, institute_id, title, description, event_date, location, deadline, ' +
  'fee_amount, created_at';

/** All slips targeting one of the parent's children. RLS on
 *  permission_slip_targets restricts which slips are visible. */
export async function getMyPermissionSlips(
  parentId: string,
): Promise<Array<{ slip: PermissionSlip; student_id: string; student_name: string | null; response: MyPermissionSlipResponse | null }>> {
  // 1. Get the parent's children.
  // parent_child has TWO FKs to users (parent_id + student_id) — PostgREST
  // can't auto-resolve `users:student_id`, so we name the FK explicitly.
  const { data: children, error: cErr } = await supabase
    .from('parent_child')
    .select('student_id, users!parent_child_student_id_fkey ( full_name )')
    .eq('parent_id', parentId)
    .limit(20);
  if (cErr) throw cErr;
  const childIds = ((children as any[]) || []).map((c) => c.student_id).filter(Boolean);
  if (childIds.length === 0) return [];

  // 2. Get slip targets for those children.
  const { data: targets, error: tErr } = await supabase
    .from('permission_slip_targets')
    .select('slip_id, student_id, response, responded_at')
    .in('student_id', childIds)
    .limit(200);
  if (tErr) throw tErr;
  const targetRows = (targets as any[]) || [];
  if (targetRows.length === 0) return [];

  // 3. Fetch the slips themselves.
  const slipIds = Array.from(new Set(targetRows.map((t) => t.slip_id)));
  const { data: slips, error: sErr } = await supabase
    .from('permission_slips')
    .select(SLIP_COLS)
    .in('id', slipIds)
    .order('event_date', { ascending: false })
    .limit(200);
  if (sErr) throw sErr;

  // 4. Resolve names + merge.
  const slipMap = new Map<string, PermissionSlip>();
  for (const s of (slips as any[]) || []) slipMap.set(s.id, s as PermissionSlip);
  const nameMap = new Map<string, string | null>();
  for (const c of (children as any[]) || []) nameMap.set(c.student_id, c.users?.full_name || null);

  return targetRows
    .map((t) => {
      const slip = slipMap.get(t.slip_id);
      if (!slip) return null;
      return {
        slip,
        student_id: t.student_id,
        student_name: nameMap.get(t.student_id) || null,
        response: t.response
          ? { slip_id: t.slip_id, student_id: t.student_id, response: t.response, responded_at: t.responded_at }
          : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function respondToPermissionSlip(input: {
  slip_id: string;
  student_id: string;
  response: 'approved' | 'declined';
}): Promise<void> {
  const { error } = await supabase
    .from('permission_slip_targets')
    .update({ response: input.response, responded_at: new Date().toISOString() })
    .eq('slip_id', input.slip_id)
    .eq('student_id', input.student_id);
  if (error) throw error;
}
