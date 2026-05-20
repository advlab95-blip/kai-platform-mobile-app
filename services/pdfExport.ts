import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Alert, Platform } from 'react-native';

// Print.printToFileAsync returns a temp file named with a UUID, which leaks
// into the share sheet as the visible filename. shareWithName copies the temp
// file to a sanitized descriptive name before invoking the share sheet so the
// user sees something like "تقرير-2026-04-30.pdf" instead of "abc-123-uuid.pdf".
async function shareWithName(uri: string, name: string, options: Sharing.SharingOptions) {
  const safe = (name || 'document')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'document';
  const target = `${FileSystem.cacheDirectory ?? ''}${safe}.pdf`;
  try {
    try { await FileSystem.deleteAsync(target, { idempotent: true }); } catch {}
    await FileSystem.copyAsync({ from: uri, to: target });
    await Sharing.shareAsync(target, options);
  } catch {
    await Sharing.shareAsync(uri, options);
  }
}

/** Web fallback: open HTML in new tab for preview/print */
function webPreviewHTML(html: string, title: string) {
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.title = title;
    win.document.close();
  } else {
    Alert.alert('خطأ', 'يرجى السماح بالنوافذ المنبثقة (popups)');
  }
}

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * Generate and share a certificate PDF with template selection
 */
/**
 * Export an AI tool output (generic text content) as a PDF.
 * Used by teacher/(teacher)/ai-tools.tsx for lesson_plan/summarize/activities/translate/report etc.
 */
export async function exportAIToolOutputPDF(data: {
  title: string;
  toolName: string;
  inputText?: string;
  outputText: string;
  teacherName?: string;
}): Promise<void> {
  const { title, toolName, inputText, outputText, teacherName } = data;
  // Basic HTML/CSS for RTL Arabic content
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: 'Amiri', 'Traditional Arabic', serif; direction: rtl; text-align: right; color: #1E293B; line-height: 1.8; }
    .header { border-bottom: 3px solid #7C3AED; padding-bottom: 12px; margin-bottom: 20px; }
    .brand { font-size: 10px; color: #64748B; letter-spacing: 1px; margin-bottom: 4px; }
    .title { font-size: 22px; font-weight: 900; color: #1E293B; margin: 0; }
    .tool { font-size: 12px; color: #7C3AED; font-weight: 700; margin-top: 4px; }
    .teacher { font-size: 11px; color: #64748B; margin-top: 6px; }
    .section { margin-top: 18px; }
    .section-title { font-size: 13px; font-weight: 800; color: #475569; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #E2E8F0; }
    .input-box { background: #F8FAFC; border-right: 3px solid #94A3B8; padding: 10px 14px; font-size: 12px; color: #475569; border-radius: 4px; }
    .output { font-size: 13px; white-space: pre-wrap; }
    .footer { position: fixed; bottom: 10mm; left: 20mm; right: 20mm; font-size: 9px; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">KAI PLATFORM</div>
    <h1 class="title">${escapeHtml(title)}</h1>
    <div class="tool">${escapeHtml(toolName)}</div>
    ${teacherName ? `<div class="teacher">أعدّه: ${escapeHtml(teacherName)}</div>` : ''}
  </div>
  ${inputText ? `<div class="section">
    <div class="section-title">المدخَل</div>
    <div class="input-box">${escapeHtml(inputText)}</div>
  </div>` : ''}
  <div class="section">
    <div class="section-title">النتيجة</div>
    <div class="output">${escapeHtml(outputText)}</div>
  </div>
  <div class="footer">تم التوليد بواسطة منصة كاي — ${new Date().toLocaleDateString('ar-IQ')}</div>
</body>
</html>`;

  try {
    if (Platform.OS === 'web') {
      webPreviewHTML(html, title);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await shareWithName(uri, title, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
    } else {
      Alert.alert('تم', `تم حفظ الملف في: ${uri}`);
    }
  } catch (err: any) {
    Alert.alert('خطأ', err?.message || 'فشل توليد PDF');
  }
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function exportCertificatePDF(cert: {
  title: string;
  studentName: string;
  instituteName: string;
  description?: string;
  verificationCode: string;
  issuedAt: string;
  type?: string;
  templateId?: string;
}) {
  const { generateCertificateHTML } = await import('./certificateTemplates');
  const html = generateCertificateHTML({
    title: cert.title,
    studentName: cert.studentName,
    instituteName: cert.instituteName,
    description: cert.description,
    verificationCode: cert.verificationCode,
    issuedAt: cert.issuedAt,
    type: cert.type || 'completion',
  }, cert.templateId || 'modern');

  try {
    if (Platform.OS === 'web') {
      webPreviewHTML(html, cert.title);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, cert.title, { mimeType: 'application/pdf', dialogTitle: cert.title });
    } else {
      Alert.alert('تم', `تم حفظ الشهادة: ${uri}`);
    }
  } catch (err: any) {
    Alert.alert('خطأ', err.message || 'فشل تصدير PDF');
  }
}

/**
 * Generate and share a timetable PDF
 */
export async function exportSchedulePDF(
  schedule: any[],
  title: string,
  subtitle?: string,
  options?: {
    showClass?: boolean;
    /** Print full grid (rows = periods, cols = days) — recommended for per-class export. */
    gridMode?: boolean;
    /** Institute name shown in the header. */
    instituteName?: string;
    /** Only render these day-of-week ints in grid mode (e.g. school = Sat-Thu). */
    dayKeys?: number[];
    /** Academic year string for the header (e.g. "2026 - 2027"). */
    academicYear?: string;
  },
) {
  const showClass = !!options?.showClass;
  const gridMode = !!options?.gridMode;
  const instituteName = options?.instituteName || '';
  const academicYear = options?.academicYear || '';
  // Default day order (RTL): Sat → Fri. Caller can override (e.g. drop Friday for schools).
  const dayOrder = options?.dayKeys && options.dayKeys.length > 0
    ? options.dayKeys
    : [6, 0, 1, 2, 3, 4, 5];

  // ── Helpers ─────────────────────────────────────────────────
  const initials = (name: string): string => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    // Arabic display: first letter of first two name parts (e.g. "أحمد علي" → "أ.ع")
    if (parts.length >= 2) return `${parts[0].charAt(0)}.${parts[1].charAt(0)}`;
    return parts[0]?.charAt(0) || '';
  };

  // ── Grid layout (per-class export) ───────────────────────────
  // Build a unique sorted list of period start-times so each row maps to a
  // canonical period. This handles non-uniform slot lengths gracefully.
  if (gridMode) {
    const periodStarts = Array.from(
      new Set(schedule.map((s: any) => (s.start_time || '').substring(0, 5)).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    // Index slots by (day, periodStart) for O(1) cell lookup.
    const byCell = new Map<string, any>();
    for (const s of schedule) {
      const day = s.day_of_week ?? 0;
      const st = (s.start_time || '').substring(0, 5);
      byCell.set(`${day}|${st}`, s);
    }

    // Header row: time column + each day.
    const headerHTML = `
      <tr>
        <th class="time-col">الوقت</th>
        ${dayOrder.map((d) => `<th>${DAYS_AR[d]}</th>`).join('')}
      </tr>`;

    // Body rows: one per period.
    const bodyHTML = periodStarts.map((start) => {
      const cells = dayOrder.map((d) => {
        const slot = byCell.get(`${d}|${start}`);
        if (!slot) return `<td class="empty">—</td>`;
        const teacher = slot.users?.full_name || slot.teacher_name || '';
        const subj = slot.subject || '';
        const room = slot.room ? ` · ${slot.room}` : '';
        return `
          <td>
            <div class="subj">${escapeHtml(subj)}</div>
            <div class="tch">${escapeHtml(initials(teacher))}${escapeHtml(room)}</div>
          </td>`;
      }).join('');
      // End time = same period's end (look up from any slot at that time).
      const sampleSlot = dayOrder
        .map((d) => byCell.get(`${d}|${start}`))
        .find(Boolean);
      const end = sampleSlot ? (sampleSlot.end_time || '').substring(0, 5) : '';
      const timeLabel = end ? `${start} - ${end}` : start;
      return `<tr><td class="time-col">${timeLabel}</td>${cells}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Amiri', 'Traditional Arabic', Arial, sans-serif; direction: rtl; color: #1E293B; margin: 0; padding: 0; }
  .header {
    background: linear-gradient(135deg, #020024 0%, #2F2FBA 50%, #00D4FF 100%);
    color: #fff; padding: 16px 22px; border-radius: 12px; margin-bottom: 14px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .header h1 { font-size: 18px; font-weight: 900; margin: 0; }
  .header .sub { font-size: 11px; opacity: 0.9; margin-top: 4px; }
  .header .meta { font-size: 10px; text-align: left; opacity: 0.85; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #4F46E5; color: #fff; padding: 10px 6px; font-size: 12px; font-weight: 800; border: 1px solid #4338CA; }
  td { border: 1px solid #E2E8F0; padding: 8px 6px; vertical-align: top; text-align: center; }
  .time-col { background: #F1F5F9; font-weight: 800; color: #475569; font-size: 11px; width: 110px; }
  .subj { font-size: 12px; font-weight: 800; color: #1E293B; }
  .tch { font-size: 10px; color: #64748B; margin-top: 3px; }
  .empty { color: #CBD5E1; font-size: 14px; }
  .footer { text-align: center; margin-top: 14px; font-size: 9px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 6px; }
</style></head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
    </div>
    <div class="meta">
      ${instituteName ? `<div>${escapeHtml(instituteName)}</div>` : ''}
      ${academicYear ? `<div>${escapeHtml(academicYear)}</div>` : ''}
      <div>${new Date().toLocaleDateString('ar-IQ')}</div>
    </div>
  </div>
  <table>
    ${headerHTML}
    ${bodyHTML}
  </table>
  <div class="footer">منصة كاي — ${new Date().toLocaleDateString('ar-IQ')}</div>
</body>
</html>`;

    try {
      if (Platform.OS === 'web') { webPreviewHTML(html, title); return; }
      // expo-print: A4 landscape = swap width/height (842 × 595 pts).
      const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
      if (await Sharing.isAvailableAsync()) {
        await shareWithName(uri, title, { mimeType: 'application/pdf', dialogTitle: title });
      } else {
        Alert.alert('تم', `تم حفظ الجدول: ${uri}`);
      }
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل تصدير PDF');
    }
    return;
  }

  // ── List layout (institute-wide export — many classes per page) ────
  // Group by day first, then list every slot. Keeps the existing flow for the
  // "كل الصفوف" path where a single grid would be too wide.
  const byDay: Record<number, any[]> = {};
  for (const slot of schedule) {
    const day = slot.day_of_week ?? 0;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(slot);
  }

  const colCount = showClass ? 5 : 4;
  let tableRows = '';
  for (const d of dayOrder) {
    const slots = (byDay[d] || []).sort((a: any, b: any) => (a.start_time || '').localeCompare(b.start_time || ''));
    if (slots.length === 0) continue;
    tableRows += `<tr><td colspan="${colCount}" style="background:#EEF2FF;font-weight:900;color:#1D4ED8;padding:10px;text-align:right;">${DAYS_AR[d]}</td></tr>`;
    for (const s of slots) {
      const time = `${(s.start_time || '').substring(0, 5)} - ${(s.end_time || '').substring(0, 5)}`;
      const teacher = s.users?.full_name || s.teacher_name || '';
      const className = s.classes?.name || s.class_name || '';
      const cancelled = s.status === 'cancelled' ? ' (ملغاة)' : '';
      tableRows += `<tr>
        ${showClass ? `<td style="padding:8px;text-align:center;color:#1E293B;font-weight:700;">${escapeHtml(className)}</td>` : ''}
        <td style="padding:8px;text-align:center;color:#64748B;">${escapeHtml(s.room || '')}</td>
        <td style="padding:8px;text-align:center;color:#64748B;">${escapeHtml(teacher)}</td>
        <td style="padding:8px;text-align:center;font-weight:700;">${time}</td>
        <td style="padding:8px;text-align:right;font-weight:700;color:#1E293B;">${escapeHtml(s.subject)}${cancelled}</td>
      </tr>`;
    }
  }

  const headerCells = showClass
    ? `<th>الصف</th><th>القاعة</th><th>الأستاذ</th><th>الوقت</th><th>المادة</th>`
    : `<th>القاعة</th><th>الأستاذ</th><th>الوقت</th><th>المادة</th>`;

  const html = `
    <html dir="rtl">
    <head><meta charset="utf-8"><style>
      @page { size: A4 landscape; margin: 14mm; }
      body { font-family: Arial, sans-serif; padding: 18px; direction: rtl; color: #1E293B; }
      .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1D4ED8; padding-bottom: 10px; margin-bottom: 16px; }
      .hdr h1 { font-size: 20px; color: #1D4ED8; margin: 0; }
      .hdr .sub { font-size: 12px; color: #64748B; margin-top: 4px; }
      .hdr .meta { font-size: 11px; color: #475569; text-align: left; }
      table { width: 100%; border-collapse: collapse; }
      td, th { border: 1px solid #E2E8F0; }
      th { background: #1D4ED8; color: #fff; padding: 10px; text-align: right; font-size: 12px; }
      .footer { text-align: center; margin-top: 16px; color: #94A3B8; font-size: 10px; border-top: 1px solid #E2E8F0; padding-top: 6px; }
    </style></head>
    <body>
      <div class="hdr">
        <div>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <div class="meta">
          ${instituteName ? `<div>${escapeHtml(instituteName)}</div>` : ''}
          ${academicYear ? `<div>${escapeHtml(academicYear)}</div>` : ''}
          <div>${new Date().toLocaleDateString('ar-IQ')}</div>
        </div>
      </div>
      <table>
        <tr>${headerCells}</tr>
        ${tableRows}
      </table>
      <div class="footer">منصة كاي — ${new Date().toLocaleDateString('ar-IQ')}</div>
    </body>
    </html>
  `;

  try {
    if (Platform.OS === 'web') { webPreviewHTML(html, title); return; }
    // Landscape A4 for the list view too — wider rows read better.
    const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, title, { mimeType: 'application/pdf', dialogTitle: title });
    } else {
      Alert.alert('تم', `تم حفظ الجدول: ${uri}`);
    }
  } catch (err: any) {
    Alert.alert('خطأ', err.message || 'فشل تصدير PDF');
  }
}

/**
 * Generate grades report PDF
 */
export async function exportGradesReportPDF(data: {
  title: string;
  instituteName: string;
  categoryName?: string;
  grades: Array<{ studentName: string; subject: string; score: number; maxScore: number; category?: string }>;
  summary?: { average: number; highest: number; lowest: number; passRate: number; totalStudents: number };
}) {
  const hasCategory = data.grades.some(g => g.category);
  const rows = data.grades.map((g, i) => `
    <tr style="${i % 2 === 0 ? 'background:#F8FAFC;' : ''}">
      <td style="padding:8px;text-align:center;font-size:12px;color:#64748B;">${Math.round((g.score / g.maxScore) * 100)}%</td>
      <td style="padding:8px;text-align:center;font-size:13px;font-weight:700;color:${g.score >= g.maxScore * 0.5 ? '#059669' : '#DC2626'};">${g.score}/${g.maxScore}</td>
      <td style="padding:8px;text-align:right;font-size:13px;color:#374151;">${g.subject}</td>
      ${hasCategory ? `<td style="padding:8px;text-align:right;font-size:12px;color:#64748B;">${g.category || ''}</td>` : ''}
      <td style="padding:8px;text-align:right;font-size:13px;font-weight:700;color:#1E293B;">${g.studentName}</td>
      <td style="padding:8px;text-align:center;font-size:12px;color:#94A3B8;">${i + 1}</td>
    </tr>`).join('');

  const summaryHTML = data.summary ? `
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <div style="flex:1;min-width:100px;background:#EEF2FF;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:900;color:#4F46E5;">${data.summary.totalStudents}</div>
        <div style="font-size:10px;color:#64748B;">عدد الطلاب</div>
      </div>
      <div style="flex:1;min-width:100px;background:#ECFDF5;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:900;color:#059669;">${data.summary.average}%</div>
        <div style="font-size:10px;color:#64748B;">المعدل</div>
      </div>
      <div style="flex:1;min-width:100px;background:#FEF3C7;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:900;color:#B45309;">${data.summary.passRate}%</div>
        <div style="font-size:10px;color:#64748B;">نسبة النجاح</div>
      </div>
      <div style="flex:1;min-width:100px;background:#FEE2E2;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:900;color:#DC2626;">${data.summary.lowest}</div>
        <div style="font-size:10px;color:#64748B;">أقل درجة</div>
      </div>
    </div>` : '';

  const html = `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:20px}*{box-sizing:border-box;font-family:Arial,sans-serif}body{margin:0;padding:20px;background:#fff}
    .hdr{text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #4F46E5}
    .hdr h1{font-size:20px;color:#1E293B;margin:0 0 4px}.hdr h2{font-size:13px;color:#4F46E5;margin:0 0 4px}.hdr p{font-size:10px;color:#94A3B8;margin:0}
    table{width:100%;border-collapse:collapse}th{background:#4F46E5;color:#fff;padding:10px 8px;font-size:11px;font-weight:800}td{border-bottom:1px solid #E2E8F0}
    .ft{text-align:center;margin-top:20px;font-size:9px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px}
  </style></head><body>
    <div class="hdr"><h1>${data.title}</h1><h2>${data.instituteName}</h2>
      ${data.categoryName ? `<p>${data.categoryName}</p>` : ''}
      <p>تاريخ التقرير: ${new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    ${summaryHTML}
    <table><thead><tr><th>النسبة</th><th>الدرجة</th><th>المادة</th>${hasCategory ? '<th>الفئة</th>' : ''}<th>الطالب</th><th>#</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="ft">منصة كاي — تقرير درجات</div>
  </body></html>`;

  try {
    if (Platform.OS === 'web') { webPreviewHTML(html, data.title); return; }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, data.title, { mimeType: 'application/pdf', dialogTitle: data.title });
    }
  } catch (err: any) { Alert.alert('خطأ', err.message || 'فشل تصدير PDF'); }
}

/**
 * Generate analytics report PDF
 */
/**
 * Generate grade report / certificate PDF (new system with themes)
 */
export async function exportGradeReportCertPDF(data: {
  studentName: string;
  instituteName: string;
  className?: string;
  academicYear?: string;
  title?: string;
  description?: string;
  grades?: Array<{ subject: string; score: number; maxScore: number; category?: string }>;
  issuedAt: string;
  type: 'grades' | 'single_subject' | 'excellence' | 'completion' | 'participation' | 'appreciation' | 'behavior' | 'attendance' | 'graduation';
  showEmoji?: boolean;
  themeId: string;
  stampUrl?: string | null;
  signatureUrl?: string | null;
}) {
  const { generateGradeReportHTML } = await import('./gradeReportTemplates');
  const html = generateGradeReportHTML(data, data.themeId);
  const isLandscape = data.type !== 'grades' && data.type !== 'single_subject';

  try {
    if (Platform.OS === 'web') {
      webPreviewHTML(html, data.title || 'شهادة');
      return;
    }
    const { uri } = await Print.printToFileAsync({
      html,
      width: isLandscape ? 842 : 595,
      height: isLandscape ? 595 : 842,
    });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, data.title || 'شهادة', { mimeType: 'application/pdf', dialogTitle: data.title || 'شهادة' });
    } else {
      Alert.alert('تم', `تم حفظ الملف: ${uri}`);
    }
  } catch (err: any) {
    Alert.alert('خطأ', err.message || 'فشل تصدير PDF');
  }
}

/**
 * Generate a comprehensive child report for parents — medical info, attendance summary,
 * grades by subject/category, and any outstanding alerts. Gets KAI branded header + footer
 * so parents have a portable record they can share with tutors, doctors, etc.
 */
export async function exportParentChildReportPDF(data: {
  childName: string;
  instituteName?: string;
  className?: string;
  parentName?: string;
  attendance?: {
    percentage: number;
    present: number;
    absent: number;
    total: number;
  };
  medical?: {
    blood_type?: string;
    blood_pressure?: string;
    sugar_level?: string;
    allergies?: string;
    chronic_conditions?: string;
  } | null;
  grades?: Array<{
    subject: string;
    categoryName: string;
    score: number;
    maxScore: number;
    date?: string;
  }>;
}): Promise<void> {
  const { childName, instituteName, className, parentName, attendance, medical, grades } = data;
  const safe = (v: any) => escapeHtml(String(v ?? ''));
  const dateStr = new Date().toLocaleDateString('ar-IQ');

  // Section builders — each one renders only if it has real data, keeping sparse reports short.
  const sections: string[] = [];

  if (attendance && attendance.total > 0) {
    const pctColor = attendance.percentage >= 85 ? '#059669' : attendance.percentage >= 75 ? '#F59E0B' : '#DC2626';
    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#3B82F6;border-color:#3B82F6;">📅 الحضور</div>
        <div class="attendance-grid">
          <div class="stat-box" style="background:${pctColor}15;border-color:${pctColor}40;">
            <div class="stat-val" style="color:${pctColor};">${attendance.percentage}%</div>
            <div class="stat-lbl">نسبة الحضور</div>
          </div>
          <div class="stat-box" style="background:#ECFDF5;border-color:#A7F3D0;">
            <div class="stat-val" style="color:#059669;">${attendance.present}</div>
            <div class="stat-lbl">حاضر</div>
          </div>
          <div class="stat-box" style="background:#FEE2E2;border-color:#FECACA;">
            <div class="stat-val" style="color:#DC2626;">${attendance.absent}</div>
            <div class="stat-lbl">غائب</div>
          </div>
          <div class="stat-box" style="background:#F1F5F9;border-color:#E2E8F0;">
            <div class="stat-val" style="color:#64748B;">${attendance.total}</div>
            <div class="stat-lbl">إجمالي الأيام</div>
          </div>
        </div>
      </div>`);
  }

  if (grades && grades.length > 0) {
    // Group by subject so the report reads naturally: subject → categories → scores
    const bySubject: Record<string, typeof grades> = {};
    for (const g of grades) {
      if (!bySubject[g.subject]) bySubject[g.subject] = [];
      bySubject[g.subject].push(g);
    }

    const subjectBlocks = Object.entries(bySubject).map(([subject, items]) => {
      const avgPct = Math.round(
        items.reduce((a, g) => a + (g.score / Math.max(1, g.maxScore)) * 100, 0) / items.length
      );
      const avgColor = avgPct >= 70 ? '#059669' : avgPct >= 50 ? '#B45309' : '#DC2626';
      const rows = items.map((g) => {
        const pct = Math.round((g.score / Math.max(1, g.maxScore)) * 100);
        const rowColor = pct >= 50 ? '#059669' : '#DC2626';
        return `
          <tr>
            <td style="padding:8px 10px;font-size:11px;color:#64748B;">${g.date ? safe(g.date) : ''}</td>
            <td style="padding:8px 10px;font-size:11px;color:${rowColor};font-weight:700;text-align:center;">${pct}%</td>
            <td style="padding:8px 10px;font-size:11px;font-weight:700;text-align:center;color:#1E293B;">${g.score}/${g.maxScore}</td>
            <td style="padding:8px 10px;font-size:11px;text-align:right;color:#1E293B;">${safe(g.categoryName)}</td>
          </tr>`;
      }).join('');
      return `
        <div class="subject-block">
          <div class="subject-header">
            <span class="subject-avg" style="background:${avgColor}15;color:${avgColor};">${avgPct}%</span>
            <span class="subject-name">${safe(subject)}</span>
          </div>
          <table class="grade-table">
            <thead>
              <tr>
                <th style="padding:8px 10px;font-size:10px;color:#64748B;">التاريخ</th>
                <th style="padding:8px 10px;font-size:10px;color:#64748B;">النسبة</th>
                <th style="padding:8px 10px;font-size:10px;color:#64748B;">الدرجة</th>
                <th style="padding:8px 10px;font-size:10px;color:#64748B;text-align:right;">الفئة</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#7C3AED;border-color:#7C3AED;">📊 الدرجات</div>
        ${subjectBlocks}
      </div>`);
  }

  if (medical) {
    const hasAny = medical.blood_type || medical.blood_pressure || medical.sugar_level
      || medical.allergies || medical.chronic_conditions;
    if (hasAny) {
      sections.push(`
        <div class="section">
          <div class="section-title" style="color:#DC2626;border-color:#DC2626;">🏥 السجل الطبي</div>
          <div class="medical-grid">
            ${medical.blood_type ? `<div class="med-row"><span class="med-label">فصيلة الدم</span><span class="med-value">${safe(medical.blood_type)}</span></div>` : ''}
            ${medical.blood_pressure ? `<div class="med-row"><span class="med-label">ضغط الدم</span><span class="med-value">${safe(medical.blood_pressure)}</span></div>` : ''}
            ${medical.sugar_level ? `<div class="med-row"><span class="med-label">مستوى السكر</span><span class="med-value">${safe(medical.sugar_level)}</span></div>` : ''}
            ${medical.allergies ? `<div class="med-row"><span class="med-label">الحساسيات</span><span class="med-value">${safe(medical.allergies)}</span></div>` : ''}
            ${medical.chronic_conditions ? `<div class="med-row"><span class="med-label">الأمراض المزمنة</span><span class="med-value">${safe(medical.chronic_conditions)}</span></div>` : ''}
          </div>
        </div>`);
    }
  }

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8" /><title>تقرير ${safe(childName)}</title>
<style>
  @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Amiri', 'Traditional Arabic', 'Arial', serif;
    direction: rtl; text-align: right; color: #1E293B;
    line-height: 1.7; margin: 0; padding: 0;
  }

  .kai-header {
    background: linear-gradient(135deg, #020024 0%, #2F2FBA 50%, #00D4FF 100%);
    color: #fff; padding: 22px 26px; border-radius: 14px; margin-bottom: 18px;
  }
  .kai-brand {
    font-size: 10px; letter-spacing: 4px; font-weight: 700;
    color: rgba(255,255,255,0.7); margin-bottom: 8px;
  }
  .kai-title { font-size: 24px; font-weight: 900; margin: 0; line-height: 1.3; }
  .kai-meta {
    display: flex; gap: 14px; margin-top: 10px; flex-wrap: wrap;
    font-size: 11px; color: rgba(255,255,255,0.9);
  }
  .kai-meta-item {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.15); padding: 3px 10px; border-radius: 20px;
  }

  .section { margin-top: 18px; page-break-inside: avoid; }
  .section-title {
    font-size: 14px; font-weight: 900; color: #7C3AED;
    padding: 6px 12px 6px 0; margin-bottom: 10px;
    border-right: 4px solid #7C3AED; background: #FAFBFC;
  }

  .attendance-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  }
  .stat-box {
    border: 1px solid; border-radius: 10px; padding: 12px;
    text-align: center;
  }
  .stat-val { font-size: 22px; font-weight: 900; }
  .stat-lbl { font-size: 10px; color: #64748B; margin-top: 4px; }

  .subject-block {
    background: #fff; border: 1px solid #E2E8F0;
    border-radius: 10px; padding: 12px 14px; margin-bottom: 10px;
  }
  .subject-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px; padding-bottom: 8px;
    border-bottom: 1px solid #F1F5F9;
  }
  .subject-name { font-size: 13px; font-weight: 900; color: #1E293B; }
  .subject-avg {
    font-size: 12px; font-weight: 800;
    padding: 3px 10px; border-radius: 8px;
  }
  .grade-table {
    width: 100%; border-collapse: collapse;
  }
  .grade-table th { background: #F8FAFC; text-align: center; }
  .grade-table td { border-bottom: 1px solid #F1F5F9; }
  .grade-table tr:last-child td { border-bottom: none; }

  .medical-grid { display: flex; flex-direction: column; gap: 6px; }
  .med-row {
    display: flex; justify-content: space-between;
    padding: 8px 12px; background: #FEF2F2;
    border-radius: 8px; border: 1px solid #FECACA;
  }
  .med-label { font-size: 11px; color: #991B1B; }
  .med-value { font-size: 12px; font-weight: 800; color: #1E293B; }

  .kai-footer {
    position: fixed; bottom: 6mm; left: 15mm; right: 15mm;
    border-top: 2px solid #E2E8F0; padding-top: 6px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9px; color: #94A3B8;
  }
  .kai-footer-brand { font-weight: 900; color: #7C3AED; letter-spacing: 2px; }
  .kai-footer-right { color: #64748B; }

  .watermark {
    position: fixed; top: 40%; left: 0; right: 0;
    font-size: 72px; font-weight: 900; color: rgba(124, 58, 237, 0.04);
    text-align: center; transform: rotate(-25deg);
    z-index: -1; letter-spacing: 20px;
    pointer-events: none;
  }

  .empty-msg {
    background: #F8FAFC; border: 1px solid #E2E8F0;
    border-radius: 10px; padding: 14px;
    text-align: center; color: #64748B; font-size: 12px;
  }
</style></head>
<body>
  <div class="watermark">KAI PLATFORM</div>

  <div class="kai-header">
    <div class="kai-brand">KAI · منصّة التعليم الذكيّة</div>
    <h1 class="kai-title">تقرير الطالب: ${safe(childName)}</h1>
    <div class="kai-meta">
      ${className ? `<span class="kai-meta-item">🎓 ${safe(className)}</span>` : ''}
      ${instituteName ? `<span class="kai-meta-item">🏫 ${safe(instituteName)}</span>` : ''}
      ${parentName ? `<span class="kai-meta-item">👨‍👩‍👧 ${safe(parentName)}</span>` : ''}
      <span class="kai-meta-item">📅 ${safe(dateStr)}</span>
    </div>
  </div>

  ${sections.length === 0
    ? `<div class="empty-msg">لا توجد بيانات لإدراجها في التقرير حالياً.</div>`
    : sections.join('')}

  <div class="kai-footer">
    <div class="kai-footer-brand">KAI PLATFORM</div>
    <div class="kai-footer-right">
      © ${new Date().getFullYear()} جميع الحقوق محفوظة — منصّة كاي التعليمية
    </div>
  </div>
</body></html>`;

  try {
    if (Platform.OS === 'web') {
      webPreviewHTML(html, `تقرير ${childName}`);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, `تقرير ${childName}`, {
        mimeType: 'application/pdf',
        dialogTitle: `تقرير ${childName}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('تم', `تم حفظ الملف في: ${uri}`);
    }
  } catch (err: any) {
    Alert.alert('خطأ', err?.message || 'فشل توليد PDF');
  }
}

export async function exportAnalyticsReportPDF(data: {
  title: string;
  instituteName: string;
  stats: { label: string; value: string }[];
  sections: Array<{ title: string; rows: Array<{ label: string; value: string }> }>;
}) {
  const statsHTML = data.stats.map(s => `
    <div style="flex:1;min-width:100px;background:#F8FAFC;border-radius:12px;padding:16px;text-align:center;border:1px solid #E2E8F0;">
      <div style="font-size:24px;font-weight:900;color:#4F46E5;">${s.value}</div>
      <div style="font-size:10px;color:#94A3B8;margin-top:4px;">${s.label}</div>
    </div>`).join('');

  const sectionsHTML = data.sections.map(sec => `
    <div style="margin-bottom:20px;">
      <h3 style="font-size:14px;color:#4F46E5;border-bottom:2px solid #EEF2FF;padding-bottom:6px;margin-bottom:10px;">${sec.title}</h3>
      ${sec.rows.map((r, i) => `
        <div style="display:flex;justify-content:space-between;padding:8px 4px;${i % 2 === 0 ? 'background:#F8FAFC;' : ''}border-radius:4px;">
          <span style="font-size:13px;font-weight:800;color:#1E293B;">${r.value}</span>
          <span style="font-size:12px;color:#64748B;">${r.label}</span>
        </div>`).join('')}
    </div>`).join('');

  const html = `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:20px}*{box-sizing:border-box;font-family:Arial,sans-serif}body{margin:0;padding:20px;background:#fff}
    .hdr{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #4F46E5}
    .hdr h1{font-size:20px;color:#1E293B;margin:0 0 4px}.hdr h2{font-size:13px;color:#4F46E5;margin:0 0 8px}
    .ft{text-align:center;margin-top:24px;font-size:9px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px}
  </style></head><body>
    <div class="hdr"><h1>${data.title}</h1><h2>${data.instituteName}</h2>
      <p style="font-size:10px;color:#94A3B8;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">${statsHTML}</div>
    ${sectionsHTML}
    <div class="ft">منصة كاي — تقرير تحليلي شامل</div>
  </body></html>`;

  try {
    if (Platform.OS === 'web') { webPreviewHTML(html, data.title); return; }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, data.title, { mimeType: 'application/pdf', dialogTitle: data.title });
    }
  } catch (err: any) { Alert.alert('خطأ', err.message || 'فشل تصدير PDF'); }
}


/**
 * Generate and display a payment receipt PDF
 */
export async function exportReceiptPDF(data: {
  receiptNo: string; studentName: string; instituteName: string;
  amount: number; currency?: string; paymentDate: string;
  description?: string; paidBy?: string;
}) {
  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;padding:40px;direction:rtl;max-width:600px;margin:0 auto}
  .hd{text-align:center;border-bottom:3px solid #2F2FBA;padding-bottom:20px;margin-bottom:20px}
  .hd h1{color:#2F2FBA;margin:0;font-size:24px}.hd p{color:#64748B;margin:4px 0}
  .rn{background:#EEF2FF;padding:8px 16px;border-radius:8px;display:inline-block;font-weight:bold;color:#4F46E5}
  .row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #E2E8F0}
  .lb{color:#64748B}.vl{font-weight:bold;color:#1E293B}
  .amt{font-size:28px;color:#059669;text-align:center;margin:24px 0;font-weight:900}
  .ft{text-align:center;margin-top:30px;color:#94A3B8;font-size:11px}
</style></head><body>
  <div class="hd"><h1>\${data.instituteName}</h1><p>إيصال دفع</p><div class="rn">رقم: \${data.receiptNo}</div></div>
  <div class="amt">\${data.amount.toLocaleString()} \${data.currency || "د.ع"}</div>
  <div class="row"><span class="lb">الطالب</span><span class="vl">\${data.studentName}</span></div>
  <div class="row"><span class="lb">التاريخ</span><span class="vl">\${new Date(data.paymentDate).toLocaleDateString("ar-IQ")}</span></div>
  \${data.description ? \`<div class="row"><span class="lb">الوصف</span><span class="vl">\${data.description}</span></div>\` : ""}
  <div class="ft">منصة كاي — إيصال إلكتروني</div>
</body></html>`;
  try {
    if (Platform.OS === "web") { webPreviewHTML(html, "إيصال دفع"); return; }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, "إيصال دفع", { mimeType: "application/pdf", dialogTitle: "إيصال دفع" });
    }
  } catch (err: any) { Alert.alert("خطأ", err.message || "فشل تصدير الإيصال"); }
}

/**
 * Export an AI-generated lesson as a richly-formatted PDF — all sections (objectives,
 * summary, concepts, infographics, quiz, flashcards, FAQ, examples, etc.) rendered with
 * KAI branding header/footer and copyright watermark on every page.
 */
export async function exportAILessonPDF(data: {
  title: string;
  teacherName?: string;
  instituteName?: string;
  createdAt?: string;
  lesson: {
    objectives?: string[];
    summary?: string;
    concepts?: Array<{ term?: string; definition?: string; label?: string; description?: string }>;
    mindMap?: any;
    infographics?: Array<{ title?: string; caption?: string; svg?: string; imagePrompt?: string }>;
    quiz?: Array<{ question?: string; options?: string[]; correctIndex?: number; explanation?: string }>;
    quizLegacy?: string[];
    flashcards?: Array<{ front?: string; back?: string } | string>;
    flashcardsLegacy?: string[];
    faq?: Array<{ question?: string; answer?: string }>;
    examples?: string[];
    keyStats?: Array<{ label?: string; value?: string }>;
    furtherReading?: string[];
  };
}): Promise<void> {
  const { title, teacherName, instituteName, createdAt, lesson } = data;
  const safe = (v: any) => escapeHtml(String(v ?? ''));
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('ar-IQ')
    : new Date().toLocaleDateString('ar-IQ');

  // Each section renders only if data exists — keeps the PDF short for sparse lessons.
  const sections: string[] = [];

  if (Array.isArray(lesson.objectives) && lesson.objectives.length > 0) {
    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#3B82F6;border-color:#3B82F6;">🎯 أهداف التعلّم</div>
        <ul class="bullet-list">
          ${lesson.objectives.map((o) => `<li>${safe(o)}</li>`).join('')}
        </ul>
      </div>`);
  }

  if (lesson.summary) {
    sections.push(`
      <div class="section">
        <div class="section-title">📝 الملخّص العميق</div>
        <div class="summary-box">${safe(lesson.summary)}</div>
      </div>`);
  }

  if (Array.isArray(lesson.keyStats) && lesson.keyStats.length > 0) {
    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#F59E0B;border-color:#F59E0B;">📊 أرقام مفتاحية</div>
        <div class="stats-grid">
          ${lesson.keyStats.map((s) => `
            <div class="stat-box">
              <div class="stat-val">${safe(s?.value)}</div>
              <div class="stat-lbl">${safe(s?.label)}</div>
            </div>`).join('')}
        </div>
      </div>`);
  }

  if (Array.isArray(lesson.concepts) && lesson.concepts.length > 0) {
    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#EC4899;border-color:#EC4899;">🔑 المفاهيم الرئيسية</div>
        ${lesson.concepts.map((c) => `
          <div class="concept">
            <div class="concept-term">${safe(c?.term || c?.label)}</div>
            <div class="concept-def">${safe(c?.definition || c?.description)}</div>
          </div>`).join('')}
      </div>`);
  }

  if (Array.isArray(lesson.quiz) && lesson.quiz.length > 0) {
    sections.push(`
      <div class="section page-break">
        <div class="section-title" style="color:#F59E0B;border-color:#F59E0B;">🧠 كويز تفاعلي</div>
        ${lesson.quiz.map((q, i) => {
          const opts = Array.isArray(q?.options) ? q.options : [];
          const optsHtml = opts.map((opt, oi) => {
            const isCorrect = oi === q?.correctIndex;
            return `<div class="quiz-opt ${isCorrect ? 'correct' : ''}">
              ${String.fromCharCode(65 + oi)}. ${safe(opt)} ${isCorrect ? '<span class="correct-badge">✓ الإجابة الصحيحة</span>' : ''}
            </div>`;
          }).join('');
          return `
            <div class="quiz-q">
              <div class="quiz-q-text">${i + 1}. ${safe(q?.question)}</div>
              ${optsHtml}
              ${q?.explanation ? `<div class="explain">💡 ${safe(q.explanation)}</div>` : ''}
            </div>`;
        }).join('')}
      </div>`);
  } else if (Array.isArray(lesson.quizLegacy) && lesson.quizLegacy.length > 0) {
    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#F59E0B;border-color:#F59E0B;">🧠 أسئلة</div>
        <ol class="bullet-list">
          ${lesson.quizLegacy.map((q) => `<li>${safe(q)}</li>`).join('')}
        </ol>
      </div>`);
  }

  if (Array.isArray(lesson.examples) && lesson.examples.length > 0) {
    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#10B981;border-color:#10B981;">💡 أمثلة تطبيقية</div>
        <ul class="bullet-list">
          ${lesson.examples.map((e) => `<li>${safe(e)}</li>`).join('')}
        </ul>
      </div>`);
  }

  if (Array.isArray(lesson.faq) && lesson.faq.length > 0) {
    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#8B5CF6;border-color:#8B5CF6;">❓ أسئلة شائعة</div>
        ${lesson.faq.map((f) => `
          <div class="faq">
            <div class="faq-q">❓ ${safe(f?.question)}</div>
            <div class="faq-a">${safe(f?.answer)}</div>
          </div>`).join('')}
      </div>`);
  }

  if (Array.isArray(lesson.furtherReading) && lesson.furtherReading.length > 0) {
    sections.push(`
      <div class="section">
        <div class="section-title" style="color:#6366F1;border-color:#6366F1;">📚 للتعمّق أكثر</div>
        <ul class="bullet-list">
          ${lesson.furtherReading.map((r) => `<li>${safe(r)}</li>`).join('')}
        </ul>
      </div>`);
  }

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8" /><title>${safe(title)}</title>
<style>
  @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Amiri', 'Traditional Arabic', 'Arial', serif;
    direction: rtl; text-align: right; color: #1E293B;
    line-height: 1.75; margin: 0; padding: 0;
  }

  /* KAI branded header */
  .kai-header {
    background: linear-gradient(135deg, #020024 0%, #2F2FBA 50%, #00D4FF 100%);
    color: #fff; padding: 22px 26px; border-radius: 14px; margin-bottom: 18px;
  }
  .kai-brand {
    font-size: 10px; letter-spacing: 4px; font-weight: 700;
    color: rgba(255,255,255,0.7); margin-bottom: 8px;
  }
  .kai-title {
    font-size: 24px; font-weight: 900; margin: 0; line-height: 1.3;
  }
  .kai-meta {
    display: flex; gap: 14px; margin-top: 10px; flex-wrap: wrap;
    font-size: 11px; color: rgba(255,255,255,0.9);
  }
  .kai-meta-item {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.15); padding: 3px 10px; border-radius: 20px;
  }

  /* Sections */
  .section { margin-top: 18px; page-break-inside: avoid; }
  .section.page-break { page-break-before: auto; }
  .section-title {
    font-size: 14px; font-weight: 900; color: #7C3AED;
    padding: 6px 12px 6px 0; margin-bottom: 10px;
    border-right: 4px solid #7C3AED;
    background: #FAFBFC;
  }

  ul.bullet-list, ol.bullet-list {
    padding-right: 20px; margin: 0; list-style: none;
  }
  ul.bullet-list li, ol.bullet-list li {
    position: relative; padding-right: 18px; padding-bottom: 6px;
    font-size: 12px; color: #334155;
  }
  ul.bullet-list li::before {
    content: '▪'; position: absolute; right: 0; color: #7C3AED; font-weight: 900;
  }
  ol.bullet-list { counter-reset: item; }
  ol.bullet-list li { counter-increment: item; }
  ol.bullet-list li::before {
    content: counter(item) '.'; position: absolute; right: 0;
    color: #7C3AED; font-weight: 900;
  }

  .summary-box {
    background: #F5F3FF; border-right: 4px solid #7C3AED;
    padding: 12px 16px; border-radius: 8px; font-size: 12.5px; line-height: 2;
  }

  .stats-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .stat-box {
    flex: 1; min-width: 110px; background: #FFFBEB;
    border: 1px solid #FDE68A; border-radius: 10px;
    padding: 12px; text-align: center;
  }
  .stat-val { font-size: 22px; font-weight: 900; color: #B45309; }
  .stat-lbl { font-size: 10px; color: #92400E; margin-top: 4px; }

  .concept {
    background: #FDF2F8; border: 1px solid #FBCFE8;
    border-radius: 10px; padding: 10px 14px; margin-bottom: 8px;
  }
  .concept-term { font-size: 13px; font-weight: 900; color: #BE185D; margin-bottom: 4px; }
  .concept-def { font-size: 11.5px; color: #334155; line-height: 1.7; }

  .infographic {
    background: #fff; border: 1px solid #BFDBFE; border-radius: 12px;
    padding: 14px; margin-bottom: 12px; text-align: center;
    page-break-inside: avoid;
  }
  .infographic-title { font-size: 12px; font-weight: 800; color: #1D4ED8; margin-bottom: 8px; }
  .infographic-media { width: 100%; max-width: 480px; margin: 0 auto; }
  .infographic-media svg, .infographic-media img { width: 100%; height: auto; max-height: 360px; object-fit: contain; }
  .infographic-caption { font-size: 10px; color: #64748B; margin-top: 6px; font-style: italic; }

  .quiz-q {
    background: #fff; border: 1px solid #E2E8F0; border-radius: 10px;
    padding: 12px 14px; margin-bottom: 10px; page-break-inside: avoid;
  }
  .quiz-q-text { font-size: 13px; font-weight: 800; color: #1E293B; margin-bottom: 8px; }
  .quiz-opt {
    background: #F8FAFC; padding: 7px 11px; border-radius: 6px;
    font-size: 12px; color: #334155; margin-bottom: 4px;
    border: 1px solid #E2E8F0;
  }
  .quiz-opt.correct {
    background: #ECFDF5; border-color: #10B981; color: #065F46; font-weight: 700;
  }
  .correct-badge {
    background: #10B981; color: #fff; font-size: 10px;
    padding: 2px 8px; border-radius: 10px; margin-right: 6px;
  }
  .explain {
    background: #EEF2FF; border-right: 3px solid #6366F1;
    padding: 7px 11px; border-radius: 6px;
    font-size: 11.5px; color: #4338CA; margin-top: 7px;
  }

  .flashcards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .flashcard-pair {
    background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 10px;
    padding: 10px 12px; page-break-inside: avoid;
  }
  .flash-front { font-size: 12px; font-weight: 800; color: #0369A1; margin-bottom: 6px; }
  .flash-back {
    font-size: 11px; color: #334155; padding-top: 6px;
    border-top: 1px dashed #BAE6FD; line-height: 1.7;
  }

  .faq {
    background: #F5F3FF; border: 1px solid #DDD6FE; border-radius: 10px;
    padding: 10px 14px; margin-bottom: 8px;
  }
  .faq-q { font-size: 12px; font-weight: 900; color: #6D28D9; margin-bottom: 4px; }
  .faq-a { font-size: 11.5px; color: #334155; line-height: 1.7; }

  /* KAI footer — runs on every page */
  .kai-footer {
    position: fixed; bottom: 6mm; left: 15mm; right: 15mm;
    border-top: 2px solid #E2E8F0; padding-top: 6px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9px; color: #94A3B8;
  }
  .kai-footer-brand { font-weight: 900; color: #7C3AED; letter-spacing: 2px; }
  .kai-footer-right { color: #64748B; }

  /* Subtle diagonal watermark on every page */
  .watermark {
    position: fixed; top: 40%; left: 0; right: 0;
    font-size: 72px; font-weight: 900; color: rgba(124, 58, 237, 0.04);
    text-align: center; transform: rotate(-25deg);
    z-index: -1; letter-spacing: 20px;
    pointer-events: none;
  }
</style></head>
<body>
  <div class="watermark">KAI PLATFORM</div>

  <div class="kai-header">
    <div class="kai-brand">KAI · منصّة التعليم الذكيّة</div>
    <h1 class="kai-title">${safe(title)}</h1>
    <div class="kai-meta">
      ${teacherName ? `<span class="kai-meta-item">👨‍🏫 ${safe(teacherName)}</span>` : ''}
      ${instituteName ? `<span class="kai-meta-item">🏫 ${safe(instituteName)}</span>` : ''}
      <span class="kai-meta-item">📅 ${safe(dateStr)}</span>
      <span class="kai-meta-item">✨ مولَّد بالذكاء الاصطناعي</span>
    </div>
  </div>

  ${sections.join('')}

  <div class="kai-footer">
    <div class="kai-footer-brand">KAI PLATFORM</div>
    <div class="kai-footer-right">
      © ${new Date().getFullYear()} جميع الحقوق محفوظة — منصّة كاي التعليمية
    </div>
  </div>
</body></html>`;

  try {
    if (Platform.OS === 'web') {
      webPreviewHTML(html, title);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, title, {
        mimeType: 'application/pdf',
        dialogTitle: title,
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('تم', `تم حفظ الملف في: ${uri}`);
    }
  } catch (err: any) {
    Alert.alert('خطأ', err?.message || 'فشل توليد PDF');
  }
}

// Monthly AI usage report PDF — per-institute breakdown with totals, feature/role splits,
// top users, and a daily timeline bar chart. Branded with KAI header/footer + watermark.
export async function exportAIUsageReportPDF(data: {
  instituteName: string;
  year: number;
  month: number;
  totals: {
    total_requests: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
    total_cost_iqd: number;
    total_savings_usd: number;
    cached_requests: number;
  };
  byFeature: Record<string, { requests: number; cost_usd: number; input_tokens: number; output_tokens: number }>;
  byRole: Record<string, { requests: number; cost_usd: number }>;
  topUsers: Array<{ user_id: string; user_name?: string; user_role: string; requests: number; cost: number }>;
  timeline: Array<{ day: string; requests: number; cost: number }>;
}): Promise<void> {
  const { instituteName, year, month, totals, byFeature, byRole, topUsers, timeline } = data;
  const safe = (v: any) => escapeHtml(String(v ?? ''));
  const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const monthLabel = `${MONTHS_AR[month - 1]} ${year}`;

  const FEATURE_LABELS: Record<string, string> = {
    chat: 'محادثة AI',
    summary: 'ملخصات',
    quiz: 'توليد أسئلة',
    study_guide: 'دليل مذاكرة',
    mindmap: 'خرائط ذهنية',
    general: 'عام',
  };
  const ROLE_LABELS: Record<string, string> = {
    student: 'الطلاب',
    teacher: 'الأساتذة',
    parent: 'أولياء الأمور',
    admin: 'الإدارة',
  };

  const savingsPct = totals.total_cost_usd > 0
    ? Math.round((totals.total_savings_usd / (totals.total_cost_usd + totals.total_savings_usd)) * 100)
    : 0;
  const cachedPct = totals.total_requests > 0
    ? Math.round((totals.cached_requests / totals.total_requests) * 100)
    : 0;

  const featureRows = Object.entries(byFeature).map(([key, v]) => {
    const label = FEATURE_LABELS[key] || key;
    return `<tr>
      <td class="num">${v.output_tokens.toLocaleString('ar-IQ')}</td>
      <td class="num">${v.input_tokens.toLocaleString('ar-IQ')}</td>
      <td class="num cost">$${Number(v.cost_usd).toFixed(4)}</td>
      <td class="num">${v.requests.toLocaleString('ar-IQ')}</td>
      <td class="name">${safe(label)}</td>
    </tr>`;
  }).join('');

  const roleRows = Object.entries(byRole).map(([key, v]) => {
    const label = ROLE_LABELS[key] || key;
    return `<tr>
      <td class="num cost">$${Number(v.cost_usd).toFixed(4)}</td>
      <td class="num">${v.requests.toLocaleString('ar-IQ')}</td>
      <td class="name">${safe(label)}</td>
    </tr>`;
  }).join('');

  const topUserRows = (topUsers || []).map((u, i) => `
    <tr>
      <td class="num cost">$${Number(u.cost).toFixed(4)}</td>
      <td class="num">${u.requests.toLocaleString('ar-IQ')}</td>
      <td class="name">${safe(ROLE_LABELS[u.user_role] || u.user_role)}</td>
      <td class="name">${safe(u.user_name || u.user_id.slice(0, 8))}</td>
      <td class="rank">${i + 1}</td>
    </tr>`).join('');

  // Timeline as horizontal bars. Scale each bar by max requests.
  const maxReq = Math.max(1, ...timeline.map(t => t.requests));
  const timelineBars = timeline.map(t => {
    const pct = Math.round((t.requests / maxReq) * 100);
    const dayLabel = new Date(t.day).toLocaleDateString('ar-IQ', { day: '2-digit', month: '2-digit' });
    return `
      <div class="bar-row">
        <div class="bar-label">${safe(dayLabel)}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%"></div>
          <span class="bar-val">${t.requests}</span>
        </div>
        <div class="bar-cost">$${Number(t.cost).toFixed(3)}</div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8" /><title>تقرير AI — ${safe(instituteName)} — ${monthLabel}</title>
<style>
  @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Amiri', 'Traditional Arabic', 'Arial', serif;
    direction: rtl; text-align: right; color: #1E293B;
    line-height: 1.7; margin: 0; padding: 0;
  }
  .kai-header {
    background: linear-gradient(135deg, #4C1D95 0%, #7C3AED 50%, #A78BFA 100%);
    color: #fff; padding: 22px 26px; border-radius: 14px; margin-bottom: 18px;
  }
  .kai-brand { font-size: 10px; letter-spacing: 4px; font-weight: 700; color: rgba(255,255,255,0.7); margin-bottom: 8px; }
  .kai-title { font-size: 22px; font-weight: 900; margin: 0; line-height: 1.3; }
  .kai-meta { display: flex; gap: 14px; margin-top: 10px; flex-wrap: wrap; font-size: 11px; color: rgba(255,255,255,0.95); }
  .kai-meta-item { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.15); padding: 3px 10px; border-radius: 20px; }

  .section { margin-top: 18px; page-break-inside: avoid; }
  .section-title { font-size: 14px; font-weight: 900; color: #7C3AED; padding: 6px 12px 6px 0; margin-bottom: 10px; border-right: 4px solid #7C3AED; background: #FAFBFC; }

  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .stat-box { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px; text-align: center; }
  .stat-val { font-size: 20px; font-weight: 900; color: #7C3AED; }
  .stat-lbl { font-size: 10px; color: #64748B; margin-top: 4px; font-weight: 700; }
  .stat-box.green .stat-val { color: #059669; }
  .stat-box.blue .stat-val { color: #2563EB; }
  .stat-box.amber .stat-val { color: #B45309; }

  table.data { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; border: 1px solid #E2E8F0; }
  table.data th { background: #F5F3FF; color: #6D28D9; font-size: 11px; font-weight: 900; padding: 8px 10px; text-align: center; }
  table.data th.name { text-align: right; }
  table.data td { padding: 8px 10px; font-size: 11.5px; color: #334155; border-top: 1px solid #F1F5F9; }
  table.data td.num { text-align: center; font-weight: 700; }
  table.data td.name { text-align: right; font-weight: 800; color: #1E293B; }
  table.data td.rank { text-align: center; color: #94A3B8; font-weight: 900; font-size: 12px; }
  table.data td.cost { color: #059669; }

  .bar-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .bar-label { width: 60px; font-size: 10px; color: #64748B; font-weight: 700; text-align: left; }
  .bar-track { flex: 1; background: #F1F5F9; height: 18px; border-radius: 9px; position: relative; overflow: hidden; }
  .bar-fill { background: linear-gradient(90deg, #7C3AED 0%, #A78BFA 100%); height: 100%; border-radius: 9px; }
  .bar-val { position: absolute; top: 0; right: 8px; line-height: 18px; font-size: 10px; font-weight: 800; color: #1E293B; }
  .bar-cost { width: 60px; font-size: 10px; color: #059669; font-weight: 700; text-align: center; }

  .kai-footer { position: fixed; bottom: 6mm; left: 15mm; right: 15mm; border-top: 2px solid #E2E8F0; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94A3B8; }
  .kai-footer-brand { font-weight: 900; color: #7C3AED; letter-spacing: 2px; }
  .watermark { position: fixed; top: 40%; left: 0; right: 0; font-size: 72px; font-weight: 900; color: rgba(124, 58, 237, 0.04); text-align: center; transform: rotate(-25deg); z-index: -1; letter-spacing: 20px; pointer-events: none; }

  .empty { background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 10px; padding: 14px; text-align: center; color: #64748B; font-size: 12px; }
</style></head>
<body>
  <div class="watermark">KAI PLATFORM</div>

  <div class="kai-header">
    <div class="kai-brand">KAI · تقرير استهلاك الذكاء الاصطناعي</div>
    <h1 class="kai-title">${safe(instituteName)}</h1>
    <div class="kai-meta">
      <span class="kai-meta-item">📅 ${safe(monthLabel)}</span>
      <span class="kai-meta-item">🤖 استهلاك رصيد AI</span>
      <span class="kai-meta-item">📊 تقرير شامل</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📊 الملخّص الشهري</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-val">${totals.total_requests.toLocaleString('ar-IQ')}</div><div class="stat-lbl">إجمالي الطلبات</div></div>
      <div class="stat-box green"><div class="stat-val">$${Number(totals.total_cost_usd).toFixed(4)}</div><div class="stat-lbl">التكلفة (دولار)</div></div>
      <div class="stat-box amber"><div class="stat-val">${Math.round(totals.total_cost_iqd).toLocaleString('ar-IQ')} د.ع</div><div class="stat-lbl">التكلفة (دينار)</div></div>
      <div class="stat-box blue"><div class="stat-val">${cachedPct}%</div><div class="stat-lbl">من الكاش</div></div>
      <div class="stat-box"><div class="stat-val">${totals.total_input_tokens.toLocaleString('ar-IQ')}</div><div class="stat-lbl">Input Tokens</div></div>
      <div class="stat-box"><div class="stat-val">${totals.total_output_tokens.toLocaleString('ar-IQ')}</div><div class="stat-lbl">Output Tokens</div></div>
      <div class="stat-box green"><div class="stat-val">$${Number(totals.total_savings_usd).toFixed(4)}</div><div class="stat-lbl">توفير من الكاش</div></div>
      <div class="stat-box blue"><div class="stat-val">${totals.cached_requests.toLocaleString('ar-IQ')}</div><div class="stat-lbl">طلبات من الكاش</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🤖 التقسيم حسب الميزة</div>
    ${featureRows ? `<table class="data">
      <thead><tr><th>Output Tokens</th><th>Input Tokens</th><th>التكلفة</th><th>الطلبات</th><th class="name">الميزة</th></tr></thead>
      <tbody>${featureRows}</tbody>
    </table>` : '<div class="empty">لا توجد طلبات لهذا الشهر</div>'}
  </div>

  <div class="section">
    <div class="section-title">👥 التقسيم حسب الدور</div>
    ${roleRows ? `<table class="data">
      <thead><tr><th>التكلفة</th><th>الطلبات</th><th class="name">الدور</th></tr></thead>
      <tbody>${roleRows}</tbody>
    </table>` : '<div class="empty">لا توجد طلبات</div>'}
  </div>

  <div class="section">
    <div class="section-title">🏆 أكثر المستخدمين استهلاكاً</div>
    ${topUserRows ? `<table class="data">
      <thead><tr><th>التكلفة</th><th>الطلبات</th><th class="name">الدور</th><th class="name">المستخدم</th><th>#</th></tr></thead>
      <tbody>${topUserRows}</tbody>
    </table>` : '<div class="empty">لا توجد بيانات</div>'}
  </div>

  <div class="section">
    <div class="section-title">📈 النشاط اليومي</div>
    ${timelineBars || '<div class="empty">لا يوجد نشاط لهذا الشهر</div>'}
  </div>

  <div class="kai-footer">
    <div class="kai-footer-brand">KAI PLATFORM</div>
    <div>تاريخ التقرير: ${new Date().toLocaleDateString('ar-IQ')}</div>
  </div>
</body></html>`;

  try {
    if (Platform.OS === 'web') {
      webPreviewHTML(html, `تقرير AI — ${instituteName} — ${monthLabel}`);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, `تقرير AI — ${instituteName}`, { mimeType: 'application/pdf', dialogTitle: `تقرير AI — ${instituteName}`, UTI: 'com.adobe.pdf' });
    } else {
      Alert.alert('تم', `تم حفظ الملف في: ${uri}`);
    }
  } catch (err: any) {
    Alert.alert('خطأ', err?.message || 'فشل توليد PDF');
  }
}

// Per-student exam result PDF: title, score, each question with student answer + correctness + explanation
export async function exportExamResultPDF(data: {
  examTitle: string;
  studentName: string;
  score: number | null;
  maxScore: number | null;
  questions: Array<{ type: 'mcq' | 'tf'; content: string; options?: string[]; correctIndex?: number; correctAnswer?: boolean; points?: number }>;
  answers: Array<{ question_index: number; answer: any }>;
}): Promise<string | null> {
  const { examTitle, studentName, score, maxScore, questions, answers } = data;
  const answerMap = new Map<number, any>();
  for (const a of answers) answerMap.set(a.question_index, a.answer);

  const scoreLine = (score !== null && maxScore !== null)
    ? `${score} / ${maxScore}`
    : '—';
  const percent = (score !== null && maxScore && maxScore > 0) ? Math.round((score / maxScore) * 100) : null;

  const questionBlocks = questions.map((q, i) => {
    const raw = answerMap.get(i);
    const studentAnsRaw = typeof raw === 'string' ? raw.replace(/^"+|"+$/g, '') : (raw === null || raw === undefined ? '' : String(raw));
    let correctText = '';
    let isCorrect = false;
    if (q.type === 'mcq') {
      correctText = q.options?.[q.correctIndex ?? -1] ?? '';
      isCorrect = studentAnsRaw === correctText;
    } else if (q.type === 'tf') {
      correctText = q.options?.[(q.correctAnswer ? 0 : 1)] ?? '';
      isCorrect = studentAnsRaw === correctText;
    }
    const badge = isCorrect
      ? '<span class="badge ok">✓ صحيح</span>'
      : (studentAnsRaw ? '<span class="badge bad">✗ خطأ</span>' : '<span class="badge skip">— لم يُجب</span>');
    const explanation = !isCorrect && correctText
      ? `<div class="expl"><b>الإجابة الصحيحة:</b> ${escapeHtml(correctText)}</div>`
      : '';
    return `
      <div class="q">
        <div class="q-head">
          <span class="q-num">سؤال ${i + 1}</span>
          ${badge}
          <span class="q-pts">${q.points ?? 0} نقطة</span>
        </div>
        <div class="q-text">${escapeHtml(q.content)}</div>
        <div class="ans"><b>إجابتك:</b> ${studentAnsRaw ? escapeHtml(studentAnsRaw) : '<i>لم يُجب</i>'}</div>
        ${explanation}
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8" /><title>نتيجة: ${escapeHtml(examTitle)}</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: 'Amiri', 'Traditional Arabic', serif; direction: rtl; text-align: right; color: #1E293B; line-height: 1.7; }
.hd { border-bottom: 3px solid #7C3AED; padding-bottom: 14px; margin-bottom: 20px; }
.hd h1 { font-size: 22px; font-weight: 900; margin: 0 0 6px; color: #1E293B; }
.hd .sub { font-size: 12px; color: #64748B; }
.score-card { background: #F5F3FF; border: 2px solid #7C3AED; padding: 14px 18px; border-radius: 12px; margin: 14px 0 22px; display: flex; justify-content: space-between; align-items: center; }
.score-val { font-size: 28px; font-weight: 900; color: #7C3AED; }
.score-lbl { font-size: 12px; color: #64748B; }
.percent { font-size: 14px; font-weight: 800; color: #059669; }
.q { background: #FFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
.q-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12px; }
.q-num { font-weight: 800; color: #475569; }
.q-pts { color: #64748B; font-weight: 700; }
.badge { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; }
.badge.ok { background: #DCFCE7; color: #15803D; }
.badge.bad { background: #FEE2E2; color: #B91C1C; }
.badge.skip { background: #F1F5F9; color: #64748B; }
.q-text { font-size: 13px; font-weight: 700; color: #1E293B; margin-bottom: 8px; }
.ans { font-size: 12px; color: #475569; background: #F8FAFC; padding: 6px 10px; border-right: 3px solid #94A3B8; border-radius: 4px; }
.expl { font-size: 12px; color: #15803D; background: #ECFDF5; padding: 6px 10px; border-right: 3px solid #059669; border-radius: 4px; margin-top: 6px; }
.ft { text-align: center; font-size: 10px; color: #94A3B8; margin-top: 24px; border-top: 1px solid #E2E8F0; padding-top: 10px; }
</style></head>
<body>
<div class="hd">
  <h1>نتيجة الامتحان: ${escapeHtml(examTitle)}</h1>
  <div class="sub">الطالب: <b>${escapeHtml(studentName)}</b> • التاريخ: ${new Date().toLocaleDateString('ar-IQ')}</div>
</div>
<div class="score-card">
  <div>
    <div class="score-lbl">درجتك</div>
    <div class="score-val">${scoreLine}</div>
  </div>
  ${percent !== null ? `<div class="percent">${percent}%</div>` : ''}
</div>
${questionBlocks}
<div class="ft">تم التوليد بواسطة منصة كاي — ${new Date().toLocaleDateString('ar-IQ')}</div>
</body></html>`;

  try {
    if (Platform.OS === 'web') {
      webPreviewHTML(html, `نتيجة ${examTitle}`);
      return null;
    }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await shareWithName(uri, `نتيجة ${examTitle}`, { mimeType: 'application/pdf', dialogTitle: `نتيجة ${examTitle}` });
    }
    return uri;
  } catch (err: any) {
    Alert.alert('خطأ', err.message || 'فشل توليد PDF');
    return null;
  }
}
