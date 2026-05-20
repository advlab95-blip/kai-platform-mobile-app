// instituteAdminService — كل عمليات الـ Institute Admin بمكان واحد.
// تغطي: dashboard, alerts, audit, payroll, calendar, templates,
// granular roles, bulk import, behavior notes, library, bus routes, sms log.
//
// الأمان: كل RPC حرج يفحص أن المستدعي = admin هذه المؤسسة بالذات
// (أو platform admin). القراءة من الجداول مفلترة بـ RLS مسبقاً.

import { supabase } from './supabase';

// ───────────────────────── Dashboard Stats ────────────────────────

export interface DashboardStats {
  total_students: number;
  total_teachers: number;
  total_classes: number;
  present_today: number;
  absent_today: number;
  attendance_rate: number;        // 0-100
  assignments_total: number;
  announcements_week: number;
  revenue_month: number;
  upcoming_exams_week: number;
  leave_requests_pending: number;
  unread_messages: number;
  taken_at: string;
}

export async function getDashboardStats(instituteId: string): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_institute_dashboard_stats', {
    p_institute_id: instituteId,
  });
  if (error) throw error;
  return data as DashboardStats;
}

// ───────────────────────── Alerts ────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface InstituteAlert {
  severity: AlertSeverity;
  icon: string;
  title: string;
  detail: string;
  cta_route?: string;
}

export async function getAlerts(instituteId: string): Promise<{ alerts: InstituteAlert[]; count: number }> {
  const { data, error } = await supabase.rpc('get_institute_alerts', {
    p_institute_id: instituteId,
  });
  if (error) throw error;
  const result = data as any;
  return { alerts: result?.alerts || [], count: result?.count || 0 };
}

// ───────────────────────── Audit Log ─────────────────────────────

export interface AuditEntry {
  id: string;
  institute_id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: any;
  created_at: string;
}

// Mirrors AuditEntry. The view backing institute_audit_log already projects
// only these columns, but spelling them out keeps the bandwidth contract
// explicit at the service layer.
const AUDIT_ENTRY_COLS =
  'id, institute_id, actor_id, actor_name, actor_role, action, target_type, ' +
  'target_id, target_label, metadata, created_at';

export async function listAuditEntries(
  instituteId: string,
  filter?: { action?: string; limit?: number },
): Promise<AuditEntry[]> {
  let q = supabase
    .from('institute_audit_log')
    .select(AUDIT_ENTRY_COLS)
    .eq('institute_id', instituteId)
    .order('created_at', { ascending: false })
    .limit(filter?.limit || 200);
  if (filter?.action) q = q.eq('action', filter.action);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as AuditEntry[];
}

export async function logEvent(input: {
  institute_id: string;
  action: string;
  target_type?: string;
  target_id?: string;
  target_label?: string;
  metadata?: any;
}): Promise<string> {
  const { data, error } = await supabase.rpc('log_institute_event', {
    p_institute_id: input.institute_id,
    p_action: input.action,
    p_target_type: input.target_type || null,
    p_target_id: input.target_id || null,
    p_target_label: input.target_label || null,
    p_metadata: input.metadata || {},
  });
  if (error) throw error;
  return data as string;
}

// ───────────────────────── Payroll ───────────────────────────────

export type ContractType = 'monthly' | 'hourly' | 'contract' | 'freelance';
export type PaymentStatus = 'pending' | 'paid' | 'cancelled';

export interface PayrollEmployee {
  id: string;
  institute_id: string;
  user_id: string | null;
  full_name: string;
  national_id: string | null;
  job_title: string;
  department: string | null;
  contract_type: ContractType;
  base_salary: number;
  currency: string;
  hire_date: string | null;
  bank_account: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PayrollPayment {
  id: string;
  institute_id: string;
  employee_id: string;
  period_month: number;
  period_year: number;
  gross_amount: number;
  deductions: number;
  bonuses: number;
  net_amount: number;
  status: PaymentStatus;
  paid_at: string | null;
  paid_by: string | null;
  payment_method: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  employee_name?: string;
  employee_title?: string;
}

// Explicit column list mirrors the PayrollEmployee interface — keeping these in
// sync prevents accidental bandwidth bloat if a heavy column (PDF blob, large
// JSONB) is ever added to payroll_employees.
const PAYROLL_EMPLOYEE_COLS =
  'id, institute_id, user_id, full_name, national_id, job_title, department, ' +
  'contract_type, base_salary, currency, hire_date, bank_account, phone, notes, ' +
  'is_active, created_at, updated_at';

export async function listEmployees(instituteId: string, opts?: { activeOnly?: boolean }): Promise<PayrollEmployee[]> {
  // .limit caps the per-fetch payload even on institutes with very large staff
  // rosters. 500 covers every real-world institute the platform targets; if a
  // tenant ever exceeds this we add pagination — not raise the cap silently.
  let q = supabase
    .from('payroll_employees')
    .select(PAYROLL_EMPLOYEE_COLS)
    .eq('institute_id', instituteId)
    .order('full_name')
    .limit(500);
  if (opts?.activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as PayrollEmployee[];
}

export async function upsertEmployee(emp: Partial<PayrollEmployee> & { institute_id: string; full_name: string; job_title: string }): Promise<PayrollEmployee> {
  const payload = { ...emp, updated_at: new Date().toISOString() };
  let result;
  if (emp.id) {
    result = await supabase.from('payroll_employees').update(payload).eq('id', emp.id).select('*').single();
  } else {
    result = await supabase.from('payroll_employees').insert(payload).select('*').single();
  }
  if (result.error) throw result.error;
  return result.data as PayrollEmployee;
}

export async function deleteEmployee(id: string) {
  const { error } = await supabase.from('payroll_employees').delete().eq('id', id);
  if (error) throw error;
}

// Mirrors PayrollPayment + the joined employee subset the UI actually renders.
const PAYROLL_PAYMENT_COLS =
  'id, institute_id, employee_id, period_month, period_year, gross_amount, ' +
  'deductions, bonuses, net_amount, status, paid_at, paid_by, payment_method, ' +
  'reference_no, notes, created_at, updated_at, ' +
  'employee:employee_id ( full_name, job_title )';

export async function listPayments(instituteId: string, filter?: { year?: number; month?: number; employeeId?: string }): Promise<PayrollPayment[]> {
  // 600 = 50 employees × 12 months — covers a full year of records without a
  // pagination control on the UI yet. The screen filters by month/year/employee
  // so the typical query returns far less than the cap.
  let q = supabase
    .from('payroll_payments')
    .select(PAYROLL_PAYMENT_COLS)
    .eq('institute_id', instituteId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(600);
  if (filter?.year) q = q.eq('period_year', filter.year);
  if (filter?.month) q = q.eq('period_month', filter.month);
  if (filter?.employeeId) q = q.eq('employee_id', filter.employeeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r, employee_name: r.employee?.full_name, employee_title: r.employee?.job_title,
  }));
}

export async function upsertPayment(p: Partial<PayrollPayment> & { institute_id: string; employee_id: string; period_month: number; period_year: number; gross_amount: number }): Promise<PayrollPayment> {
  const payload = { ...p, updated_at: new Date().toISOString() };
  let result;
  if (p.id) {
    result = await supabase.from('payroll_payments').update(payload).eq('id', p.id).select('*').single();
  } else {
    result = await supabase.from('payroll_payments').insert(payload).select('*').single();
  }
  if (result.error) throw result.error;
  return result.data as PayrollPayment;
}

export async function markPaymentPaid(paymentId: string, method?: string, refNo?: string) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('payroll_payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by: userData?.user?.id || null,
      payment_method: method || null,
      reference_no: refNo || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId);
  if (error) throw error;
}

// ───────────────────────── Calendar ──────────────────────────────

export type CalendarCategory = 'holiday' | 'exam' | 'conference' | 'meeting' | 'event' | 'general';

export interface CalendarEvent {
  id: string;
  institute_id: string;
  title: string;
  description: string | null;
  category: CalendarCategory;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
  audience: string[];
  created_by: string | null;
  created_at: string;
}

// Mirrors CalendarEvent. created_by + audience are needed by the admin screen
// even though the student/teacher views only consume a subset — one query path
// keeps the service simple.
const CALENDAR_EVENT_COLS =
  'id, institute_id, title, description, category, start_date, end_date, ' +
  'all_day, start_time, end_time, color, audience, created_by, created_at';

export async function listCalendarEvents(instituteId: string, from?: string, to?: string): Promise<CalendarEvent[]> {
  // 365 ≈ one event per day for a whole school year. Practical institutes
  // run 50-150 events/year; the cap is a safety net, not a working limit.
  let q = supabase
    .from('academic_calendar_events')
    .select(CALENDAR_EVENT_COLS)
    .eq('institute_id', instituteId)
    .order('start_date')
    .limit(365);
  if (from) q = q.gte('start_date', from);
  if (to) q = q.lte('end_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as CalendarEvent[];
}

export async function upsertCalendarEvent(ev: Partial<CalendarEvent> & { institute_id: string; title: string; start_date: string; end_date: string }) {
  const payload = { ...ev, updated_at: new Date().toISOString() };
  let result;
  if (ev.id) {
    result = await supabase.from('academic_calendar_events').update(payload).eq('id', ev.id).select('*').single();
  } else {
    result = await supabase.from('academic_calendar_events').insert(payload).select('*').single();
  }
  if (result.error) throw result.error;
  return result.data as CalendarEvent;
}

export async function deleteCalendarEvent(id: string) {
  const { error } = await supabase.from('academic_calendar_events').delete().eq('id', id);
  if (error) throw error;
}

// ───────────────────────── Announcement Templates ────────────────

export interface AnnTemplate {
  id: string;
  institute_id: string;
  name: string;
  body: string;
  category: string | null;
  variables: string[];
  use_count: number;
  created_at: string;
}

// Mirrors AnnTemplate. body is the heaviest column (template text), so caps
// matter here even more than on flat list endpoints.
const ANN_TEMPLATE_COLS =
  'id, institute_id, name, body, category, variables, use_count, created_at';

export async function listTemplates(instituteId: string): Promise<AnnTemplate[]> {
  // 200 templates is well past what any real institute curates by hand.
  const { data, error } = await supabase
    .from('announcement_templates')
    .select(ANN_TEMPLATE_COLS)
    .eq('institute_id', instituteId)
    .order('use_count', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as unknown as AnnTemplate[];
}

export async function upsertTemplate(t: Partial<AnnTemplate> & { institute_id: string; name: string; body: string }) {
  const payload = { ...t, updated_at: new Date().toISOString() };
  let result;
  if (t.id) {
    result = await supabase.from('announcement_templates').update(payload).eq('id', t.id).select('*').single();
  } else {
    result = await supabase.from('announcement_templates').insert(payload).select('*').single();
  }
  if (result.error) throw result.error;
  return result.data as AnnTemplate;
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from('announcement_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function bumpTemplateUseCount(id: string) {
  // Best-effort; ignore failure.
  await supabase.rpc('bump_template_use_count', { p_id: id }).then(() => {}, () => {});
}

// ───────────────────────── Granular Roles ────────────────────────

export type InstituteRoleKey = 'financial' | 'academic' | 'student_affairs' | 'communications';

export interface RoleAssignment {
  id: string;
  institute_id: string;
  user_id: string;
  role_key: InstituteRoleKey;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  // joined
  user_name?: string;
}

// Mirrors RoleAssignment + the joined user.full_name the UI shows.
const ROLE_ASSIGNMENT_COLS =
  'id, institute_id, user_id, role_key, granted_by, granted_at, revoked_at, ' +
  'user:user_id ( full_name )';

export async function listRoleAssignments(instituteId: string): Promise<RoleAssignment[]> {
  // Four granular roles × institute staff ⇒ a handful of active assignments.
  // 200 is a generous cap that still bounds payload on a runaway query.
  const { data, error } = await supabase
    .from('institute_role_assignments')
    .select(ROLE_ASSIGNMENT_COLS)
    .eq('institute_id', instituteId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, user_name: r.user?.full_name }));
}

export async function grantRole(input: { institute_id: string; user_id: string; role_key: InstituteRoleKey }): Promise<RoleAssignment> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('institute_role_assignments')
    .insert({ ...input, granted_by: userData?.user?.id })
    .select('*')
    .single();
  if (error) throw error;
  return data as RoleAssignment;
}

export async function revokeRole(assignmentId: string) {
  const { error } = await supabase
    .from('institute_role_assignments')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', assignmentId);
  if (error) throw error;
}

// ───────────────────────── Bulk Import ───────────────────────────

export interface BulkImportRow {
  full_name: string;
  role: 'student' | 'teacher' | 'parent';
  class_id?: string;
  phone?: string;
  code: string;
}

export async function validateBulkImport(instituteId: string, rows: BulkImportRow[]): Promise<{
  total: number;
  valid: number;
  errors: number;
  rows: Array<{ idx: number; ok: boolean; error?: string }>;
}> {
  const { data, error } = await supabase.rpc('bulk_import_validate', {
    p_institute_id: instituteId,
    p_rows: rows,
  });
  if (error) throw error;
  return data as any;
}

export interface BulkImportExecuteRow extends BulkImportRow {
  idx: number;
}

export interface BulkImportExecuteResult {
  total: number;
  created: Array<{ idx: number; full_name: string; userId: string; code: string }>;
  failed: Array<{ idx: number; full_name: string; reason: string }>;
}

/** Server-side execution of a validated CSV batch. Per-row failures don't
 *  abort — the result reports created vs failed. Service-role privileges
 *  required, so the work happens inside admin-ops (Edge Function). */
export async function executeBulkImport(
  instituteId: string,
  rows: BulkImportExecuteRow[],
  createdBy?: string,
): Promise<BulkImportExecuteResult> {
  const { data, error } = await supabase.functions.invoke('admin-ops', {
    body: {
      action: 'bulk_import_simple',
      institutionId: instituteId,
      rows,
      createdBy,
    },
  });
  if (error) throw error;
  // admin-ops wraps successful results as { data: ... }
  return ((data as any)?.data ?? data) as BulkImportExecuteResult;
}

// ───────────────────────── Tier-3: Behavior / Library / Bus ──────

export interface BehaviorNote {
  id: string;
  institute_id: string;
  student_id: string;
  author_id: string | null;
  sentiment: 'positive' | 'neutral' | 'warning' | 'negative';
  category: string | null;
  note: string;
  visible_to_parent: boolean;
  created_at: string;
  student_name?: string;
}

// Mirrors BehaviorNote + the joined student name. Column name on the live
// table is `sentiment` (not `kind`) — an earlier draft used the wrong name
// and the screen silently rendered without a sentiment chip.
const BEHAVIOR_NOTE_COLS =
  'id, institute_id, student_id, author_id, sentiment, category, note, ' +
  'visible_to_parent, created_at, student:student_id ( full_name )';

export async function listBehaviorNotes(instituteId: string, studentId?: string): Promise<BehaviorNote[]> {
  // 200 already covered the limit — switching off select(*) to keep the
  // bandwidth contract uniform across the whole service.
  let q = supabase
    .from('behavior_notes')
    .select(BEHAVIOR_NOTE_COLS)
    .eq('institute_id', instituteId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (studentId) q = q.eq('student_id', studentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, student_name: r.student?.full_name }));
}

export async function addBehaviorNote(input: Omit<BehaviorNote, 'id' | 'created_at' | 'author_id' | 'student_name'>) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('behavior_notes')
    .insert({ ...input, author_id: userData?.user?.id || null })
    .select('*')
    .single();
  if (error) throw error;
  return data as BehaviorNote;
}

export interface LibraryBook {
  id: string;
  institute_id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  category: string | null;
  copies_total: number;
  copies_available: number;
  cover_url: string | null;
  notes: string | null;
  created_at: string;
}

// Mirrors LibraryBook. cover_url is a URL not a blob, so payload stays light.
const LIBRARY_BOOK_COLS =
  'id, institute_id, title, author, isbn, category, copies_total, ' +
  'copies_available, cover_url, notes, created_at';

export async function listBooks(instituteId: string): Promise<LibraryBook[]> {
  // 1000 covers a fully-stocked institute library; pagination can be added
  // later if any tenant blows past it. Without the cap, a careless seed
  // import could send tens of thousands of rows on every screen open.
  const { data, error } = await supabase
    .from('library_books')
    .select(LIBRARY_BOOK_COLS)
    .eq('institute_id', instituteId)
    .order('title')
    .limit(1000);
  if (error) throw error;
  return (data || []) as unknown as LibraryBook[];
}

export async function upsertBook(b: Partial<LibraryBook> & { institute_id: string; title: string }) {
  let result;
  if (b.id) result = await supabase.from('library_books').update(b).eq('id', b.id).select('*').single();
  else result = await supabase.from('library_books').insert(b).select('*').single();
  if (result.error) throw result.error;
  return result.data as LibraryBook;
}

export interface BusRoute {
  id: string;
  institute_id: string;
  name: string;
  driver_name: string | null;
  driver_phone: string | null;
  plate_no: string | null;
  capacity: number | null;
  pickup_time: string | null;
  dropoff_time: string | null;
  notes: string | null;
  created_at: string;
}

// Mirrors BusRoute. All scalar columns — no heavy payload risk, but the
// bandwidth contract requires bounded selects and explicit caps anyway.
const BUS_ROUTE_COLS =
  'id, institute_id, name, driver_name, driver_phone, plate_no, capacity, ' +
  'pickup_time, dropoff_time, notes, created_at';

export async function listBusRoutes(instituteId: string): Promise<BusRoute[]> {
  // 200 bus routes is well past what real institutes operate (typical: 5-30).
  const { data, error } = await supabase
    .from('bus_routes')
    .select(BUS_ROUTE_COLS)
    .eq('institute_id', instituteId)
    .order('name')
    .limit(200);
  if (error) throw error;
  return (data || []) as unknown as BusRoute[];
}

export async function upsertBusRoute(r: Partial<BusRoute> & { institute_id: string; name: string }) {
  let result;
  if (r.id) result = await supabase.from('bus_routes').update(r).eq('id', r.id).select('*').single();
  else result = await supabase.from('bus_routes').insert(r).select('*').single();
  if (result.error) throw result.error;
  return result.data as BusRoute;
}
