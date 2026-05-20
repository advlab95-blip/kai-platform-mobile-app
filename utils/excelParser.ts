import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface ParsedTeacher {
  rowNumber: number;
  full_name: string;
  phone: string;
  subject: string;
  class_name?: string;
  section?: string;
  level?: string;
  group?: string;
}

export interface ParsedStudent {
  rowNumber: number;
  full_name: string;
  phone?: string;
  class_name?: string;
  section?: string;
  level?: string;
  subject?: string;
  group?: string;
  parent_name: string;
  parent_phone: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

// Iraqi mobile phone: 07[3-9]xxxxxxxx (11 digits total). Users sometimes paste
// spaces/dashes from export tools — normalize before matching.
const PHONE_RE = /^07[3-9]\d{8}$/;
function normalizePhone(v: unknown): string {
  let digits = String(v ?? '').replace(/[^\d]/g, '').trim();
  // Excel silently strips the leading 0 when a phone is typed as a plain number.
  // If we got 10 digits starting with 7[3-9], re-add the 0 so 7814187623 → 07814187623.
  if (/^7[3-9]\d{8}$/.test(digits)) digits = '0' + digits;
  return digits;
}
function cell(v: unknown): string {
  return String(v ?? '').trim();
}

async function readExcel(fileUri: string): Promise<any[][]> {
  let wb: XLSX.WorkBook;
  if (Platform.OS === 'web') {
    // DocumentPicker on web yields a blob/data URL — fetch bytes directly.
    const res = await fetch(fileUri);
    const buf = await res.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array' });
  } else {
    const content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64' as any,
    });
    wb = XLSX.read(content, { type: 'base64' });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('الملف فارغ أو لا يحتوي على ورقة صالحة');
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

// ───────────────────────────────────────────────────────
// Teachers — school: الاسم | المادة | الصف | الشعبة | الرقم
// ───────────────────────────────────────────────────────
export async function parseTeachersSchool(fileUri: string): Promise<{
  teachers: ParsedTeacher[]; errors: ValidationError[];
}> {
  const rows = await readExcel(fileUri);
  const teachers: ParsedTeacher[] = [];
  const errors: ValidationError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c: any) => !cell(c))) continue;
    const r = i + 1;
    const name = cell(row[0]);
    const subject = cell(row[1]);
    const className = cell(row[2]);
    const section = cell(row[3]);
    const phone = normalizePhone(row[4]);

    if (!name) { errors.push({ row: r, field: 'الاسم', message: 'الاسم مطلوب' }); continue; }
    if (!subject) { errors.push({ row: r, field: 'المادة', message: `المادة مطلوبة للأستاذ "${name}"` }); continue; }
    if (!className) { errors.push({ row: r, field: 'الصف', message: `الصف مطلوب للأستاذ "${name}"` }); continue; }
    if (!section) { errors.push({ row: r, field: 'الشعبة', message: `الشعبة مطلوبة للأستاذ "${name}"` }); continue; }
    if (!phone) { errors.push({ row: r, field: 'الرقم', message: `رقم الهاتف مطلوب للأستاذ "${name}"` }); continue; }
    if (!PHONE_RE.test(phone)) {
      errors.push({ row: r, field: 'الرقم', message: `رقم الهاتف غير صحيح "${phone}" — المطلوب: 07XXXXXXXXX` });
      continue;
    }
    teachers.push({ rowNumber: r, full_name: name, subject, class_name: className, section, phone });
  }
  return { teachers, errors };
}

// ───────────────────────────────────────────────────────
// Teachers — institute: الاسم | المادة | المرحلة | الكروب | الرقم
// ───────────────────────────────────────────────────────
export async function parseTeachersInstitute(fileUri: string): Promise<{
  teachers: ParsedTeacher[]; errors: ValidationError[];
}> {
  const rows = await readExcel(fileUri);
  const teachers: ParsedTeacher[] = [];
  const errors: ValidationError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c: any) => !cell(c))) continue;
    const r = i + 1;
    const name = cell(row[0]);
    const subject = cell(row[1]);
    const level = cell(row[2]);
    const group = cell(row[3]);
    const phone = normalizePhone(row[4]);

    if (!name) { errors.push({ row: r, field: 'الاسم', message: 'الاسم مطلوب' }); continue; }
    if (!subject) { errors.push({ row: r, field: 'المادة', message: `المادة مطلوبة للأستاذ "${name}"` }); continue; }
    if (!level) { errors.push({ row: r, field: 'المرحلة', message: `المرحلة مطلوبة للأستاذ "${name}"` }); continue; }
    if (!group) { errors.push({ row: r, field: 'الكروب', message: `الكروب مطلوب للأستاذ "${name}"` }); continue; }
    if (!phone) { errors.push({ row: r, field: 'الرقم', message: `الرقم مطلوب للأستاذ "${name}"` }); continue; }
    if (!PHONE_RE.test(phone)) {
      errors.push({ row: r, field: 'الرقم', message: `رقم غير صحيح "${phone}" — المطلوب: 07XXXXXXXXX` });
      continue;
    }
    teachers.push({ rowNumber: r, full_name: name, subject, level, group, phone });
  }
  return { teachers, errors };
}

// ───────────────────────────────────────────────────────
// Students — school: الاسم | الصف | الشعبة | ولي الأمر | رقم ولي الأمر
// ───────────────────────────────────────────────────────
export async function parseStudentsSchool(fileUri: string): Promise<{
  students: ParsedStudent[]; errors: ValidationError[];
}> {
  const rows = await readExcel(fileUri);
  const students: ParsedStudent[] = [];
  const errors: ValidationError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c: any) => !cell(c))) continue;
    const r = i + 1;
    const name = cell(row[0]);
    const className = cell(row[1]);
    const section = cell(row[2]);
    const parentName = cell(row[3]);
    const parentPhone = normalizePhone(row[4]);

    if (!name) { errors.push({ row: r, field: 'الاسم', message: 'الاسم مطلوب' }); continue; }
    if (!className) { errors.push({ row: r, field: 'الصف', message: `الصف مطلوب للطالب "${name}"` }); continue; }
    if (!section) { errors.push({ row: r, field: 'الشعبة', message: `الشعبة مطلوبة للطالب "${name}"` }); continue; }
    if (!parentName) { errors.push({ row: r, field: 'ولي الأمر', message: `اسم ولي الأمر مطلوب للطالب "${name}"` }); continue; }
    if (!parentPhone) { errors.push({ row: r, field: 'رقم ولي الأمر', message: `رقم ولي الأمر مطلوب للطالب "${name}"` }); continue; }
    if (!PHONE_RE.test(parentPhone)) {
      errors.push({ row: r, field: 'رقم ولي الأمر', message: `رقم غير صحيح "${parentPhone}" للطالب "${name}"` });
      continue;
    }
    students.push({
      rowNumber: r, full_name: name, class_name: className, section,
      parent_name: parentName, parent_phone: parentPhone,
    });
  }
  return { students, errors };
}

// ───────────────────────────────────────────────────────
// Students — institute: الاسم | المرحلة | المادة | الكروب | ولي الأمر | رقمه
// ───────────────────────────────────────────────────────
export async function parseStudentsInstitute(fileUri: string): Promise<{
  students: ParsedStudent[]; errors: ValidationError[];
}> {
  const rows = await readExcel(fileUri);
  const students: ParsedStudent[] = [];
  const errors: ValidationError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c: any) => !cell(c))) continue;
    const r = i + 1;
    const name = cell(row[0]);
    const level = cell(row[1]);
    const subject = cell(row[2]);
    const group = cell(row[3]);
    const parentName = cell(row[4]);
    const parentPhone = normalizePhone(row[5]);

    if (!name) { errors.push({ row: r, field: 'الاسم', message: 'الاسم مطلوب' }); continue; }
    if (!level) { errors.push({ row: r, field: 'المرحلة', message: `المرحلة مطلوبة للطالب "${name}"` }); continue; }
    if (!subject) { errors.push({ row: r, field: 'المادة', message: `المادة مطلوبة للطالب "${name}"` }); continue; }
    if (!group) { errors.push({ row: r, field: 'الكروب', message: `الكروب مطلوب للطالب "${name}"` }); continue; }
    if (!parentName) { errors.push({ row: r, field: 'ولي الأمر', message: `اسم ولي الأمر مطلوب للطالب "${name}"` }); continue; }
    if (!parentPhone) { errors.push({ row: r, field: 'رقم ولي الأمر', message: `رقم ولي الأمر مطلوب للطالب "${name}"` }); continue; }
    if (!PHONE_RE.test(parentPhone)) {
      errors.push({ row: r, field: 'رقم ولي الأمر', message: `رقم غير صحيح "${parentPhone}" للطالب "${name}"` });
      continue;
    }
    students.push({
      rowNumber: r, full_name: name, level, subject, group,
      parent_name: parentName, parent_phone: parentPhone,
    });
  }
  return { students, errors };
}
