import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { exportExamResultPDF } from '../../services/pdfExport';
import { haptics } from '../../utils/haptics';
import StatCard from '../../components/teacher/cards/StatCard';
import FAB from '../../components/teacher/buttons/FAB';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import SkeletonList from '../../components/shared/SkeletonList';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import ManualExamCreator from '../../components/teacher/exams/ManualExamCreator';

type ExamStatus = 'draft' | 'active' | 'scheduled' | 'completed' | 'graded';
type SessionStatus = 'in_progress' | 'started' | 'submitted' | 'auto_submitted' | 'graded';

interface ExamRow {
  id: string;
  title: string;
  status: ExamStatus;
  duration_minutes: number;
  total_points: number;
  created_at: string;
  class_id: string | null;
  teacher_id: string;
  institute_id: string;
}

interface SessionRow {
  id: string;
  student_id: string;
  status: SessionStatus;
  started_at: string | null;
  submitted_at: string | null;
  auto_submitted_at: string | null;
  graded_at: string | null;
  grade_published_at: string | null;
  score: number | null;
  max_score: number | null;
  users: { id: string; full_name: string } | null;
}

export default function TeacherExams() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { t } = useTranslation();
  const router = useRouter();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [grading, setGrading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [detailSession, setDetailSession] = useState<SessionRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<{ questions: any[]; answers: any[]; student: any; exam: any } | null>(null);
  // Per-answer AI-suggestion state, keyed by answer.id. Holds the pending
  // suggestion + the teacher's in-progress edits before they accept it.
  // Cleared on sheet close so suggestions don't leak across sessions.
  type AISuggestState = {
    loading?: boolean;
    score?: number;       // current editable score (may differ from suggested)
    feedback?: string;    // current editable feedback
    suggested?: boolean;  // true once a suggestion has been fetched
    saving?: boolean;
    accepted?: boolean;   // true after the teacher confirmed and we wrote score
    error?: string;
  };
  const [aiGrade, setAiGrade] = useState<Record<string, AISuggestState>>({});
  const timerRef = useRef<any>(null);
  const subRef = useRef<any>(null);

  // Create-mode chooser: لما يضغط الأستاذ + يختار يدوي أو ذكاء صناعي.
  const [showCreateChooser, setShowCreateChooser] = useState(false);
  const [showManualCreator, setShowManualCreator] = useState(false);

  // ConfirmSheet state — replaces inline Alert.alert confirms
  const [confirmState, setConfirmState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>({ visible: false, title: '', confirmLabel: '', onConfirm: () => {} });

  const loadExams = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setLoadError(null);
      const data = await api.getExamsByTeacher(userId);
      setExams((data as any) || []);
    } catch (err: any) {
      setLoadError(err?.message || t('common.loadFailed', { defaultValue: 'تعذّر تحميل البيانات' }));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => { loadExams(); }, [loadExams]);

  // Auto-open a specific exam when navigated with ?openExamId=X (from content screen tap)
  const routeParams = useLocalSearchParams<{ openExamId?: string }>();
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    const targetId = routeParams.openExamId;
    if (!targetId || !exams.length || autoOpenedRef.current === targetId) return;
    const exam = exams.find((e: any) => e.id === targetId);
    if (!exam) return;
    autoOpenedRef.current = targetId;
    openExam(exam);
  }, [exams, routeParams.openExamId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadExams(); } finally { setRefreshing(false); }
  }, [loadExams]);

  // ── Open live dashboard for a specific exam ──
  const openExam = async (exam: ExamRow) => {
    // Defense-in-depth: verify this exam belongs to the currently authenticated teacher
    // before opening a live channel. If a stale/tampered exam object sneaks in,
    // this catches it before we subscribe to real-time events on exam_sessions.
    if (exam.teacher_id && userId && exam.teacher_id !== userId) {
      Alert.alert(t('common.error'), 'غير مصرّح — هذا الامتحان يخص أستاذاً آخر.');
      return;
    }
    // Multi-tenant gate: refuse to open a realtime channel if the teacher's
    // institute hasn't been resolved yet, or if the exam is in a different
    // institute than the logged-in teacher. Prevents a stale/tampered exam
    // object from opening a live subscription across tenant boundaries.
    if (!userInstituteId) {
      Alert.alert(t('common.error'), 'جاري تحميل بيانات المؤسسة — حاول مجدداً بعد ثانية.');
      return;
    }
    if (exam.institute_id && exam.institute_id !== userInstituteId) {
      Alert.alert(t('common.error'), 'غير مصرّح — هذا الامتحان يخص مؤسسة أخرى.');
      return;
    }
    setSelectedExam(exam);
    setLoadingSessions(true);
    try {
      const s = await api.getExamLiveSessions(exam.id);
      setSessions((s as any) || []);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل تحميل الجلسات');
    } finally {
      setLoadingSessions(false);
    }

    // Subscribe to realtime session changes. The filter scopes to this exam's id only
    // (exam_id is narrower than institute_id — every exam belongs to exactly one
    // institute), and the ownership + institute checks above guarantee the
    // channel never crosses tenant boundaries.
    if (subRef.current) { try { supabase.removeChannel(subRef.current); } catch {} }
    subRef.current = supabase
      .channel(`exam_sessions_${exam.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'exam_sessions', filter: `exam_id=eq.${exam.id}` },
        async () => {
          try {
            const fresh = await api.getExamLiveSessions(exam.id);
            setSessions((fresh as any) || []);
          } catch {}
        }
      )
      .subscribe();

    // Start countdown using ABSOLUTE time (created_at + duration) — never resets on re-open
    if (exam.status === 'active' && exam.duration_minutes) {
      const totalSec = exam.duration_minutes * 60;
      const startMs = new Date(exam.created_at).getTime();
      const computeRemaining = () => Math.max(0, Math.floor(totalSec - (Date.now() - startMs) / 1000));

      const initial = computeRemaining();
      setTimeLeft(initial);

      if (initial <= 0) {
        api.autoSubmitExpiredExam(exam.id).catch(() => {});
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          const remaining = computeRemaining();
          setTimeLeft(remaining);
          if (remaining <= 0) {
            clearInterval(timerRef.current);
            api.autoSubmitExpiredExam(exam.id).catch(() => {});
          }
        }, 1000);
      }
    }
  };

  const closeExam = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (subRef.current) { try { supabase.removeChannel(subRef.current); } catch {} subRef.current = null; }
    setSelectedExam(null);
    setSessions([]);
    setTimeLeft(null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (subRef.current) { try { supabase.removeChannel(subRef.current); } catch {} }
    };
  }, []);

  const openSessionDetail = async (sess: SessionRow) => {
    if (!(sess.submitted_at || sess.auto_submitted_at)) return;
    setDetailSession(sess);
    setDetailLoading(true);
    setDetailData(null);
    setAiGrade({}); // clear stale suggestions from a previous session
    try {
      const d = await api.getExamSessionDetail(sess.id);
      setDetailData({ questions: d.questions, answers: d.answers, student: d.student, exam: d.exam });
      // Pre-populate AI suggestion state from already-cached suggestions on
      // the answer rows (set by a previous teacher click). Saves tokens on
      // reopen and lets the teacher continue where they left off — including
      // marking the row "accepted" if `score` is already set (meaning the
      // teacher had already finalized it on an earlier visit).
      const seed: Record<string, AISuggestState> = {};
      for (const a of d.answers as any[]) {
        const hasAI = a?.ai_suggested_score != null || a?.ai_feedback != null;
        const hasFinal = a?.score != null;
        if (hasAI || hasFinal) {
          seed[a.id] = {
            suggested: hasAI,
            accepted: hasFinal,
            // Prefer the teacher's final score+feedback if set; otherwise show
            // the AI suggestion as the editable starting point.
            score: a.score != null ? Number(a.score) : (a.ai_suggested_score != null ? Number(a.ai_suggested_score) : undefined),
            feedback: a.feedback || a.ai_feedback || '',
          };
        }
      }
      setAiGrade(seed);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل تحميل الإجابات');
      setDetailSession(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Find the model answer for an essay/short-answer question. Authoring UIs
  // have used a few different field names over time, so we check them all.
  const getModelAnswer = (q: any): string => {
    return String(
      q?.modelAnswer || q?.model_answer || q?.correctAnswer ||
      q?.correct_answer || q?.answer || q?.expectedAnswer || ''
    );
  };

  const requestAIGrade = async (answerId: string, q: any, studentAns: string) => {
    if (!answerId) return;
    const maxPoints = Number(q?.points || 0);
    if (!maxPoints) {
      Alert.alert(t('common.error'), 'هذا السؤال بدون درجة محددة — لا يمكن اقتراح تصحيح.');
      return;
    }
    setAiGrade(prev => ({ ...prev, [answerId]: { ...(prev[answerId] || {}), loading: true, error: undefined } }));
    try {
      const result = await api.suggestEssayGrade({
        answerId,
        question: String(q?.content || ''),
        modelAnswer: getModelAnswer(q),
        studentAnswer: studentAns,
        maxPoints,
      });
      setAiGrade(prev => ({
        ...prev,
        [answerId]: {
          loading: false,
          suggested: true,
          // Pre-fill editable fields with the suggestion — teacher edits before accept.
          score: result.score,
          feedback: result.feedback,
        },
      }));
    } catch (err: any) {
      setAiGrade(prev => ({
        ...prev,
        [answerId]: { ...(prev[answerId] || {}), loading: false, error: err?.message || 'فشل اقتراح الدرجة' },
      }));
    }
  };

  const acceptAIGrade = async (answerId: string, maxPoints: number) => {
    const cur = aiGrade[answerId];
    if (!cur || cur.score == null) return;
    // Clamp into [0, maxPoints] — teacher may have typed an invalid value.
    const score = Math.max(0, Math.min(maxPoints, Number(cur.score)));
    if (Number.isNaN(score)) {
      Alert.alert(t('common.error'), 'الدرجة المُدخلة غير صالحة.');
      return;
    }
    setAiGrade(prev => ({ ...prev, [answerId]: { ...(prev[answerId] || {}), saving: true } }));
    try {
      await api.acceptAIGradeSuggestion(answerId, score, cur.feedback || '');
      setAiGrade(prev => ({
        ...prev,
        [answerId]: { ...(prev[answerId] || {}), saving: false, accepted: true, score, error: undefined },
      }));
      // Update local detailData so the row reflects the saved score immediately.
      setDetailData(prev => prev ? {
        ...prev,
        answers: prev.answers.map((a: any) =>
          a.id === answerId ? { ...a, score, feedback: cur.feedback || '' } : a
        ),
      } : prev);
    } catch (err: any) {
      setAiGrade(prev => ({
        ...prev,
        [answerId]: { ...(prev[answerId] || {}), saving: false, error: err?.message || 'فشل حفظ الدرجة' },
      }));
    }
  };

  const rejectAIGrade = (answerId: string) => {
    setAiGrade(prev => {
      const next = { ...prev };
      // Keep the suggestion data on the DB (advisory) but clear the in-memory
      // editable state so the teacher's UI returns to "not suggested".
      delete next[answerId];
      return next;
    });
  };

  const exportSessionPDF = async () => {
    if (!detailSession || !detailData) return;
    try {
      await exportExamResultPDF({
        examTitle: detailData.exam?.title || selectedExam?.title || '',
        studentName: detailData.student?.full_name || '—',
        score: detailSession.score,
        maxScore: detailSession.max_score,
        questions: detailData.questions as any,
        answers: detailData.answers as any,
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل توليد PDF');
    }
  };

  const handleAutoGrade = async () => {
    if (!selectedExam) return;
    setConfirmState({
      visible: true,
      title: t('teacherExams.autoGradeTitle', { defaultValue: 'تصحيح تلقائي' }),
      message: t('teacherExams.autoGradeConfirm', { defaultValue: 'سيتم تصحيح جميع الامتحانات المُسلّمة تلقائياً. متابعة؟' }),
      confirmLabel: t('teacherExams.autoGrade', { defaultValue: 'تصحيح تلقائي' }),
      destructive: false,
      onConfirm: async () => {
        setGrading(true);
        try {
          const results = await api.autoGradeExam(selectedExam.id);
          const fresh = await api.getExamLiveSessions(selectedExam.id);
          setSessions((fresh as any) || []);
          Alert.alert(
            t('common.success'),
            t('teacherExams.autoGradeDone', { defaultValue: 'تم تصحيح {{count}} امتحان', count: (results as any[]).length })
          );
        } catch (err: any) {
          Alert.alert(t('common.error'), err?.message || 'فشل التصحيح');
        } finally {
          setGrading(false);
        }
      },
    });
  };

  const handlePublishGrades = async () => {
    if (!selectedExam) return;
    setConfirmState({
      visible: true,
      title: t('teacherExams.publishTitle', { defaultValue: 'نشر الدرجات' }),
      message: t('teacherExams.publishConfirm', { defaultValue: 'سيتم إرسال الدرجات للطلاب. متابعة؟' }),
      confirmLabel: t('teacherExams.publishGrades', { defaultValue: 'نشر الدرجات' }),
      destructive: false,
      onConfirm: async () => {
        setPublishing(true);
        try {
          const n = await api.publishExamGrades(selectedExam.id);
          const fresh = await api.getExamLiveSessions(selectedExam.id);
          setSessions((fresh as any) || []);
          Alert.alert(
            t('common.success'),
            t('teacherExams.publishDone', { defaultValue: 'تم نشر {{count}} درجة', count: n })
          );
        } catch (err: any) {
          Alert.alert(t('common.error'), err?.message || 'فشل النشر');
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const sessionStatusColor = (s: SessionRow): string => {
    if (s.grade_published_at) return tokens.color.purple;
    if (s.graded_at) return tokens.color.success;
    if (s.submitted_at || s.auto_submitted_at) return tokens.color.warning;
    if (s.started_at) return tokens.color.info;
    return tokens.color.text3;
  };

  const sessionStatusLabel = (s: SessionRow): string => {
    if (s.grade_published_at) return t('teacherExams.statusPublished', { defaultValue: 'تم نشر الدرجة' });
    if (s.graded_at) return t('teacherExams.statusGraded', { defaultValue: `مصحّح: ${s.score}/${s.max_score}` });
    if (s.auto_submitted_at) return t('teacherExams.statusAutoSubmitted', { defaultValue: 'سُلّم تلقائياً' });
    if (s.submitted_at) return t('teacherExams.statusSubmitted', { defaultValue: 'سُلّم' });
    if (s.started_at) return t('teacherExams.statusInProgress', { defaultValue: 'يحل الآن' });
    return t('teacherExams.statusNotStarted', { defaultValue: 'لم يبدأ' });
  };

  // Categorize exams for sectioned list
  const grouped = useMemo(() => {
    const active: ExamRow[] = [];
    const waiting: ExamRow[] = [];
    const finished: ExamRow[] = [];
    for (const e of exams) {
      if (e.status === 'active') active.push(e);
      else if (e.status === 'draft' || e.status === 'scheduled') waiting.push(e);
      else finished.push(e); // completed | graded
    }
    return { active, waiting, finished };
  }, [exams]);

  // Compute average score per exam (used as trailing chip on cards)
  // We don't have sessions for ALL exams here — we only have them for the open one.
  // So fall back to "—" unless the exam has a cached avg field; placeholder dash.
  const examAvg = (e: ExamRow): string => {
    const cached = (e as any).avg_score;
    if (typeof cached === 'number') return `${Math.round(cached)}`;
    return '—';
  };

  // ── Exam detail / live dashboard ──
  if (selectedExam) {
    const submittedCount = sessions.filter(s => s.submitted_at || s.auto_submitted_at).length;
    const gradedCount = sessions.filter(s => s.graded_at).length;
    const publishedCount = sessions.filter(s => s.grade_published_at).length;
    const canGrade = submittedCount > gradedCount;
    const canPublish = gradedCount > publishedCount;

    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <View style={s.detailHeader}>
          <TouchableOpacity onPress={closeExam} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={20} color={tokens.color.text} />
          </TouchableOpacity>
          <Text style={s.detailTitle} numberOfLines={1}>{selectedExam.title}</Text>
          <Text style={s.detailSubtitle}>{selectedExam.total_points} {t('teacherAssignments.points')} • {selectedExam.duration_minutes} {t('common.minutes', { defaultValue: 'دقيقة' })}</Text>
        </View>

        {/* Timer card */}
        {selectedExam.status === 'active' && timeLeft !== null && (
          <View style={s.timerCard}>
            <Ionicons name="timer-outline" size={28} color={timeLeft < 60 ? tokens.color.danger : tokens.color.purple} />
            <Text style={[s.timerText, timeLeft < 60 && { color: tokens.color.danger }]}>{formatTime(timeLeft)}</Text>
            <Text style={s.timerLabel}>{t('teacherExams.timeRemaining', { defaultValue: 'الوقت المتبقي' })}</Text>
          </View>
        )}

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statValue}>{sessions.length}</Text>
            <Text style={s.statLabel}>{t('teacherExams.totalStudents', { defaultValue: 'مجموع الطلاب' })}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statValue, { color: tokens.color.warning }]}>{submittedCount}</Text>
            <Text style={s.statLabel}>{t('teacherExams.submitted', { defaultValue: 'سُلّم' })}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statValue, { color: tokens.color.success }]}>{gradedCount}</Text>
            <Text style={s.statLabel}>{t('teacherExams.graded', { defaultValue: 'مصحّح' })}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statValue, { color: tokens.color.purple }]}>{publishedCount}</Text>
            <Text style={s.statLabel}>{t('teacherExams.published', { defaultValue: 'نُشر' })}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: canGrade ? tokens.color.success : tokens.color.text4 }]}
            disabled={!canGrade || grading}
            onPress={handleAutoGrade}
          >
            {grading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-done-circle" size={18} color="#fff" />
                <Text style={s.actionBtnText}>{t('teacherExams.autoGrade', { defaultValue: 'تصحيح تلقائي' })}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: canPublish ? tokens.color.purple : tokens.color.text4 }]}
            disabled={!canPublish || publishing}
            onPress={handlePublishGrades}
          >
            {publishing ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={s.actionBtnText}>{t('teacherExams.publishGrades', { defaultValue: 'نشر الدرجات' })}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Student sessions list */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={s.sectionHeader}>{t('teacherExams.studentsList', { defaultValue: 'قائمة الطلاب' })}</Text>
          {loadingSessions ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={tokens.color.brand500} />
          ) : sessions.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Ionicons name="people-outline" size={48} color={tokens.color.text4} />
              <Text style={{ fontSize: tokens.font.size.md, color: tokens.color.text3, marginTop: 12 }}>
                {t('teacherExams.noSessions', { defaultValue: 'لا توجد جلسات بعد' })}
              </Text>
            </View>
          ) : (
            sessions.map(sess => (
              <TouchableOpacity
                key={sess.id}
                style={s.sessionCard}
                onPress={() => openSessionDetail(sess)}
                activeOpacity={0.7}
                disabled={!(sess.submitted_at || sess.auto_submitted_at)}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sessionStatusColor(sess) }} />
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={s.sessionName}>{sess.users?.full_name || t('common.unknown', { defaultValue: 'غير معروف' })}</Text>
                  <Text style={[s.sessionStatus, { color: sessionStatusColor(sess) }]}>{sessionStatusLabel(sess)}</Text>
                </View>
                {sess.graded_at && (
                  <Text style={s.sessionScore}>{sess.score}/{sess.max_score}</Text>
                )}
                {(sess.submitted_at || sess.auto_submitted_at) && (
                  <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {/* Session detail sheet: student answers vs correct answers */}
        <SwipeableSheet
          visible={!!detailSession}
          onClose={() => setDetailSession(null)}
          maxHeight={0.9}
          sheetStyle={{ backgroundColor: tokens.color.bg }}
        >
          <View>
            <View>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: tokens.color.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity onPress={() => setDetailSession(null)} style={{ padding: 6 }}>
                  <Ionicons name="close" size={22} color={tokens.color.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right' }}>
                    {detailData?.student?.full_name || '—'}
                  </Text>
                  <Text style={{ fontSize: tokens.font.size.base, color: tokens.color.text3, textAlign: 'right', marginTop: 2 }}>
                    {detailSession?.graded_at ? `الدرجة: ${detailSession.score}/${detailSession.max_score}` : 'لم يُصحّح بعد'}
                  </Text>
                </View>
                {/* PDF export disabled until session is graded — empty/ungraded PDFs caused confusion in the field */}
                <TouchableOpacity
                  onPress={exportSessionPDF}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: (!detailData || !detailSession?.graded_at) ? tokens.color.text4 : tokens.color.purple,
                    paddingHorizontal: 10, paddingVertical: 8, borderRadius: tokens.radius.md,
                    opacity: (!detailData || !detailSession?.graded_at) ? 0.6 : 1,
                  }}
                  disabled={!detailData || !detailSession?.graded_at}
                  accessibilityState={{ disabled: !detailData || !detailSession?.graded_at }}
                >
                  <Ionicons name="document-text" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.heavy }}>PDF</Text>
                </TouchableOpacity>
                {detailSession && !detailSession.graded_at && (
                  <Text style={{ position: 'absolute', bottom: -4, right: 16, fontSize: 9, fontWeight: tokens.font.weight.bold, color: tokens.color.text3 }}>
                    متاح بعد التصحيح
                  </Text>
                )}
              </View>

              {detailLoading ? (
                <ActivityIndicator style={{ padding: 40 }} color={tokens.color.brand500} />
              ) : detailData && (
                <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
                  {detailData.questions.map((q: any, idx: number) => {
                    const ansRow = detailData.answers.find((a: any) => a.question_index === idx);
                    const studentAns = ansRow ? String(ansRow.answer || '').replace(/^"+|"+$/g, '') : '';
                    // Open-ended question types — these are what the auto_grade RPC
                    // marks as `partially_graded` because they can't be string-compared.
                    const isOpenEnded = q.type === 'essay' || q.type === 'short_answer' || q.type === 'open' || q.type === 'fill';
                    let correctText = '';
                    if (q.type === 'mcq') correctText = q.options?.[q.correctIndex] || '';
                    else if (q.type === 'tf') correctText = q.options?.[q.correctAnswer ? 0 : 1] || '';
                    else if (isOpenEnded) correctText = getModelAnswer(q);
                    // Status pill: for open-ended, "auto-grading" doesn't apply — show
                    // a neutral "needs review" badge unless the teacher has accepted
                    // a final score (ansRow.score != null).
                    const teacherGradedScore = ansRow?.score;
                    const isFinalized = isOpenEnded && teacherGradedScore != null;
                    const isCorrect = !isOpenEnded && studentAns && studentAns === correctText;
                    const ai = ansRow?.id ? aiGrade[ansRow.id] : undefined;
                    return (
                      <View key={idx} style={{ backgroundColor: tokens.color.surface, padding: 12, borderRadius: tokens.radius.md, marginBottom: 10, borderWidth: 1, borderColor: tokens.color.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.heavy, color: tokens.color.text3 }}>
                            {isFinalized ? `${teacherGradedScore}/${q.points || 0}` : `${q.points || 0} نقطة`}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{
                              fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.heavy,
                              color: isOpenEnded
                                ? (isFinalized ? tokens.color.success : tokens.color.warning)
                                : (isCorrect ? tokens.color.success : (studentAns ? tokens.color.danger : tokens.color.text2)),
                              backgroundColor: isOpenEnded
                                ? (isFinalized ? tokens.color.successBg : (tokens.color.warningBg || tokens.color.surface2))
                                : (isCorrect ? tokens.color.successBg : (studentAns ? tokens.color.dangerBg : tokens.color.surface2)),
                              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                            }}>
                              {isOpenEnded
                                ? (isFinalized ? '✓ مُصحَّح' : (studentAns ? '⏳ يحتاج تصحيح' : '— لم يُجب'))
                                : (isCorrect ? '✓ صحيح' : studentAns ? '✗ خطأ' : '— لم يُجب')}
                            </Text>
                            <Text style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.heavy, color: tokens.color.text }}>سؤال {idx + 1}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.text, textAlign: 'right', marginBottom: 8 }}>{q.content}</Text>
                        <View style={{ backgroundColor: tokens.color.surface2, padding: 8, borderRadius: 8, borderRightWidth: 3, borderRightColor: tokens.color.text3 }}>
                          <Text style={{ fontSize: tokens.font.size.base, color: tokens.color.text2, textAlign: 'right' }}>
                            <Text style={{ fontWeight: tokens.font.weight.heavy }}>إجابة الطالب: </Text>
                            {studentAns || 'لم يُجب'}
                          </Text>
                        </View>
                        {/* For closed questions, show the correct answer when student got it wrong. */}
                        {!isOpenEnded && !isCorrect && correctText && (
                          <View style={{ backgroundColor: tokens.color.successBg, padding: 8, borderRadius: 8, borderRightWidth: 3, borderRightColor: tokens.color.success, marginTop: 6 }}>
                            <Text style={{ fontSize: tokens.font.size.base, color: tokens.color.success, textAlign: 'right' }}>
                              <Text style={{ fontWeight: tokens.font.weight.heavy }}>الإجابة الصحيحة: </Text>
                              {correctText}
                            </Text>
                          </View>
                        )}
                        {/* For open-ended questions, always surface the model answer for the teacher's reference. */}
                        {isOpenEnded && correctText && (
                          <View style={{ backgroundColor: tokens.color.successBg, padding: 8, borderRadius: 8, borderRightWidth: 3, borderRightColor: tokens.color.success, marginTop: 6 }}>
                            <Text style={{ fontSize: tokens.font.size.base, color: tokens.color.success, textAlign: 'right' }}>
                              <Text style={{ fontWeight: tokens.font.weight.heavy }}>الإجابة النموذجية: </Text>
                              {correctText}
                            </Text>
                          </View>
                        )}
                        {/* ── AI Grading Suggestion Block (open-ended only, has an answer row, student actually answered) */}
                        {isOpenEnded && ansRow?.id && studentAns && !isFinalized && (
                          <View style={{ marginTop: 8 }}>
                            {/* Trigger button — shown until the teacher has fetched a suggestion */}
                            {!ai?.suggested && !ai?.loading && (
                              <TouchableOpacity
                                onPress={() => requestAIGrade(ansRow.id, q, studentAns)}
                                style={{
                                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  backgroundColor: tokens.color.purple, paddingVertical: 10, borderRadius: tokens.radius.md,
                                }}
                                activeOpacity={0.85}
                              >
                                <Ionicons name="sparkles" size={16} color="#fff" />
                                <Text style={{ color: '#fff', fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.heavy }}>
                                  اقتراح درجة بـ AI
                                </Text>
                              </TouchableOpacity>
                            )}
                            {ai?.loading && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 }}>
                                <ActivityIndicator color={tokens.color.purple} size="small" />
                                <Text style={{ color: tokens.color.text3, fontSize: tokens.font.size.base }}>
                                  جاري تحليل الإجابة...
                                </Text>
                              </View>
                            )}
                            {ai?.error && !ai?.loading && (
                              <Text style={{ color: tokens.color.danger, fontSize: tokens.font.size.sm, textAlign: 'right', marginVertical: 4 }}>
                                {ai.error}
                              </Text>
                            )}
                            {/* Suggestion card with editable score + feedback. Teacher accepts/rejects. */}
                            {ai?.suggested && (
                              <View style={{
                                backgroundColor: tokens.color.surface2, padding: 10, borderRadius: tokens.radius.md,
                                borderWidth: 1, borderColor: tokens.color.purple, marginTop: 6,
                              }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, justifyContent: 'flex-end' }}>
                                  <Text style={{ color: tokens.color.purple, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.heavy }}>
                                    اقتراح الذكاء الاصطناعي
                                  </Text>
                                  <Ionicons name="sparkles" size={14} color={tokens.color.purple} />
                                </View>
                                {/* Editable score row */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, justifyContent: 'flex-end' }}>
                                  <Text style={{ color: tokens.color.text3, fontSize: tokens.font.size.base }}>
                                    / {q.points || 0}
                                  </Text>
                                  <TextInput
                                    value={ai.score != null ? String(ai.score) : ''}
                                    onChangeText={(v) => {
                                      // Allow digits + one decimal point. Anything else → keep last good value.
                                      const cleaned = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                                      setAiGrade(prev => ({
                                        ...prev,
                                        [ansRow.id]: { ...(prev[ansRow.id] || {}), score: cleaned === '' ? undefined : Number(cleaned) },
                                      }));
                                    }}
                                    keyboardType="decimal-pad"
                                    style={{
                                      backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border,
                                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 64,
                                      textAlign: 'center', color: tokens.color.text, fontWeight: tokens.font.weight.heavy,
                                    }}
                                  />
                                  <Text style={{ color: tokens.color.text2, fontSize: tokens.font.size.sm }}>الدرجة:</Text>
                                </View>
                                {/* Editable feedback */}
                                <TextInput
                                  value={ai.feedback || ''}
                                  onChangeText={(v) => setAiGrade(prev => ({
                                    ...prev,
                                    [ansRow.id]: { ...(prev[ansRow.id] || {}), feedback: v },
                                  }))}
                                  multiline
                                  placeholder="ملاحظات للطالب"
                                  placeholderTextColor={tokens.color.text3}
                                  style={{
                                    backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border,
                                    borderRadius: 8, padding: 8, color: tokens.color.text, textAlign: 'right',
                                    minHeight: 60, marginBottom: 8,
                                  }}
                                />
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                  <TouchableOpacity
                                    onPress={() => acceptAIGrade(ansRow.id, Number(q.points || 0))}
                                    disabled={ai.saving || ai.accepted}
                                    style={{
                                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                                      backgroundColor: ai.accepted ? tokens.color.text4 : tokens.color.success,
                                      paddingVertical: 9, borderRadius: tokens.radius.md, opacity: ai.saving ? 0.6 : 1,
                                    }}
                                    activeOpacity={0.85}
                                  >
                                    {ai.saving ? <ActivityIndicator color="#fff" size="small" /> : (
                                      <>
                                        <Ionicons name={ai.accepted ? 'checkmark-circle' : 'checkmark'} size={16} color="#fff" />
                                        <Text style={{ color: '#fff', fontWeight: tokens.font.weight.heavy, fontSize: tokens.font.size.base }}>
                                          {ai.accepted ? 'تم القبول' : 'قبول وحفظ'}
                                        </Text>
                                      </>
                                    )}
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => rejectAIGrade(ansRow.id)}
                                    disabled={ai.saving}
                                    style={{
                                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                                      backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border,
                                      paddingVertical: 9, borderRadius: tokens.radius.md,
                                    }}
                                    activeOpacity={0.85}
                                  >
                                    <Ionicons name="close" size={16} color={tokens.color.text2} />
                                    <Text style={{ color: tokens.color.text2, fontWeight: tokens.font.weight.heavy, fontSize: tokens.font.size.base }}>
                                      رفض
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                                {ai.accepted && (
                                  <Text style={{ color: tokens.color.success, fontSize: tokens.font.size.sm, textAlign: 'center', marginTop: 6 }}>
                                    تم حفظ درجة الطالب
                                  </Text>
                                )}
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </SwipeableSheet>

        {/* Confirm sheet — replaces inline Alert.alert confirms */}
        <ConfirmSheet
          visible={confirmState.visible}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          destructive={confirmState.destructive}
          onConfirm={confirmState.onConfirm}
          onClose={() => setConfirmState(prev => ({ ...prev, visible: false }))}
        />
      </SafeAreaView>
    );
  }

  // ── Exams list ──
  const renderExamCard = (exam: ExamRow) => (
    <TouchableOpacity key={exam.id} style={s.examCard} onPress={() => openExam(exam)} activeOpacity={0.7}>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={s.examTitle}>{exam.title}</Text>
        <Text style={s.examMeta}>
          {(exam as any).question_count || 0} سؤال · {exam.duration_minutes} {t('common.minutes', { defaultValue: 'د' })} · {exam.total_points} {t('teacherAssignments.points')}
        </Text>
      </View>
      <View style={s.scoreBlock}>
        <Text style={s.scoreValue}>{examAvg(exam)}</Text>
        <Text style={s.scoreLabel}>{t('teacherExams.avg', { defaultValue: 'المعدل' })}</Text>
      </View>
      <LinearGradient
        colors={tokens.gradient.info}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.examIcon}
      >
        <Ionicons name="document-text" size={22} color="#fff" />
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title={t('teacherExams.myExams', { defaultValue: 'امتحاناتي' })} fallbackRoute="/(teacher)/services" />

      {/* Mini-stat cards row */}
      <View style={s.statRow}>
        <StatCard
          label={t('teacherExams.statActive', { defaultValue: 'النشطة' })}
          value={grouped.active.length}
          gradient="success"
          icon="play-circle"
        />
        <View style={{ width: 8 }} />
        <StatCard
          label={t('teacherExams.statWaiting', { defaultValue: 'بانتظار' })}
          value={grouped.waiting.length}
          gradient="warning"
          icon="time"
        />
        <View style={{ width: 8 }} />
        <StatCard
          label={t('teacherExams.statFinished', { defaultValue: 'منتهية' })}
          value={grouped.finished.length}
          gradient="info"
          icon="checkmark-done"
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <SkeletonList count={5} />
        ) : loadError ? (
          <ErrorState
            title={t('common.loadFailedTitle', { defaultValue: 'تعذّر تحميل الامتحانات' })}
            message={loadError}
            retryLabel={t('common.retry', { defaultValue: 'إعادة المحاولة' })}
            onRetry={loadExams}
          />
        ) : exams.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title={t('teacherExams.noExams', { defaultValue: 'لا توجد امتحانات بعد' })}
            message={t('teacherExams.createNewHint', { defaultValue: 'اضغط زر + لإنشاء امتحان يدوي أو بالذكاء الصناعي' })}
          />
        ) : (
          <>
            {grouped.active.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <Text style={s.sectionTitle}>{t('teacherExams.statActive', { defaultValue: 'النشطة' })}</Text>
                {grouped.active.map(renderExamCard)}
              </View>
            )}
            {grouped.waiting.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <Text style={s.sectionTitle}>{t('teacherExams.statWaiting', { defaultValue: 'بانتظار' })}</Text>
                {grouped.waiting.map(renderExamCard)}
              </View>
            )}
            {grouped.finished.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <Text style={s.sectionTitle}>{t('teacherExams.statFinished', { defaultValue: 'منتهية' })}</Text>
                {grouped.finished.map(renderExamCard)}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* FAB → opens a chooser sheet so the teacher can pick manual creation
          (default, no AI) or fall back to the AI generator. Manual is the
          primary flow per product requirement. */}
      <FAB
        icon="add"
        gradient="brand"
        onPress={() => setShowCreateChooser(true)}
        accessibilityLabel={t('teacherExams.newExam', { defaultValue: 'امتحان جديد' })}
      />

      {/* Create chooser sheet — manual vs AI */}
      <SwipeableSheet
        visible={showCreateChooser}
        onClose={() => setShowCreateChooser(false)}
        maxHeight={0.4}
      >
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right', marginBottom: 4 }}>
            إنشاء امتحان جديد
          </Text>
          <Text style={{ fontSize: tokens.font.size.base, color: tokens.color.text3, textAlign: 'right', marginBottom: 16 }}>
            اختر الطريقة المناسبة لك
          </Text>

          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: tokens.color.surface, padding: 14, borderRadius: tokens.radius.lg,
              borderWidth: 1, borderColor: tokens.color.brand500, marginBottom: 10,
            }}
            activeOpacity={0.85}
            onPress={() => { setShowCreateChooser(false); setShowManualCreator(true); }}
          >
            <View style={{ width: 44, height: 44, borderRadius: tokens.radius.md, backgroundColor: tokens.color.brand500, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="create" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right' }}>
                إنشاء يدوي
              </Text>
              <Text style={{ fontSize: tokens.font.size.sm, color: tokens.color.text3, textAlign: 'right', marginTop: 2 }}>
                اكتب الأسئلة والخيارات والدرجات بنفسك
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: tokens.color.surface, padding: 14, borderRadius: tokens.radius.lg,
              borderWidth: 1, borderColor: tokens.color.border,
            }}
            activeOpacity={0.85}
            onPress={() => { setShowCreateChooser(false); router.push('/(teacher)/ai-tools'); }}
          >
            <View style={{ width: 44, height: 44, borderRadius: tokens.radius.md, backgroundColor: tokens.color.purple, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right' }}>
                إنشاء بالذكاء الصناعي
              </Text>
              <Text style={{ fontSize: tokens.font.size.sm, color: tokens.color.text3, textAlign: 'right', marginTop: 2 }}>
                ولّد أسئلة من نص أو موضوع
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </SwipeableSheet>

      {/* Manual exam creator (3-step sheet) */}
      <ManualExamCreator
        visible={showManualCreator}
        onClose={() => setShowManualCreator(false)}
        onCreated={loadExams}
      />

      {/* Confirm sheet — replaces inline Alert.alert confirms */}
      <ConfirmSheet
        visible={confirmState.visible}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        destructive={confirmState.destructive}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  statRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right', marginBottom: 10 },

  examCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border2,
    gap: 12,
    ...tokens.shadow.xs,
  },
  examTitle: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, marginBottom: 4, textAlign: 'right' },
  examMeta: { fontSize: tokens.font.size.base, color: tokens.color.text3, textAlign: 'right' },
  examIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBlock: {
    minWidth: 48,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  scoreValue: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, fontVariant: ['tabular-nums'] },
  scoreLabel: { fontSize: 9, color: tokens.color.text3, fontWeight: tokens.font.weight.bold, marginTop: 2 },

  detailHeader: { backgroundColor: tokens.color.surface, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: tokens.color.border, flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-end' },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: tokens.color.surface2, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right', flex: 1 },
  detailSubtitle: { fontSize: tokens.font.size.sm, color: tokens.color.text3, position: 'absolute', right: 60, bottom: 4 },
  timerCard: { backgroundColor: tokens.color.surface, margin: 16, padding: 16, borderRadius: tokens.radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 2, borderColor: tokens.color.purple },
  timerText: { fontSize: 28, fontWeight: tokens.font.weight.heavy, color: tokens.color.purple, letterSpacing: 1 },
  timerLabel: { fontSize: tokens.font.size.base, color: tokens.color.text3, marginLeft: 6 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  statBox: { flex: 1, backgroundColor: tokens.color.surface, padding: 12, borderRadius: tokens.radius.md, alignItems: 'center', borderWidth: 1, borderColor: tokens.color.border },
  statValue: { fontSize: 20, fontWeight: tokens.font.weight.heavy, color: tokens.color.text },
  statLabel: { fontSize: tokens.font.size.xs, color: tokens.color.text3, marginTop: 4, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: tokens.radius.md },
  actionBtnText: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.heavy, color: '#fff' },
  sectionHeader: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right', marginBottom: 10 },
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: tokens.color.border },
  sessionName: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.text, textAlign: 'right' },
  sessionStatus: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, marginTop: 2, textAlign: 'right' },
  sessionScore: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, marginLeft: 6 },
});
