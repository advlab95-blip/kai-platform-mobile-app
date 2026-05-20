/**
 * Grade Report Certificate Templates
 * - Academic report cards with grades (شهري، نصف سنة، نهائي)
 * - Plain certificates (تفوق، تقدير، مشاركة)
 * - Multiple themes per template type
 * - No verification codes shown
 */

// ── Types ──

export interface GradeEntry {
  subject: string;
  score: number;
  maxScore: number;
  category?: string; // شهري أول، نصف السنة، نهائي
}

export interface ReportData {
  studentName: string;
  instituteName: string;
  className?: string;
  academicYear?: string;
  title?: string;
  description?: string;
  grades?: GradeEntry[];
  issuedAt: string;
  type: 'grades' | 'single_subject' | 'excellence' | 'completion' | 'participation' | 'appreciation' | 'behavior' | 'attendance' | 'graduation';
  showEmoji?: boolean;
  stampUrl?: string | null;
  signatureUrl?: string | null;
}

export interface ReportTheme {
  id: string;
  nameAr: string;
  preview: string;
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  textDark: string;
  textLight: string;
}

// ── 8 Themes ──

export const REPORT_THEMES: ReportTheme[] = [
  { id: 'royal_gold', nameAr: 'الذهبي الملكي', preview: '👑', primary: '#B8860B', secondary: '#78350F', accent: '#FEF3C7', bg: '#FFFBEB', textDark: '#78350F', textLight: '#92400E' },
  { id: 'ocean_blue', nameAr: 'الأزرق المحيطي', preview: '🌊', primary: '#1D4ED8', secondary: '#1E3A8A', accent: '#DBEAFE', bg: '#EFF6FF', textDark: '#1E3A8A', textLight: '#3B82F6' },
  { id: 'forest_green', nameAr: 'الأخضر الطبيعي', preview: '🌿', primary: '#059669', secondary: '#065F46', accent: '#D1FAE5', bg: '#ECFDF5', textDark: '#065F46', textLight: '#10B981' },
  { id: 'royal_purple', nameAr: 'البنفسجي الملكي', preview: '🔮', primary: '#7C3AED', secondary: '#5B21B6', accent: '#EDE9FE', bg: '#F5F3FF', textDark: '#5B21B6', textLight: '#8B5CF6' },
  { id: 'ruby_red', nameAr: 'الياقوتي الأحمر', preview: '💎', primary: '#DC2626', secondary: '#991B1B', accent: '#FEE2E2', bg: '#FEF2F2', textDark: '#991B1B', textLight: '#EF4444' },
  { id: 'midnight_dark', nameAr: 'الداكن الأنيق', preview: '🌙', primary: '#374151', secondary: '#111827', accent: '#F3F4F6', bg: '#F9FAFB', textDark: '#111827', textLight: '#6B7280' },
  { id: 'rose_pink', nameAr: 'الوردي الناعم', preview: '🌸', primary: '#DB2777', secondary: '#9D174D', accent: '#FCE7F3', bg: '#FDF2F8', textDark: '#9D174D', textLight: '#EC4899' },
  { id: 'sunset_orange', nameAr: 'البرتقالي الدافئ', preview: '🌅', primary: '#EA580C', secondary: '#9A3412', accent: '#FED7AA', bg: '#FFF7ED', textDark: '#9A3412', textLight: '#F97316' },
];

// ── Sanitize ──

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Generate Report HTML ──

export function generateGradeReportHTML(data: ReportData, themeId: string): string {
  const t = REPORT_THEMES.find(th => th.id === themeId) || REPORT_THEMES[0];
  const date = new Date(data.issuedAt).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
  const sName = esc(data.studentName);
  const iName = esc(data.instituteName);
  const desc = data.description ? esc(data.description) : '';

  const typeLabel: Record<string, string> = {
    grades: 'كشف الدرجات',
    single_subject: 'كشف درجات المادة',
    excellence: 'شهادة تفوق',
    completion: 'شهادة إتمام',
    participation: 'شهادة مشاركة',
    appreciation: 'شهادة تقدير',
    behavior: 'شهادة سلوك مثالي',
    attendance: 'شهادة حضور مثالي',
    graduation: 'شهادة تخرج',
  };
  const label = data.title ? esc(data.title) : (typeLabel[data.type] || 'شهادة');
  const showEmoji = data.showEmoji !== false; // default true

  // ── Grade Table ──
  let gradesHTML = '';
  let summaryHTML = '';
  if (data.grades && data.grades.length > 0) {
    const totalScore = data.grades.reduce((a, g) => a + g.score, 0);
    const totalMax = data.grades.reduce((a, g) => a + g.maxScore, 0);
    const avg = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const level = avg >= 90 ? 'ممتاز' : avg >= 80 ? 'جيد جداً' : avg >= 70 ? 'جيد' : avg >= 60 ? 'متوسط' : avg >= 50 ? 'مقبول' : 'ضعيف';

    // Group by category if mixed
    const categories = [...new Set(data.grades.map(g => g.category || 'عام'))];

    const rows = data.grades.map((g, i) => {
      const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0;
      const pColor = pct >= 50 ? t.primary : '#DC2626';
      return `<tr style="${i % 2 === 0 ? `background:${t.accent};` : ''}">
        <td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:800;color:${pColor};">${pct}%</td>
        <td style="padding:10px 12px;text-align:center;font-size:14px;font-weight:800;color:${t.textDark};">${g.score}/${g.maxScore}</td>
        ${categories.length > 1 ? `<td style="padding:10px 12px;text-align:right;font-size:12px;color:${t.textLight};">${esc(g.category || 'عام')}</td>` : ''}
        <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:700;color:${t.textDark};">${esc(g.subject)}</td>
        <td style="padding:10px 12px;text-align:center;font-size:12px;color:${t.textLight};">${i + 1}</td>
      </tr>`;
    }).join('');

    gradesHTML = `
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead><tr style="background:${t.primary};">
          <th style="padding:10px;color:#fff;font-size:12px;font-weight:800;">النسبة</th>
          <th style="padding:10px;color:#fff;font-size:12px;font-weight:800;">الدرجة</th>
          ${categories.length > 1 ? '<th style="padding:10px;color:#fff;font-size:12px;font-weight:800;">الفئة</th>' : ''}
          <th style="padding:10px;color:#fff;font-size:12px;font-weight:800;">المادة</th>
          <th style="padding:10px;color:#fff;font-size:12px;font-weight:800;">#</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:${t.primary};">
          <td style="padding:10px;color:#fff;font-size:14px;font-weight:900;text-align:center;">${avg}%</td>
          <td style="padding:10px;color:#fff;font-size:14px;font-weight:900;text-align:center;">${totalScore}/${totalMax}</td>
          ${categories.length > 1 ? '<td></td>' : ''}
          <td style="padding:10px;color:#fff;font-size:13px;font-weight:800;text-align:right;" colspan="2">المجموع والمعدل</td>
        </tr></tfoot>
      </table>`;

    summaryHTML = `
      <div style="display:flex;gap:16px;margin:16px 0;flex-wrap:wrap;justify-content:center;">
        <div style="background:${t.accent};border-radius:16px;padding:16px 24px;text-align:center;min-width:100px;">
          <div style="font-size:28px;font-weight:900;color:${t.primary};">${avg}%</div>
          <div style="font-size:11px;color:${t.textLight};">المعدل العام</div>
        </div>
        <div style="background:${t.accent};border-radius:16px;padding:16px 24px;text-align:center;min-width:100px;">
          <div style="font-size:28px;font-weight:900;color:${t.primary};">${level}</div>
          <div style="font-size:11px;color:${t.textLight};">التقدير</div>
        </div>
        <div style="background:${t.accent};border-radius:16px;padding:16px 24px;text-align:center;min-width:100px;">
          <div style="font-size:28px;font-weight:900;color:${t.primary};">${data.grades.length}</div>
          <div style="font-size:11px;color:${t.textLight};">المواد</div>
        </div>
      </div>`;
  }

  return `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4 ${(data.type === 'grades' || data.type === 'single_subject') ? 'portrait' : 'landscape'}; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: ${t.bg}; font-family: Arial, sans-serif; }
    .cert { width: ${(data.type === 'grades' || data.type === 'single_subject') ? '700' : '940'}px; padding: 40px; background: #fff; border: 3px solid ${t.primary}; border-radius: 12px; text-align: center; position: relative; }
    .cert::before { content: ''; position: absolute; top: 6px; left: 6px; right: 6px; bottom: 6px; border: 1px solid ${t.accent}; border-radius: 8px; }
    .logo { font-size: 36px; margin-bottom: 4px; }
    .inst { font-size: 20px; color: ${t.secondary}; font-weight: 900; letter-spacing: 1px; }
    .platform { font-size: 10px; color: ${t.textLight}; letter-spacing: 3px; margin-bottom: 16px; }
    .divider { width: 180px; height: 2px; background: linear-gradient(90deg, transparent, ${t.primary}, transparent); margin: 12px auto; }
    .type { font-size: ${(data.type === 'grades' || data.type === 'single_subject') ? '22' : '28'}px; color: ${t.secondary}; font-weight: 900; margin: 8px 0; }
    .label { font-size: 14px; color: ${t.textLight}; margin: 10px 0 4px; }
    .name { font-size: ${(data.type === 'grades' || data.type === 'single_subject') ? '26' : '34'}px; color: ${t.secondary}; font-weight: 900; margin: 8px 0 16px; padding-bottom: 8px; border-bottom: 2px solid ${t.accent}; display: inline-block; }
    .desc { font-size: 14px; color: ${t.textLight}; line-height: 1.8; margin: 10px 30px; }
    .class-info { font-size: 13px; color: ${t.textLight}; margin: 4px 0; }
    .footer { display: flex; justify-content: space-between; margin-top: 24px; padding: 0 30px; align-items: flex-end; }
    .f-label { font-size: 9px; color: ${t.textLight}; margin-bottom: 3px; }
    .f-value { font-size: 12px; color: ${t.secondary}; font-weight: 700; }
    .seal { width: 60px; height: 60px; border: 2px solid ${t.primary}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; color: ${t.primary}; font-weight: 900; line-height: 1.2; }
  </style></head><body>
    <div class="cert">
      ${showEmoji ? `<div class="logo">${REPORT_THEMES.find(th => th.id === themeId)?.preview || '📜'}</div>` : ''}
      <div class="inst">${iName}</div>
      <div class="platform">KAI PLATFORM</div>
      <div class="divider"></div>
      <div class="type">${label}</div>
      ${data.className ? `<div class="class-info">${esc(data.className)}${data.academicYear ? ' — ' + esc(data.academicYear) : ''}</div>` : ''}
      <div class="divider"></div>
      ${(() => {
        const labels: Record<string, string> = {
          grades: 'الطالب', single_subject: 'الطالب',
          excellence: 'يُمنح بكل فخر واعتزاز إلى',
          completion: 'تشهد إدارة المؤسسة بأن',
          participation: 'شارك بفاعلية وتميز',
          appreciation: 'تقديراً وعرفاناً يُمنح إلى',
          behavior: 'نظراً لسلوكه المثالي وانضباطه يُمنح إلى',
          attendance: 'لالتزامه بالحضور المثالي طوال الفصل يُمنح إلى',
          graduation: 'تشهد إدارة المؤسسة بتخرج الطالب',
        };
        return `<div class="label">${labels[data.type] || 'يُمنح إلى'}</div>`;
      })()}
      <div class="name">${sName}</div>
      ${desc ? `<div class="desc">${desc}</div>` : ''}
      ${summaryHTML}
      ${gradesHTML}
      <div class="divider"></div>
      <div class="footer">
        <div style="text-align:center;">
          <div class="f-label">التوقيع</div>
          ${data.signatureUrl
            ? `<img src="${data.signatureUrl}" style="height:50px;max-width:120px;object-fit:contain;margin-top:4px;" />`
            : `<div style="width:100px;border-bottom:1px solid ${t.textLight};margin-top:20px;"></div>`
          }
        </div>
        <div style="text-align:center;">
          ${data.stampUrl
            ? `<img src="${data.stampUrl}" style="height:70px;width:70px;object-fit:contain;border-radius:50%;" />`
            : `<div class="seal">منصة<br>كاي</div>`
          }
        </div>
        <div><div class="f-label">تاريخ الإصدار</div><div class="f-value">${date}</div></div>
      </div>
    </div>
  </body></html>`;
}
