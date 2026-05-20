/**
 * useQueryData — Factory of query hooks for multi-tenant data.
 * Every queryKey includes instituteId so caches are isolated per tenant.
 * Every hook uses enabled:!!instituteId to prevent leaks before tenant resolves.
 *
 * Complements hooks/useCachedQuery.ts (announcements, notifications, timetable, etc).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { EnrollmentStatus } from '../types';

const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

export function useStudentsByInstitute(instituteId: string | undefined) {
  return useQuery({
    queryKey: ['students', 'institute', instituteId],
    queryFn: () => api.getStudentsByInstitute(instituteId as string),
    enabled: !!instituteId,
    staleTime: FIVE_MIN,
  });
}

export function useTeachersByInstitute(instituteId: string | undefined) {
  return useQuery({
    queryKey: ['teachers', 'institute', instituteId],
    queryFn: () => api.getTeachersByInstitute(instituteId as string),
    enabled: !!instituteId,
    staleTime: FIVE_MIN,
  });
}

export function useSubjectsByInstitute(instituteId: string | undefined) {
  return useQuery({
    queryKey: ['subjects', 'institute', instituteId],
    queryFn: () => api.getSubjects(instituteId as string),
    enabled: !!instituteId,
    staleTime: TEN_MIN,
  });
}

export function useClassesByInstitute(instituteId: string | undefined) {
  return useQuery({
    queryKey: ['classes', 'institute', instituteId],
    queryFn: () => api.getClassesByInstitute(instituteId as string),
    enabled: !!instituteId,
    staleTime: TEN_MIN,
  });
}

export function useStudentsByTeacher(teacherId: string | undefined, instituteId?: string) {
  return useQuery({
    queryKey: ['students', 'teacher', instituteId ?? 'no-inst', teacherId],
    queryFn: () => api.getStudentsByTeacher(teacherId as string),
    enabled: !!teacherId,
    staleTime: FIVE_MIN,
  });
}

export function useAttendanceByStudent(
  studentId: string | undefined,
  academicYearId?: string,
  instituteId?: string,
) {
  return useQuery({
    queryKey: ['attendance', 'student', instituteId ?? 'no-inst', studentId, academicYearId ?? 'current'],
    queryFn: () => api.getAttendanceByStudent(studentId as string, academicYearId),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAttendanceSummary(studentId: string | undefined, instituteId?: string) {
  return useQuery({
    queryKey: ['attendanceSummary', instituteId ?? 'no-inst', studentId],
    queryFn: () => api.getAttendanceSummary(studentId as string),
    enabled: !!studentId,
    staleTime: FIVE_MIN,
  });
}

export function useGradesByClass(
  instituteId: string | undefined,
  classId: string | undefined,
  categoryId?: string,
) {
  return useQuery({
    queryKey: ['grades', 'class', instituteId, classId, categoryId ?? 'all'],
    queryFn: () => api.getGradesByClass(instituteId as string, classId as string, categoryId),
    enabled: !!instituteId && !!classId,
    staleTime: FIVE_MIN,
  });
}

export function useEnrollmentsByStatus(
  instituteId: string | undefined,
  status: EnrollmentStatus,
) {
  return useQuery({
    queryKey: ['enrollments', instituteId, status],
    queryFn: () => api.getEnrollmentsByStatus(instituteId as string, status),
    enabled: !!instituteId,
    staleTime: FIVE_MIN,
  });
}

export function useInvalidateTenantData() {
  const qc = useQueryClient();
  return {
    invalidateStudents: () => qc.invalidateQueries({ queryKey: ['students'] }),
    invalidateTeachers: () => qc.invalidateQueries({ queryKey: ['teachers'] }),
    invalidateSubjects: () => qc.invalidateQueries({ queryKey: ['subjects'] }),
    invalidateClasses: () => qc.invalidateQueries({ queryKey: ['classes'] }),
    invalidateAttendance: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
    invalidateGrades: () => qc.invalidateQueries({ queryKey: ['grades'] }),
    invalidateEnrollments: () => qc.invalidateQueries({ queryKey: ['enrollments'] }),
    clearAll: () => qc.clear(),
  };
}
