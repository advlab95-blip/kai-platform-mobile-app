// _helpers — pure helpers extracted from app/(institute)/settings.tsx.
// Behavior must remain byte-identical with the original implementations.

import { Colors } from '../../../constants/colors';

export const getSortedGrades = (schoolStructure: any): any[] => {
  if (!schoolStructure) return [];
  const stages = (schoolStructure.stages || []).sort(
    (a: any, b: any) => (a.order_num || 0) - (b.order_num || 0),
  );
  const grades = schoolStructure.grades || [];
  const sorted: any[] = [];
  for (const stage of stages) {
    sorted.push(
      ...grades
        .filter((g: any) => g.stage_id === stage.id)
        .sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0)),
    );
  }
  return sorted;
};

export const getSectionsForGrade = (
  schoolStructure: any,
  gradeId: string,
): any[] => {
  return (schoolStructure?.sections || []).filter(
    (s: any) => s.grade_id === gradeId,
  );
};

export const getRoleBadgeColor = (role: string): string => {
  const map: Record<string, string> = {
    teacher: Colors.teacher,
    student: Colors.student,
    parent: Colors.parent,
    institute: Colors.institute,
    cafeteria: Colors.cafeteria,
    medical: Colors.medical,
  };
  return map[role] || Colors.primary;
};

export const getRoleName = (role: string): string => {
  const map: Record<string, string> = {
    teacher: 'أستاذ',
    student: 'طالب',
    parent: 'ولي أمر',
    institute: 'إدارة',
    cafeteria: 'كافتيريا',
    medical: 'طبابة',
  };
  return map[role] || role;
};

export const generateRandomCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};
