// خدمة جداول الامتحانات الإدارية (الورقية).
// مفصولة تماماً عن services/api.ts: exams (الكوزات اللي يسوّيها الأستاذ).
//
// الجداول: exam_schedules + exam_schedule_items
// الـ RPCs: generate_exam_schedule_items, publish_exam_schedule, update_exam_schedule_item
//
// كل عملية تمر عبر RLS — الإدارة تكتب، باقي الأدوار يقرأون فقط (طلاب/أساتذة/أولياء).

import { supabase } from './supabase';

export type ExamScheduleStatus = 'draft' | 'published' | 'cancelled';

export interface ExamSchedule {
  id: string;
  institute_id: string;
  name: string;
  description: string | null;
  period_start: string;
  period_end: string;
  status: ExamScheduleStatus;
  published_at: string | null;
  published_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExamScheduleItem {
  id: string;
  schedule_id: string;
  institute_id: string;
  class_id: string | null;
  section_id: string | null;
  subject_id: string | null;
  subject_name: string;
  teacher_id: string | null;
  exam_date: string;
  start_time: string;
  duration_minutes: number;
  hall: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined fields (optional)
  class_name?: string;
  teacher_name?: string;
}

// قائمة الجداول لمؤسسة محددة (للإدارة: drafts+published، لباقي الأدوار: published فقط بفعل RLS)
export async function getExamSchedules(instituteId: string): Promise<ExamSchedule[]> {
  const { data, error } = await supabase
    .from('exam_schedules')
    .select('id, institute_id, name, description, period_start, period_end, status, published_at, published_by, created_by, created_at, updated_at')
    .eq('institute_id', instituteId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as ExamSchedule[];
}

export async function getExamSchedule(scheduleId: string): Promise<ExamSchedule | null> {
  const { data, error } = await supabase
    .from('exam_schedules')
    .select('*')
    .eq('id', scheduleId)
    .maybeSingle();
  if (error) throw error;
  return (data as ExamSchedule) || null;
}

// بنود جدول واحد + اسم الصف + اسم الأستاذ
export async function getExamScheduleItems(scheduleId: string): Promise<ExamScheduleItem[]> {
  const { data, error } = await supabase
    .from('exam_schedule_items')
    .select(`
      id, schedule_id, institute_id, class_id, section_id, subject_id, subject_name,
      teacher_id, exam_date, start_time, duration_minutes, hall, notes,
      created_at, updated_at,
      classes:class_id ( name ),
      users:teacher_id ( full_name )
    `)
    .eq('schedule_id', scheduleId)
    .order('exam_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    class_name: row.classes?.name,
    teacher_name: row.users?.full_name,
  })) as ExamScheduleItem[];
}

export interface CreateScheduleInput {
  institute_id: string;
  name: string;
  description?: string;
  period_start: string;
  period_end: string;
  created_by: string;
}

export async function createExamSchedule(input: CreateScheduleInput): Promise<ExamSchedule> {
  const { data, error } = await supabase
    .from('exam_schedules')
    .insert({
      institute_id: input.institute_id,
      name: input.name,
      description: input.description || null,
      period_start: input.period_start,
      period_end: input.period_end,
      created_by: input.created_by,
      status: 'draft',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ExamSchedule;
}

export async function updateExamSchedule(
  scheduleId: string,
  patch: Partial<Pick<ExamSchedule, 'name' | 'description' | 'period_start' | 'period_end'>>
): Promise<void> {
  const { error } = await supabase
    .from('exam_schedules')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', scheduleId);
  if (error) throw error;
}

export async function deleteExamSchedule(scheduleId: string): Promise<void> {
  const { error } = await supabase.from('exam_schedules').delete().eq('id', scheduleId);
  if (error) throw error;
}

// توليد ذكي عبر RPC (يمسح القديم ويعيد التوليد)
export async function generateExamScheduleItems(params: {
  schedule_id: string;
  class_ids: string[];
  subject_ids: string[];
  start_date: string;
  default_start_time?: string;
  default_duration?: number;
  subjects_per_day?: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc('generate_exam_schedule_items', {
    p_schedule_id: params.schedule_id,
    p_class_ids: params.class_ids,
    p_subject_ids: params.subject_ids,
    p_start_date: params.start_date,
    p_default_start_time: params.default_start_time || '09:00',
    p_default_duration: params.default_duration || 60,
    p_subjects_per_day: params.subjects_per_day || 1,
  });
  if (error) throw error;
  return (data as number) || 0;
}

// إضافة بند يدوي
export interface AddItemInput {
  schedule_id: string;
  institute_id: string;
  class_id: string;
  subject_id?: string | null;
  subject_name: string;
  teacher_id?: string | null;
  exam_date: string;
  start_time: string;
  duration_minutes: number;
  hall?: string | null;
}

export async function addExamScheduleItem(input: AddItemInput): Promise<ExamScheduleItem> {
  const { data, error } = await supabase
    .from('exam_schedule_items')
    .insert({
      schedule_id: input.schedule_id,
      institute_id: input.institute_id,
      class_id: input.class_id,
      subject_id: input.subject_id || null,
      subject_name: input.subject_name,
      teacher_id: input.teacher_id || null,
      exam_date: input.exam_date,
      start_time: input.start_time,
      duration_minutes: input.duration_minutes,
      hall: input.hall || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ExamScheduleItem;
}

// تعديل بند (عبر RPC ليرسل إشعارات تحديث لو الجدول منشور)
export async function updateExamScheduleItem(params: {
  item_id: string;
  exam_date: string;
  start_time: string;
  duration_minutes: number;
  hall?: string | null;
  teacher_id?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('update_exam_schedule_item', {
    p_item_id: params.item_id,
    p_exam_date: params.exam_date,
    p_start_time: params.start_time,
    p_duration: params.duration_minutes,
    p_hall: params.hall || null,
    p_teacher_id: params.teacher_id || null,
    p_notes: params.notes || null,
  });
  if (error) throw error;
}

export async function deleteExamScheduleItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('exam_schedule_items').delete().eq('id', itemId);
  if (error) throw error;
}

// نشر الجدول (يطلق إشعارات لكل الأطراف)
export async function publishExamSchedule(scheduleId: string): Promise<void> {
  const { error } = await supabase.rpc('publish_exam_schedule', { p_schedule_id: scheduleId });
  if (error) throw error;
}

// === عرض حسب الدور ===

// طالب: امتحاناته الخاصة من جداول منشورة
export async function getStudentExamSchedule(studentId: string): Promise<ExamScheduleItem[]> {
  const { data: classRows, error: classErr } = await supabase
    .from('student_classes')
    .select('class_id')
    .eq('student_id', studentId);
  if (classErr) throw classErr;
  const classIds = (classRows || []).map((r: any) => r.class_id);
  if (classIds.length === 0) return [];

  const { data, error } = await supabase
    .from('exam_schedule_items')
    .select(`
      id, schedule_id, institute_id, class_id, subject_id, subject_name,
      teacher_id, exam_date, start_time, duration_minutes, hall, notes,
      classes:class_id ( name ),
      users:teacher_id ( full_name ),
      exam_schedules!inner ( status, name )
    `)
    .in('class_id', classIds)
    .eq('exam_schedules.status', 'published')
    .order('exam_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    class_name: row.classes?.name,
    teacher_name: row.users?.full_name,
  })) as ExamScheduleItem[];
}

// أستاذ: امتحاناته
export async function getTeacherExamSchedule(teacherId: string): Promise<ExamScheduleItem[]> {
  const { data, error } = await supabase
    .from('exam_schedule_items')
    .select(`
      id, schedule_id, institute_id, class_id, subject_id, subject_name,
      teacher_id, exam_date, start_time, duration_minutes, hall, notes,
      classes:class_id ( name ),
      exam_schedules!inner ( status, name )
    `)
    .eq('teacher_id', teacherId)
    .eq('exam_schedules.status', 'published')
    .order('exam_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    class_name: row.classes?.name,
  })) as ExamScheduleItem[];
}

// ولي أمر: امتحانات أبنائه
export async function getParentExamSchedule(parentId: string): Promise<Record<string, ExamScheduleItem[]>> {
  const { data: kids, error: kidsErr } = await supabase
    .from('parent_child')
    .select('student_id, users:student_id ( full_name )')
    .eq('parent_id', parentId);
  if (kidsErr) throw kidsErr;

  const byChild: Record<string, ExamScheduleItem[]> = {};
  for (const kid of kids || []) {
    const studentId = (kid as any).student_id;
    const items = await getStudentExamSchedule(studentId);
    const name = (kid as any).users?.full_name || 'الطالب';
    byChild[`${name}|${studentId}`] = items;
  }
  return byChild;
}

// === Helpers للإدارة (لاستخدام البناء) ===

export interface ClassOption { id: string; name: string }
export interface SubjectOption { id: string; name: string }

export async function getInstituteClasses(instituteId: string): Promise<ClassOption[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name')
    .eq('institute_id', instituteId)
    .order('name')
    .limit(200);
  if (error) throw error;
  return (data || []) as ClassOption[];
}

export async function getInstituteSubjects(instituteId: string): Promise<SubjectOption[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('institute_id', instituteId)
    .order('name')
    .limit(200);
  if (error) throw error;
  return (data || []) as SubjectOption[];
}

// ───────────────────────── الامتحانات الفصلية (teacher_quizzes) ────────
// مفصولة عن جداول الإدارة. كل أستاذ يضيف امتحان قصير لصفه مباشرة
// (مثل: امتحان فصلي بمادة الرياضيات يوم الأحد).
// الـ trigger في DB يطلق إشعارات للطلاب وأولياء الأمور تلقائياً.

export interface TeacherQuiz {
  id: string;
  institute_id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  topic: string | null;
  quiz_date: string;
  start_time: string;
  duration_minutes: number;
  created_at: string;
  updated_at: string;
  // joined fields
  class_name?: string;
  subject_name?: string;
  teacher_name?: string;
}

export interface CreateTeacherQuizInput {
  institute_id: string;
  teacher_id: string;
  class_id: string;
  subject_id?: string | null;
  title: string;
  description?: string | null;
  topic?: string | null;
  quiz_date: string;
  start_time?: string;
  duration_minutes?: number;
}

export async function createTeacherQuiz(input: CreateTeacherQuizInput): Promise<TeacherQuiz> {
  const { data, error } = await supabase
    .from('teacher_quizzes')
    .insert({
      institute_id: input.institute_id,
      teacher_id: input.teacher_id,
      class_id: input.class_id,
      subject_id: input.subject_id || null,
      title: input.title,
      description: input.description || null,
      topic: input.topic || null,
      quiz_date: input.quiz_date,
      start_time: input.start_time || '09:00:00',
      duration_minutes: input.duration_minutes ?? 30,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TeacherQuiz;
}

export async function updateTeacherQuiz(
  id: string,
  patch: Partial<Pick<TeacherQuiz, 'title' | 'description' | 'topic' | 'quiz_date' | 'start_time' | 'duration_minutes' | 'subject_id'>>,
): Promise<void> {
  const { error } = await supabase
    .from('teacher_quizzes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTeacherQuiz(id: string): Promise<void> {
  const { error } = await supabase.from('teacher_quizzes').delete().eq('id', id);
  if (error) throw error;
}

// كل امتحانات أستاذ معين (مع تفاصيل الصف والمادة)
export async function getTeacherQuizzes(teacherId: string): Promise<TeacherQuiz[]> {
  const { data, error } = await supabase
    .from('teacher_quizzes')
    .select(`
      id, institute_id, teacher_id, class_id, subject_id, title, description, topic,
      quiz_date, start_time, duration_minutes, created_at, updated_at,
      classes:class_id ( name ),
      subjects:subject_id ( name )
    `)
    .eq('teacher_id', teacherId)
    .order('quiz_date', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    class_name: row.classes?.name,
    subject_name: row.subjects?.name,
  })) as TeacherQuiz[];
}

// ───────────────────────── العرض الموحَّد للطلاب/الأولياء ──────────────
// يدمج: امتحانات إدارية (paper) + امتحانات فصلية (teacher quizzes)
// مرتبة بالتاريخ، مع `is_past` ليرسم الـ UI شطب على المنتهي.

export type ExamSource = 'institute' | 'teacher';

export interface UpcomingExam {
  id: string;
  source: ExamSource;
  date: string;          // ISO date
  start_time: string;
  duration_minutes: number;
  title: string;         // subject_name (institute) أو title (teacher)
  subject_name?: string;
  class_id: string | null;
  class_name?: string;
  teacher_id: string | null;
  teacher_name?: string;
  hall?: string | null;
  topic?: string | null; // للـ teacher quizzes فقط
  notes?: string | null;
  is_past: boolean;
}

function isPast(dateISO: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateISO);
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

// كل امتحانات الطالب: مدمجة من المصدرين، مرتبة تصاعدياً.
export async function getStudentUpcomingExams(studentId: string): Promise<UpcomingExam[]> {
  const { data: classRows } = await supabase
    .from('student_classes').select('class_id').eq('student_id', studentId);
  const classIds = (classRows || []).map((r: any) => r.class_id);
  if (classIds.length === 0) return [];

  const [instituteItems, quizzes] = await Promise.all([
    supabase
      .from('exam_schedule_items')
      .select(`
        id, exam_date, start_time, duration_minutes, subject_name, class_id,
        teacher_id, hall, notes,
        classes:class_id ( name ),
        users:teacher_id ( full_name ),
        exam_schedules!inner ( status )
      `)
      .in('class_id', classIds)
      .eq('exam_schedules.status', 'published')
      .limit(300),
    supabase
      .from('teacher_quizzes')
      .select(`
        id, quiz_date, start_time, duration_minutes, title, topic, class_id, teacher_id,
        classes:class_id ( name ),
        users:teacher_id ( full_name ),
        subjects:subject_id ( name )
      `)
      .in('class_id', classIds)
      .limit(300),
  ]);

  const out: UpcomingExam[] = [];
  for (const row of (instituteItems.data || []) as any[]) {
    out.push({
      id: row.id, source: 'institute',
      date: row.exam_date, start_time: row.start_time,
      duration_minutes: row.duration_minutes,
      title: row.subject_name, subject_name: row.subject_name,
      class_id: row.class_id, class_name: row.classes?.name,
      teacher_id: row.teacher_id, teacher_name: row.users?.full_name,
      hall: row.hall, notes: row.notes,
      is_past: isPast(row.exam_date),
    });
  }
  for (const row of (quizzes.data || []) as any[]) {
    out.push({
      id: row.id, source: 'teacher',
      date: row.quiz_date, start_time: row.start_time,
      duration_minutes: row.duration_minutes,
      title: row.title, subject_name: row.subjects?.name,
      class_id: row.class_id, class_name: row.classes?.name,
      teacher_id: row.teacher_id, teacher_name: row.users?.full_name,
      topic: row.topic,
      is_past: isPast(row.quiz_date),
    });
  }
  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.start_time.localeCompare(b.start_time);
  });
}

// نفس الشي لولي الأمر: يجمع كل أبنائه ويرجع dict {childName|studentId: items[]}
export async function getParentUpcomingExams(parentId: string): Promise<Record<string, UpcomingExam[]>> {
  const { data: kids } = await supabase
    .from('parent_child')
    .select('student_id, users:student_id ( full_name )')
    .eq('parent_id', parentId);

  const byChild: Record<string, UpcomingExam[]> = {};
  for (const kid of (kids || []) as any[]) {
    const sid = kid.student_id;
    const name = kid.users?.full_name || 'الطالب';
    byChild[`${name}|${sid}`] = await getStudentUpcomingExams(sid);
  }
  return byChild;
}

// كشف التعارضات في بنود جدول واحد:
// 1) نفس أستاذ بنفس التاريخ والوقت
// 2) نفس صف بأكثر من امتحان متداخل وقتياً بنفس اليوم
export interface Conflict {
  type: 'teacher' | 'class';
  date: string;
  ids: string[];
  message: string;
}

export function detectConflicts(items: ExamScheduleItem[]): Conflict[] {
  const conflicts: Conflict[] = [];
  // تعارض الأستاذ
  const teacherKey = new Map<string, ExamScheduleItem[]>();
  for (const it of items) {
    if (!it.teacher_id) continue;
    const k = `${it.teacher_id}|${it.exam_date}|${it.start_time}`;
    if (!teacherKey.has(k)) teacherKey.set(k, []);
    teacherKey.get(k)!.push(it);
  }
  for (const [, group] of teacherKey) {
    if (group.length > 1) {
      conflicts.push({
        type: 'teacher',
        date: group[0].exam_date,
        ids: group.map(g => g.id),
        message: `الأستاذ ${group[0].teacher_name || ''} لديه امتحانان بنفس الوقت`,
      });
    }
  }
  // تعارض الصف بنفس التاريخ
  const classDay = new Map<string, ExamScheduleItem[]>();
  for (const it of items) {
    if (!it.class_id) continue;
    const k = `${it.class_id}|${it.exam_date}`;
    if (!classDay.has(k)) classDay.set(k, []);
    classDay.get(k)!.push(it);
  }
  for (const [, group] of classDay) {
    if (group.length > 1) {
      conflicts.push({
        type: 'class',
        date: group[0].exam_date,
        ids: group.map(g => g.id),
        message: `الصف ${group[0].class_name || ''} له ${group.length} امتحانات في نفس اليوم`,
      });
    }
  }
  return conflicts;
}
