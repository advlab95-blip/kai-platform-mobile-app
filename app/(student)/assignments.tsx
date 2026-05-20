import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { offlineQueue } from '../../utils/offlineQueue';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useStudentStore from '../../stores/studentStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import AssignmentFilterBar, { AssignmentFilterKey } from '../../components/student/assignments/AssignmentFilterBar';
import AssignmentList from '../../components/student/assignments/AssignmentList';
import AssignmentsByDay from '../../components/student/assignments/AssignmentsByDay';
import AssignmentSolveModal from '../../components/student/assignments/sheets/AssignmentSolveModal';
import TaskViewerSheet from '../../components/student/assignments/sheets/TaskViewerSheet';
import { tierOf, safeUrl } from '../../components/student/assignments/_helpers';

export default function StudentAssignments() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { classId } = useStudentStore();
  const { userInstituteId } = useDataStore();
  const [teacherSubjectMap, setTeacherSubjectMap] = useState<Record<string, { subject_id: string; subject_name: string }>>({});
  useEffect(() => {
    if (!userInstituteId) return;
    api.getTeachersSubjectMap(userInstituteId).then(setTeacherSubjectMap).catch(() => setTeacherSubjectMap({}));
  }, [userInstituteId]);
  const isEnabled = useFeatureFlag('electronic_assignments');
  const routeParams = useLocalSearchParams<{ openAssignmentId?: string }>();
  const autoOpenedRef = useRef<string | null>(null);

  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<AssignmentFilterKey>('all');
  // Calendar/list view toggle — adds a "by day" grouping for the student who
  // wants to see "what's due today / tomorrow / this week" instead of a flat
  // list. Defaults to flat list to preserve existing behavior.
  const [viewMode, setViewMode] = useState<'list' | 'byday'>('list');

  // Solve modal
  const [showSolve, setShowSolve] = useState(false);
  const [currentAssignment, setCurrentAssignment] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submissionId, setSubmissionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // Simple task (homework) viewer — for items from `tasks` table that have no structured questions
  const [viewingTask, setViewingTask] = useState<any>(null);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadError(null);
      const data = await api.getStudentAssignmentsList(userId, classId || undefined);
      setAssignments(data);
    } catch (err: any) {
      setLoadError(err?.message || t('common.loadFailed', { defaultValue: 'تعذّر تحميل البيانات' }));
    } finally {
      setLoading(false);
    }
  }, [userId, classId, t]);

  useEffect(() => { loadData(); }, [userId, classId]);

  const openAssignment = useCallback(async (asgn: any) => {
    haptics.selection();
    try {
      const [details, sub] = await Promise.all([
        api.getAssignmentWithQuestions(asgn.id),
        api.getOrCreateSubmission(asgn.id, userId || ''),
      ]);
      setCurrentAssignment(asgn);
      setQuestions(details.questions || []);
      setSubmissionId(sub.id);
      setCurrentQIndex(0);
      // Load existing answers
      const existingAnswers: Record<string, string> = {};
      if (sub.assignment_answers) {
        for (const a of sub.assignment_answers) {
          existingAnswers[a.question_id] = a.answer || '';
        }
      }
      setAnswers(existingAnswers);
      setShowSolve(true);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  }, [userId, t]);

  // Auto-open specific assignment when navigated from subject-detail
  useEffect(() => {
    const targetId = routeParams.openAssignmentId;
    if (!targetId || !assignments.length || autoOpenedRef.current === targetId) return;
    const asgn = assignments.find((a: any) => a.id === targetId);
    if (!asgn) return;
    autoOpenedRef.current = targetId;
    openAssignment(asgn);
  }, [assignments, routeParams.openAssignmentId, openAssignment]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const handleSaveAnswer = async (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    // Always keep a local backup so student's work isn't lost if server fails
    if (submissionId) {
      AsyncStorage.setItem(`assignment_backup_${submissionId}_${questionId}`, answer).catch(() => {});
    }
    setSaveError(false);
    try {
      await api.saveAnswer(submissionId, questionId, answer);
      // Clear backup only once server save succeeded
      AsyncStorage.removeItem(`assignment_backup_${submissionId}_${questionId}`).catch(() => {});
    } catch {
      setSaveError(true);
      // Keep banner visible until next successful save — no auto-hide (student must see it)
    }
  };

  const handleSubmit = () => {
    // Block submit if past deadline
    if (currentAssignment?.due_date && new Date(currentAssignment.due_date) < new Date()) {
      Alert.alert(
        t('common.error'),
        t('student.assignmentPastDue', { defaultValue: 'انتهى الموعد النهائي لهذا الواجب — لا يمكن التسليم' })
      );
      return;
    }
    setShowSubmitConfirm(true);
  };

  const performSubmit = async () => {
    setSubmitting(true);
    // Snapshot connectivity once so we can decide between submit-vs-queue.
    let isOnline = true;
    try {
      const net = await NetInfo.fetch();
      isOnline = !!net.isConnected;
    } catch {
      isOnline = true; // optimistic — let the request itself fail if needed
    }

    const queueForLater = async (reason: 'offline' | 'network_error') => {
      try {
        const id =
          (globalThis as any)?.crypto?.randomUUID?.() ??
          `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await offlineQueue.enqueue({
          id,
          kind: 'assignment_submission',
          payload: { submissionId },
          createdAt: Date.now(),
        });
      } catch {
        // if queueing itself fails, fall through to a generic error message
      }
      Alert.alert(
        t('common.notice', { defaultValue: 'تنبيه' }),
        'تم الحفظ ، سيُرسل عند عودة الاتصال'
      );
      // Optimistic local UI: mark this assignment as pending-submission
      setAssignments(prev =>
        prev.map((a: any) =>
          a.id === currentAssignment?.id ? { ...a, _pending_submit: true } : a
        )
      );
      setShowSolve(false);
    };

    if (!isOnline) {
      await queueForLater('offline');
      setSubmitting(false);
      return;
    }

    try {
      await api.submitAssignment(submissionId);
      Alert.alert(t('common.success'), t('student.assignmentSubmitted'));
      setShowSolve(false);
      loadData();
    } catch (err: any) {
      // Distinguish network failure from real backend errors. We treat fetch /
      // TypeError / "Network request failed" as queueable; everything else
      // surfaces to the user as before.
      const msg: string = String(err?.message || '');
      const isNetworkErr =
        err?.name === 'TypeError' ||
        /Network request failed|Failed to fetch|network/i.test(msg);
      if (isNetworkErr) {
        await queueForLater('network_error');
      } else {
        Alert.alert(t('common.error'), err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const counts = useMemo(() => {
    const c = { all: assignments.length, pending: 0, submitted: 0, late: 0 };
    for (const a of assignments) {
      const ti = tierOf(a);
      if (ti === 'pending') c.pending++;
      else if (ti === 'submitted' || ti === 'graded') c.submitted++;
      else if (ti === 'late') c.late++;
    }
    return c;
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    if (filter === 'all') return assignments;
    return assignments.filter(a => {
      const ti = tierOf(a);
      if (filter === 'pending') return ti === 'pending';
      if (filter === 'submitted') return ti === 'submitted' || ti === 'graded';
      if (filter === 'late') return ti === 'late';
      return true;
    });
  }, [assignments, filter]);

  const handleRowPress = (a: any) => {
    if (a.source === 'task') { haptics.selection(); setViewingTask(a); return; }
    const ti = tierOf(a);
    const isSubmitted = ti === 'submitted' || ti === 'graded';
    if (!isSubmitted) openAssignment(a);
  };

  const handleOpenAttachment = async (url: string) => {
    try {
      if (!safeUrl(url)) {
        Alert.alert(t('common.error'), t('common.invalidLink', { defaultValue: 'رابط غير صالح' }));
        return;
      }
      haptics.selection();
      const { Linking } = await import('react-native');
      await Linking.openURL(url);
    } catch {}
  };

  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title={t('student.myAssignments')}
          gradient={tokens.gradient.student}
          glowAccent="rgba(20,184,166,0.30)"
        />
        <View style={s.lockWrap}>
          <Ionicons name="lock-closed" size={48} color={tokens.color.text4} />
          <Text style={s.lockText}>{t('student.featureDisabled')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('student.myAssignments')}
        subtitle={t('student.assignmentCount', { count: assignments.length })}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.teal600} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <AssignmentFilterBar filter={filter} counts={counts} onChange={setFilter} />

        {/* View toggle: list vs by-day. Kept lightweight (2 icon buttons)
            so it doesn't compete with the filter chips for visual weight. */}
        <View style={s.viewToggleRow}>
          <TouchableOpacity
            onPress={() => { haptics.selection(); setViewMode('list'); }}
            style={[s.viewToggleBtn, viewMode === 'list' && s.viewToggleActive]}
            activeOpacity={0.85}
          >
            <Ionicons name="list" size={14} color={viewMode === 'list' ? '#fff' : tokens.color.text2} />
            <Text style={[s.viewToggleText, viewMode === 'list' && s.viewToggleTextActive]}>قائمة</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { haptics.selection(); setViewMode('byday'); }}
            style={[s.viewToggleBtn, viewMode === 'byday' && s.viewToggleActive]}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar" size={14} color={viewMode === 'byday' ? '#fff' : tokens.color.text2} />
            <Text style={[s.viewToggleText, viewMode === 'byday' && s.viewToggleTextActive]}>حسب اليوم</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <SkeletonList count={5} />
        ) : loadError ? (
          <ErrorState
            title={t('common.loadFailedTitle', { defaultValue: 'تعذّر تحميل الواجبات' })}
            message={loadError}
            retryLabel={t('common.retry', { defaultValue: 'إعادة المحاولة' })}
            onRetry={() => { setLoading(true); loadData(); }}
          />
        ) : filteredAssignments.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title={
              filter === 'all'
                ? t('student.noAssignments', { defaultValue: 'لا توجد واجبات' })
                : t('student.noAssignmentsForFilter', { defaultValue: 'لا توجد واجبات في هذا التصنيف' })
            }
            message={t('student.noAssignmentsHint', { defaultValue: 'الواجبات الجديدة ستظهر هنا تلقائياً' })}
          />
        ) : viewMode === 'byday' ? (
          <AssignmentsByDay
            assignments={filteredAssignments}
            onRowPress={handleRowPress}
          />
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <AssignmentList
              assignments={filteredAssignments}
              teacherSubjectMap={teacherSubjectMap}
              onRowPress={handleRowPress}
            />
          </View>
        )}
      </ScrollView>

      {/* Solve Assignment Modal */}
      <AssignmentSolveModal
        visible={showSolve}
        assignment={currentAssignment}
        questions={questions}
        answers={answers}
        currentQIndex={currentQIndex}
        saveError={saveError}
        submitting={submitting}
        onClose={() => setShowSolve(false)}
        onChangeAnswer={handleSaveAnswer}
        onPrev={() => { if (currentQIndex > 0) { haptics.light(); setCurrentQIndex(currentQIndex - 1); } }}
        onNext={() => { haptics.light(); setCurrentQIndex(currentQIndex + 1); }}
        onSubmit={handleSubmit}
      />

      {/* Submit confirmation */}
      <ConfirmSheet
        visible={showSubmitConfirm}
        title={t('student.submitAssignment')}
        message={t('student.assignmentSubmitConfirm')}
        confirmLabel={t('student.submitBtn', { defaultValue: 'تسليم' })}
        cancelLabel={t('common.cancel', { defaultValue: 'إلغاء' })}
        onConfirm={performSubmit}
        onClose={() => setShowSubmitConfirm(false)}
      />

      {/* Task detail viewer — for simple homework (no structured questions) */}
      <TaskViewerSheet
        task={viewingTask}
        onClose={() => setViewingTask(null)}
        onOpenAttachment={handleOpenAttachment}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  viewToggleRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  viewToggleBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  viewToggleActive: {
    backgroundColor: tokens.color.brand500,
    borderColor: tokens.color.brand500,
  },
  viewToggleText: { fontSize: 11, fontWeight: '700', color: tokens.color.text2 },
  viewToggleTextActive: { color: '#fff' },
  lockWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockText: { fontSize: tokens.font.size.xl, color: tokens.color.text3, marginTop: 12 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 2,
  },
});
