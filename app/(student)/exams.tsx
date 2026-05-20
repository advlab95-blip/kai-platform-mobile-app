import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, TextInput, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useStudentStore from '../../stores/studentStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { exportExamResultPDF } from '../../services/pdfExport';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useExamProtection, getWatermarkText } from '../../hooks/useExamProtection';
import { useTranslation } from 'react-i18next';
import { confirmAlert } from '../../utils/alerts';
import { haptics } from '../../utils/haptics';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import TagChip from '../../components/teacher/chips/TagChip';
import DangerButton from '../../components/teacher/buttons/DangerButton';
import IconButton from '../../components/teacher/buttons/IconButton';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';

// AsyncStorage key for in-progress answer backup. Rebuilt on every answer change
// so a mid-submit network drop never wipes the student's work. DO NOT REMOVE.
const answerBackupKey = (examId: string, userId: string) => `answers_${examId}_${userId}`;

// Pulsing red dot for the "LIVE" badge. Self-contained — doesn't rerender the card.
function PulsingLiveBadge() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={badgeStyles.wrap}>
      <Animated.View style={[badgeStyles.dot, { opacity }]} />
      <Text style={badgeStyles.text}>مباشر</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.color.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#fff',
  },
  text: {
    color: '#fff',
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.heavy,
  },
});

export default function StudentExams() {
  const { t } = useTranslation();
  const { userId, userName } = useAuthStore();
  const { classId } = useStudentStore();
  const { userInstituteId } = useDataStore();
  const isEnabled = useFeatureFlag('exam_system');
  const routeParams = useLocalSearchParams<{ openExamId?: string }>();
  const autoOpenedRef = useRef<string | null>(null);

  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Teacher→subject map: falls back to teacher's primary subject when exam row has no subject_id
  const [teacherSubjectMap, setTeacherSubjectMap] = useState<Record<string, { subject_id: string; subject_name: string }>>({});
  useEffect(() => {
    if (!userInstituteId) return;
    api.getTeachersSubjectMap(userInstituteId).then(setTeacherSubjectMap).catch(() => setTeacherSubjectMap({}));
  }, [userInstituteId]);

  // Exam session
  const [showExam, setShowExam] = useState(false);
  const [currentExam, setCurrentExam] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [examQuestions, setExamQuestions] = useState<any[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<number, any>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Result detail modal (view answers after grade is published)
  const [resultSession, setResultSession] = useState<any>(null);
  const [resultData, setResultData] = useState<{ questions: any[]; answers: any[]; exam: any } | null>(null);
  const [resultLoading, setResultLoading] = useState(false);

  const openResultDetail = async (exam: any, session: any) => {
    if (!session?.id) return;
    haptics.selection();
    setResultSession({ ...session, examTitle: exam.title, examTotal: exam.total_points });
    setResultLoading(true);
    setResultData(null);
    try {
      const d = await api.getExamSessionDetail(session.id);
      setResultData({ questions: d.questions, answers: d.answers, exam: d.exam });
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل تحميل الإجابات');
      setResultSession(null);
    } finally {
      setResultLoading(false);
    }
  };

  const exportResultPDF = async () => {
    if (!resultSession || !resultData) return;
    haptics.selection();
    try {
      await exportExamResultPDF({
        examTitle: resultData.exam?.title || resultSession.examTitle || '',
        studentName: userName || '',
        score: resultSession.score,
        maxScore: resultSession.max_score || resultSession.examTotal,
        questions: resultData.questions as any,
        answers: resultData.answers as any,
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل توليد PDF');
    }
  };

  // Protection — DO NOT REMOVE
  const { logEvent } = useExamProtection(sessionId, userId, currentExam?.id, showExam);

  // Debounced AsyncStorage backup of examAnswers. Fires ~500ms after the last
  // change so mid-exam crashes, reloads, or network drops never lose answers.
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!showExam || !currentExam?.id || !userId) return;
    if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(
        answerBackupKey(currentExam.id, userId),
        JSON.stringify(examAnswers),
      ).catch(() => { /* swallow storage errors — backup is best-effort */ });
    }, 500);
    return () => { if (backupTimerRef.current) clearTimeout(backupTimerRef.current); };
  }, [examAnswers, showExam, currentExam?.id, userId]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadError(null);
      const data = await api.getStudentExams(userId, classId || undefined, userId);
      setExams(data);
    } catch (err: any) {
      setLoadError(err?.message || t('common.loadFailed', { defaultValue: 'تعذّر تحميل البيانات' }));
    } finally {
      setLoading(false);
    }
  }, [userId, classId, t]);

  useEffect(() => { loadData(); }, [userId, classId]);

  // Auto-open specific exam when navigated from subject-detail (openExamId param)
  useEffect(() => {
    const targetId = routeParams.openExamId;
    if (!targetId || !exams.length || autoOpenedRef.current === targetId) return;
    const exam = exams.find((e: any) => e.id === targetId);
    if (!exam) return;
    autoOpenedRef.current = targetId;
    const ses = exam.session;
    if (ses?.grade_published_at && ses.score !== null) {
      openResultDetail(exam, ses);
    } else if (!ses && (exam.status === 'active' || exam.status === 'scheduled')) {
      startExam(exam);
    }
    // else: already submitted awaiting grading — just show the list
  }, [exams, routeParams.openExamId]);

  // Ref to avoid stale closure in timer
  const forceSubmitRef = useRef<() => void>(() => {});

  // Timer with warning at 30 seconds
  useEffect(() => {
    if (!showExam || timeLeft <= 0) return;
    const intervalId = setInterval(() => setTimeLeft(prev => {
      if (prev <= 1) { forceSubmitRef.current(); return 0; }
      if (prev === 31) { Alert.alert(t('common.warning'), t('student.thirtySecondsLeft')); }
      return prev - 1;
    }), 1000);
    return () => clearInterval(intervalId);
  }, [showExam]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  const startExam = async (exam: any) => {
    confirmAlert(t('student.startExam'), t('student.startExamConfirm', { title: exam.title, duration: exam.duration_minutes }), async () => {
      haptics.selection();
      try {
        const session = await api.startExamSession(exam.id, userId || '', `${Platform.OS}/${Platform.Version}`);
        setSessionId(session.id);
        setCurrentExam(exam);
        // Parse questions
        let qs: any[];
        try { qs = typeof exam.questions === 'string' ? JSON.parse(exam.questions) : exam.questions; } catch { qs = []; }
        setExamQuestions(qs);
        setCurrentQ(0);
        setTimeLeft((exam.duration_minutes || 60) * 60);

        // Restore AsyncStorage backup if one exists for this (exam, user). This covers
        // app-kill / network-drop mid-exam where saveExamAnswer never reached the server.
        let restored = false;
        try {
          const raw = userId ? await AsyncStorage.getItem(answerBackupKey(exam.id, userId)) : null;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
              await new Promise<void>((resolve) => {
                Alert.alert(
                  'استعادة الإجابات',
                  'هل تريد استعادة إجاباتك السابقة؟',
                  [
                    { text: 'لا، ابدأ من جديد', style: 'cancel', onPress: () => {
                      setExamAnswers({});
                      if (userId) AsyncStorage.removeItem(answerBackupKey(exam.id, userId)).catch(() => {});
                      resolve();
                    } },
                    { text: 'نعم، استعد', onPress: () => { setExamAnswers(parsed); restored = true; resolve(); } },
                  ],
                );
              });
            }
          }
        } catch { /* corrupt backup — fall through to empty state */ }
        if (!restored) setExamAnswers({});

        setShowExam(true);
      } catch (err: any) { Alert.alert(t('common.error'), err.message); }
    });
  };

  const handleSaveExamAnswer = (qIndex: number, answer: any) => {
    setExamAnswers(prev => ({ ...prev, [qIndex]: answer }));
    // Every change also goes to server (api.saveExamAnswer) AND AsyncStorage (via effect above).
    if (sessionId) api.saveExamAnswer(sessionId, qIndex, answer).catch(() => {});
  };

  // Force submit when timer expires — no cancel option
  const forceSubmitExam = async () => {
    if (!sessionId || submitting) return; // Prevent double submit
    setSubmitting(true);
    try {
      await api.submitExamSession(sessionId);
      // Clear the AsyncStorage backup only after the server acknowledges submission.
      // If submit fails, we keep the backup so the student can retry without losing answers.
      if (currentExam?.id && userId) {
        AsyncStorage.removeItem(answerBackupKey(currentExam.id, userId)).catch(() => {});
      }
      Alert.alert(t('student.timeUp'), t('student.autoSubmitted'));
      setShowExam(false);
      loadData();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setSubmitting(false);
    }
  };

  // Keep ref updated with latest forceSubmitExam
  useEffect(() => { forceSubmitRef.current = forceSubmitExam; });

  // Manual submit — goes through ConfirmSheet (destructive)
  const handleSubmitExam = () => {
    if (!sessionId) return;
    setShowSubmitConfirm(true);
  };

  const performSubmitExam = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      await api.submitExamSession(sessionId);
      // Clear the AsyncStorage backup only after the server acknowledges submission.
      if (currentExam?.id && userId) {
        AsyncStorage.removeItem(answerBackupKey(currentExam.id, userId)).catch(() => {});
      }
      Alert.alert(t('common.success'), t('student.examSubmitted'));
      setShowExam(false);
      loadData();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // --- Classify exams into 3 sections for display ---
  type Section = 'live' | 'upcoming' | 'results';
  const sectioned = useMemo(() => {
    const live: any[] = [];
    const upcoming: any[] = [];
    const results: any[] = [];
    const now = Date.now();
    for (const e of exams) {
      const ses = e.session;
      const isFinished = ses?.status === 'submitted' || ses?.status === 'graded' || ses?.status === 'returned';
      if (isFinished) {
        results.push(e);
        continue;
      }
      const startsAt = e.start_at ? new Date(e.start_at).getTime() : null;
      const isUpcoming = e.status === 'scheduled' && startsAt && startsAt > now;
      if (isUpcoming) {
        upcoming.push(e);
      } else {
        // "live" == active, or in_progress session, or scheduled-but-within-window
        live.push(e);
      }
    }
    return { live, upcoming, results };
  }, [exams]);

  const scoreTone = (score: number, max: number): { tone: 'success' | 'warning' | 'danger'; pct: number } => {
    const pct = max > 0 ? Math.round((score / max) * 100) : 0;
    if (pct >= 85) return { tone: 'success', pct };
    if (pct >= 70) return { tone: 'warning', pct };
    return { tone: 'danger', pct };
  };

  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title={t('student.examsTitle')}
          gradient={tokens.gradient.student}
          glowAccent="rgba(20,184,166,0.30)"
          fallbackRoute="/(student)/services"
        />
        <View style={s.lockWrap}>
          <Ionicons name="lock-closed" size={48} color={tokens.color.text4} />
          <Text style={s.lockText}>{t('student.featureDisabled')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderExamCard = (e: any, section: Section) => {
    const ses = e.session;
    const canStart = !ses && (e.status === 'active' || e.status === 'scheduled');
    const isSubmitted = ses?.status === 'submitted' || ses?.status === 'graded' || ses?.status === 'returned';
    const hasPublishedScore = isSubmitted && ses.score != null && ses.grade_published_at;

    const onCardPress = () => {
      if (hasPublishedScore) { openResultDetail(e, ses); return; }
      if (canStart || ses?.status === 'in_progress') { startExam(e); return; }
    };

    return (
      <TouchableOpacity
        key={e.id}
        style={s.card}
        activeOpacity={0.85}
        onPress={onCardPress}
      >
        <View style={s.cardRow}>
          <View style={s.cardRight}>
            {/* Right-side badges/score */}
            {section === 'live' && <PulsingLiveBadge />}
            {section === 'upcoming' && (
              <TagChip label={t('student.upcomingSoon', { defaultValue: 'قريباً' })} tone="info" icon="time" />
            )}
            {section === 'results' && hasPublishedScore && (() => {
              const { tone, pct } = scoreTone(ses.score, ses.max_score || e.total_points || 100);
              const pillBg =
                tone === 'success' ? tokens.color.successBg
                : tone === 'warning' ? tokens.color.warningBg
                : tokens.color.dangerBg;
              const pillFg =
                tone === 'success' ? tokens.color.success
                : tone === 'warning' ? tokens.color.warning
                : tokens.color.danger;
              return (
                <View style={[s.scorePill, { backgroundColor: pillBg }]}>
                  <Text style={[s.scorePillValue, { color: pillFg }]}>{ses.score}</Text>
                  <Text style={[s.scorePillMax, { color: pillFg }]}>
                    / {ses.max_score || e.total_points || 100}
                  </Text>
                  <Ionicons name="eye" size={13} color={pillFg} />
                </View>
              );
            })()}
            {section === 'results' && !hasPublishedScore && (
              <TagChip
                label={t('student.awaitingCorrection', { defaultValue: 'قيد التصحيح' })}
                tone="warning"
                icon="hourglass"
              />
            )}
          </View>

          <View style={s.cardCenter}>
            <Text style={s.cardTitle} numberOfLines={2}>{e.title}</Text>
            <View style={s.cardMetaRow}>
              {e.duration_minutes ? (
                <Text style={s.cardMeta}>
                  {t('student.minuteLabel', { minutes: e.duration_minutes })}
                </Text>
              ) : null}
              {e.total_points ? (
                <>
                  <Text style={s.metaSep}>·</Text>
                  <Text style={s.cardMeta}>
                    {t('student.pointsLabel', { points: e.total_points })}
                  </Text>
                </>
              ) : null}
              {section === 'upcoming' && e.start_at ? (
                <>
                  <Text style={s.metaSep}>·</Text>
                  <Text style={s.cardMeta}>
                    {new Date(e.start_at).toLocaleDateString('ar-IQ')}
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          <View style={[
            s.cardIcon,
            section === 'live' && { backgroundColor: tokens.color.dangerBg },
            section === 'upcoming' && { backgroundColor: tokens.color.infoBg },
            section === 'results' && { backgroundColor: hasPublishedScore ? tokens.color.successBg : tokens.color.warningBg },
          ]}>
            <Ionicons
              name={
                section === 'live' ? 'flash'
                : section === 'upcoming' ? 'calendar'
                : hasPublishedScore ? 'checkmark-done' : 'hourglass'
              }
              size={20}
              color={
                section === 'live' ? tokens.color.danger
                : section === 'upcoming' ? tokens.color.info
                : hasPublishedScore ? tokens.color.success : tokens.color.warning
              }
            />
          </View>
        </View>

        {/* Start / Continue CTA — only when actionable */}
        {section === 'live' && (canStart || ses?.status === 'in_progress') && (
          <View style={s.ctaRow}>
            <View style={s.ctaBadge}>
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={s.ctaText}>
                {ses?.status === 'in_progress'
                  ? t('student.continueLabel', { defaultValue: 'متابعة' })
                  : t('student.startLabel', { defaultValue: 'ابدأ' })}
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSection = (title: string, section: Section, items: any[], icon: string) => {
    if (!items.length) return null;
    return (
      <View style={{ marginTop: 8, marginBottom: 4 }}>
        <View style={s.sectionHeader}>
          <Ionicons name={icon as any} size={16} color={tokens.color.teal700} />
          <Text style={s.sectionTitle}>{title}</Text>
          <Text style={s.sectionCount}>{items.length}</Text>
        </View>
        {items.map(e => renderExamCard(e, section))}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('student.examsTitle')}
        subtitle={t('student.examCount', { count: exams.length })}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
        fallbackRoute="/(student)/services"
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.teal600} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >

        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <SkeletonList count={5} />
          </View>
        ) : loadError ? (
          <ErrorState
            title={t('common.loadFailedTitle', { defaultValue: 'تعذّر تحميل الامتحانات' })}
            message={loadError}
            retryLabel={t('common.retry', { defaultValue: 'إعادة المحاولة' })}
            onRetry={() => { setLoading(true); loadData(); }}
          />
        ) : exams.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title={t('student.noExams', { defaultValue: 'لا توجد امتحانات' })}
          />
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {renderSection(
              t('student.availableNow', { defaultValue: 'متاحة الآن' }),
              'live',
              sectioned.live,
              'flash',
            )}
            {renderSection(
              t('student.upcoming', { defaultValue: 'قادمة' }),
              'upcoming',
              sectioned.upcoming,
              'calendar',
            )}
            {renderSection(
              t('student.results', { defaultValue: 'النتائج' }),
              'results',
              sectioned.results,
              'trophy',
            )}
          </View>
        )}
      </ScrollView>

      {/* Result detail sheet — student reviews answers + exports PDF */}
      <SwipeableSheet
        visible={!!resultSession}
        onClose={() => setResultSession(null)}
        maxHeight={0.9}
        sheetStyle={{ backgroundColor: tokens.color.bg }}
      >
        <View>
          <View style={s.resultHeader}>
            <TouchableOpacity onPress={() => setResultSession(null)} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color={tokens.color.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.resultTitle}>
                {resultSession?.examTitle || ''}
              </Text>
              <Text style={s.resultScoreSub}>
                {t('student.yourScore', { defaultValue: 'درجتك:' })} {resultSession?.score}/{resultSession?.max_score || resultSession?.examTotal}
              </Text>
            </View>
            <TouchableOpacity
              onPress={exportResultPDF}
              style={s.pdfBtn}
              disabled={!resultData}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text" size={14} color="#fff" />
              <Text style={s.pdfBtnText}>PDF</Text>
            </TouchableOpacity>
          </View>

          {resultLoading ? (
            <ActivityIndicator style={{ padding: 40 }} color={tokens.color.teal600} />
          ) : resultData ? (
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
              {resultData.questions.map((q: any, idx: number) => {
                const ansRow = resultData.answers.find((a: any) => a.question_index === idx);
                const studentAns = ansRow ? String(ansRow.answer || '').replace(/^"+|"+$/g, '') : '';
                let correctText = '';
                if (q.type === 'mcq') correctText = q.options?.[q.correctIndex] || '';
                else if (q.type === 'tf') correctText = q.options?.[q.correctAnswer ? 0 : 1] || '';
                const isCorrect = studentAns && studentAns === correctText;
                return (
                  <View key={idx} style={s.resultQCard}>
                    <View style={s.resultQHeader}>
                      <Text style={s.resultQPoints}>{q.points || 0} {t('student.point', { defaultValue: 'نقطة' })}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[
                          s.resultPill,
                          {
                            backgroundColor: isCorrect ? tokens.color.successBg : (studentAns ? tokens.color.dangerBg : tokens.color.surface2),
                          },
                        ]}>
                          <Text style={{
                            fontSize: tokens.font.size.sm,
                            fontWeight: tokens.font.weight.heavy,
                            color: isCorrect ? tokens.color.success : (studentAns ? tokens.color.danger : tokens.color.text3),
                          }}>
                            {isCorrect ? '✓ صحيح' : studentAns ? '✗ خطأ' : '— لم تُجب'}
                          </Text>
                        </View>
                        <Text style={s.resultQNum}>{t('student.questionWord', { defaultValue: 'سؤال' })} {idx + 1}</Text>
                      </View>
                    </View>
                    <Text style={s.resultQText}>{q.content}</Text>
                    <View style={[s.answerBox, { borderRightColor: tokens.color.text3 }]}>
                      <Text style={s.answerLabel}>{t('student.yourAnswerLabel', { defaultValue: 'إجابتك:' })} </Text>
                      <Text style={s.answerValue}>{studentAns || 'لم تُجب'}</Text>
                    </View>
                    {!isCorrect && correctText ? (
                      <View style={[s.answerBox, { backgroundColor: tokens.color.successBg, borderRightColor: tokens.color.success, marginTop: 6 }]}>
                        <Text style={[s.answerLabel, { color: tokens.color.success }]}>{t('student.correctAnswerLabel', { defaultValue: 'الإجابة الصحيحة:' })} </Text>
                        <Text style={[s.answerValue, { color: tokens.color.success }]}>{correctText}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      </SwipeableSheet>

      {/* Exam Session Modal — full-screen, watermarked */}
      <Modal visible={showExam} animationType="slide">
        <SafeAreaView style={[s.container, { backgroundColor: tokens.color.surface }]}>
          {/* Watermark — DO NOT REMOVE */}
          <Text style={s.watermark}>{getWatermarkText(userName || '', userId || '')}</Text>

          {/* Timer + exit */}
          <View style={s.timerBar}>
            <IconButton
              icon="close"
              onPress={() => setShowExitConfirm(true)}
              variant="surface"
              accessibilityLabel={t('common.close', { defaultValue: 'إغلاق' })}
            />
            <TouchableOpacity onPress={handleSubmitExam} activeOpacity={0.7}>
              <Text style={s.examSubmitLink}>{t('student.examSubmitLabel')}</Text>
            </TouchableOpacity>
            <Text style={[s.timerText, timeLeft > 0 && timeLeft < 60 && { color: tokens.color.danger }]}>
              {formatTimer(timeLeft)}
            </Text>
            <Text style={s.qCounter}>{currentQ + 1}/{examQuestions.length}</Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
            {examQuestions.length > 0 && (() => {
              const q = examQuestions[currentQ];
              if (!q) return null;
              const opts = q.options?.choices || q.options || ((q.type === 'true_false' || q.type === 'tf') ? ['صح', 'خطأ'] : []);
              return (
                <View>
                  <View style={s.qCard}>
                    <Text style={s.qNum}>{t('student.questionNumber', { number: currentQ + 1 })}</Text>
                    <Text style={s.qText}>{q.content}</Text>
                    <Text style={s.qPoints}>{t('student.pointsLabel', { points: q.points })}</Text>
                  </View>
                  {(q.type === 'mcq' || q.type === 'true_false' || q.type === 'tf' || q.type === 'multi_select') && (Array.isArray(opts) ? opts : []).map((opt: string, i: number) => (
                    <TouchableOpacity
                      key={i}
                      style={[s.optBtn, examAnswers[currentQ] === opt && s.optSelected]}
                      onPress={() => { haptics.selection(); handleSaveExamAnswer(currentQ, opt); }}
                      activeOpacity={0.85}
                    >
                      <View style={[s.optRadio, examAnswers[currentQ] === opt && s.optRadioSel]} />
                      <Text style={[s.optText, examAnswers[currentQ] === opt && { color: tokens.color.teal700, fontWeight: tokens.font.weight.heavy }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                  {['short_answer', 'short', 'essay', 'fill_blank', 'fill'].includes(q.type) && (
                    <TextInput
                      style={[s.ansInput, q.type === 'essay' && { height: 120 }]}
                      value={examAnswers[currentQ] || ''}
                      onChangeText={tx => handleSaveExamAnswer(currentQ, tx)}
                      placeholder={t('student.yourAnswer')}
                      placeholderTextColor={tokens.color.text3}
                      textAlign="right"
                      multiline={q.type === 'essay'}
                    />
                  )}
                </View>
              );
            })()}
          </ScrollView>

          <View style={s.navBar}>
            <TouchableOpacity
              style={[s.navBtn, currentQ === 0 && { opacity: 0.3 }]}
              onPress={() => { if (currentQ > 0) { haptics.light(); setCurrentQ(currentQ - 1); } }}
              disabled={currentQ === 0}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-forward" size={18} color={tokens.color.teal700} />
              <Text style={s.navText}>{t('student.previousBtn')}</Text>
            </TouchableOpacity>
            {currentQ < examQuestions.length - 1 ? (
              <TouchableOpacity
                style={s.navBtn}
                onPress={() => { haptics.light(); setCurrentQ(currentQ + 1); }}
                activeOpacity={0.85}
              >
                <Text style={s.navText}>{t('student.nextBtn')}</Text>
                <Ionicons name="arrow-back" size={18} color={tokens.color.teal700} />
              </TouchableOpacity>
            ) : (
              <DangerButton
                label={t('student.examSubmitLabel')}
                onPress={handleSubmitExam}
                icon="checkmark-done"
                loading={submitting}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Submit exam confirmation (destructive) */}
      <ConfirmSheet
        visible={showSubmitConfirm}
        title={t('student.submitExam')}
        message={t('student.submitConfirm')}
        confirmLabel={t('student.examSubmitLabel', { defaultValue: 'تسليم' })}
        cancelLabel={t('common.cancel', { defaultValue: 'إلغاء' })}
        destructive
        onConfirm={performSubmitExam}
        onClose={() => setShowSubmitConfirm(false)}
      />

      {/* Exit exam confirmation (destructive) */}
      <ConfirmSheet
        visible={showExitConfirm}
        title={t('student.exitExamTitle', { defaultValue: 'خروج من الامتحان' })}
        message={t('student.exitExamMsg', { defaultValue: 'ستُحفظ إجاباتك كمسودة ويمكنك العودة لاحقاً. هل أنت متأكد؟' })}
        confirmLabel={t('common.yes', { defaultValue: 'نعم' })}
        cancelLabel={t('common.cancel', { defaultValue: 'إلغاء' })}
        destructive
        onConfirm={() => setShowExam(false)}
        onClose={() => setShowExitConfirm(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },

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

  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text3,
    marginTop: 12,
  },

  // --- Section headers ---
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionCount: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.teal700,
    backgroundColor: tokens.color.teal50,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    overflow: 'hidden',
  },

  // --- Exam card ---
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardRight: {
    flexShrink: 0,
    alignItems: 'flex-start',
  },
  cardCenter: {
    flex: 1,
  },
  cardIcon: {
    width: 44, height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
    flexWrap: 'wrap',
  },
  cardMeta: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
  },
  metaSep: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text4,
  },

  // Score pill (results section)
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },
  scorePillValue: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scorePillMax: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    opacity: 0.8,
  },

  // Start/continue CTA row
  ctaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  ctaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.color.teal600,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    ...tokens.shadow.teal,
  },
  ctaText: {
    color: '#fff',
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.heavy,
  },

  // --- Result sheet ---
  resultHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  resultScoreSub: {
    fontSize: tokens.font.size.base,
    color: tokens.color.success,
    fontWeight: tokens.font.weight.heavy,
    textAlign: 'right',
    marginTop: 2,
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.color.purple,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
  },
  pdfBtnText: {
    color: '#fff',
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.heavy,
  },
  resultQCard: {
    backgroundColor: tokens.color.surface,
    padding: 12,
    borderRadius: tokens.radius.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  resultQHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resultQPoints: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text3,
  },
  resultQNum: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  resultQText: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 8,
    writingDirection: 'rtl',
  },
  resultPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
  },
  answerBox: {
    backgroundColor: tokens.color.surface2,
    padding: 8,
    borderRadius: tokens.radius.sm,
    borderRightWidth: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  answerLabel: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.heavy,
    textAlign: 'right',
  },
  answerValue: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    textAlign: 'right',
  },

  // --- Exam session modal ---
  watermark: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    fontSize: tokens.font.size.lg,
    color: 'rgba(0,0,0,0.04)',
    fontWeight: tokens.font.weight.heavy,
    transform: [{ rotate: '-30deg' }],
    zIndex: 1,
  },
  timerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  timerText: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  qCounter: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
  },
  examSubmitLink: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.danger,
  },

  qCard: {
    backgroundColor: tokens.color.teal50,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[5],
    marginBottom: 20,
    borderWidth: 1,
    borderColor: tokens.color.teal100,
  },
  qNum: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.teal700,
    marginBottom: 8,
  },
  qText: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    lineHeight: 26,
    writingDirection: 'rtl',
  },
  qPoints: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.teal600,
    marginTop: 6,
    fontWeight: tokens.font.weight.bold,
    textAlign: 'right',
  },

  optBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    gap: 12,
  },
  optSelected: {
    borderColor: tokens.color.teal600,
    backgroundColor: tokens.color.teal50,
  },
  optRadio: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: tokens.color.surface3,
  },
  optRadioSel: {
    borderColor: tokens.color.teal600,
    backgroundColor: tokens.color.teal600,
  },
  optText: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ansInput: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
    fontSize: tokens.font.size.lg,
    color: tokens.color.text,
    textAlignVertical: 'top',
  },

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 10,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.teal50,
    borderWidth: 1,
    borderColor: tokens.color.teal100,
  },
  navText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.teal700,
  },
});
