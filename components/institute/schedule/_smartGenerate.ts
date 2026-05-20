// _smartGenerate — institute/school timetable generator (v3).
//
// Algorithm v3 — "schedule units × subjects × teachers with global conflict graph":
//
//   1) Resolve the set of *scheduling units* from real structure:
//        - school   → every sections row (each section is a class with own students)
//        - institute → every classes row
//      Falls back to `classes` only when the school has no sections seeded yet
//      (legacy data path).
//
//   2) Pull *all* teacher_assignments for the institute in ONE query (bulk join
//      with `subjects(name)`) instead of N+1 — the previous version did one
//      query per teacher, fanned out per loop iteration.
//
//   3) For each unit, derive the curriculum it should cover:
//        - subjects taught for it (via teacher_assignments that match its
//          section_id OR class_id)
//        - the teacher anchored to each subject (the assignment owner).
//      A unit with 0 matching assignments → every slot for it is skipped with
//      reason='no_assignment' so the admin sees exactly what to fix.
//
//   4) Schedule per (day × period) with these constraints:
//        - hard: no teacher is double-booked at the same (day,start) globally.
//        - hard: each unit gets exactly one teacher per (day,start).
//        - soft: same teacher must not teach the SAME unit two periods in a
//          row (back-to-back fatigue) when an alternative subject exists.
//        - soft: spread each subject through the week — e.g. don't pile all
//          math into one day. We round-robin subjects per unit so they rotate
//          across the day grid.
//
//   5) Wipe previous auto-generated rows for the institute first (`generated_by_ai`
//      flag) so re-running smart generate doesn't duplicate or stale-pollute.
//      Manually-added rows (without the flag) are PRESERVED — admins keep their
//      custom adjustments.
//
//   6) Bulk-insert all generated rows in chunks (50 each) to stay under PostgREST
//      payload limits and avoid one-by-one round trips.
//
// Notes:
//   - Period times are emitted from a configurable grid (default: 6 periods,
//     08:00 start, 45-min slots + 5-min gaps). Override via params.
//   - The greedy assignment is O(units × days × periods × subjects) — fine for
//     the ≤30-section schools we target. For 100+ sections an ILP solver would
//     be needed; we don't ship one here.

import { api } from '../../../services/api';
import { supabase, supabaseAdmin } from '../../../services/supabase';

export type SkipReason =
  | 'no_assignment'           // unit has no teacher assigned to any subject
  | 'no_subjects'             // unit has assignments but they lack subject names
  | 'no_free_teacher'         // all subject teachers busy at this slot
  | 'partial_coverage';       // some periods couldn't be filled even after fallback

export interface SkippedSlot {
  className: string;
  classId: string;
  subjectName: string | null;
  day: number;
  period: number; // 1-based slot index within the day
  startTime: string;
  reason: SkipReason;
}

export type SmartGenerateResult =
  | { kind: 'noTeachersOrClasses' }
  | { kind: 'success'; count: number; skipped: SkippedSlot[] };

interface SmartGenerateParams {
  userInstituteId: string;
  /** institute_type — 'school' uses sections grid, 'institute' uses classes. */
  instType?: 'institute' | 'school';
  /** Day-of-week ints (0..6) the institute actually operates. */
  dayKeys: number[];
  /** First slot start time, default '08:00'. */
  startTime?: string;
  /** Slot length in minutes, default 45. */
  slotMinutes?: number;
  /** Gap minutes between periods (break time), default 5. */
  breakMinutes?: number;
  /** Number of periods per day, default 6. */
  periodsPerDay?: number;
}

// ── Time helpers ────────────────────────────────────────────────
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
  return h * 60 + (m || 0);
}
function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Types for internal data ─────────────────────────────────────
type Unit = {
  id: string;           // section_id OR class_id depending on instType
  name: string;
  isSection: boolean;   // tells the slot writer which column to populate
  legacyClassId?: string | null; // for sections, the flat classes.id used by timetables.class_id
};

type Assignment = {
  teacherId: string;
  subjectId: string | null;
  subjectName: string;
  sectionId: string | null;
  classId: string | null;
};

export async function runSmartGenerate(params: SmartGenerateParams): Promise<SmartGenerateResult> {
  const {
    userInstituteId,
    instType = 'institute',
    dayKeys,
    startTime = '08:00',
    slotMinutes = 45,
    breakMinutes = 5,
    periodsPerDay = 6,
  } = params;

  if (!userInstituteId) return { kind: 'noTeachersOrClasses' };
  const client = supabaseAdmin || supabase;

  // 1) Load teachers + scheduling units in parallel ──────────────
  const [teachers, classesRaw, structure] = await Promise.all([
    api.getTeachersByInstitute(userInstituteId),
    api.getClassesByInstitute(userInstituteId),
    instType === 'school'
      ? api.getSchoolStructure(userInstituteId)
      : Promise.resolve({ stages: [], grades: [], sections: [], subjects: [] }),
  ]);

  // 2) Build the unit list — sections for schools, classes for institutes.
  //    For schools, derive a display label like "{grade} {section}" and find
  //    the legacy classes.id so timetables.class_id stays consistent with
  //    everything else that reads from the flat table.
  let units: Unit[] = [];

  if (instType === 'school' && (structure as any)?.sections?.length) {
    const grades = (structure as any).grades as Array<{ id: string; name: string }>;
    const gradeById = new Map(grades.map((g) => [g.id, g.name] as const));
    const sections = (structure as any).sections as Array<{ id: string; name: string; grade_id: string }>;
    const flatClasses = (classesRaw || []) as Array<{ id: string; name: string }>;

    for (const sec of sections) {
      const gradeName = gradeById.get(sec.grade_id) || '';
      const label = gradeName ? `${gradeName} ${sec.name}`.trim() : sec.name;
      // Match the legacy flat-classes row so timetables.class_id stays usable
      // by everything that already reads from `classes` (teacher dashboard, etc.)
      const legacy = flatClasses.find((c) => {
        const n = (c.name || '').trim();
        return n === label || (gradeName && n.includes(gradeName.split(/\s+/)[0]) && n.endsWith((sec.name || '').trim()));
      });
      units.push({
        id: sec.id,
        name: label,
        isSection: true,
        legacyClassId: legacy?.id || null,
      });
    }
  } else {
    // Institute path, or school with no sections seeded yet.
    units = (classesRaw || []).map((c: any) => ({
      id: c.id,
      name: c.name || 'صف',
      isSection: false,
    }));
  }

  if (!teachers.length || units.length === 0) {
    return { kind: 'noTeachersOrClasses' };
  }

  // 3) Bulk-load every teacher_assignment for this institute in one query.
  //    Old code looped per-teacher → N+1. This is a single round-trip.
  const teacherIds = new Set(teachers.map((t: any) => t.id));
  const { data: rawAssignments } = await client
    .from('teacher_assignments')
    .select('teacher_id, subject_id, section_id, class_id, subjects:subject_id(name)')
    .eq('institute_id', userInstituteId)
    .limit(2000);

  // 4) Normalize assignments + filter by valid teachers (drop orphans pointing
  //    at deleted users).
  const assignments: Assignment[] = ((rawAssignments || []) as any[])
    .filter((r) => teacherIds.has(r.teacher_id))
    .map((r) => {
      const subj = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
      return {
        teacherId: r.teacher_id as string,
        subjectId: (r.subject_id as string) || null,
        subjectName: ((subj?.name as string) || '').trim() || 'مادة',
        sectionId: (r.section_id as string) || null,
        classId: (r.class_id as string) || null,
      };
    });

  // 5) For each unit, list the (subject → teacher) pairs that apply.
  //    A unit matches an assignment if assignment.section_id == unit.id
  //    (school) OR assignment.class_id == unit.id (institute) OR — legacy —
  //    assignment.section_id == unit.legacyClassId (school wizard quirk that
  //    stored classes.id in section_id).
  type SubjectSlot = { subjectName: string; subjectId: string | null; teacherId: string };
  const subjectsByUnit = new Map<string, SubjectSlot[]>();

  for (const unit of units) {
    const matchers = (a: Assignment): boolean => {
      if (unit.isSection) {
        if (a.sectionId === unit.id) return true;
        // Legacy school wizard stored classes.id in section_id → also accept
        // a class_id match against the flat row.
        if (unit.legacyClassId && a.classId === unit.legacyClassId) return true;
        return false;
      }
      return a.classId === unit.id;
    };
    const hits = assignments.filter(matchers);
    // De-dup: one entry per (subjectName, teacherId) — the same teacher can
    // legitimately be assigned the same subject twice in the DB; once is enough.
    const seen = new Set<string>();
    const list: SubjectSlot[] = [];
    for (const a of hits) {
      const key = `${a.teacherId}|${a.subjectName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ subjectName: a.subjectName, subjectId: a.subjectId, teacherId: a.teacherId });
    }
    subjectsByUnit.set(unit.id, list);
  }

  // 6) Build the day×period time grid ──────────────────────────────
  const slotStarts: string[] = [];
  const slotEnds: string[] = [];
  let cursor = toMinutes(startTime);
  for (let i = 0; i < periodsPerDay; i++) {
    const sStart = cursor;
    const sEnd = sStart + slotMinutes;
    slotStarts.push(fromMinutes(sStart));
    slotEnds.push(fromMinutes(sEnd));
    cursor = sEnd + breakMinutes;
  }

  // 7) Greedy schedule with constraints ────────────────────────────
  //    - teacherBusy: key=`${day}|${start}|${teacherId}` for global conflict
  //    - lastTeacherInUnit: tracks the teacher who took the previous period
  //      for this same unit, so we can prefer rotation (no back-to-back).
  //    - subjectCursor: round-robin index per unit, ensuring subjects rotate
  //      through the week.
  const teacherBusy = new Set<string>();
  const subjectCursor = new Map<string, number>(); // unitId → cursor
  const lastTeacherInUnit = new Map<string, string>(); // `${unitId}|${day}` → teacherId
  const skipped: SkippedSlot[] = [];
  const generatedRows: any[] = [];

  for (const day of dayKeys) {
    for (let p = 0; p < periodsPerDay; p++) {
      const start = slotStarts[p];
      const end = slotEnds[p];

      for (const unit of units) {
        const subjects = subjectsByUnit.get(unit.id) || [];
        if (subjects.length === 0) {
          skipped.push({
            className: unit.name,
            classId: unit.legacyClassId || unit.id,
            subjectName: null,
            day,
            period: p + 1,
            startTime: start,
            reason: 'no_assignment',
          });
          continue;
        }

        // Round-robin starting point — rotates each period for this unit.
        const cursor0 = subjectCursor.get(unit.id) ?? 0;
        const prevTeacher = lastTeacherInUnit.get(`${unit.id}|${day}`);

        // Try every subject in order from cursor; prefer ones whose teacher
        // is (a) not double-booked this slot AND (b) different from previous.
        let picked: SubjectSlot | null = null;
        let fallbackBusy: SubjectSlot | null = null; // backup if every option violates "no back-to-back"
        for (let i = 0; i < subjects.length; i++) {
          const s = subjects[(cursor0 + i) % subjects.length];
          const busyKey = `${day}|${start}|${s.teacherId}`;
          if (teacherBusy.has(busyKey)) continue; // teacher already teaching elsewhere
          if (s.teacherId === prevTeacher) {
            // Same teacher as last period for this unit — keep as fallback
            if (!fallbackBusy) fallbackBusy = s;
            continue;
          }
          picked = s;
          break;
        }
        // No conflict-free + rotation-friendly pick? Accept the back-to-back
        // option rather than skip the slot.
        if (!picked && fallbackBusy) picked = fallbackBusy;

        if (!picked) {
          // Every teacher for this unit's subjects is busy this slot.
          skipped.push({
            className: unit.name,
            classId: unit.legacyClassId || unit.id,
            subjectName: null,
            day,
            period: p + 1,
            startTime: start,
            reason: 'no_free_teacher',
          });
          continue;
        }

        teacherBusy.add(`${day}|${start}|${picked.teacherId}`);
        lastTeacherInUnit.set(`${unit.id}|${day}`, picked.teacherId);
        // Advance cursor so next period picks a different subject first.
        subjectCursor.set(unit.id, (cursor0 + 1) % subjects.length);

        // Timetable schema: class_id is a single column. For schools we map
        // the section.id into it (the rest of the app already supports both
        // via lookups), unless we have a legacy classes.id mirror, in which
        // case the flat id is preferred for backward compatibility.
        const classIdForRow = unit.isSection
          ? (unit.legacyClassId || unit.id)
          : unit.id;

        generatedRows.push({
          institute_id: userInstituteId,
          class_id: classIdForRow,
          teacher_id: picked.teacherId,
          subject: picked.subjectName,
          day_of_week: day,
          start_time: start,
          end_time: end,
          room: null,
          // Marker so we can safely wipe + regenerate without touching manual edits.
          // The column is optional; if the schema doesn't have it the field is dropped
          // by PostgREST and the rest still works (we filter on it best-effort below).
          generated_by_ai: true,
        });
      }
    }
  }

  // 8) Wipe previous auto-generated rows so re-running does NOT duplicate
  //    or leave stale entries. Manually-added slots are preserved.
  //
  //    Supabase-JS does NOT throw on a missing column — it returns `{ error }`.
  //    So we check error.code/message and silently skip when the schema lacks
  //    the marker (rather than aborting the whole regenerate).
  {
    const { error: delErr } = await client
      .from('timetables')
      .delete()
      .eq('institute_id', userInstituteId)
      .eq('generated_by_ai', true);
    if (delErr) {
      const msg = String(delErr.message || '').toLowerCase();
      const missingCol = msg.includes('generated_by_ai') || msg.includes('column') || delErr.code === '42703';
      if (!missingCol) {
        // Some other DB error — surface to admin instead of silently leaking duplicates.
        throw new Error(delErr.message || 'فشل تنظيف الجدول السابق');
      }
      // else: column doesn't exist yet → safe no-op. New rows will still
      // insert; admin should re-run delete manually or apply the migration
      // when ready.
    }
  }

  // 9) Bulk insert in chunks of 50 to keep PostgREST payloads under 1MB.
  const chunkSize = 50;
  for (let i = 0; i < generatedRows.length; i += chunkSize) {
    const chunk = generatedRows.slice(i, i + chunkSize);
    // If the `generated_by_ai` column doesn't exist, strip it on first failure
    // and retry once — keeps the feature working on environments that haven't
    // applied the migration yet.
    const { error } = await client.from('timetables').insert(chunk);
    if (error) {
      // Strip the marker column and retry — keeps the feature working when the
      // migration that adds `generated_by_ai` hasn't been applied yet.
      const stripped = chunk.map((row) => {
        const { generated_by_ai: _omit, ...rest } = row;
        return rest;
      });
      const retry = await client.from('timetables').insert(stripped);
      if (retry.error) throw new Error(retry.error.message);
    }
  }

  return { kind: 'success', count: generatedRows.length, skipped };
}
