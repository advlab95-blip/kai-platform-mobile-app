import { create } from 'zustand';
import { api } from '../services/api';
import { supabase } from '../services/supabase';

// Unified "content target" — selected class/section + subject for uploads
export interface ContentTarget {
  subjectId: string;
  subjectName: string;
  classId: string | null;
  sectionId: string | null;
  displayName: string;
}

interface TeacherState {
  videos: any[];
  videoTotal: number;
  exams: any[];
  galleries: any[];
  materials: any[];
  students: any[];
  classes: any[];
  voiceMessages: any[];
  selectedClass: any | null;
  selectedClassId: string | null;
  subjects: any[];
  selectedSubject: any | null;
  teacherAssignments: any[];
  targets: ContentTarget[];
  selectedTarget: ContentTarget | null;      // legacy single-select (kept for backwards compat)
  selectedTargets: ContentTarget[];           // NEW: multi-select — upload handlers loop through these
  isLive: boolean;
  liveStream: any | null;
  isLoading: boolean;

  loadTeacherData: (teacherId: string, instituteId: string) => Promise<void>;
  loadSubjects: (teacherId: string) => Promise<void>;
  loadTargets: (teacherId: string) => Promise<void>;
  setSelectedTarget: (target: ContentTarget | null) => void;
  toggleSelectedTarget: (target: ContentTarget) => void;
  clearSelectedTargets: () => void;
  selectAllTargets: () => void;
  setSelectedSubject: (subject: any) => void;
  loadVideos: (teacherId: string, page?: number) => Promise<void>;
  loadExams: (teacherId: string) => Promise<void>;
  loadGalleries: (teacherId: string) => Promise<void>;
  loadMaterials: (instituteId?: string) => Promise<void>;
  loadStudents: (teacherId: string) => Promise<void>;
  loadClasses: (instituteId: string, teacherId?: string) => Promise<void>;
  loadVoiceMessages: (userId: string) => Promise<void>;
  loadLiveStatus: (teacherId: string) => Promise<void>;
  setSelectedClass: (cls: any) => void;
  setIsLive: (v: boolean) => void;
}

const useTeacherStore = create<TeacherState>((set) => ({
  videos: [],
  videoTotal: 0,
  exams: [],
  galleries: [],
  materials: [],
  students: [],
  classes: [],
  voiceMessages: [],
  selectedClass: null,
  selectedClassId: null,
  subjects: [],
  selectedSubject: null,
  teacherAssignments: [],
  targets: [],
  selectedTarget: null,
  selectedTargets: [],
  isLive: false,
  liveStream: null,
  isLoading: false,

  loadTeacherData: async (teacherId, instituteId) => {
    // Validate teacherId matches current auth user
    const authStore = (await import('./authStore')).default;
    const authUserId = authStore.getState().userId;
    if (authUserId && teacherId !== authUserId) {
      console.error('Security: teacherId mismatch');
      return;
    }

    // Race guard: if the teacher logs out and a different teacher signs in
    // mid-flight, the older in-flight call must NOT clobber the new
    // teacher's freshly-loaded state. We capture the auth userId at entry
    // and bail before any set() if it changed. Mirrors medicalStore +
    // studentStore patterns.
    const token = teacherId;
    const stillCurrent = () => authStore.getState().userId === token;

    set({ isLoading: true });
    try {
      await Promise.all([
        useTeacherStore.getState().loadVideos(teacherId),
        useTeacherStore.getState().loadExams(teacherId),
        useTeacherStore.getState().loadGalleries(teacherId),
        useTeacherStore.getState().loadMaterials(instituteId),
        useTeacherStore.getState().loadStudents(teacherId),
        instituteId ? useTeacherStore.getState().loadClasses(instituteId, teacherId) : Promise.resolve(),
        useTeacherStore.getState().loadSubjects(teacherId),
        useTeacherStore.getState().loadTargets(teacherId),
        useTeacherStore.getState().loadLiveStatus(teacherId),
      ]);
    } catch (e) {
      console.error('loadTeacherData error:', e);
    } finally {
      // Don't flip isLoading off if a newer load is now in flight under a
      // different auth user; that load owns the loading state now.
      if (stillCurrent()) set({ isLoading: false });
    }
  },

  // Teacher's own views show ALL their uploaded content — no class filter.
  // Filtering to a specific class on the teacher side caused "appear/disappear" flicker as
  // selectedClassId changed between screens. The student side has its own filtering.
  loadVideos: async (teacherId, page = 1) => {
    try {
      const result = await api.getVideosByTeacher(teacherId, page, 10, undefined);
      set({ videos: result.data || [], videoTotal: result.total });
    } catch (err) { console.error(err); }
  },

  loadExams: async (teacherId) => {
    try {
      const data = await api.getExamsByTeacher(teacherId, undefined);
      set({ exams: data || [] });
    } catch (err) { console.error(err); }
  },

  loadGalleries: async (teacherId) => {
    try {
      const data = await api.getGalleries(teacherId, undefined);
      set({ galleries: data || [] });
    } catch (err) { console.error(err); }
  },

  loadMaterials: async (instituteId) => {
    try {
      const data = await api.getMaterials(instituteId);
      set({ materials: data || [] });
    } catch (err) { console.error(err); }
  },

  loadStudents: async (teacherId) => {
    try {
      const data = await api.getStudentsByTeacher(teacherId);
      set({ students: data || [] });
    } catch (err) { console.error(err); }
  },

  // Scoped to the teacher's own assignments — a teacher should never see a class
  // from their institute that they aren't actually teaching (prevents leaking grades
  // or sending notifications to unrelated classes). Falls back to the full institute
  // list only when teacherId is not provided (rare — keeps older callers working).
  loadClasses: async (instituteId, teacherId) => {
    try {
      const all = await api.getClassesByInstitute(instituteId);
      if (!teacherId) { set({ classes: all || [] }); return; }
      const allowedIds = new Set<string>();
      try {
        const assignments = await api.getTeacherAssignments(teacherId);
        for (const a of (assignments as any[]) || []) {
          if (a?.class_id) allowedIds.add(a.class_id);
        }
      } catch { /* empty set → hide all */ }
      // Legacy: some older teachers only have student_classes links
      try {
        const resolved = await api.getTeacherAssignmentsResolved(teacherId);
        for (const r of (resolved as any[]) || []) {
          if (r?.class_id) allowedIds.add(r.class_id);
        }
      } catch { /* noop */ }
      const filtered = (all || []).filter((c: any) => allowedIds.has(c.id));
      set({ classes: filtered });
    } catch (err) { console.error(err); }
  },

  loadVoiceMessages: async (userId) => {
    try {
      const data = await api.getVoiceMessages(userId, undefined, 'teacher');
      set({ voiceMessages: data || [] });
    } catch (err) { console.error(err); }
  },

  loadLiveStatus: async (teacherId) => {
    try {
      const data = await api.getLiveStreamStatus(teacherId);
      set({ isLive: !!data, liveStream: data });
    } catch (err) { console.error(err); }
  },

  loadSubjects: async (teacherId) => {
    try {
      const assignments = await api.getTeacherAssignments(teacherId);
      set({ teacherAssignments: assignments });
      const subjectMap = new Map<string, any>();
      for (const a of assignments) {
        if (a.subject_id && a.subjects) {
          subjectMap.set(a.subject_id, { id: a.subject_id, name: (a.subjects as any).name });
        }
      }
      set({ subjects: Array.from(subjectMap.values()) });
    } catch { set({ subjects: [], teacherAssignments: [] }); }
  },

  // Loads unified content targets. Uses getTeacherAssignmentsResolved as the single
  // source — it already bulk-fetches sections/classes/subjects by ID, so it works
  // even if the nested-join FKs are missing in the DB schema.
  // Each target = one pill the teacher taps to aim uploads at a specific (class/section, subject).
  loadTargets: async (teacherId) => {
    try {
      const seen = new Set<string>();
      const targets: ContentTarget[] = [];
      const pushTarget = (t: ContentTarget) => {
        const key = `${t.classId || ''}|${t.sectionId || ''}|${t.subjectId}`;
        if (seen.has(key)) return;
        seen.add(key);
        targets.push(t);
      };

      // Primary: resolved helper (handles legacy section_id-as-class-id convention)
      try {
        const resolved = await api.getTeacherAssignmentsResolved(teacherId);
        console.log('[teacherStore.loadTargets] resolved rows:', (resolved as any[])?.length || 0);
        for (const r of (resolved as any[]) || []) {
          if (!r.subject_id) continue;
          pushTarget({
            subjectId: r.subject_id,
            subjectName: r.subject_name || 'بدون مادة',
            classId: r.class_id || null,
            sectionId: r.section_id || null,
            displayName: r.display_name || '—',
          });
        }
      } catch (e) {
        console.warn('[teacherStore.loadTargets] resolved failed, will try raw fallback:', e);
      }

      // Defensive fallback: raw teacher_assignments query with bulk name lookups.
      // Catches cases where the resolved helper silently yields nothing (stale
      // OTA, unexpected schema variants, or nested-join issues with RLS).
      if (targets.length === 0) {
        try {
          // Resolve the teacher's institute first so every join below can be
          // scoped to it (defense-in-depth — RLS already restricts, but a
          // server-side institute_id filter ensures we never accidentally
          // pull rows from another tenant if a future RLS regression slips).
          const { data: teacherRow } = await supabase
            .from('users')
            .select('institute_id')
            .eq('id', teacherId)
            .maybeSingle();
          const teacherInstituteId = (teacherRow as any)?.institute_id || null;

          const { data: rawRows, error: rawErr } = await supabase
            .from('teacher_assignments')
            .select('section_id, class_id, subject_id, institute_id')
            .eq('teacher_id', teacherId)
            .eq('institute_id', teacherInstituteId || '');
          console.log('[teacherStore.loadTargets] raw fallback rows:', rawRows?.length || 0, rawErr);
          const rows = (rawRows || []).filter((r: any) => r.subject_id);
          if (rows.length > 0) {
            const subjectIds = Array.from(new Set(rows.map((r: any) => r.subject_id).filter(Boolean))) as string[];
            // school wizard stores classes.id in section_id column, so look up both as classes
            const classLookupIds = Array.from(new Set([
              ...rows.map((r: any) => r.class_id).filter(Boolean),
              ...rows.map((r: any) => r.section_id).filter(Boolean),
            ])) as string[];
            const sectionIds = Array.from(new Set(rows.map((r: any) => r.section_id).filter(Boolean))) as string[];
            const scopeInst = (q: any) => teacherInstituteId ? q.eq('institute_id', teacherInstituteId) : q;
            const [subsRes, clsRes, secsRes] = await Promise.all([
              subjectIds.length ? scopeInst(supabase.from('subjects').select('id, name').in('id', subjectIds)) : Promise.resolve({ data: [] as any[] }),
              classLookupIds.length ? scopeInst(supabase.from('classes').select('id, name').in('id', classLookupIds)) : Promise.resolve({ data: [] as any[] }),
              sectionIds.length ? scopeInst(supabase.from('sections').select('id, name').in('id', sectionIds)) : Promise.resolve({ data: [] as any[] }),
            ]);
            const subs: any[] = (subsRes as any).data || [];
            const cls: any[] = (clsRes as any).data || [];
            const secs: any[] = (secsRes as any).data || [];
            for (const r of rows as any[]) {
              const sub = subs.find(s => s.id === r.subject_id);
              const sec = secs.find(s => s.id === r.section_id);
              const secAsClass = !sec && r.section_id ? cls.find(c => c.id === r.section_id) : null;
              const cl = cls.find(c => c.id === r.class_id) || secAsClass;
              const display = sec?.name || cl?.name || sub?.name || '—';
              // Surface section_id as classId when the school-wizard convention
              // applies (class_id null + section_id is actually a classes.id),
              // otherwise downstream content APIs fail their class_id check.
              const resolvedClassId = r.class_id || (secAsClass ? r.section_id : null);
              pushTarget({
                subjectId: r.subject_id,
                subjectName: sub?.name || 'بدون مادة',
                classId: resolvedClassId,
                sectionId: r.section_id || null,
                displayName: display,
              });
            }
          }
        } catch (e) {
          console.warn('[teacherStore.loadTargets] raw fallback failed:', e);
        }
      }

      console.log('[teacherStore.loadTargets] final targets:', targets.length);

      const currentSingle = useTeacherStore.getState().selectedTarget;
      const currentMulti = useTeacherStore.getState().selectedTargets;
      const keyOf = (t: ContentTarget) => `${t.classId || ''}|${t.sectionId || ''}|${t.subjectId}`;
      const validKeys = new Set(targets.map(keyOf));
      const keptMulti = currentMulti.filter(t => validKeys.has(keyOf(t)));
      // Default: select all targets on first load (teacher usually wants broadcast unless narrowed)
      const finalMulti = keptMulti.length > 0 ? keptMulti : [...targets];
      const stillExistsSingle = currentSingle && targets.find(t => keyOf(t) === keyOf(currentSingle));
      set({
        targets,
        selectedTarget: stillExistsSingle ? currentSingle : (finalMulti[0] || null),
        selectedTargets: finalMulti,
      });
    } catch (err) {
      console.error('loadTargets error:', err);
      set({ targets: [], selectedTarget: null });
    }
  },

  setSelectedTarget: (target) => set({ selectedTarget: target, selectedTargets: target ? [target] : [] }),
  toggleSelectedTarget: (target) => {
    const current = useTeacherStore.getState().selectedTargets;
    const key = (t: ContentTarget) => `${t.classId || ''}|${t.sectionId || ''}|${t.subjectId}`;
    const targetKey = key(target);
    const exists = current.find(t => key(t) === targetKey);
    const next = exists ? current.filter(t => key(t) !== targetKey) : [...current, target];
    set({ selectedTargets: next, selectedTarget: next[0] || null });
  },
  clearSelectedTargets: () => set({ selectedTargets: [], selectedTarget: null }),
  selectAllTargets: () => {
    const all = useTeacherStore.getState().targets;
    set({ selectedTargets: [...all], selectedTarget: all[0] || null });
  },
  setSelectedClass: (cls) => set({ selectedClass: cls, selectedClassId: cls?.id || null }),
  setSelectedSubject: (subject) => set({ selectedSubject: subject }),
  setIsLive: (v) => set({ isLive: v }),
}));

export default useTeacherStore;
