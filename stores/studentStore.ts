import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { cachedFetch } from '../services/cache';

// Per-student key so switching accounts doesn't leak "seen" timestamps across users.
const voiceSeenKey = (studentId: string) => `kai-voice-last-seen:${studentId}`;

interface AttendanceSummary {
  percentage: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
}

interface StudentState {
  attendanceSummary: AttendanceSummary;
  attendanceRecords: any[];
  tasks: any[];
  exams: any[];
  materials: any[];
  aiLessons: any[];
  weeklyTimetable: any[];
  videos: any[];
  galleries: any[];
  liveStreams: any[];
  voiceMessages: any[];
  unreadVoiceCount: number;
  lastVoiceSeenAt: string | null;
  justifications: any[];
  classId: string | null;
  selectedClassId: string | null;
  studentClasses: any[];
  currentStudentId: string | null;
  studentSubjects: any[];
  selectedSubjectId: string | null;
  isLoading: boolean;

  loadStudentData: (studentId: string, instituteId: string) => Promise<void>;
  loadStudentClasses: (studentId: string) => Promise<void>;
  setSelectedClass: (classId: string | null) => void;
  loadAttendance: (studentId: string) => Promise<void>;
  loadTasks: (classId: string, studentId?: string) => Promise<void>;
  loadExams: (classId: string, studentId?: string) => Promise<void>;
  loadMaterials: (instituteId: string, studentId?: string) => Promise<void>;
  loadTimetable: (classId: string, studentId?: string) => Promise<void>;
  loadAILessons: (classId?: string | null, studentId?: string, instituteId?: string) => Promise<void>;
  loadVideos: (instituteId: string, studentId?: string) => Promise<void>;
  loadGalleries: (instituteId: string, studentId?: string) => Promise<void>;
  loadLiveStreams: (instituteId: string, studentId?: string) => Promise<void>;
  loadVoiceMessages: (studentId: string) => Promise<void>;
  markVoicesAsSeen: (studentId: string) => Promise<void>;
  loadJustifications: (studentId: string) => Promise<void>;
  loadStudentSubjects: (studentId: string) => Promise<void>;
  setSelectedSubjectId: (subjectId: string | null) => void;
  manualGrades: any[];
  loadManualGrades: (studentId: string, instituteId?: string) => Promise<void>;
}

const useStudentStore = create<StudentState>((set) => ({
  attendanceSummary: { percentage: 0, present: 0, late: 0, absent: 0, excused: 0, total: 0 },
  attendanceRecords: [],
  tasks: [],
  manualGrades: [],
  exams: [],
  materials: [],
  aiLessons: [],
  weeklyTimetable: [],
  videos: [],
  galleries: [],
  liveStreams: [],
  voiceMessages: [],
  unreadVoiceCount: 0,
  lastVoiceSeenAt: null,
  justifications: [],
  classId: null,
  selectedClassId: null,
  studentClasses: [],
  currentStudentId: null,
  studentSubjects: [],
  selectedSubjectId: null,
  isLoading: false,

  loadStudentData: async (studentId, instituteId) => {
    // Race guard: if a parent-child swap (or login of another student in the
    // same shared device session) re-enters loadStudentData mid-flight, the
    // earlier in-flight call must NOT clobber the later one's state. We
    // snapshot the studentId at entry and bail before every `set()` that
    // could overwrite a fresher load. This mirrors the pattern in
    // medicalStore.loadMedicalRecord.
    const token = studentId;
    const stillCurrent = () => useStudentStore.getState().currentStudentId === token;

    set({ currentStudentId: studentId, isLoading: true });
    try {
      await useStudentStore.getState().loadStudentClasses(studentId);
      if (!stillCurrent()) return;

      // Use selectedClassId if set, otherwise fall back to first enrolled class
      let classId = useStudentStore.getState().selectedClassId;
      if (!classId) {
        classId = await api.getStudentClassId(studentId);
        if (!stillCurrent()) return;
        set({ classId, selectedClassId: classId });
      } else {
        set({ classId });
      }

      // Auto-select if only one class
      const studentClasses = useStudentStore.getState().studentClasses;
      if (studentClasses.length === 1 && !useStudentStore.getState().selectedClassId) {
        const autoClassId = studentClasses[0].id;
        if (!stillCurrent()) return;
        set({ selectedClassId: autoClassId, classId: autoClassId });
        classId = autoClassId;
      }

      const promises: Promise<void>[] = [
        useStudentStore.getState().loadAttendance(studentId),
        useStudentStore.getState().loadMaterials(instituteId, studentId),
        useStudentStore.getState().loadVideos(instituteId, studentId),
        useStudentStore.getState().loadGalleries(instituteId, studentId),
        useStudentStore.getState().loadLiveStreams(instituteId, studentId),
        useStudentStore.getState().loadVoiceMessages(studentId),
        useStudentStore.getState().loadJustifications(studentId),
      ];

      if (classId) {
        promises.push(
          useStudentStore.getState().loadTasks(classId, studentId),
          useStudentStore.getState().loadExams(classId, studentId),
          useStudentStore.getState().loadTimetable(classId, studentId),
        );
      }

      await Promise.all(promises);
    } catch (e) {
      console.error('loadStudentData error:', e);
    } finally {
      // Only clear loading if we are still the active load. Otherwise the
      // newer in-flight call already set isLoading=true and we'd flip it off
      // prematurely.
      if (stillCurrent()) set({ isLoading: false });
    }
  },

  loadStudentClasses: async (studentId) => {
    try {
      const classes = await api.getStudentClasses(studentId);
      set({ studentClasses: classes || [] });
      // Auto-select if only one class
      if (classes?.length === 1 && !useStudentStore.getState().selectedClassId) {
        set({ selectedClassId: classes[0].id, classId: classes[0].id });
      }
    } catch (err) { console.error(err); }
  },

  setSelectedClass: (classId) => set({ selectedClassId: classId, classId }),

  loadAttendance: async (studentId) => {
    try {
      const [summary, records] = await Promise.all([
        api.getAttendanceSummary(studentId),
        api.getAttendanceByStudent(studentId),
      ]);
      set({ attendanceSummary: summary, attendanceRecords: records });
    } catch (err) { console.error(err); }
  },

  loadTasks: async (classId, studentId?) => {
    try {
      const data = await api.getStudentTasks(classId, studentId);
      set({ tasks: data || [] });
    } catch (err) { console.error(err); }
  },

  loadExams: async (classId, studentId?) => {
    try {
      const data = await api.getExamsByClass(classId, studentId);
      set({ exams: data || [] });
    } catch (err) { console.error(err); }
  },

  loadMaterials: async (instituteId, studentId?) => {
    try {
      // Use cache for materials (refreshes in background)
      const data = await api.getMaterials(instituteId, studentId);
      set({ materials: data || [] });
    } catch (err) { console.error(err); }
  },

  loadTimetable: async (classId, studentId?) => {
    try {
      const data = await api.getWeeklyTimetable(classId, studentId);
      set({ weeklyTimetable: data || [] });
      // Schedule class reminders (10 min before each class)
      try {
        const { scheduleClassReminders } = await import('../services/classReminders');
        await scheduleClassReminders(data || []);
      } catch { /* silent — may fail on web */ }
    } catch (err) { console.error(err); }
  },

  loadAILessons: async (classId?, studentId?, instituteId?) => {
    try {
      const sid = studentId || useStudentStore.getState().currentStudentId || undefined;
      const result = await api.getStudentAILessons(classId, sid, instituteId);
      const lessons = result?.lessons || [];
      set({ aiLessons: Array.isArray(lessons) ? lessons : [] });
    } catch (err) {
      console.error('[AI lessons load]:', err);
    }
  },

  // Fetch fresh every time. The previous cachedFetch pattern had a race where a
  // background refresh's onUpdate callback could overwrite fresher data from a later
  // effect run — causing videos/galleries to "appear then disappear" on screen.
  loadVideos: async (instituteId, studentId?) => {
    try {
      const classId = useStudentStore.getState().selectedClassId;
      const data = await api.getVideosByInstitute(instituteId, classId || undefined, studentId);
      set({ videos: data || [] });
    } catch (err) { console.error(err); }
  },

  loadGalleries: async (instituteId, studentId?) => {
    try {
      const classId = useStudentStore.getState().selectedClassId;
      const data = await api.getGalleriesByInstitute(instituteId, classId || undefined, studentId);
      set({ galleries: data || [] });
    } catch (err) { console.error(err); }
  },

  loadLiveStreams: async (instituteId, studentId?) => {
    try {
      const data = await api.getActiveLiveStreams(instituteId, studentId);
      set({ liveStreams: data || [] });
    } catch (err) { console.error(err); }
  },

  loadVoiceMessages: async (studentId) => {
    try {
      // Get student's class IDs so they can see class-wide voice messages
      const studentClasses = useStudentStore.getState().studentClasses;
      const classIds = studentClasses.map((c: any) => c.id).filter(Boolean);
      const data = await api.getVoiceMessages(studentId, classIds, 'student');
      const list = data || [];

      // Read the persisted "last seen" timestamp — any message created AFTER this
      // that's NOT from the student themselves is considered unread.
      let lastSeen: string | null = useStudentStore.getState().lastVoiceSeenAt;
      if (!lastSeen) {
        try { lastSeen = await AsyncStorage.getItem(voiceSeenKey(studentId)); } catch { /* ignore */ }
      }
      const unread = lastSeen
        ? list.filter((m: any) => m.sender_id !== studentId && new Date(m.created_at) > new Date(lastSeen)).length
        // No "last seen" yet → treat everything from others as unread so the badge
        // surfaces historical messages the student hasn't acknowledged.
        : list.filter((m: any) => m.sender_id !== studentId).length;

      set({ voiceMessages: list, unreadVoiceCount: unread, lastVoiceSeenAt: lastSeen });
    } catch (err) { console.error(err); }
  },

  markVoicesAsSeen: async (studentId) => {
    const now = new Date().toISOString();
    set({ unreadVoiceCount: 0, lastVoiceSeenAt: now });
    try { await AsyncStorage.setItem(voiceSeenKey(studentId), now); } catch { /* non-fatal */ }
  },

  loadJustifications: async (studentId) => {
    try {
      const data = await api.getAbsenceJustifications(studentId);
      set({ justifications: data || [] });
    } catch (err) { console.error(err); }
  },

  loadStudentSubjects: async (studentId) => {
    try {
      // Get subjects from teacher assignments for this student
      const teachers = await api.getStudentTeachers(studentId);
      const subjectMap = new Map<string, string>();
      for (const t of teachers) {
        if (t.subject) {
          for (const subName of t.subject.split('، ')) {
            if (subName.trim()) subjectMap.set(subName.trim(), subName.trim());
          }
        }
      }
      set({ studentSubjects: Array.from(subjectMap.values()).map(name => ({ name })) });
    } catch { set({ studentSubjects: [] }); }
  },

  setSelectedSubjectId: (subjectId) => set({ selectedSubjectId: subjectId }),

  loadManualGrades: async (studentId, instituteId?) => {
    try {
      // The student is viewing their own grades — pass studentId as callerId
      // so the now-required authorization guard succeeds.
      const data = await api.getStudentManualGrades(studentId, instituteId, studentId);
      set({ manualGrades: data });
    } catch (err) { console.error('[Manual grades load]:', err); }
  },
}));

export default useStudentStore;
