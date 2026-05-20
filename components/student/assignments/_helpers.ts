// Pure helpers for student assignments: status tier classification + due-date label.
// Kept here so AssignmentRow can stay presentational without re-deriving in parent.

import type { TFunction } from 'i18next';

export type AssignmentTier = 'pending' | 'submitted' | 'late' | 'graded';

export const tierOf = (a: any): AssignmentTier => {
  const sub = a.submission;
  const isSubmitted = sub?.status === 'submitted' || sub?.status === 'graded' || sub?.status === 'returned';
  const isReturned = sub?.status === 'returned';
  const isPastDue = a.due_date && new Date(a.due_date) < new Date();
  if (isReturned) return 'graded';
  if (isSubmitted) return 'submitted';
  if (isPastDue) return 'late';
  return 'pending';
};

export const daysRemaining = (dueDate: string, t: TFunction) => {
  try {
    const ms = new Date(dueDate).getTime() - Date.now();
    if (ms <= 0) return { overdue: true, label: t('common.expired', { defaultValue: 'انتهى' }) as string };
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    if (days === 1) return { overdue: false, label: t('student.oneDayLeft', { defaultValue: 'يوم واحد متبقٍ' }) as string };
    return { overdue: false, label: t('student.daysLeft', { count: days, defaultValue: `${days} أيام متبقية` }) as string };
  } catch { return { overdue: false, label: '' }; }
};

// Protocol whitelist — prevents hostile URLs (javascript:, file:, etc).
export const safeUrl = (url: string) => {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch { return false; }
};
