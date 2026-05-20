import { create } from 'zustand';
import { api } from '../services/api';

interface Child {
  id: string;
  name: string;
  instituteId?: string | null; // enriched by api.getChildrenByParent — needed to scope child data loads
}

interface ParentState {
  children: Child[];
  selectedChildId: string | null;
  childAttendance: { percentage: number; present: number; absent: number; total: number };
  childAttendanceRecords: any[];
  childPayments: any[];
  childGradeAverage: number; // 0-100 — average of all published grades across all subjects
  childGradesCount: number;   // total published grades (used to show "N درجة" indicator)
  childMedical: any | null;
  conversations: any[];
  isLoading: boolean;

  loadChildren: (parentId: string) => Promise<void>;
  selectChild: (id: string, parentId?: string) => Promise<void>;
  loadChildData: (childId: string, instituteId?: string, parentId?: string) => Promise<void>;
  loadConversations: (parentId: string, instituteId?: string) => Promise<void>;
}

const useParentStore = create<ParentState>((set, get) => ({
  children: [],
  selectedChildId: null,
  childAttendance: { percentage: 0, present: 0, absent: 0, total: 0 },
  childAttendanceRecords: [],
  childPayments: [],
  childGradeAverage: 0,
  childGradesCount: 0,
  childMedical: null,
  conversations: [],
  isLoading: false,

  loadChildren: async (parentId) => {
    try {
      const data = await api.getChildrenByParent(parentId);
      set({ children: data });
      if (data.length > 0 && !get().selectedChildId) {
        set({ selectedChildId: data[0].id });
        await get().loadChildData(data[0].id, undefined, parentId);
      }
    } catch (err) { console.error(err); }
  },

  selectChild: async (id, parentId) => {
    set({ selectedChildId: id });
    await get().loadChildData(id, undefined, parentId);
  },

  loadChildData: async (childId, instituteId, parentId) => {
    set({ isLoading: true });
    try {
      // Verify this child belongs to the parent
      const children = get().children;
      const child = children.find(c => c.id === childId);
      if (children.length > 0 && !child) {
        console.warn('[ParentStore] childId not in parent children list');
        return;
      }
      // Use child.instituteId as authoritative (falls back to arg for legacy callers).
      // getChildrenByParent enriches children with `instituteId` (camelCase).
      const tenantId = (child as any)?.instituteId || (child as any)?.institute_id || instituteId || '';
      if (!tenantId) {
        console.error('[ParentStore] missing institute_id — skipping loadChildData');
        return;
      }
      const [attendance, records, payments, medical, grades] = await Promise.all([
        api.getAttendanceSummary(childId, tenantId),
        api.getAttendanceByStudent(childId, undefined, tenantId, parentId),
        api.getStudentPayments(childId, tenantId, parentId),
        api.getMedicalRecord(childId, tenantId, parentId),
        // getStudentManualGrades already filters is_published=true server-side.
        api.getStudentManualGrades(childId, tenantId, parentId),
      ]);
      // Compute overall grade average (weighted equally per row — simple mean of percentages).
      const gradePercents = (grades as any[])
        .map(g => g?.max_score > 0 ? (g.score / g.max_score) * 100 : null)
        .filter((x: number | null): x is number => x !== null);
      const gradeAvg = gradePercents.length > 0
        ? Math.round(gradePercents.reduce((a, b) => a + b, 0) / gradePercents.length)
        : 0;
      set({
        childAttendance: attendance,
        childAttendanceRecords: records,
        childPayments: payments,
        childMedical: medical,
        childGradeAverage: gradeAvg,
        childGradesCount: gradePercents.length,
      });
    } catch (err) { console.error(err); } finally {
      set({ isLoading: false });
    }
  },

  loadConversations: async (parentId, instituteId) => {
    try {
      const data = await api.getConversations(parentId, instituteId);
      set({ conversations: data });
    } catch (err) { console.error(err); }
  },
}));

export default useParentStore;
