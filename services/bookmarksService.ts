// bookmarksService — student-owned saves across content types.
// Generic kind+ref_id pattern so one table serves video/gallery/lesson/etc.

import { supabase } from './supabase';

export type BookmarkKind =
  | 'video'
  | 'gallery'
  | 'ai_lesson'
  | 'exam'
  | 'announcement'
  | 'material'
  | 'assignment';

export interface Bookmark {
  id: string;
  institute_id: string;
  student_id: string;
  kind: BookmarkKind;
  ref_id: string;
  label: string;
  note: string | null;
  created_at: string;
}

const COLS = 'id, institute_id, student_id, kind, ref_id, label, note, created_at';

export async function listMyBookmarks(
  studentId: string,
  opts?: { kind?: BookmarkKind; limit?: number },
): Promise<Bookmark[]> {
  let q = supabase
    .from('student_bookmarks')
    .select(COLS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.kind) q = q.eq('kind', opts.kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as Bookmark[]) || [];
}

/** Idempotent — re-adding an existing bookmark is a no-op (unique constraint). */
export async function addBookmark(input: {
  institute_id: string;
  student_id: string;
  kind: BookmarkKind;
  ref_id: string;
  label: string;
  note?: string;
}): Promise<Bookmark | null> {
  const { data, error } = await supabase
    .from('student_bookmarks')
    .upsert(
      {
        institute_id: input.institute_id,
        student_id: input.student_id,
        kind: input.kind,
        ref_id: input.ref_id,
        label: input.label,
        note: input.note || null,
      },
      { onConflict: 'student_id,kind,ref_id', ignoreDuplicates: false },
    )
    .select(COLS)
    .single();
  if (error) throw error;
  return (data as unknown as Bookmark) || null;
}

export async function removeBookmark(id: string): Promise<void> {
  const { error } = await supabase.from('student_bookmarks').delete().eq('id', id);
  if (error) throw error;
}

/** Cheap "is this row already bookmarked?" check used by toggle buttons. */
export async function isBookmarked(
  studentId: string,
  kind: BookmarkKind,
  refId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('student_bookmarks')
    .select('id')
    .eq('student_id', studentId)
    .eq('kind', kind)
    .eq('ref_id', refId)
    .maybeSingle();
  if (error) return null;
  return (data as any)?.id || null;
}
