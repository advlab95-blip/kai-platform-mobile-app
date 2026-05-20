import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useStudentStore from '../../stores/studentStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { confirmAlert } from '../../utils/alerts';
import { haptics } from '../../utils/haptics';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import StudentProgress from '../../components/shared/StudentProgress';
import AttendanceRing from '../../components/student/rings/AttendanceRing';
import TagChip from '../../components/teacher/chips/TagChip';
import PrimaryButton from '../../components/teacher/buttons/PrimaryButton';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';

type JustificationStatus = 'pending' | 'approved' | 'rejected';

export default function StudentStats() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const {
    attendanceSummary,
    attendanceRecords,
    exams,
    classId,
    selectedClassId,
    justifications,
    loadAttendance,
    loadExams,
    loadJustifications,
  } = useStudentStore();

  const activeClassId = selectedClassId || classId;

  const [refreshing, setRefreshing] = useState(false);

  // Submitted exams tracking
  const [submittedExams, setSubmittedExams] = useState<Set<string>>(new Set());

  // Justification sheet state
  const [justifyModalVisible, setJustifyModalVisible] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<any>(null);
  const [justifyReason, setJustifyReason] = useState('');
  const [justifyDoc, setJustifyDoc] = useState<{ name: string; uri: string } | null>(null);
  const [justifySending, setJustifySending] = useState(false);

  // Clear-cache confirm sheet
  const [clearCacheVisible, setClearCacheVisible] = useState(false);

  // Exam inline runner (KEEP — do not change computations)
  const [examModalVisible, setExamModalVisible] = useState(false);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, any>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isGrace, setIsGrace] = useState(false);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const timerRef = useRef<any>(null);
  const isGraceRef = useRef(false);
  const handleSubmitExamRef = useRef<() => void>(() => {});

  // Persist exam answers on every change (offline backup)
  useEffect(() => {
    if (activeExam && Object.keys(examAnswers).length > 0) {
      AsyncStorage.setItem(`exam_backup_${activeExam.id}`, JSON.stringify(examAnswers)).catch(() => {});
    }
  }, [examAnswers, activeExam]);

  useEffect(() => {
    if (userId) {
      loadAttendance(userId);
      loadJustifications(userId);
    }
    if (activeClassId) {
      loadExams(activeClassId);
    }
  }, [userId, activeClassId]);

  // Fetch submitted exams to prevent duplicates
  useEffect(() => {
    if (userId && userInstituteId) {
      supabase.from('exam_submissions')
        .select('exam_id')
        .eq('student_id', userId)
        .eq('institute_id', userInstituteId)
        .then(({ data, error }) => {
          if (error) { console.error('[stats] submitted exams', error); return; }
          setSubmittedExams(new Set(data?.map((s: any) => s.exam_id) || []));
        });
    }
  }, [userId, exams, userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      const promises: Promise<void>[] = [];
      if (userId) {
        promises.push(loadAttendance(userId), loadJustifications(userId));
      }
      if (activeClassId) promises.push(loadExams(activeClassId));
      await Promise.all(promises);
    } finally {
      setRefreshing(false);
    }
  }, [userId, activeClassId]);

  // --- Justification ---
  const openJustifyModal = (record: any) => {
    haptics.selection();
    setSelectedAttendance(record);
    setJustifyReason('');
    setJustifyDoc(null);
    setJustifyModalVisible(true);
  };

  const pickJustifyDoc = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setJustifyDoc({
          name: result.assets[0].name || 'document',
          uri: result.assets[0].uri,
        });
      }
    } catch { /* cancelled or denied — silent */ }
  };

  const handleSubmitJustification = async () => {
    if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); return; }
    if (!justifyReason.trim()) {
      Alert.alert(t('common.error'), t('student.writeReason'));
      return;
    }
    setJustifySending(true);
    try {
      // Note: current api.createJustification takes (studentId, attendanceId, reason).
      // Doc attachment is presentation-only until backend adds a doc_url column.
      await api.createJustification(userId || '', selectedAttendance.id, justifyReason.trim());
      Alert.alert(t('common.success'), t('student.justificationSent'));
      setJustifyModalVisible(false);
      if (userId) loadJustifications(userId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('student.justificationFailed'));
    } finally {
      setJustifySending(false);
    }
  };

  // --- Exam runner (KEEP) ---
  const startExam = async (exam: any) => {
    haptics.selection();
    let questions: any[] = [];
    try {
      questions = typeof exam.questions === 'string' ? JSON.parse(exam.questions) : exam.questions;
    } catch (err) {
      console.error('[Exam parse]:', err);
    }
    const examData = { ...exam, parsedQuestions: questions };

    const saved = await AsyncStorage.getItem(`exam_backup_${exam.id}`).catch(() => null);
    if (saved) {
      Alert.alert(t('common.restore'), t('student.restoreAnswers'), [
        {
          text: t('student.startNew'),
          onPress: () => {
            setExamAnswers({});
            setActiveExam(examData);
            setTimeLeft((exam.duration_minutes || 30) * 60);
            setIsGrace(false);
            isGraceRef.current = false;
            setExamModalVisible(true);
          },
        },
        {
          text: t('student.restoreBtn'),
          onPress: () => {
            setExamAnswers(JSON.parse(saved));
            setActiveExam(examData);
            setTimeLeft((exam.duration_minutes || 30) * 60);
            setIsGrace(false);
            isGraceRef.current = false;
            setExamModalVisible(true);
          },
        },
      ]);
    } else {
      setExamAnswers({});
      setActiveExam(examData);
      setTimeLeft((exam.duration_minutes || 30) * 60);
      setIsGrace(false);
      isGraceRef.current = false;
      setExamModalVisible(true);
    }
  };

  useEffect(() => {
    if (!examModalVisible) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (!isGraceRef.current) {
            isGraceRef.current = true;
            setIsGrace(true);
            return 30;
          } else {
            handleSubmitExamRef.current();
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [examModalVisible]);

  const handleSubmitExam = async (attempt: number = 1) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); return; }
    if (!activeExam || examSubmitting) return;
    setExamSubmitting(true);
    try {
      const answers = Object.entries(examAnswers).map(([idx, val]) => ({
        questionIndex: Number(idx),
        answer: val,
      }));
      await api.submitExamAnswers(activeExam.id, userId || '', answers);
      await AsyncStorage.removeItem(`exam_backup_${activeExam.id}`).catch(() => {});
      setSubmittedExams((prev) => new Set([...prev, activeExam.id]));
      setExamModalVisible(false);
      Alert.alert(t('common.success'), t('student.examSubmitted'));
    } catch (err: any) {
      if (attempt < 2) {
        confirmAlert(t('common.error'), t('student.examSubmitFailed'), () => handleSubmitExam(attempt + 1));
      } else {
        Alert.alert(
          t('common.error'),
          t('student.examSubmitFailedFinal', { defaultValue: 'فشل الإرسال. إجاباتك محفوظة محلياً. تأكد من الاتصال وحاول لاحقاً.' })
        );
      }
    } finally {
      setExamSubmitting(false);
    }
  };

  // Keep ref in sync with latest handleSubmitExam so the timer uses fresh examAnswers
  useEffect(() => {
    handleSubmitExamRef.current = handleSubmitExam;
  });

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Look up justification by attendance id — pending/approved/rejected badge control
  const justificationByAttendance = useMemo(() => {
    const map = new Map<string, { status: JustificationStatus }>();
    (justifications || []).forEach((j: any) => {
      if (j.attendance_id) {
        map.set(j.attendance_id, { status: (j.status || 'pending') as JustificationStatus });
      }
    });
    return map;
  }, [justifications]);

  // Status icon tile per record status
  const statusTile = (status: string) => {
    const spec: Record<string, { bg: string; fg: string; icon: string }> = {
      present:   { bg: tokens.color.successBg, fg: tokens.color.success, icon: 'checkmark-circle' },
      late:      { bg: tokens.color.warningBg, fg: tokens.color.warning, icon: 'time' },
      absent:    { bg: tokens.color.dangerBg,  fg: tokens.color.danger,  icon: 'close-circle' },
      justified: { bg: tokens.color.infoBg,    fg: tokens.color.info,    icon: 'document-text' },
    };
    const s = spec[status] || spec.absent;
    return (
      <View style={[styles.recordIcon, { backgroundColor: s.bg }]}>
        <Ionicons name={s.icon as any} size={20} color={s.fg} />
      </View>
    );
  };

  // Recent graded exams (last 3, with grade_published_at set) — GUARD MUST REMAIN
  const recentGradedExams = useMemo(() => {
    return (exams || [])
      .filter((e: any) => e.session?.status === 'returned' && e.session?.grade_published_at)
      .slice(0, 3);
  }, [exams]);

  const clearCache = async () => {
    try {
      const [videoMod, aiMod, pdfMod] = await Promise.all([
        import('../../services/videoCache'),
        import('../../services/aiCache'),
        import('../../services/pdfCache').catch(() => null),
      ]);
      await Promise.all([
        videoMod.clearAllVideoCache().catch(() => {}),
        aiMod.AICache.clear().catch(() => {}),
        (pdfMod as any)?.PdfCache?.clear?.().catch(() => {}),
      ]);
      try {
        const keys = await AsyncStorage.getAllKeys();
        const toRemove = keys.filter(k =>
          k.startsWith('exam_backup_') ||
          k.startsWith('assignment_backup_') ||
          k === 'quiz_history'
        );
        if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
      } catch {}
      Alert.alert(t('common.success'), t('student.cacheCleared'));
    } catch {
      Alert.alert(t('common.error'), t('student.clearFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('student.statisticsTitle')}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
        fallbackRoute="/(student)/services"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.color.teal600}
          />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View style={styles.contentArea}>
          {/* Academic progress (Phase 3.7) */}
          {userId ? (
            <View style={{ marginBottom: 14 }}>
              <StudentProgress studentId={userId} />
            </View>
          ) : null}

          {/* Attendance Ring Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('student.attendanceRate')}</Text>
            <View style={styles.ringRow}>
              <AttendanceRing
                percentage={attendanceSummary?.percentage ?? 0}
                size={160}
                label={t('student.attendanceRate')}
              />
            </View>

            {/* 4-cell breakdown */}
            <View style={styles.breakdownGrid}>
              <View style={styles.breakdownCell}>
                <Text style={[styles.breakdownValue, { color: tokens.color.success }]}>
                  {attendanceSummary?.present ?? 0}
                </Text>
                <Text style={styles.breakdownLabel}>{t('student.attendancePresent')}</Text>
              </View>
              <View style={styles.breakdownCell}>
                <Text style={[styles.breakdownValue, { color: tokens.color.danger }]}>
                  {attendanceSummary?.absent ?? 0}
                </Text>
                <Text style={styles.breakdownLabel}>{t('student.attendanceAbsent')}</Text>
              </View>
              <View style={styles.breakdownCell}>
                <Text style={[styles.breakdownValue, { color: tokens.color.warning }]}>
                  {attendanceSummary?.late ?? 0}
                </Text>
                <Text style={styles.breakdownLabel}>{t('student.late')}</Text>
              </View>
              <View style={styles.breakdownCell}>
                <Text style={[styles.breakdownValue, { color: tokens.color.text2 }]}>
                  {attendanceSummary?.total ?? 0}
                </Text>
                <Text style={styles.breakdownLabel}>{t('student.attendanceTotal')}</Text>
              </View>
            </View>
          </View>

          {/* Attendance Records */}
          <Text style={styles.sectionTitle}>{t('student.attendanceRecords')}</Text>
          {attendanceRecords.length === 0 ? (
            <Text style={styles.emptyText}>{t('student.noAttendanceRecords')}</Text>
          ) : (
            attendanceRecords.map((record: any) => {
              const just = justificationByAttendance.get(record.id);
              return (
                <View key={record.id} style={styles.recordCard}>
                  {statusTile(record.status)}
                  <View style={styles.recordInfo}>
                    <Text style={styles.recordSubject} numberOfLines={1}>
                      {record.timetables?.subject || t('student.subjectFallback')}
                    </Text>
                    <Text style={styles.recordDate}>
                      {record.date ? new Date(record.date).toLocaleDateString('ar-IQ') : ''}
                    </Text>
                  </View>

                  {/* Action / badge per status */}
                  {record.status === 'absent' && !just && (
                    <View style={styles.recordAction}>
                      <PrimaryButton
                        label="تبرير"
                        onPress={() => openJustifyModal(record)}
                        gradient="orange"
                      />
                    </View>
                  )}
                  {record.status === 'absent' && just?.status === 'pending' && (
                    <TagChip tone="warning" label="قيد المراجعة" icon="time-outline" />
                  )}
                  {record.status === 'absent' && just?.status === 'approved' && (
                    <TagChip tone="success" label="مبرّر" icon="checkmark-circle" />
                  )}
                  {record.status === 'absent' && just?.status === 'rejected' && (
                    <TagChip tone="danger" label="مرفوض" icon="close-circle" />
                  )}
                  {record.status === 'late' && just?.status === 'approved' && (
                    <TagChip tone="success" label="مقبول" icon="checkmark-circle" />
                  )}
                </View>
              );
            })
          )}

          {/* Recent exam results (only published grades) */}
          {recentGradedExams.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
                {t('student.recentResults', { defaultValue: 'آخر النتائج' })}
              </Text>
              {recentGradedExams.map((exam: any) => {
                const score = exam.session?.score ?? 0;
                const tone: 'success' | 'warning' | 'danger' =
                  score >= 85 ? 'success' : score >= 70 ? 'warning' : 'danger';
                return (
                  <View key={exam.id} style={styles.recordCard}>
                    <View
                      style={[
                        styles.recordIcon,
                        {
                          backgroundColor:
                            tone === 'success'
                              ? tokens.color.successBg
                              : tone === 'warning'
                              ? tokens.color.warningBg
                              : tokens.color.dangerBg,
                        },
                      ]}
                    >
                      <Ionicons
                        name="school"
                        size={20}
                        color={
                          tone === 'success'
                            ? tokens.color.success
                            : tone === 'warning'
                            ? tokens.color.warning
                            : tokens.color.danger
                        }
                      />
                    </View>
                    <View style={styles.recordInfo}>
                      <Text style={styles.recordSubject} numberOfLines={1}>
                        {exam.title || t('student.examFallback')}
                      </Text>
                      <Text style={styles.recordDate}>
                        {exam.session?.grade_published_at
                          ? new Date(exam.session.grade_published_at).toLocaleDateString('ar-IQ')
                          : ''}
                      </Text>
                    </View>
                    <TagChip tone={tone} label={`${score}%`} />
                  </View>
                );
              })}
            </>
          ) : null}

          {/* Exams Section */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t('student.examsSection')}</Text>
          {exams.length === 0 ? (
            <Text style={styles.emptyText}>{t('student.noExamsSection')}</Text>
          ) : (
            exams.map((exam: any) => (
              <View key={exam.id} style={styles.examCard}>
                <View style={styles.examInfo}>
                  <Text style={styles.examTitle} numberOfLines={1}>
                    {exam.title || t('student.examFallback')}
                  </Text>
                  <View style={styles.examMeta}>
                    <Text style={styles.examMetaText}>
                      {exam.total_points || 0} {t('student.pointsUnit')}
                    </Text>
                    <Text style={styles.examMetaDot}> · </Text>
                    <Text style={styles.examMetaText}>
                      {exam.duration_minutes || 30} {t('student.minuteUnit')}
                    </Text>
                  </View>
                </View>
                {exam.status === 'published' &&
                  (submittedExams.has(exam.id) ? (
                    <TagChip tone="success" icon="checkmark-circle" label={t('student.submittedExam')} />
                  ) : (
                    <TouchableOpacity
                      onPress={() => startExam(exam)}
                      activeOpacity={0.85}
                      style={styles.startExamBtn}
                    >
                      <LinearGradient
                        colors={tokens.gradient.student}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.startExamGradient}
                      >
                        <Ionicons name="play" size={16} color="#fff" />
                        <Text style={styles.startExamText}>{t('student.startExamLabel')}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
              </View>
            ))
          )}

          {/* Cache Management removed per user request (Issue #21 — student
              doesn't need a manual cache-clear button; the app handles it
              transparently on logout). */}
        </View>
      </ScrollView>

      {/* Justification sheet */}
      <SwipeableSheet visible={justifyModalVisible} onClose={() => setJustifyModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheetBody}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setJustifyModalVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={tokens.color.text} />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>{t('student.absenceJustification')}</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('student.absenceReason')}
              placeholderTextColor={tokens.color.text3}
              value={justifyReason}
              onChangeText={setJustifyReason}
              multiline
              numberOfLines={4}
              textAlign="right"
              textAlignVertical="top"
            />

            {/* Doc picker (optional) */}
            <Pressable style={styles.docPickerBtn} onPress={pickJustifyDoc}>
              <Ionicons
                name={justifyDoc ? 'document-attach' : 'attach'}
                size={18}
                color={tokens.color.teal600}
              />
              <Text style={styles.docPickerText} numberOfLines={1}>
                {justifyDoc?.name || t('student.attachDoc', { defaultValue: 'إرفاق مستند (اختياري)' })}
              </Text>
              {justifyDoc ? (
                <TouchableOpacity onPress={() => setJustifyDoc(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={tokens.color.text3} />
                </TouchableOpacity>
              ) : null}
            </Pressable>

            <View style={{ marginTop: 12 }}>
              <PrimaryButton
                label={t('common.send')}
                icon="send"
                onPress={handleSubmitJustification}
                gradient="student"
                loading={justifySending}
                fullWidth
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SwipeableSheet>

      {/* Clear-cache confirm sheet (replaces destructive Alert) */}
      <ConfirmSheet
        visible={clearCacheVisible}
        title={t('student.clearCache')}
        message={t('student.clearCacheConfirm')}
        confirmLabel={t('student.clearCacheLabel')}
        cancelLabel="إلغاء"
        destructive
        onConfirm={clearCache}
        onClose={() => setClearCacheVisible(false)}
      />

      {/* Exam Modal (runner preserved) */}
      <Modal visible={examModalVisible} animationType="slide">
        <SafeAreaView style={styles.examModalContainer}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {activeExam && (
              <>
                <View style={styles.examHeader}>
                  <TouchableOpacity
                    onPress={() => {
                      confirmAlert(t('student.endExam'), t('student.endExamConfirm'), handleSubmitExam, true);
                    }}
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={24} color={tokens.color.text} />
                  </TouchableOpacity>
                  <Text style={styles.examHeaderTitle} numberOfLines={1}>
                    {activeExam.title}
                  </Text>
                  <View style={[styles.timerBadge, isGrace && styles.timerBadgeGrace]}>
                    <Ionicons name="time" size={14} color={isGrace ? '#fff' : tokens.color.text} />
                    <Text style={[styles.timerText, isGrace && styles.timerTextGrace]}>
                      {formatTime(timeLeft)}
                    </Text>
                  </View>
                </View>

                <ScrollView
                  style={styles.examBody}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {(activeExam.parsedQuestions || []).map((q: any, idx: number) => (
                    <View key={idx} style={styles.examQuestionCard}>
                      <Text style={styles.examQuestionNumber}>
                        {t('student.questionNumber', { number: idx + 1 })}
                      </Text>
                      <Text style={styles.examQuestionText}>{q.question || q.text || ''}</Text>

                      {q.type === 'mcq' && q.options && (
                        <View style={styles.examOptions}>
                          {q.options.map((opt: string, oIdx: number) => {
                            const isSel = examAnswers[idx] === oIdx;
                            return (
                              <TouchableOpacity
                                key={oIdx}
                                style={[styles.examOption, isSel && styles.examOptionSelected]}
                                onPress={() => setExamAnswers({ ...examAnswers, [idx]: oIdx })}
                              >
                                <Text
                                  style={[
                                    styles.examOptionText,
                                    isSel && styles.examOptionTextSelected,
                                  ]}
                                >
                                  {opt}
                                </Text>
                                <View style={[styles.examRadio, isSel && styles.examRadioSelected]} />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {q.type === 'tf' && (
                        <View style={styles.examOptions}>
                          {[t('teacherAssignments.true'), t('teacherAssignments.false')].map((opt, oIdx) => {
                            const isSel = examAnswers[idx] === (oIdx === 0);
                            return (
                              <TouchableOpacity
                                key={oIdx}
                                style={[styles.examOption, isSel && styles.examOptionSelected]}
                                onPress={() => setExamAnswers({ ...examAnswers, [idx]: oIdx === 0 })}
                              >
                                <Text
                                  style={[
                                    styles.examOptionText,
                                    isSel && styles.examOptionTextSelected,
                                  ]}
                                >
                                  {opt}
                                </Text>
                                <View style={[styles.examRadio, isSel && styles.examRadioSelected]} />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {q.type === 'short' && (
                        <TextInput
                          style={[styles.input, styles.textArea, { marginTop: 8 }]}
                          placeholder={t('student.writeYourAnswer', { defaultValue: 'اكتب إجابتك هنا...' })}
                          placeholderTextColor={tokens.color.text3}
                          value={examAnswers[idx] || ''}
                          onChangeText={(text) => setExamAnswers({ ...examAnswers, [idx]: text })}
                          multiline
                          numberOfLines={3}
                          textAlign="right"
                          textAlignVertical="top"
                        />
                      )}
                    </View>
                  ))}

                  <View style={{ marginTop: 8, marginBottom: 40 }}>
                    <PrimaryButton
                      label={t('student.submitExam')}
                      icon="checkmark-circle"
                      onPress={() => {
                        confirmAlert(t('student.submitExam'), t('student.submitExamConfirm'), handleSubmitExam);
                      }}
                      gradient="student"
                      loading={examSubmitting}
                      fullWidth
                    />
                  </View>
                </ScrollView>
              </>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  contentArea: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  cardTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 16,
  },
  ringRow: {
    alignItems: 'center',
    marginBottom: 18,
  },
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  breakdownCell: {
    flexGrow: 1,
    flexBasis: '23%',
    minWidth: 70,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  breakdownValue: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
  breakdownLabel: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text3,
  },
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 10,
    marginTop: 6,
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 20,
  },
  recordCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  recordIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInfo: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  recordSubject: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  recordDate: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
  },
  recordAction: {
    minWidth: 92,
  },
  examCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...tokens.shadow.xs,
  },
  examInfo: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  examTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  examMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  examMetaText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
  },
  examMetaDot: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
  },
  startExamBtn: {
    overflow: 'hidden',
    borderRadius: tokens.radius.md,
  },
  startExamGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
  },
  startExamText: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.heavy,
    color: '#fff',
  },
  cacheCard: {
    marginTop: 20,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  clearCacheBtn: {
    backgroundColor: tokens.color.dangerBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.md,
  },
  clearCacheText: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.danger,
  },
  cacheTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  cacheDesc: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    marginTop: 2,
  },
  // Sheet
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  input: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 10,
  },
  docPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.color.teal50,
    borderWidth: 1,
    borderColor: tokens.color.teal100,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  docPickerText: {
    flex: 1,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.teal700,
    textAlign: 'right',
  },
  // Exam modal
  examModalContainer: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  examHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  examHeaderTitle: {
    flex: 1,
    marginHorizontal: 10,
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'center',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.color.surface2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.md,
  },
  timerBadgeGrace: {
    backgroundColor: tokens.color.danger,
  },
  timerText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    fontVariant: ['tabular-nums'],
  },
  timerTextGrace: {
    color: '#fff',
  },
  examBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  examQuestionCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  examQuestionNumber: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.teal600,
    textAlign: 'right',
    marginBottom: 6,
  },
  examQuestionText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    lineHeight: 22,
  },
  examOptions: {
    marginTop: 12,
    gap: 8,
  },
  examOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  examOptionSelected: {
    backgroundColor: tokens.color.teal50,
    borderColor: tokens.color.teal500,
  },
  examOptionText: {
    flex: 1,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlign: 'right',
  },
  examOptionTextSelected: {
    color: tokens.color.teal700,
    fontWeight: tokens.font.weight.heavy,
  },
  examRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: tokens.color.border,
    marginLeft: 10,
  },
  examRadioSelected: {
    borderColor: tokens.color.teal500,
    backgroundColor: tokens.color.teal500,
  },
});
