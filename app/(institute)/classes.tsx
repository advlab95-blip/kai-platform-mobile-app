import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Alert,
  TextInput, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { searchMatch } from '../../hooks/useSmartSearch';
import BackHeader from '../../components/shared/BackHeader';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SkeletonList from '../../components/shared/SkeletonList';

// ─── Extracted presentational components ──────────────────────────────────
import EmptyState from '../../components/institute/classes/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import StageTabs from '../../components/institute/classes/StageTabs';
import StageSummary from '../../components/institute/classes/StageSummary';
import FilterBar, { type TrackFilter } from '../../components/institute/classes/FilterBar';
import GradeRow from '../../components/institute/classes/GradeRow';
import SectionDetailHeader from '../../components/institute/classes/SectionDetailHeader';
import SectionHero from '../../components/institute/classes/SectionHero';
import TabButton from '../../components/institute/classes/TabButton';
import StudentCard from '../../components/institute/classes/StudentCard';
import TeacherCard from '../../components/institute/classes/TeacherCard';
import AddGradeSheet from '../../components/institute/classes/sheets/AddGradeSheet';
import AddSectionSheet from '../../components/institute/classes/sheets/AddSectionSheet';
import DeleteSectionSheet from '../../components/institute/classes/sheets/DeleteSectionSheet';
import ActionModal from '../../components/institute/classes/sheets/ActionModal';
import {
  emptyAttendance,
  type StageRow,
  type GradeRow as TGradeRow,
  type SectionRow,
  type UserLite,
  type StudentDetail,
  type ActionType,
} from '../../components/institute/classes/_helpers';

// ─── Screen ───────────────────────────────────────────────────────────────
export default function InstituteClasses() {
  const { userId } = useAuthStore();
  const { userInstituteId: storeInstituteId, detectInstitute } = useDataStore();
  // Admin navigates here from /(admin)/institutions with ?instituteId=... to manage a
  // specific institute. For admins, storeInstituteId is null (no enrollment). For regular
  // institute users, the query param is absent and we fall back to their own institute.
  const { instituteId: paramInstituteId } = useLocalSearchParams<{ instituteId?: string }>();
  const userInstituteId = paramInstituteId || storeInstituteId;
  const isAdminContext = !!paramInstituteId;
  const router = useRouter();

  const [instType, setInstType] = useState<'school' | 'institute'>('school');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // School-mode data
  const [stages, setStages] = useState<StageRow[]>([]);
  const [grades, setGrades] = useState<TGradeRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});
  const [activeStageId, setActiveStageId] = useState<string | null>(null);

  // Section drill-down
  const [selectedSection, setSelectedSection] = useState<SectionRow | null>(null);
  const [selectedGradeName, setSelectedGradeName] = useState<string>('');
  const [secStudents, setSecStudents] = useState<UserLite[]>([]);
  const [secTeachers, setSecTeachers] = useState<UserLite[]>([]);
  const [secLoading, setSecLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [studentDetails, setStudentDetails] = useState<Record<string, StudentDetail>>({});
  const [tab, setTab] = useState<'students' | 'teachers'>('students');

  // ── User actions (reset code / transfer) ────────────────────────────────
  const [actionUser, setActionUser] = useState<UserLite | null>(null);
  const [actionUserRole, setActionUserRole] = useState<'student' | 'teacher'>('student');
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionBusy, setActionBusy] = useState(false);
  // Reset-code state
  const [newCode, setNewCode] = useState('');
  const [codeAvail, setCodeAvail] = useState<'unknown' | 'yes' | 'no'>('unknown');
  // Transfer state
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [targetGradeId, setTargetGradeId] = useState<string | null>(null);
  const [targetStageId, setTargetStageId] = useState<string | null>(null);
  const [teacherTransferMode, setTeacherTransferMode] = useState<'add' | 'replace'>('add');

  // ── Add grade / add section state ───────────────────────────────────────
  const [addGradeOpen, setAddGradeOpen] = useState(false);
  const [addGradeName, setAddGradeName] = useState('');
  const [addGradeBusy, setAddGradeBusy] = useState(false);
  const [addGradeTrack, setAddGradeTrack] = useState<'none' | 'علمي' | 'أدبي'>('none');
  // Track filter inside إعدادية stage
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all');
  const [addSectionForGradeId, setAddSectionForGradeId] = useState<string | null>(null);
  const [addSectionName, setAddSectionName] = useState('');
  const [addSectionBusy, setAddSectionBusy] = useState(false);
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  // Delete section (with transfer if it has students)
  const [deleteSec, setDeleteSec] = useState<{ sec: SectionRow; gradeName: string } | null>(null);
  const [deleteStudentIds, setDeleteStudentIds] = useState<string[]>([]);
  const [deleteTargetGradeId, setDeleteTargetGradeId] = useState<string | null>(null);
  const [deleteTargetSectionId, setDeleteTargetSectionId] = useState<string | null>(null);
  const [deleteLoadingStudents, setDeleteLoadingStudents] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ── Load institute structure ────────────────────────────────────────────
  const loadStructure = useCallback(async () => {
    if (!userInstituteId) {
      setLoading(false);
      return;
    }
    try {
      setLoadError(null);
      // Fetch institute type so we know whether to use stages/grades/sections
      const { data: inst } = await supabase
        .from('institutes').select('type').eq('id', userInstituteId).maybeSingle();
      const type = (inst?.type === 'institute' ? 'institute' : 'school') as 'school' | 'institute';
      setInstType(type);

      // Always fetch stages/grades/sections — even for institutes we'll ignore
      // the empty stages. This keeps the code path uniform.
      const structure = await api.getSchoolStructure(userInstituteId);
      const stg = (structure.stages || []) as StageRow[];
      const grd = (structure.grades || []) as TGradeRow[];
      const sec = (structure.sections || []) as SectionRow[];
      setStages(stg);
      setGrades(grd);
      setSections(sec);
      if (stg.length > 0 && !activeStageId) setActiveStageId(stg[0].id);

      // Tally student count per section. Paginate so very large institutes
      // (100+ sections × 50+ students) never silently truncate.
      if (sec.length > 0) {
        const sectionIds = sec.map((s) => s.id);
        const counts: Record<string, number> = {};
        const PAGE = 1000;
        let from = 0;
        // Safety cap: 50 pages × 1000 = 50k rows. Beyond that something is wrong
        // and a paginated UI is needed anyway.
        for (let i = 0; i < 50; i++) {
          const { data: enr, error } = await supabase
            .from('enrollments')
            .select('section_id')
            .eq('institute_id', userInstituteId)
            .eq('role', 'student')
            .eq('status', 'active')
            .in('section_id', sectionIds)
            .range(from, from + PAGE - 1);
          if (error) break;
          const rows = (enr || []) as any[];
          for (const row of rows) {
            if (row.section_id) counts[row.section_id] = (counts[row.section_id] || 0) + 1;
          }
          if (rows.length < PAGE) break;
          from += PAGE;
        }
        setSectionCounts(counts);
      } else {
        setSectionCounts({});
      }
    } catch (err: any) {
      setLoadError(err?.message || 'تعذّر تحميل هيكل الصفوف');
    }
  }, [userInstituteId, activeStageId]);

  // Trigger institute detection if we landed here without one (e.g. cold open).
  useEffect(() => {
    if (!userInstituteId && userId && !isAdminContext) {
      detectInstitute(userId).catch(() => {});
    }
  }, [userInstituteId, userId, isAdminContext, detectInstitute]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await loadStructure();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInstituteId]);

  // Watchdog: surface a retry instead of an endless spinner if loading hangs.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      if (!userInstituteId && userId) {
        setLoadError('تعذّر تحديد المؤسسة — تحقق من اتصالك');
      } else {
        setLoadError('تأخر تحميل البيانات — اضغط لإعادة المحاولة');
      }
      setLoading(false);
    }, 12000);
    return () => clearTimeout(t);
  }, [loading, userInstituteId, userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStructure();
    setRefreshing(false);
  }, [loadStructure]);

  // ── Derived data ────────────────────────────────────────────────────────
  const activeStageName = useMemo(
    () => stages.find((s) => s.id === activeStageId)?.name || '',
    [stages, activeStageId]
  );
  const isPrepStage = activeStageName.includes('الإعدادية');

  const gradesInStage = useMemo(() => {
    if (!activeStageId) return [];
    const list = grades
      .filter((g) => g.stage_id === activeStageId)
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    if (!isPrepStage || trackFilter === 'all') return list;
    return list.filter((g) => {
      const hasSci = g.name.includes('علمي');
      const hasLit = g.name.includes('أدبي') || g.name.includes('الأدبي');
      if (trackFilter === 'علمي') return hasSci;
      if (trackFilter === 'أدبي') return hasLit;
      return true;
    });
  }, [grades, activeStageId, isPrepStage, trackFilter]);

  const sectionsByGrade = useMemo(() => {
    const map: Record<string, SectionRow[]> = {};
    for (const sec of sections) {
      if (!map[sec.grade_id]) map[sec.grade_id] = [];
      map[sec.grade_id].push(sec);
    }
    // Keep a stable order: by Arabic letter order in name
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return map;
  }, [sections]);

  const totalStudentsInStage = useMemo(() => {
    const gradeIds = new Set(gradesInStage.map((g) => g.id));
    return Object.entries(sectionCounts).reduce((sum, [secId, n]) => {
      const sec = sections.find((s) => s.id === secId);
      if (sec && gradeIds.has(sec.grade_id)) return sum + n;
      return sum;
    }, 0);
  }, [gradesInStage, sectionCounts, sections]);

  // ── Add grade / add section handlers ─────────────────────────────────────
  const openAddGrade = useCallback(() => {
    if (!activeStageId) {
      Alert.alert('تنبيه', 'اختر مرحلة أولاً');
      return;
    }
    setAddGradeName('');
    setAddGradeTrack('none');
    setAddGradeOpen(true);
  }, [activeStageId]);

  const submitAddGrade = useCallback(async () => {
    if (!userInstituteId || !activeStageId) return;
    const base = addGradeName.trim();
    if (!base) {
      Alert.alert('تنبيه', 'اكتب اسم الصف');
      return;
    }
    // For إعدادية, auto-append track suffix if chosen and not already in name
    let finalName = base;
    if (isPrepStage && addGradeTrack !== 'none') {
      const suffix = addGradeTrack;
      if (!base.includes('علمي') && !base.includes('أدبي')) {
        finalName = `${base} - ${suffix}`;
      }
    }
    const dup = grades.some((g) => g.stage_id === activeStageId && g.name.trim() === finalName);
    if (dup) {
      Alert.alert('تنبيه', 'الصف موجود مسبقاً بهذه المرحلة');
      return;
    }
    setAddGradeBusy(true);
    try {
      await api.addGrade(activeStageId, userInstituteId, finalName);
      setAddGradeOpen(false);
      setAddGradeName('');
      setAddGradeTrack('none');
      await loadStructure();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر إضافة الصف');
    } finally {
      setAddGradeBusy(false);
    }
  }, [userInstituteId, activeStageId, addGradeName, addGradeTrack, isPrepStage, grades, loadStructure]);

  const openAddSection = useCallback((gradeId: string) => {
    setAddSectionForGradeId(gradeId);
    setAddSectionName('');
    setSelectedPresets([]);
  }, []);

  const submitAddSection = useCallback(async () => {
    if (!userInstituteId || !addSectionForGradeId) return;
    const typed = addSectionName.trim();
    const namesToAdd: string[] = [];
    for (const p of selectedPresets) if (!namesToAdd.includes(p)) namesToAdd.push(p);
    if (typed && !namesToAdd.includes(typed)) namesToAdd.push(typed);

    if (namesToAdd.length === 0) {
      Alert.alert('تنبيه', 'اختر شعبة أو اكتب اسماً');
      return;
    }
    const existing = new Set(
      sections.filter((s) => s.grade_id === addSectionForGradeId).map((s) => s.name.trim())
    );
    const dupes = namesToAdd.filter((n) => existing.has(n));
    const fresh = namesToAdd.filter((n) => !existing.has(n));
    if (fresh.length === 0) {
      Alert.alert('تنبيه', 'جميع الشعب المختارة موجودة مسبقاً');
      return;
    }
    setAddSectionBusy(true);
    try {
      for (const n of fresh) {
        await api.addSection(addSectionForGradeId, userInstituteId, n);
      }
      setAddSectionForGradeId(null);
      setAddSectionName('');
      setSelectedPresets([]);
      await loadStructure();
      if (dupes.length > 0) {
        Alert.alert('تم', `أُضيفت ${fresh.length} شعبة. تم تجاهل ${dupes.length} موجودة مسبقاً.`);
      }
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر إضافة الشعبة');
    } finally {
      setAddSectionBusy(false);
    }
  }, [userInstituteId, addSectionForGradeId, addSectionName, selectedPresets, sections, loadStructure]);

  // ── Delete section (with transfer) ──────────────────────────────────────
  const openDeleteSection = useCallback(async (sec: SectionRow, gradeName: string) => {
    if (!userInstituteId) return;
    setDeleteSec({ sec, gradeName });
    setDeleteTargetGradeId(null);
    setDeleteTargetSectionId(null);
    setDeleteStudentIds([]);
    setDeleteLoadingStudents(true);
    try {
      const students = await api.getStudentsByClass(sec.id, userInstituteId);
      setDeleteStudentIds(students.map((s: any) => s.id));
    } catch {
      setDeleteStudentIds([]);
    } finally {
      setDeleteLoadingStudents(false);
    }
  }, [userInstituteId]);

  const submitDeleteSection = useCallback(async () => {
    if (!userInstituteId || !deleteSec) return;
    const secId = deleteSec.sec.id;
    const count = deleteStudentIds.length;

    if (count > 0) {
      if (!deleteTargetGradeId || !deleteTargetSectionId) {
        Alert.alert('تنبيه', 'اختر الصف والشعبة لنقل الطلاب إليهما');
        return;
      }
      if (deleteTargetSectionId === secId) {
        Alert.alert('تنبيه', 'لا يمكن النقل إلى نفس الشعبة التي تحذفها');
        return;
      }
    }

    setDeleteBusy(true);
    try {
      if (count > 0) {
        for (const uid of deleteStudentIds) {
          await api.transferStudentToSection(uid, userInstituteId, deleteTargetGradeId!, deleteTargetSectionId!);
        }
      }
      await api.deleteSection(secId);
      setDeleteSec(null);
      setDeleteStudentIds([]);
      setDeleteTargetGradeId(null);
      setDeleteTargetSectionId(null);
      await loadStructure();
      Alert.alert('تم', count > 0 ? `تم نقل ${count} طالب وحذف الشعبة` : 'تم حذف الشعبة');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذر حذف الشعبة');
    } finally {
      setDeleteBusy(false);
    }
  }, [userInstituteId, deleteSec, deleteStudentIds, deleteTargetGradeId, deleteTargetSectionId, loadStructure]);

  // ── Section drill-down ──────────────────────────────────────────────────
  const openSection = useCallback(async (sec: SectionRow, gradeName: string) => {
    if (!userInstituteId) return;
    setSelectedSection(sec);
    setSelectedGradeName(gradeName);
    setTab('students');
    setStudentSearch('');
    setExpandedStudent(null);
    setStudentDetails({});
    setSecLoading(true);
    try {
      // Teachers in a section come from TWO sources:
      //   1. enrollments (legacy / generic role link)
      //   2. teacher_assignments (per-subject assignment — the canonical source for school flows)
      // The school create-user wizard stores classes.id into teacher_assignments.section_id,
      // so we also match by classes-id-in-section_id (covered by direct .eq on section_id).
      const [stuRes, teaEnrRes, teaAsnRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select('user_id, users:user_id (id, full_name, code)')
          .eq('institute_id', userInstituteId)
          .eq('role', 'student')
          .eq('section_id', sec.id)
          .eq('status', 'active')
          .limit(5000),
        supabase
          .from('enrollments')
          .select('user_id, users:user_id (id, full_name, code)')
          .eq('institute_id', userInstituteId)
          .eq('role', 'teacher')
          .eq('section_id', sec.id)
          .eq('status', 'active')
          .limit(500),
        supabase
          .from('teacher_assignments')
          .select('teacher_id, subject_id, users:teacher_id (id, full_name, code), subjects:subject_id (name)')
          .eq('institute_id', userInstituteId)
          .eq('section_id', sec.id)
          .limit(2000),
      ]);

      const stu: UserLite[] = (stuRes.data || [])
        .filter((r: any) => r.users)
        .map((r: any) => ({ id: r.user_id, full_name: r.users.full_name || '—', code: r.users.code }));

      // Build teacher → subjects map from teacher_assignments
      const teacherMap = new Map<string, UserLite>();
      for (const r of (teaAsnRes.data || []) as any[]) {
        if (!r.users) continue;
        const id = r.teacher_id || r.users.id;
        const subName: string | null = Array.isArray(r.subjects) ? r.subjects[0]?.name : r.subjects?.name;
        if (!teacherMap.has(id)) {
          teacherMap.set(id, {
            id,
            full_name: r.users.full_name || '—',
            code: r.users.code,
            subjects: [],
          });
        }
        if (subName && !teacherMap.get(id)!.subjects!.includes(subName)) {
          teacherMap.get(id)!.subjects!.push(subName);
        }
      }
      // Add enrollment-based teachers that aren't already in the map
      for (const r of (teaEnrRes.data || []) as any[]) {
        if (!r.users) continue;
        const id = r.user_id;
        if (!teacherMap.has(id)) {
          teacherMap.set(id, {
            id,
            full_name: r.users.full_name || '—',
            code: r.users.code,
            subjects: [],
          });
        }
      }

      setSecStudents(stu);
      setSecTeachers(Array.from(teacherMap.values()));
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'تعذّر تحميل بيانات الشعبة');
    } finally {
      setSecLoading(false);
    }
  }, [userInstituteId]);

  const toggleStudent = useCallback(async (studentId: string) => {
    const willOpen = expandedStudent !== studentId;
    setExpandedStudent(willOpen ? studentId : null);
    if (!willOpen || !userInstituteId || !userId) return;
    if (studentDetails[studentId]) return;
    setStudentDetails((prev) => ({
      ...prev,
      [studentId]: { loading: true, grades: [], attendance: emptyAttendance(), avgGrade: 0 },
    }));
    try {
      const [gradesData, att] = await Promise.all([
        api.getStudentGrades(studentId, undefined, userId, userInstituteId),
        api.getAttendanceSummary(studentId, userInstituteId),
      ]);
      const avg = gradesData.length > 0
        ? Math.round(gradesData.reduce((s: number, g: any) => s + Number(g.score || 0), 0) / gradesData.length)
        : 0;
      setStudentDetails((prev) => ({
        ...prev,
        [studentId]: { loading: false, grades: gradesData as any, attendance: att as any, avgGrade: avg },
      }));
    } catch {
      setStudentDetails((prev) => ({
        ...prev,
        [studentId]: { loading: false, grades: [], attendance: emptyAttendance(), avgGrade: 0 },
      }));
    }
  }, [expandedStudent, userInstituteId, userId, studentDetails]);

  // ── Open action dialogs ────────────────────────────────────────────────
  const openResetCode = useCallback(async (user: UserLite, role: 'student' | 'teacher') => {
    setActionUser(user);
    setActionUserRole(role);
    setActionType('reset-code');
    setCodeAvail('unknown');
    // Auto-generate a fresh unique code as the starting suggestion
    try {
      const code = await api.generateUniqueCode(8);
      setNewCode(code);
      setCodeAvail('yes');
    } catch {
      setNewCode('');
    }
  }, []);

  const openTransferSection = useCallback((user: UserLite, role: 'student' | 'teacher') => {
    setActionUser(user);
    setActionUserRole(role);
    setActionType('transfer-section');
    setTargetSectionId(null);
    setTeacherTransferMode('add');
  }, []);

  const openTransferGrade = useCallback((user: UserLite, role: 'student' | 'teacher') => {
    setActionUser(user);
    setActionUserRole(role);
    setActionType('transfer-grade');
    setTargetStageId(activeStageId);
    setTargetGradeId(null);
    setTargetSectionId(null);
  }, [activeStageId]);

  const closeAction = useCallback(() => {
    setActionUser(null);
    setActionType(null);
    setActionBusy(false);
    setNewCode('');
    setCodeAvail('unknown');
    setTargetSectionId(null);
    setTargetGradeId(null);
    setTargetStageId(null);
  }, []);

  // ── Actions: regenerate code, check availability, submit ───────────────
  const regenerateCode = useCallback(async () => {
    try {
      const code = await api.generateUniqueCode(8);
      setNewCode(code);
      setCodeAvail('yes');
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل توليد الرمز');
    }
  }, []);

  const checkCodeAvailability = useCallback(async (code: string) => {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed || trimmed.length < 4) { setCodeAvail('unknown'); return; }
    try {
      const ok = await api.checkCodeAvailable(trimmed);
      setCodeAvail(ok ? 'yes' : 'no');
    } catch {
      setCodeAvail('unknown');
    }
  }, []);

  const submitResetCode = useCallback(async () => {
    if (!actionUser) return;
    const code = (newCode || '').trim().toUpperCase();
    if (code.length < 4) {
      Alert.alert('خطأ', 'الرمز قصير جداً');
      return;
    }
    if (codeAvail === 'no') {
      Alert.alert('خطأ', 'هذا الرمز مستخدم — اختر غيره');
      return;
    }
    setActionBusy(true);
    try {
      await api.resetUserCode(actionUser.id, code);
      Alert.alert('تم', `الرمز الجديد:\n${code}`);
      // Refresh the section list so the new code shows
      if (selectedSection) await openSection(selectedSection, selectedGradeName);
      closeAction();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تغيير الرمز');
    } finally {
      setActionBusy(false);
    }
  }, [actionUser, newCode, codeAvail, selectedSection, selectedGradeName, openSection, closeAction]);

  // Transfer a student to another section within the same grade. Keeps all
  // grades/attendance as the student stays in the same grade.
  const submitTransferSection = useCallback(async () => {
    if (!actionUser || !selectedSection || !targetSectionId || !userInstituteId) return;
    if (targetSectionId === selectedSection.id) {
      Alert.alert('تنبيه', 'الطالب بالفعل في هذه الشعبة');
      return;
    }
    setActionBusy(true);
    try {
      if (actionUserRole === 'student') {
        const { error } = await supabase
          .from('enrollments')
          .update({ section_id: targetSectionId })
          .eq('user_id', actionUser.id)
          .eq('institute_id', userInstituteId)
          .eq('role', 'student')
          .eq('section_id', selectedSection.id);
        if (error) throw new Error(error.message);
      } else {
        // Teacher — respect add-vs-replace mode
        if (teacherTransferMode === 'replace') {
          const { error: delErr } = await supabase
            .from('enrollments').delete()
            .eq('user_id', actionUser.id)
            .eq('institute_id', userInstituteId)
            .eq('role', 'teacher')
            .eq('section_id', selectedSection.id);
          if (delErr) throw new Error(delErr.message);
        }
        const { error: addErr } = await supabase
          .from('enrollments').insert({
            user_id: actionUser.id,
            institute_id: userInstituteId,
            role: 'teacher',
            section_id: targetSectionId,
            status: 'active',
          });
        if (addErr && !/duplicate/i.test(addErr.message)) throw new Error(addErr.message);
      }
      Alert.alert('تم', 'تم نقل المستخدم بنجاح');
      await openSection(selectedSection, selectedGradeName);
      await loadStructure();
      closeAction();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل النقل');
    } finally {
      setActionBusy(false);
    }
  }, [actionUser, actionUserRole, selectedSection, selectedGradeName, targetSectionId, userInstituteId, teacherTransferMode, openSection, loadStructure, closeAction]);

  // Transfer a student to a different grade. Per spec: old grades/attendance
  // stay in DB (archived), but the student's new enrollment points elsewhere.
  // We tag old enrollment rows with status='archived' so aggregated queries
  // can filter them out — data is preserved for the later graduation export.
  const submitTransferGrade = useCallback(async () => {
    if (!actionUser || !selectedSection || !targetGradeId || !targetSectionId || !userInstituteId) return;
    setActionBusy(true);
    try {
      if (actionUserRole === 'student') {
        // Step 1: archive old student enrollment (soft)
        const { error: arcErr } = await supabase
          .from('enrollments')
          .update({ status: 'archived' })
          .eq('user_id', actionUser.id)
          .eq('institute_id', userInstituteId)
          .eq('role', 'student')
          .eq('status', 'active');
        if (arcErr) throw new Error(arcErr.message);
        // Step 2: insert new active enrollment in target grade/section
        const { error: insErr } = await supabase
          .from('enrollments').insert({
            user_id: actionUser.id,
            institute_id: userInstituteId,
            role: 'student',
            grade_id: targetGradeId,
            section_id: targetSectionId,
            status: 'active',
          });
        if (insErr) throw new Error(insErr.message);
      } else {
        // Teacher: add new assignment (never destroy prior ones unless replace)
        if (teacherTransferMode === 'replace') {
          await supabase
            .from('enrollments').delete()
            .eq('user_id', actionUser.id)
            .eq('institute_id', userInstituteId)
            .eq('role', 'teacher')
            .eq('section_id', selectedSection.id);
        }
        await supabase
          .from('enrollments').insert({
            user_id: actionUser.id,
            institute_id: userInstituteId,
            role: 'teacher',
            grade_id: targetGradeId,
            section_id: targetSectionId,
            status: 'active',
          });
      }
      Alert.alert('تم', 'تم نقل المستخدم للصف الجديد' + (actionUserRole === 'student' ? ' (درجاته السابقة محفوظة بالأرشيف)' : ''));
      await openSection(selectedSection, selectedGradeName);
      await loadStructure();
      closeAction();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل النقل');
    } finally {
      setActionBusy(false);
    }
  }, [actionUser, actionUserRole, selectedSection, selectedGradeName, targetGradeId, targetSectionId, userInstituteId, teacherTransferMode, openSection, loadStructure, closeAction]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim();
    if (!q) return secStudents;
    return secStudents.filter((s) => searchMatch(s.full_name, q) || searchMatch(s.code, q));
  }, [secStudents, studentSearch]);

  // ── Add-section sheet props (computed) ──────────────────────────────────
  const addSectionExisting = useMemo(() => {
    if (!addSectionForGradeId) return new Set<string>();
    return new Set(
      sections
        .filter((s) => s.grade_id === addSectionForGradeId)
        .map((s) => s.name.trim())
    );
  }, [sections, addSectionForGradeId]);

  const togglePreset = useCallback((p: string) => {
    setSelectedPresets((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // DETAIL VIEW — SECTION DRILL-DOWN
  // ═══════════════════════════════════════════════════════════════════════
  if (selectedSection) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <SectionDetailHeader
          sectionName={selectedSection.name}
          gradeName={selectedGradeName}
          onBack={() => setSelectedSection(null)}
        />

        <KeyboardAwareScroll
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={secLoading}
              onRefresh={() => openSection(selectedSection, selectedGradeName)}
              tintColor={Colors.primary}
            />
          }
        >
          <SectionHero
            sectionName={selectedSection.name}
            gradeName={selectedGradeName}
            studentsCount={secStudents.length}
            teachersCount={secTeachers.length}
          />

          {/* Tabs */}
          <View style={styles.tabsRow}>
            <TabButton
              active={tab === 'students'} label="الطلاب" icon="people"
              count={secStudents.length} onPress={() => setTab('students')}
            />
            <TabButton
              active={tab === 'teachers'} label="الأساتذة" icon="person"
              count={secTeachers.length} onPress={() => setTab('teachers')}
            />
          </View>

          {secLoading ? (
            <SkeletonList count={4} cardHeight={68} />
          ) : tab === 'students' ? (
            <>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={Colors.textMuted} />
                <TextInput
                  placeholder="بحث عن طالب..."
                  placeholderTextColor={Colors.textMuted}
                  value={studentSearch}
                  onChangeText={setStudentSearch}
                  style={styles.searchInput}
                  textAlign="right"
                />
              </View>
              {filteredStudents.length === 0 ? (
                <EmptyState icon="people-outline" label="لا يوجد طلاب في هذه الشعبة بعد" />
              ) : (
                filteredStudents.map((s) => (
                  <StudentCard
                    key={s.id}
                    student={s}
                    expanded={expandedStudent === s.id}
                    detail={studentDetails[s.id]}
                    onToggle={() => toggleStudent(s.id)}
                    onResetCode={() => openResetCode(s, 'student')}
                    onTransferSection={() => openTransferSection(s, 'student')}
                    onTransferGrade={() => openTransferGrade(s, 'student')}
                  />
                ))
              )}
            </>
          ) : (
            secTeachers.length === 0 ? (
              <EmptyState icon="person-outline" label="لا يوجد أساتذة مرتبطون بهذه الشعبة بعد" />
            ) : (
              secTeachers.map((t) => (
                <TeacherCard
                  key={t.id}
                  teacher={t}
                  onResetCode={() => openResetCode(t, 'teacher')}
                  onTransferSection={() => openTransferSection(t, 'teacher')}
                  onTransferGrade={() => openTransferGrade(t, 'teacher')}
                />
              ))
            )
          )}
        </KeyboardAwareScroll>

        {/* Shared action modal (reset code / transfer section / transfer grade) */}
        <ActionModal
          actionUser={actionUser}
          actionUserRole={actionUserRole}
          actionType={actionType}
          actionBusy={actionBusy}
          newCode={newCode}
          codeAvail={codeAvail}
          targetStageId={targetStageId}
          targetGradeId={targetGradeId}
          targetSectionId={targetSectionId}
          teacherTransferMode={teacherTransferMode}
          stages={stages}
          grades={grades}
          sections={sections}
          sectionCounts={sectionCounts}
          selectedSection={selectedSection}
          setNewCode={setNewCode}
          setCodeAvail={setCodeAvail}
          setTargetStageId={setTargetStageId}
          setTargetGradeId={setTargetGradeId}
          setTargetSectionId={setTargetSectionId}
          setTeacherTransferMode={setTeacherTransferMode}
          onClose={closeAction}
          onRegenerate={regenerateCode}
          onCheckAvailability={checkCodeAvailability}
          onSubmitReset={submitResetCode}
          onSubmitTransferSection={submitTransferSection}
          onSubmitTransferGrade={submitTransferGrade}
        />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIST VIEW — STAGES → GRADES → SECTIONS
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الصفوف والشعب"
        subtitle={instType === 'school'
          ? `${stages.length} مرحلة · ${grades.length} صف · ${sections.length} شعبة`
          : `${grades.length} صف`}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={isAdminContext}
        onBack={isAdminContext ? () => router.replace('/(admin)/institutions' as any) : undefined}
        fallbackRoute={isAdminContext ? '/(admin)/institutions' : '/(institute)'}
      />

      {loading ? (
        <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
          <SkeletonList count={6} cardHeight={72} />
        </View>
      ) : loadError ? (
        <ErrorState
          title="تعذّر تحميل الصفوف"
          message={loadError}
          retryLabel="إعادة المحاولة"
          onRetry={async () => {
            setLoadError(null);
            setLoading(true);
            if (!userInstituteId && userId && !isAdminContext) {
              await detectInstitute(userId);
            }
            await loadStructure();
            setLoading(false);
          }}
        />
      ) : stages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="school-outline"
            label={instType === 'school'
              ? 'لم يتم تفعيل مراحل لهذه المدرسة بعد — راجع المدير العام'
              : 'لم يتم إضافة صفوف بعد'}
          />
        </View>
      ) : (
        <>
          <StageTabs
            stages={stages}
            grades={grades}
            activeStageId={activeStageId}
            onSelectStage={(id) => { setActiveStageId(id); setTrackFilter('all'); }}
          />

          <StageSummary total={totalStudentsInStage} />

          <FilterBar
            isPrepStage={isPrepStage}
            trackFilter={trackFilter}
            onTrackChange={setTrackFilter}
            gradesCount={gradesInStage.length}
            sectionsCount={sections.filter((s) => gradesInStage.some((g) => g.id === s.grade_id)).length}
          />

          {/* Grades list with inline sections */}
          <ScrollView
            contentContainerStyle={{ padding: 14, paddingTop: 6, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          >
            {/* Add grade button — full width dashed */}
            <TouchableOpacity activeOpacity={0.8} onPress={openAddGrade} style={styles.addGradeFull}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={styles.addGradeFullText}>إضافة صف جديد</Text>
            </TouchableOpacity>

            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.hintText}>اضغط مطولاً على الشعبة للحذف أو نقل طلابها</Text>
            </View>

            {gradesInStage.length === 0 ? (
              <EmptyState icon="grid-outline" label="لم يتم إضافة صفوف لهذه المرحلة بعد" />
            ) : (
              gradesInStage.map((g) => (
                <GradeRow
                  key={g.id}
                  grade={g}
                  sections={sectionsByGrade[g.id] || []}
                  sectionCounts={sectionCounts}
                  onOpenSection={openSection}
                  onLongPressSection={openDeleteSection}
                  onAddSection={openAddSection}
                />
              ))
            )}
          </ScrollView>
        </>
      )}

      <AddGradeSheet
        visible={addGradeOpen}
        stageName={stages.find((s) => s.id === activeStageId)?.name || ''}
        isPrepStage={isPrepStage}
        name={addGradeName}
        track={addGradeTrack}
        busy={addGradeBusy}
        onChangeName={setAddGradeName}
        onChangeTrack={setAddGradeTrack}
        onClose={() => setAddGradeOpen(false)}
        onSubmit={submitAddGrade}
      />

      <AddSectionSheet
        visible={!!addSectionForGradeId}
        gradeName={grades.find((g) => g.id === addSectionForGradeId)?.name || ''}
        existingNames={addSectionExisting}
        selectedPresets={selectedPresets}
        customName={addSectionName}
        busy={addSectionBusy}
        onTogglePreset={togglePreset}
        onChangeCustomName={setAddSectionName}
        onClose={() => setAddSectionForGradeId(null)}
        onSubmit={submitAddSection}
      />

      <DeleteSectionSheet
        target={deleteSec}
        loadingStudents={deleteLoadingStudents}
        studentIds={deleteStudentIds}
        grades={grades}
        sectionsByGrade={sectionsByGrade}
        targetGradeId={deleteTargetGradeId}
        targetSectionId={deleteTargetSectionId}
        busy={deleteBusy}
        onPickGrade={(gradeId) => { setDeleteTargetGradeId(gradeId); setDeleteTargetSectionId(null); }}
        onPickSection={setDeleteTargetSectionId}
        onClose={() => setDeleteSec(null)}
        onSubmit={submitDeleteSection}
      />
    </SafeAreaView>
  );
}

// ─── Styles (only what is still used by this parent file) ─────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  addGradeFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: Colors.primary + '10',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    borderStyle: 'dashed',
  },
  addGradeFullText: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 12,
  },
  hintText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },

  // Tabs inside detail view
  tabsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },

  // Search wrapper for student list
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, padding: 0 },
});
