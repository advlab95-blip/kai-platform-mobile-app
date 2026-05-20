// medicalService — clinic visits + medications + vaccinations.
// All queries are institute-scoped + bounded.

import { supabase } from './supabase';

// ───────────────────────── Clinic visits ───────────────────────────────
export interface ClinicVisit {
  id: string;
  institute_id: string;
  student_id: string;
  recorded_by: string;
  visit_at: string;
  symptoms: string;
  treatment: string | null;
  sent_home: boolean;
  follow_up_needed: boolean;
  notes: string | null;
  created_at: string;
  // joined
  student_name?: string;
}

// PostgREST embed `student:student_id ( full_name )` would target auth.users
// (that's where the FK points), and auth.users has no full_name column. So we
// drop the embed and resolve names via a second query against public.users.
const VISIT_COLS =
  'id, institute_id, student_id, recorded_by, visit_at, symptoms, treatment, ' +
  'sent_home, follow_up_needed, notes, created_at';

// Tiny helper: given rows that all have a student_id, fetch names from
// public.users in one IN-query and stitch them back onto each row.
async function attachStudentNames<T extends { student_id: string }>(rows: T[]): Promise<Array<T & { student_name?: string }>> {
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((r) => r.student_id).filter(Boolean)));
  if (ids.length === 0) return rows.map((r) => ({ ...r }));
  const { data } = await supabase.from('users').select('id, full_name').in('id', ids);
  const nameMap = new Map<string, string>();
  for (const u of (data || []) as Array<{ id: string; full_name: string }>) {
    if (u.full_name) nameMap.set(u.id, u.full_name);
  }
  return rows.map((r) => ({ ...r, student_name: nameMap.get(r.student_id) }));
}

export async function listClinicVisits(
  instituteId: string,
  opts?: { studentId?: string; sinceDays?: number; limit?: number },
): Promise<ClinicVisit[]> {
  let q = supabase
    .from('clinic_visits')
    .select(VISIT_COLS)
    .eq('institute_id', instituteId)
    .order('visit_at', { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.studentId) q = q.eq('student_id', opts.studentId);
  if (opts?.sinceDays) {
    const since = new Date(Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte('visit_at', since);
  }
  const { data, error } = await q;
  if (error) throw error;
  return attachStudentNames((data as any[]) || []) as Promise<ClinicVisit[]>;
}

export async function addClinicVisit(input: {
  institute_id: string;
  student_id: string;
  recorded_by: string;
  symptoms: string;
  treatment?: string;
  sent_home?: boolean;
  follow_up_needed?: boolean;
  notes?: string;
}): Promise<ClinicVisit> {
  const { data, error } = await supabase
    .from('clinic_visits')
    .insert({
      institute_id: input.institute_id,
      student_id: input.student_id,
      recorded_by: input.recorded_by,
      symptoms: input.symptoms,
      treatment: input.treatment || null,
      sent_home: input.sent_home || false,
      follow_up_needed: input.follow_up_needed || false,
      notes: input.notes || null,
    })
    .select(VISIT_COLS)
    .single();
  if (error) throw error;
  const [withName] = await attachStudentNames([data as any]);
  return withName as ClinicVisit;
}

// ───────────────────────── Medications ─────────────────────────────────
export interface MedicationLog {
  id: string;
  institute_id: string;
  student_id: string;
  given_by: string;
  visit_id: string | null;
  medication_name: string;
  dose: string;
  route: string | null;
  given_at: string;
  notes: string | null;
  created_at: string;
  student_name?: string;
}

// Same auth.users FK quirk as clinic_visits — drop embed, resolve via helper.
const MED_COLS =
  'id, institute_id, student_id, given_by, visit_id, medication_name, dose, ' +
  'route, given_at, notes, created_at';

export async function listMedicationLogs(
  instituteId: string,
  opts?: { studentId?: string; limit?: number },
): Promise<MedicationLog[]> {
  let q = supabase
    .from('medication_logs')
    .select(MED_COLS)
    .eq('institute_id', instituteId)
    .order('given_at', { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.studentId) q = q.eq('student_id', opts.studentId);
  const { data, error } = await q;
  if (error) throw error;
  return attachStudentNames((data as any[]) || []) as Promise<MedicationLog[]>;
}

export async function addMedicationLog(input: {
  institute_id: string;
  student_id: string;
  given_by: string;
  visit_id?: string;
  medication_name: string;
  dose: string;
  route?: string;
  notes?: string;
}): Promise<MedicationLog> {
  const { data, error } = await supabase
    .from('medication_logs')
    .insert({
      institute_id: input.institute_id,
      student_id: input.student_id,
      given_by: input.given_by,
      visit_id: input.visit_id || null,
      medication_name: input.medication_name,
      dose: input.dose,
      route: input.route || null,
      notes: input.notes || null,
    })
    .select(MED_COLS)
    .single();
  if (error) throw error;
  const [withName] = await attachStudentNames([data as any]);
  return withName as MedicationLog;
}

// ───────────────────────── Vaccinations ────────────────────────────────
export interface VaccinationRecord {
  id: string;
  institute_id: string;
  student_id: string;
  recorded_by: string | null;
  vaccine_name: string;
  dose_number: number | null;
  administered_at: string;
  batch_number: string | null;
  administered_by: string | null;
  next_due_date: string | null;
  notes: string | null;
  created_at: string;
  student_name?: string;
}

// Same auth.users FK quirk — drop embed, resolve via helper.
const VAX_COLS =
  'id, institute_id, student_id, recorded_by, vaccine_name, dose_number, ' +
  'administered_at, batch_number, administered_by, next_due_date, notes, created_at';

export async function listVaccinations(
  instituteId: string,
  opts?: { studentId?: string; limit?: number },
): Promise<VaccinationRecord[]> {
  let q = supabase
    .from('vaccination_records')
    .select(VAX_COLS)
    .eq('institute_id', instituteId)
    .order('administered_at', { ascending: false })
    .limit(opts?.limit ?? 300);
  if (opts?.studentId) q = q.eq('student_id', opts.studentId);
  const { data, error } = await q;
  if (error) throw error;
  return attachStudentNames((data as any[]) || []) as Promise<VaccinationRecord[]>;
}

export async function addVaccination(input: {
  institute_id: string;
  student_id: string;
  recorded_by?: string;
  vaccine_name: string;
  dose_number?: number;
  administered_at: string;
  batch_number?: string;
  administered_by?: string;
  next_due_date?: string;
  notes?: string;
}): Promise<VaccinationRecord> {
  const { data, error } = await supabase
    .from('vaccination_records')
    .insert({
      institute_id: input.institute_id,
      student_id: input.student_id,
      recorded_by: input.recorded_by || null,
      vaccine_name: input.vaccine_name,
      dose_number: input.dose_number ?? null,
      administered_at: input.administered_at,
      batch_number: input.batch_number || null,
      administered_by: input.administered_by || null,
      next_due_date: input.next_due_date || null,
      notes: input.notes || null,
    })
    .select(VAX_COLS)
    .single();
  if (error) throw error;
  const [withName] = await attachStudentNames([data as any]);
  return withName as VaccinationRecord;
}

// ───────────────────────── Critical conditions ─────────────────────────
export interface CriticalStudent {
  student_id: string;
  full_name: string | null;
  chronic_conditions: string | null;
  allergies: string | null;
  blood_type: string | null;
}

/** All students whose medical_records row has at least one critical field
 *  populated. Surfaces a "watch list" for the medical office. */
export async function listCriticalStudents(instituteId: string): Promise<CriticalStudent[]> {
  const { data, error } = await supabase
    .from('medical_records')
    .select('student_id, chronic_conditions, allergies, blood_type, student:student_id ( full_name )')
    .eq('institute_id', instituteId)
    .or('chronic_conditions.not.is.null,allergies.not.is.null')
    .limit(500);
  if (error) throw error;
  return ((data as any[]) || [])
    .filter((r) =>
      (r.chronic_conditions && String(r.chronic_conditions).trim()) ||
      (r.allergies && String(r.allergies).trim())
    )
    .map((r) => ({
      student_id: r.student_id,
      full_name: r.student?.full_name || null,
      chronic_conditions: r.chronic_conditions,
      allergies: r.allergies,
      blood_type: r.blood_type,
    }));
}
