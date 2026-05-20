import { create } from 'zustand';
import { Alert } from 'react-native';
import { api } from '../services/api';

interface MedicalState {
  selectedStudent: { id: string; full_name: string } | null;
  medicalRecord: any | null;
  stats: { totalStudents: number; withRecords: number };
  searchResults: any[];
  allRecords: any[];
  allStudents: any[];
  isLoading: boolean;

  searchStudents: (query: string, instituteId: string) => Promise<void>;
  selectStudent: (student: { id: string; full_name: string }) => Promise<void>;
  loadMedicalRecord: (studentId: string, instituteId: string) => Promise<void>;
  saveMedicalRecord: (studentId: string, instituteId: string, record: any) => Promise<void>;
  loadStats: (instituteId: string) => Promise<void>;
  loadAllRecords: (instituteId: string) => Promise<void>;
  loadAllStudents: (instituteId: string) => Promise<void>;
  sendAlert: (studentId: string, studentName: string, message: string, senderId: string, instituteId: string) => Promise<void>;
}

const useMedicalStore = create<MedicalState>((set, get) => ({
  selectedStudent: null,
  medicalRecord: null,
  stats: { totalStudents: 0, withRecords: 0 },
  searchResults: [],
  allRecords: [],
  allStudents: [],
  isLoading: false,

  searchStudents: async (query, instituteId) => {
    if (!query.trim() || !instituteId) {
      set({ searchResults: [] });
      return;
    }
    try {
      const data = await api.searchStudents(query, instituteId);
      set({ searchResults: data });
    } catch (err: any) {
      // Surface to user — silent console.error was hiding network/RLS failures
      Alert.alert('خطأ', err?.message || 'فشل في البحث عن الطلاب');
    }
  },

  selectStudent: async (student) => {
    set({ selectedStudent: student, searchResults: [] });
    // Caller must invoke loadMedicalRecord(student.id, instituteId) after setSelectedStudent
    // (tenant isolation requires institute context)
  },

  loadMedicalRecord: async (studentId, instituteId) => {
    if (!instituteId) { console.warn('[medicalStore] missing instituteId'); return; }
    set({ isLoading: true, selectedStudent: { id: studentId } as any });
    try {
      const data = await api.getMedicalRecord(studentId, instituteId);
      // Race guard: if the user selected a different student while this was
      // in flight, drop the stale result so we don't show student A's record
      // on student B's profile.
      const current = get().selectedStudent as any;
      if (current?.id && current.id !== studentId) return;
      set({ medicalRecord: data });
    } catch {
      const current = get().selectedStudent as any;
      if (current?.id && current.id !== studentId) return;
      set({ medicalRecord: null });
    } finally {
      const current = get().selectedStudent as any;
      if (!current?.id || current.id === studentId) set({ isLoading: false });
    }
  },

  saveMedicalRecord: async (studentId, instituteId, record) => {
    if (!instituteId) throw new Error('instituteId مطلوب لحفظ السجل الطبي');
    await api.upsertMedicalRecord(studentId, instituteId, record);
    // Re-fetch with instituteId so the reload stays scoped to the same institute.
    // Previously this omitted instituteId, which broke tenant isolation on refresh.
    await get().loadMedicalRecord(studentId, instituteId);
  },

  loadStats: async (instituteId) => {
    try {
      const data = await api.getMedicalStats(instituteId);
      set({ stats: data });
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل في تحميل إحصائيات الطبابة');
    }
  },

  loadAllRecords: async (instituteId) => {
    try {
      const data = await api.getAllMedicalRecords(instituteId);
      set({ allRecords: data });
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل في تحميل السجلات الطبية');
    }
  },

  loadAllStudents: async (instituteId) => {
    try {
      const data = await api.getAllStudentsForMedical(instituteId);
      set({ allStudents: data });
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل في تحميل قائمة الطلاب');
    }
  },

  sendAlert: async (studentId, studentName, message, senderId, instituteId) => {
    if (!instituteId) throw new Error('instituteId مطلوب لإرسال التنبيه');
    const parentId = await api.getParentByStudent(studentId, instituteId);
    if (parentId) {
      await api.sendParentAlert(parentId, studentName, message, senderId, instituteId);
    } else {
      throw new Error('لم يتم العثور على ولي أمر لهذا الطالب في هذه المؤسسة');
    }
  },
}));

export default useMedicalStore;
