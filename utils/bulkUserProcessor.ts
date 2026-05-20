import type { ParsedTeacher, ParsedStudent } from './excelParser';

// Deduplicated teacher after collapsing rows that share a phone.
// A teacher showing up in 3 rows (math in grade 1-A, 1-B, 2-A) becomes one account
// with 3 assignments and a single code.
export interface ProcessedTeacher {
  full_name: string;
  phone: string;
  code: string;
  rowNumbers: number[];
  assignments: Array<{
    subject: string;
    class_name?: string;
    section?: string;
    level?: string;
    group?: string;
  }>;
}

export interface ProcessedStudent {
  rowNumber: number;
  full_name: string;
  code: string;
  class_name?: string;
  section?: string;
  level?: string;
  subject?: string;
  group?: string;
  parent_phone: string;
  parent_name: string;
}

export interface ProcessedParent {
  full_name: string;
  phone: string;
  code: string;
  children: string[]; // child full names (for export preview only)
}

/** Group teachers by phone — one account, many class/subject assignments. */
export function processTeachers(
  teachers: ParsedTeacher[],
  codes: string[],
): ProcessedTeacher[] {
  const map = new Map<string, ProcessedTeacher>();
  let i = 0;
  for (const t of teachers) {
    const key = t.phone;
    const existing = map.get(key);
    const assignment = {
      subject: t.subject,
      class_name: t.class_name,
      section: t.section,
      level: t.level,
      group: t.group,
    };
    if (existing) {
      existing.assignments.push(assignment);
      existing.rowNumbers.push(t.rowNumber);
    } else {
      map.set(key, {
        full_name: t.full_name,
        phone: t.phone,
        code: codes[i++],
        rowNumbers: [t.rowNumber],
        assignments: [assignment],
      });
    }
  }
  return Array.from(map.values());
}

/** Attach codes to each student row (one code per student — no dedup). */
export function processStudents(
  students: ParsedStudent[],
  codes: string[],
): ProcessedStudent[] {
  return students.map((s, i) => ({
    rowNumber: s.rowNumber,
    full_name: s.full_name,
    code: codes[i],
    class_name: s.class_name,
    section: s.section,
    level: s.level,
    subject: s.subject,
    group: s.group,
    parent_name: s.parent_name,
    parent_phone: s.parent_phone,
  }));
}

/** Collapse parents by phone — one parent with many children gets one account. */
export function extractParents(
  students: ProcessedStudent[],
  codes: string[],
): ProcessedParent[] {
  const map = new Map<string, ProcessedParent>();
  let i = 0;
  for (const s of students) {
    const key = s.parent_phone;
    const existing = map.get(key);
    if (existing) {
      existing.children.push(s.full_name);
    } else {
      map.set(key, {
        full_name: s.parent_name,
        phone: s.parent_phone,
        code: codes[i++],
        children: [s.full_name],
      });
    }
  }
  return Array.from(map.values());
}

/** How many unique parent codes we'll need (count of distinct parent phones). */
export function countUniqueParents(students: ParsedStudent[]): number {
  const set = new Set(students.map(s => s.parent_phone));
  return set.size;
}

/** How many unique teacher codes we'll need (count of distinct teacher phones). */
export function countUniqueTeachers(teachers: ParsedTeacher[]): number {
  const set = new Set(teachers.map(t => t.phone));
  return set.size;
}
