import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

type Row = (string | number)[];

async function writeAndShare(filename: string, headers: Row, rows: Row[]): Promise<void> {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // Auto-size columns based on longest cell per column — prevents Excel from
  // truncating Arabic content behind narrow defaults.
  ws['!cols'] = headers.map((_, colIdx) => {
    const widest = Math.max(
      String(headers[colIdx] ?? '').length,
      ...rows.map(r => String(r[colIdx] ?? '').length),
    );
    return { wch: Math.min(Math.max(widest + 2, 12), 60) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  if (Platform.OS === 'web') {
    // Browser download via Blob + anchor — no native filesystem available.
    const arrayBuf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([arrayBuf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const uri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' as any });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: filename,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

// ───────────────────────────────────────────────────────
// RESULT EXPORTS (created accounts)
// ───────────────────────────────────────────────────────

export async function exportTeacherCodes(
  teachers: Array<{ name: string; code: string; assignments: string; status: string }>,
  institutionName: string,
): Promise<void> {
  const headers = ['الاسم', 'كود الدخول (الباسورد)', 'التكاليف', 'الحالة'];
  const rows = teachers.map(t => [t.name, t.code, t.assignments, t.status]);
  await writeAndShare(`أكواد_الأساتذة_${institutionName}_${stamp()}.xlsx`, headers, rows);
}

export async function exportStudentCodes(
  students: Array<{ name: string; code: string; className: string; status: string }>,
  institutionName: string,
): Promise<void> {
  const headers = ['الاسم', 'كود الدخول (الباسورد)', 'الصف/الشعبة', 'الحالة'];
  const rows = students.map(s => [s.name, s.code, s.className, s.status]);
  await writeAndShare(`أكواد_الطلاب_${institutionName}_${stamp()}.xlsx`, headers, rows);
}

export async function exportParentCodes(
  parents: Array<{ name: string; code: string; children: string; phone: string; status: string }>,
  institutionName: string,
): Promise<void> {
  const headers = ['الاسم', 'كود الدخول (الباسورد)', 'الأبناء', 'رقم الهاتف', 'الحالة'];
  const rows = parents.map(p => [p.name, p.code, p.children, p.phone, p.status]);
  await writeAndShare(`أكواد_أولياء_الأمور_${institutionName}_${stamp()}.xlsx`, headers, rows);
}

// ───────────────────────────────────────────────────────
// BLANK TEMPLATES — downloaded by the admin before filling
// ───────────────────────────────────────────────────────

export async function downloadTeacherTemplate(type: 'school' | 'institute'): Promise<void> {
  if (type === 'school') {
    const headers = ['الاسم', 'المادة', 'الصف', 'الشعبة', 'الرقم'];
    const example = ['أحمد حسن', 'رياضيات', 'الأول', 'أ', '07801234567'];
    await writeAndShare('قالب_الأساتذة_مدرسة.xlsx', headers, [example]);
  } else {
    const headers = ['الاسم', 'المادة', 'المرحلة', 'الكروب', 'الرقم'];
    const example = ['أحمد حسن', 'رياضيات', 'الأول متوسط', 'أ', '07801234567'];
    await writeAndShare('قالب_الأساتذة_معهد.xlsx', headers, [example]);
  }
}

export async function downloadStudentTemplate(type: 'school' | 'institute'): Promise<void> {
  if (type === 'school') {
    const headers = ['الاسم', 'الصف', 'الشعبة', 'اسم ولي الأمر', 'رقم ولي الأمر'];
    const example = ['محمد علي', 'الأول', 'أ', 'علي أحمد', '07801234567'];
    await writeAndShare('قالب_الطلاب_مدرسة.xlsx', headers, [example]);
  } else {
    const headers = ['الاسم', 'المرحلة', 'المادة', 'الكروب', 'اسم ولي الأمر', 'رقم ولي الأمر'];
    const example = ['محمد علي', 'الأول متوسط', 'رياضيات', 'أ', 'علي أحمد', '07801234567'];
    await writeAndShare('قالب_الطلاب_معهد.xlsx', headers, [example]);
  }
}
