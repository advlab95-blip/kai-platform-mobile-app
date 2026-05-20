// lessonNotesService — per-lesson teacher notes (one per timetable slot per
// calendar date). Kept in its own service to avoid bloating api.ts /
// instituteAdminService.ts.
//
// RLS on lesson_notes already restricts writes to teacher_id = auth.uid(),
// so these helpers are intentionally thin — no extra gates needed.

import { supabase } from './supabase';

export interface LessonNote {
  id: string;
  institute_id: string;
  teacher_id: string;
  timetable_id: string;
  lesson_date: string; // YYYY-MM-DD
  content: string;
  created_at: string;
  updated_at: string;
}

const LESSON_NOTE_COLS =
  'id, institute_id, teacher_id, timetable_id, lesson_date, content, created_at, updated_at';

/** Fetch the single note for a specific lesson occurrence, if any. */
export async function getLessonNote(
  timetableId: string,
  lessonDate: string,
): Promise<LessonNote | null> {
  const { data, error } = await supabase
    .from('lesson_notes')
    .select(LESSON_NOTE_COLS)
    .eq('timetable_id', timetableId)
    .eq('lesson_date', lessonDate)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as LessonNote) || null;
}

/** Latest notes for a teacher across all slots — used by a "recent lesson
 *  notes" widget on the home, plus the institute-admin overview later. */
export async function listMyLessonNotes(
  teacherId: string,
  opts?: { limit?: number },
): Promise<LessonNote[]> {
  const { data, error } = await supabase
    .from('lesson_notes')
    .select(LESSON_NOTE_COLS)
    .eq('teacher_id', teacherId)
    .order('lesson_date', { ascending: false })
    .limit(opts?.limit || 100);
  if (error) throw error;
  return (data as unknown as LessonNote[]) || [];
}

/** Upsert (insert or update) the note for a specific lesson occurrence.
 *  Uses the (timetable_id, lesson_date) unique constraint as the conflict key. */
export async function upsertLessonNote(input: {
  institute_id: string;
  teacher_id: string;
  timetable_id: string;
  lesson_date: string;
  content: string;
}): Promise<LessonNote> {
  const { data, error } = await supabase
    .from('lesson_notes')
    .upsert(
      {
        institute_id: input.institute_id,
        teacher_id: input.teacher_id,
        timetable_id: input.timetable_id,
        lesson_date: input.lesson_date,
        content: input.content,
      },
      { onConflict: 'timetable_id,lesson_date' },
    )
    .select(LESSON_NOTE_COLS)
    .single();
  if (error) throw error;
  return data as unknown as LessonNote;
}

export async function deleteLessonNote(id: string): Promise<void> {
  const { error } = await supabase.from('lesson_notes').delete().eq('id', id);
  if (error) throw error;
}
