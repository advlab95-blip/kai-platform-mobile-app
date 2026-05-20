/**
 * Certificate Templates — 6 modern professional designs
 */

export interface CertificateData {
  title: string;
  studentName: string;
  instituteName: string;
  description?: string;
  verificationCode: string;
  issuedAt: string;
  type: string; // completion, excellence, participation, custom
}

export interface CertTemplate {
  id: string;
  name: string;
  nameAr: string;
  preview: string; // emoji preview
  color: string;
}

export const CERTIFICATE_TEMPLATES: CertTemplate[] = [
  { id: 'royal', name: 'Royal Gold', nameAr: 'الذهبي الملكي', preview: '👑', color: '#B8860B' },
  { id: 'modern', name: 'Modern Blue', nameAr: 'الأزرق العصري', preview: '💎', color: '#1D4ED8' },
  { id: 'elegant', name: 'Elegant Green', nameAr: 'الأخضر الأنيق', preview: '🌿', color: '#059669' },
  { id: 'premium', name: 'Premium Purple', nameAr: 'البنفسجي الفاخر', preview: '🔮', color: '#7C3AED' },
  { id: 'classic', name: 'Classic Red', nameAr: 'الأحمر الكلاسيكي', preview: '🎓', color: '#DC2626' },
  { id: 'minimal', name: 'Minimal Dark', nameAr: 'الداكن البسيط', preview: '🖤', color: '#1E293B' },
];

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    completion: 'شهادة إتمام',
    excellence: 'شهادة تفوق',
    participation: 'شهادة مشاركة',
    custom: 'شهادة تقدير',
  };
  return map[type] || 'شهادة';
}

// Sanitize user input to prevent XSS in generated HTML
function sanitizeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateCertificateHTML(cert: CertificateData, templateId: string): string {
  const template = CERTIFICATE_TEMPLATES.find(t => t.id === templateId) || CERTIFICATE_TEMPLATES[0];
  const typeLabel = getTypeLabel(cert.type);
  const date = new Date(cert.issuedAt).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });

  // Sanitize all user-provided data before embedding in HTML
  const safe = {
    title: sanitizeHTML(cert.title),
    studentName: sanitizeHTML(cert.studentName),
    instituteName: sanitizeHTML(cert.instituteName),
    description: cert.description ? sanitizeHTML(cert.description) : '',
    verificationCode: sanitizeHTML(cert.verificationCode),
  };

  // Use sanitized data in templates
  const safeCert: CertificateData = { ...cert, ...safe };

  switch (templateId) {
    case 'royal': return royalTemplate(safeCert, typeLabel, date);
    case 'modern': return modernTemplate(safeCert, typeLabel, date);
    case 'elegant': return elegantTemplate(safeCert, typeLabel, date);
    case 'premium': return premiumTemplate(safeCert, typeLabel, date);
    case 'classic': return classicTemplate(safeCert, typeLabel, date);
    case 'minimal': return minimalTemplate(safeCert, typeLabel, date);
    default: return modernTemplate(safeCert, typeLabel, date);
  }
}

// ═══════════════════════════════════════════
// Template 1: Royal Gold (الذهبي الملكي)
// ═══════════════════════════════════════════
function royalTemplate(c: CertificateData, typeLabel: string, date: string): string {
  return `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #FFFBEB; font-family: Arial, sans-serif; }
    .cert { width: 940px; padding: 50px; background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 50%, #FFFBEB 100%); border: 3px solid #B8860B; border-radius: 8px; text-align: center; position: relative; }
    .cert::before { content: ''; position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px; border: 1px solid #D4A843; border-radius: 4px; }
    .cert::after { content: ''; position: absolute; top: 16px; left: 16px; right: 16px; bottom: 16px; border: 2px solid #B8860B; border-radius: 2px; }
    .corner { position: absolute; width: 60px; height: 60px; border-color: #B8860B; border-style: solid; }
    .tl { top: 24px; left: 24px; border-width: 3px 0 0 3px; }
    .tr { top: 24px; right: 24px; border-width: 3px 3px 0 0; }
    .bl { bottom: 24px; left: 24px; border-width: 0 0 3px 3px; }
    .br { bottom: 24px; right: 24px; border-width: 0 3px 3px 0; }
    .crown { font-size: 48px; margin-bottom: 5px; }
    .inst { font-size: 22px; color: #92400E; font-weight: 900; margin-bottom: 5px; letter-spacing: 2px; }
    .platform { font-size: 12px; color: #B45309; letter-spacing: 4px; margin-bottom: 25px; }
    .divider { width: 200px; height: 2px; background: linear-gradient(90deg, transparent, #B8860B, transparent); margin: 15px auto; }
    .type { font-size: 32px; color: #78350F; font-weight: 900; margin: 10px 0; }
    .label { font-size: 16px; color: #92400E; margin: 15px 0 5px; }
    .name { font-size: 36px; color: #78350F; font-weight: 900; margin: 10px 0 20px; padding: 10px 50px; border-bottom: 3px double #B8860B; display: inline-block; }
    .desc { font-size: 15px; color: #92400E; line-height: 1.8; margin: 15px 40px; }
    .footer { display: flex; justify-content: space-between; margin-top: 30px; padding: 0 40px; align-items: flex-end; }
    .date-box, .code-box { text-align: center; }
    .footer-label { font-size: 10px; color: #B45309; margin-bottom: 4px; }
    .footer-value { font-size: 13px; color: #78350F; font-weight: 700; }
    .seal { width: 70px; height: 70px; border: 2px solid #B8860B; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #B8860B; font-weight: 900; }
  </style></head><body>
    <div class="cert">
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="crown">👑</div>
      <div class="inst">${c.instituteName}</div>
      <div class="platform">KAI PLATFORM</div>
      <div class="divider"></div>
      <div class="type">${typeLabel}</div>
      <div class="divider"></div>
      <div class="label">يُمنح هذا بكل فخر واعتزاز إلى</div>
      <div class="name">${c.studentName}</div>
      ${c.description ? `<div class="desc">${c.description}</div>` : ''}
      <div class="divider"></div>
      <div class="footer">
        <div class="code-box"><div class="footer-label">رمز التحقق</div><div class="footer-value" style="font-family:monospace;letter-spacing:2px;">${c.verificationCode}</div></div>
        <div class="seal">منصة<br>كاي</div>
        <div class="date-box"><div class="footer-label">تاريخ الإصدار</div><div class="footer-value">${date}</div></div>
      </div>
    </div>
  </body></html>`;
}

// ═══════════════════════════════════════════
// Template 2: Modern Blue (الأزرق العصري)
// ═══════════════════════════════════════════
function modernTemplate(c: CertificateData, typeLabel: string, date: string): string {
  return `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #F0F9FF; font-family: Arial, sans-serif; }
    .cert { width: 940px; background: #fff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(29,78,216,0.1); }
    .header { background: linear-gradient(135deg, #1E3A8A, #1D4ED8, #3B82F6); padding: 40px; text-align: center; }
    .header-inst { font-size: 24px; color: #fff; font-weight: 900; }
    .header-sub { font-size: 11px; color: rgba(255,255,255,0.6); letter-spacing: 4px; margin-top: 5px; }
    .body { padding: 40px 60px; text-align: center; }
    .type { font-size: 28px; color: #1E3A8A; font-weight: 900; margin-bottom: 20px; }
    .accent { width: 80px; height: 4px; background: linear-gradient(90deg, #1D4ED8, #3B82F6); margin: 0 auto 20px; border-radius: 2px; }
    .label { font-size: 15px; color: #64748B; }
    .name { font-size: 38px; color: #1E3A8A; font-weight: 900; margin: 15px 0; }
    .desc { font-size: 14px; color: #475569; line-height: 1.8; margin: 15px 0; }
    .footer { display: flex; justify-content: space-between; align-items: center; padding: 20px 60px 30px; border-top: 1px solid #E2E8F0; }
    .f-item { text-align: center; }
    .f-label { font-size: 10px; color: #94A3B8; }
    .f-value { font-size: 13px; color: #1E293B; font-weight: 700; margin-top: 4px; }
    .badge { background: linear-gradient(135deg, #1D4ED8, #3B82F6); color: #fff; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 900; line-height: 1.3; }
  </style></head><body>
    <div class="cert">
      <div class="header">
        <div class="header-inst">${c.instituteName}</div>
        <div class="header-sub">KAI PLATFORM</div>
      </div>
      <div class="body">
        <div class="type">${typeLabel}</div>
        <div class="accent"></div>
        <div class="label">يُمنح هذا إلى</div>
        <div class="name">${c.studentName}</div>
        ${c.description ? `<div class="desc">${c.description}</div>` : ''}
      </div>
      <div class="footer">
        <div class="f-item"><div class="f-label">رمز التحقق</div><div class="f-value" style="font-family:monospace;">${c.verificationCode}</div></div>
        <div class="badge">منصة<br>كاي</div>
        <div class="f-item"><div class="f-label">تاريخ الإصدار</div><div class="f-value">${date}</div></div>
      </div>
    </div>
  </body></html>`;
}

// ═══════════════════════════════════════════
// Template 3: Elegant Green (الأخضر الأنيق)
// ═══════════════════════════════════════════
function elegantTemplate(c: CertificateData, typeLabel: string, date: string): string {
  return `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #ECFDF5; font-family: Arial, sans-serif; }
    .cert { width: 940px; padding: 0; background: #fff; border-radius: 16px; overflow: hidden; border: 2px solid #059669; }
    .side { position: absolute; top: 0; right: 0; width: 12px; height: 100%; background: linear-gradient(180deg, #059669, #10B981, #34D399); }
    .inner { padding: 50px 60px; text-align: center; position: relative; }
    .leaf { font-size: 40px; margin-bottom: 10px; }
    .inst { font-size: 20px; color: #065F46; font-weight: 900; }
    .platform { font-size: 10px; color: #059669; letter-spacing: 6px; margin: 5px 0 20px; }
    .line { width: 300px; height: 1px; background: #D1FAE5; margin: 15px auto; }
    .type { font-size: 30px; color: #065F46; font-weight: 900; margin: 10px 0; }
    .label { font-size: 14px; color: #6B7280; margin-top: 15px; }
    .name { font-size: 36px; color: #047857; font-weight: 900; margin: 10px 0 5px; padding-bottom: 10px; border-bottom: 2px solid #10B981; display: inline-block; }
    .desc { font-size: 14px; color: #374151; line-height: 1.9; margin: 20px 30px; }
    .bottom { display: flex; justify-content: space-around; margin-top: 30px; padding-top: 20px; border-top: 1px solid #D1FAE5; }
    .b-label { font-size: 9px; color: #6B7280; }
    .b-value { font-size: 12px; color: #065F46; font-weight: 700; margin-top: 3px; }
  </style></head><body>
    <div class="cert">
      <div class="inner">
        <div class="leaf">🌿</div>
        <div class="inst">${c.instituteName}</div>
        <div class="platform">KAI PLATFORM</div>
        <div class="line"></div>
        <div class="type">${typeLabel}</div>
        <div class="line"></div>
        <div class="label">تمنح هذه الشهادة تقديراً لـ</div>
        <div class="name">${c.studentName}</div>
        ${c.description ? `<div class="desc">${c.description}</div>` : ''}
        <div class="bottom">
          <div><div class="b-label">التاريخ</div><div class="b-value">${date}</div></div>
          <div><div class="b-label">رمز التحقق</div><div class="b-value" style="font-family:monospace;">${c.verificationCode}</div></div>
        </div>
      </div>
    </div>
  </body></html>`;
}

// ═══════════════════════════════════════════
// Template 4: Premium Purple (البنفسجي الفاخر)
// ═══════════════════════════════════════════
function premiumTemplate(c: CertificateData, typeLabel: string, date: string): string {
  return `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #FAF5FF; font-family: Arial, sans-serif; }
    .cert { width: 940px; background: linear-gradient(160deg, #2E1065 0%, #4C1D95 30%, #5B21B6 60%, #6D28D9 100%); border-radius: 20px; padding: 50px; text-align: center; color: #fff; position: relative; overflow: hidden; }
    .glow { position: absolute; width: 300px; height: 300px; border-radius: 50%; background: rgba(167,139,250,0.15); top: -100px; right: -100px; }
    .glow2 { position: absolute; width: 200px; height: 200px; border-radius: 50%; background: rgba(167,139,250,0.1); bottom: -50px; left: -50px; }
    .content { position: relative; z-index: 1; }
    .gem { font-size: 42px; margin-bottom: 10px; }
    .inst { font-size: 22px; font-weight: 900; color: #E9D5FF; }
    .platform { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 6px; margin: 5px 0 25px; }
    .type { font-size: 30px; font-weight: 900; color: #fff; margin: 10px 0; }
    .bar { width: 100px; height: 3px; background: linear-gradient(90deg, #A78BFA, #C4B5FD, #A78BFA); margin: 15px auto; border-radius: 2px; }
    .label { font-size: 14px; color: #C4B5FD; }
    .name { font-size: 38px; font-weight: 900; margin: 10px 0; color: #fff; text-shadow: 0 2px 20px rgba(167,139,250,0.5); }
    .desc { font-size: 14px; color: #DDD6FE; line-height: 1.8; margin: 15px 40px; }
    .foot { display: flex; justify-content: space-between; margin-top: 30px; padding: 20px 30px 0; border-top: 1px solid rgba(255,255,255,0.1); }
    .f-l { font-size: 9px; color: rgba(255,255,255,0.4); }
    .f-v { font-size: 12px; color: #E9D5FF; font-weight: 700; margin-top: 3px; }
  </style></head><body>
    <div class="cert">
      <div class="glow"></div><div class="glow2"></div>
      <div class="content">
        <div class="gem">🔮</div>
        <div class="inst">${c.instituteName}</div>
        <div class="platform">KAI PLATFORM</div>
        <div class="bar"></div>
        <div class="type">${typeLabel}</div>
        <div class="bar"></div>
        <div class="label">يُمنح بكل فخر إلى</div>
        <div class="name">${c.studentName}</div>
        ${c.description ? `<div class="desc">${c.description}</div>` : ''}
        <div class="foot">
          <div><div class="f-l">رمز التحقق</div><div class="f-v" style="font-family:monospace;">${c.verificationCode}</div></div>
          <div><div class="f-l">تاريخ الإصدار</div><div class="f-v">${date}</div></div>
        </div>
      </div>
    </div>
  </body></html>`;
}

// ═══════════════════════════════════════════
// Template 5: Classic Red (الأحمر الكلاسيكي)
// ═══════════════════════════════════════════
function classicTemplate(c: CertificateData, typeLabel: string, date: string): string {
  return `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #FEF2F2; font-family: Arial, sans-serif; }
    .cert { width: 940px; padding: 50px; background: #fff; border: 4px solid #991B1B; text-align: center; position: relative; }
    .cert::before { content: ''; position: absolute; top: 10px; left: 10px; right: 10px; bottom: 10px; border: 1px solid #FCA5A5; }
    .grad { font-size: 44px; margin-bottom: 10px; }
    .inst { font-size: 20px; color: #991B1B; font-weight: 900; }
    .platform { font-size: 10px; color: #DC2626; letter-spacing: 5px; margin: 3px 0 20px; }
    .hr { width: 250px; border: none; border-top: 2px solid #FCA5A5; margin: 15px auto; }
    .type { font-size: 28px; color: #7F1D1D; font-weight: 900; }
    .label { font-size: 14px; color: #6B7280; margin-top: 15px; }
    .name { font-size: 34px; color: #991B1B; font-weight: 900; margin: 10px 0; padding: 8px 40px; border-bottom: 2px solid #DC2626; display: inline-block; }
    .desc { font-size: 14px; color: #374151; line-height: 1.8; margin: 15px 40px; }
    .ft { display: flex; justify-content: space-around; margin-top: 25px; padding-top: 15px; border-top: 1px solid #FECACA; }
    .ft-l { font-size: 9px; color: #9CA3AF; }
    .ft-v { font-size: 12px; color: #7F1D1D; font-weight: 700; margin-top: 3px; }
  </style></head><body>
    <div class="cert">
      <div class="grad">🎓</div>
      <div class="inst">${c.instituteName}</div>
      <div class="platform">KAI PLATFORM</div>
      <hr class="hr">
      <div class="type">${typeLabel}</div>
      <hr class="hr">
      <div class="label">شهادة تقدير ممنوحة إلى</div>
      <div class="name">${c.studentName}</div>
      ${c.description ? `<div class="desc">${c.description}</div>` : ''}
      <div class="ft">
        <div><div class="ft-l">التاريخ</div><div class="ft-v">${date}</div></div>
        <div><div class="ft-l">رمز التحقق</div><div class="ft-v" style="font-family:monospace;">${c.verificationCode}</div></div>
      </div>
    </div>
  </body></html>`;
}

// ═══════════════════════════════════════════
// Template 6: Minimal Dark (الداكن البسيط)
// ═══════════════════════════════════════════
function minimalTemplate(c: CertificateData, typeLabel: string, date: string): string {
  return `<html dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0F172A; font-family: Arial, sans-serif; }
    .cert { width: 940px; background: #1E293B; border-radius: 16px; padding: 60px; text-align: center; color: #F1F5F9; border: 1px solid #334155; }
    .inst { font-size: 18px; color: #94A3B8; font-weight: 700; letter-spacing: 3px; }
    .platform { font-size: 9px; color: #475569; letter-spacing: 8px; margin: 5px 0 30px; }
    .line { width: 60px; height: 2px; background: #475569; margin: 20px auto; }
    .type { font-size: 26px; color: #F8FAFC; font-weight: 900; }
    .label { font-size: 13px; color: #64748B; margin-top: 20px; }
    .name { font-size: 40px; color: #fff; font-weight: 900; margin: 10px 0; letter-spacing: 2px; }
    .desc { font-size: 13px; color: #94A3B8; line-height: 1.8; margin: 20px 50px; }
    .ft { display: flex; justify-content: center; gap: 60px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; }
    .ft-l { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 2px; }
    .ft-v { font-size: 12px; color: #CBD5E1; font-weight: 600; margin-top: 5px; }
  </style></head><body>
    <div class="cert">
      <div class="inst">${c.instituteName}</div>
      <div class="platform">KAI PLATFORM</div>
      <div class="line"></div>
      <div class="type">${typeLabel}</div>
      <div class="line"></div>
      <div class="label">AWARDED TO</div>
      <div class="name">${c.studentName}</div>
      ${c.description ? `<div class="desc">${c.description}</div>` : ''}
      <div class="ft">
        <div><div class="ft-l">DATE</div><div class="ft-v">${date}</div></div>
        <div><div class="ft-l">VERIFICATION</div><div class="ft-v" style="font-family:monospace;">${c.verificationCode}</div></div>
      </div>
    </div>
  </body></html>`;
}
