// useGradesController — owns all teacher-grades state, effects, handlers, and Supabase calls.
// Lives next to the grades components so the route file stays orchestration-only.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import useAuthStore from '../../../stores/authStore';
import useDataStore from '../../../stores/dataStore';
import useTeacherStore from '../../../stores/teacherStore';
import { api } from '../../../services/api';
import { hapticSuccess } from '../../../utils/performance';
import { haptics } from '../../../utils/haptics';

type ConfirmState = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function useGradesController() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { t } = useTranslation();
  const { targets, loadTargets, loadTeacherData } = useTeacherStore();

  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Wizard state
  const [selectedCat, setSelectedCat] = useState<any>(null);
  const [targetKey, setTargetKey] = useState<string>(''); // "classId|sectionId|subjectId"
  const [students, setStudents] = useState<any[]>([]);
  const [gradeEntries, setGradeEntries] = useState<Record<string, string>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // New category modal
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('monthly');
  const [newCatMax, setNewCatMax] = useState('100');
  const [creatingCat, setCreatingCat] = useState(false);

  // Stage 2: search + class filter
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedStudentId, setFocusedStudentId] = useState<string | null>(null);

  // Phase 3.7 — per-student progress drawer (opens on demand so list mount stays fast)
  const [progressStudent, setProgressStudent] = useState<{ id: string; name: string } | null>(null);

  // ConfirmSheet state — replaces inline Alert.alert confirms
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    visible: false, title: '', confirmLabel: '', onConfirm: () => {},
  });

  const selectedTarget = useMemo(() => {
    if (!targetKey) return null;
    return targets.find(tg =>
      `${tg.classId || ''}|${tg.sectionId || ''}|${tg.subjectId}` === targetKey
    );
  }, [targets, targetKey]);

  const loadCategories = useCallback(async () => {
    if (!userInstituteId) { setLoading(false); return; }
    try {
      const data = await api.getGradeCategories(userInstituteId);
      setCategories(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [userInstituteId]);

  // On mount: make sure teacher targets/assignments are loaded even if the user
  // jumped straight here without visiting home (where the store is populated).
  useEffect(() => {
    if (!userId) return;
    if (targets.length === 0) {
      loadTargets(userId).catch(() => {});
      if (userInstituteId) loadTeacherData(userId, userInstituteId).catch(() => {});
    }
    loadCategories();
  }, [userId, userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userId) {
        await loadTargets(userId).catch(() => {});
      }
      await loadCategories();
    } finally {
      setRefreshing(false);
    }
  }, [userId, loadCategories]);

  // Re-load students when target changes
  useEffect(() => {
    const run = async () => {
      if (!selectedCat || !selectedTarget) { setStudents([]); return; }
      setLoadingStudents(true);
      try {
        // Use section_id if present (school), otherwise class_id (institute group)
        const scopeId = selectedTarget.sectionId || selectedTarget.classId;
        if (!scopeId) { setStudents([]); return; }
        // Parallel: roster and existing-grades come from independent tables; fetch together to cut wait.
        const [studentList, existing] = await Promise.all([
          api.getStudentsByClass(scopeId, userInstituteId || undefined),
          api.getGradesByCategory(
            selectedCat.id,
            selectedTarget.sectionId || selectedTarget.classId || undefined,
            selectedTarget.subjectName,
            userInstituteId || undefined,
          ),
        ]);
        setStudents(studentList);
        const map: Record<string, string> = {};
        existing.forEach((g: any) => { map[g.student_id] = String(g.score); });
        setGradeEntries(map);

        // Determine publish state — any row marked is_published means the set is public.
        const anyPublished = existing.some((g: any) => g.is_published);
        setIsPublished(anyPublished);
      } catch (err) { console.error(err); }
      finally { setLoadingStudents(false); }
    };
    run();
  }, [selectedCat, targetKey, userInstituteId]);

  const handlePublish = () => {
    // Fail-fast: cross-institute guard — publish must never fire without a scoped institute.
    if (!userInstituteId) {
      Alert.alert(t('common.error'), 'المؤسسة غير محددة');
      return;
    }
    if (!selectedCat || !selectedTarget || !userId) return;
    const next = !isPublished;
    const title = next ? 'نشر الدرجات للطلاب؟' : 'إخفاء الدرجات عن الطلاب؟';
    const msg = next
      ? 'سيتمكّن الطلاب وأولياء الأمور من رؤية الدرجات فوراً وسيتلقّون إشعاراً'
      : 'الدرجات لن تعود ظاهرة للطلاب حتى تنشرها مرة أخرى';
    setConfirmState({
      visible: true,
      title,
      message: msg,
      confirmLabel: next ? 'نشر' : 'إخفاء',
      destructive: next,
      onConfirm: async () => {
        setPublishing(true);
        try {
          await api.publishCategoryGrades({
            categoryId: selectedCat.id,
            classId: selectedTarget.sectionId || selectedTarget.classId || undefined,
            subject: selectedTarget.subjectName,
            instituteId: userInstituteId,
            teacherId: userId,
            publish: next,
          });
          setIsPublished(next);
          hapticSuccess();
          Alert.alert(t('common.success'), next ? 'تم نشر الدرجات — الطلاب يستلمون إشعاراً' : 'تم إلغاء النشر');
        } catch (err: any) {
          Alert.alert(t('common.error'), err?.message || 'فشل النشر');
        } finally { setPublishing(false); }
      },
    });
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim() || !userInstituteId) return;
    const max = Number(newCatMax) || 100;
    if (max < 1 || max > 1000) {
      Alert.alert(t('common.error'), 'الدرجة القصوى يجب أن تكون بين 1 و 1000');
      return;
    }
    setCreatingCat(true);
    try {
      await api.createGradeCategory(userInstituteId, newCatName.trim(), newCatType, max);
      hapticSuccess();
      Alert.alert(t('common.success'), t('teacherGrades.categoryCreated'));
      setShowNewCat(false);
      setNewCatName('');
      setNewCatType('monthly');
      setNewCatMax('100');
      loadCategories();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
    finally { setCreatingCat(false); }
  };

  const handleSaveAllGrades = async () => {
    if (!selectedCat || !selectedTarget || !userId || !userInstituteId) return;
    const entries = Object.entries(gradeEntries).filter(([_, v]) => v.trim() !== '');
    if (entries.length === 0) { Alert.alert(t('common.warning'), t('teacherGrades.noGradesToSave')); return; }

    // Validate each score against max (accept comma as decimal separator for AR keyboards)
    const normalized: Array<[string, number]> = [];
    for (const [sid, v] of entries) {
      const n = Number(v.replace(',', '.'));
      if (isNaN(n) || n < 0) {
        Alert.alert(t('common.error'), 'بعض الدرجات غير صالحة (رقم موجب مطلوب)');
        return;
      }
      if (n > selectedCat.max_score) {
        Alert.alert(t('common.error'), `درجة أعلى من الحد الأقصى (${selectedCat.max_score})`);
        return;
      }
      normalized.push([sid, n]);
    }

    setSaving(true);
    try {
      // teacherId is intentionally NOT passed — the API derives it from the
      // authenticated session to prevent client-side spoofing of authorship.
      const grades = normalized.map(([studentId, score]) => ({
        instituteId: userInstituteId,
        categoryId: selectedCat.id,
        studentId,
        subject: selectedTarget.subjectName,
        classId: selectedTarget.sectionId || selectedTarget.classId || undefined,
        score,
        maxScore: selectedCat.max_score || 100,
      }));
      await api.saveBulkGrades(grades);
      hapticSuccess();
      Alert.alert(t('common.success'), t('teacherGrades.gradesSaved', { count: grades.length }));
    } catch (err: any) { Alert.alert(t('common.error'), err.message || t('teacherGrades.saveGradesFailed')); }
    finally { setSaving(false); }
  };

  // Score input border color — brand500 when focused, success when filled, danger if invalid, warning below 50%
  const scoreBorderColor = (val: string, focused: boolean): string => {
    if (focused) return tokens.color.brand500;
    if (!val) return tokens.color.border;
    const n = Number(val);
    if (isNaN(n)) return tokens.color.danger;
    if (selectedCat && n > selectedCat.max_score) return tokens.color.danger;
    if (selectedCat && n < (selectedCat.max_score * 0.5)) return tokens.color.warning;
    return tokens.color.success;
  };

  const filledCount = Object.values(gradeEntries).filter(v => v.trim() !== '').length;

  const avgScore = useMemo(() => {
    // Include zero scores — a student who got 0 is a valid sample for the average.
    const vals = Object.values(gradeEntries)
      .filter(v => v.trim() !== '')
      .map(v => Number(v.replace(',', '.')))
      .filter(n => !isNaN(n) && n >= 0);
    if (vals.length === 0 || !selectedCat || !selectedCat.max_score) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round((avg / selectedCat.max_score) * 100);
  }, [gradeEntries, selectedCat]);

  const closeConfirm = () => setConfirmState(prev => ({ ...prev, visible: false }));

  const exitStageTwo = () => {
    setSelectedCat(null);
    setStudents([]);
    setGradeEntries({});
    setTargetKey('');
    setIsPublished(false);
  };

  const setEntry = (studentId: string, value: string) =>
    setGradeEntries(prev => ({ ...prev, [studentId]: value }));

  return {
    // store-derived
    targets, userInstituteId,
    // data
    categories, loading, refreshing,
    selectedCat, setSelectedCat,
    targetKey, setTargetKey, selectedTarget,
    students, gradeEntries, setEntry,
    loadingStudents, saving,
    isPublished, publishing,
    filledCount, avgScore, scoreBorderColor,
    // new-category sheet
    showNewCat, setShowNewCat,
    newCatName, setNewCatName,
    newCatType, setNewCatType,
    newCatMax, setNewCatMax,
    creatingCat,
    // stage 2 ui
    searchQuery, setSearchQuery,
    focusedStudentId, setFocusedStudentId,
    progressStudent, setProgressStudent,
    // confirm sheet
    confirmState, closeConfirm,
    // handlers
    onRefresh,
    handlePublish, handleCreateCategory, handleSaveAllGrades,
    exitStageTwo,
  };
}
