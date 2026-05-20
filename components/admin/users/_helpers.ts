// Pure helpers and shared constants extracted from app/(admin)/users.tsx.
// Behavior preserved verbatim — these are the same values inlined in the parent screen.

export const ROLE_BG: Record<string, { bg: string; text: string }> = {
  teacher: { bg: '#EFF6FF', text: '#1D4ED8' },
  student: { bg: '#F0FDFA', text: '#0D9488' },
  parent: { bg: '#F5F3FF', text: '#7C3AED' },
  cafeteria: { bg: '#FFF7ED', text: '#F97316' },
  medical: { bg: '#FEF2F2', text: '#EF4444' },
};

export function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

export const PERMISSIONS_KEY = 'institute_permissions';

// Role hierarchy used by the institute body to render groups in a stable order.
export const ROLE_ORDER = ['institute', 'teacher', 'student', 'parent', 'cafeteria', 'medical'] as const;

export const ROLE_ICONS: Record<string, string> = {
  institute: 'shield',
  teacher: 'school',
  student: 'person',
  parent: 'people',
  cafeteria: 'restaurant',
  medical: 'medkit',
};

// Stage parsing (used in the user detail class picker).
export const PICKER_STAGES = [
  { key: 'primary', label: 'الابتدائية', color: '#059669', grades: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'] },
  { key: 'middle', label: 'المتوسطة', color: '#1D4ED8', grades: ['الأول', 'الثاني', 'الثالث'] },
  { key: 'secondary', label: 'الإعدادية', color: '#7C3AED', grades: ['الرابع', 'الخامس', 'السادس'], branches: ['العلمي', 'الأدبي'] },
] as const;

export function parsePickerClass(name: string) {
  for (const stage of PICKER_STAGES) {
    if (name.includes(stage.label)) {
      const grade = stage.grades.find(g => name.includes(g)) || '';
      const branch = (stage as any).branches?.find((b: string) => name.includes(b)) || '';
      const parts = name.trim().split(/\s+/);
      const section = parts[parts.length - 1];
      const isSection = section.length <= 2;
      return { stageKey: stage.key, grade, branch, section: isSection ? section : '', label: stage.label };
    }
  }
  return { stageKey: 'other', grade: '', branch: '', section: '', label: '' };
}
