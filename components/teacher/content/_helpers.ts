// Pure helpers + constants for the teacher content screen.
// No Supabase, no AsyncStorage, no side effects.

export type SubTab =
  | 'videos'
  | 'exams'
  | 'gallery'
  | 'materials'
  | 'homework'
  | 'pdfs'
  | 'live';

export type QuestionType = 'mcq' | 'tf' | 'short' | 'fill' | 'essay';

export type SubTabKey = {
  key: SubTab;
  labelKey: string;
  icon: string;
  navTarget?: string;
  fallbackLabel?: string;
};

export const SUB_TAB_KEYS: SubTabKey[] = [
  { key: 'videos', labelKey: 'teacherContent.videos', icon: 'videocam' },
  { key: 'exams', labelKey: 'teacherContent.exams', icon: 'document-text' },
  { key: 'gallery', labelKey: 'teacherContent.gallery', icon: 'images' },
  { key: 'materials', labelKey: 'teacherContent.materials', icon: 'storefront' },
  { key: 'homework', labelKey: 'teacherContent.homework', icon: 'book' },
  { key: 'pdfs', labelKey: 'teacherContent.pdfs', icon: 'document-attach' },
  // Voice was removed from teacher content per user request — voice messages
  // now live exclusively inside class chat (see app/(teacher)/class-chat.tsx).
  { key: 'live', labelKey: 'teacherContent.live', icon: 'radio', navTarget: '/(teacher)/live', fallbackLabel: 'البث المباشر' },
];

export const QUESTION_TYPE_KEYS: { key: QuestionType; labelKey: string }[] = [
  { key: 'mcq', labelKey: 'teacherContent.mcq' },
  { key: 'tf', labelKey: 'teacherContent.tf' },
  { key: 'short', labelKey: 'teacherContent.shortAnswer' },
  { key: 'fill', labelKey: 'teacherContent.fillBlank' },
  { key: 'essay', labelKey: 'teacherContent.essay' },
];

export const STATUS_COLOR_BASE: Record<string, { bg: string; text: string; labelKey: string }> = {
  draft: { bg: '#F1F5F9', text: '#64748B', labelKey: 'teacherContent.statusDraft' },
  scheduled: { bg: '#DBEAFE', text: '#1D4ED8', labelKey: 'teacherContent.statusScheduled' },
  active: { bg: '#D1FAE5', text: '#059669', labelKey: 'teacherContent.statusActive' },
  completed: { bg: '#EDE9FE', text: '#7C3AED', labelKey: 'teacherContent.statusCompleted' },
  graded: { bg: '#FEF3C7', text: '#D97706', labelKey: 'teacherContent.statusGraded' },
};

/** Stable key for a target item (class|section|subject) — used for active comparisons. */
export const targetKey = (t: { classId?: string | null; sectionId?: string | null; subjectId?: string | null }): string =>
  `${t.classId || ''}|${t.sectionId || ''}|${t.subjectId || ''}`;
