// _helpers — pure helpers for institute schedule (time math, conflict detection, presets).
// Extracted verbatim from app/(institute)/schedule.tsx — do NOT change behavior.

export const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TIME_PRESETS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00',
];

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
  return h * 60 + (m || 0);
};

// Conflict detection: same teacher or same class can't have overlapping slots on the same day.
// Returns null if OK, or a localized Arabic error string otherwise.
export const findConflict = (params: {
  day: number;
  start: string;
  end: string;
  teacherId: string | null;
  classId: string | null;
  excludeSlotId?: string;
  timetable: any[];
  teachers: Array<{ id: string; full_name: string }>;
  classes: Array<{ id: string; name: string }>;
}): string | null => {
  const newStart = toMinutes(params.start);
  const newEnd = toMinutes(params.end);
  for (const s of params.timetable) {
    if (s.id === params.excludeSlotId) continue;
    if (s.day_of_week !== params.day) continue;
    const sStart = toMinutes(s.start_time?.slice(0, 5) || '00:00');
    const sEnd = toMinutes(s.end_time?.slice(0, 5) || '00:00');
    const overlaps = newStart < sEnd && newEnd > sStart;
    if (!overlaps) continue;
    if (params.teacherId && s.teacher_id === params.teacherId) {
      const tname = params.teachers.find((t) => t.id === params.teacherId)?.full_name || 'الأستاذ';
      return `تعارض: ${tname} عنده حصة بنفس الوقت (${s.subject})`;
    }
    if (params.classId && s.class_id === params.classId) {
      const cname = params.classes.find((c) => c.id === params.classId)?.name || 'الصف';
      return `تعارض: ${cname} عنده حصة بنفس الوقت (${s.subject})`;
    }
  }
  return null;
};

export const formatTime = (time: string): string => {
  if (!time) return '';
  const parts = time.split(':');
  const hour = parseInt(parts[0]);
  const min = parts[1] || '00';
  if (hour < 12) return `${hour}:${min} ص`;
  if (hour === 12) return `12:${min} م`;
  return `${hour - 12}:${min} م`;
};

export type DayItem = { key: number; label: string };

export const ALL_DAYS: DayItem[] = [
  { key: 6, label: 'السبت' },
  { key: 0, label: 'الأحد' },
  { key: 1, label: 'الإثنين' },
  { key: 2, label: 'الثلاثاء' },
  { key: 3, label: 'الأربعاء' },
  { key: 4, label: 'الخميس' },
  { key: 5, label: 'الجمعة' },
];

// Schools: Sat-Thu (no Friday). Institutes: full week.
export const getDaysForInstType = (instType: string): DayItem[] => {
  return instType === 'institute'
    ? ALL_DAYS
    : ALL_DAYS.filter((d) => d.key !== 5);
};
