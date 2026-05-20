import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import { SafeAreaView } from 'react-native-safe-area-context';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useTeacherStore from '../../stores/teacherStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import TargetsPicker from '../../components/shared/TargetsPicker';
import { haptics } from '../../utils/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import FilterChip from '../../components/teacher/chips/FilterChip';
import TagChip from '../../components/teacher/chips/TagChip';
import FAB from '../../components/teacher/buttons/FAB';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import PrimaryButton from '../../components/teacher/buttons/PrimaryButton';

const Q_TYPE_KEYS = [
  { key: 'mcq', labelKey: 'teacherAssignments.mcq', icon: 'radio-button-on' },
  { key: 'true_false', labelKey: 'teacherAssignments.trueFalse', icon: 'checkmark-circle' },
  { key: 'short_answer', labelKey: 'teacherAssignments.shortAnswer', icon: 'text' },
  { key: 'essay', labelKey: 'teacherAssignments.essay', icon: 'document-text' },
];

type StatusFilter = 'all' | 'active' | 'draft' | 'expired';

// Status detection: published + due in future = active; published + past due = expired; not published = draft
function getStatus(a: any): 'active' | 'draft' | 'expired' {
  if (!a.is_published) return 'draft';
  if (a.due_date) {
    const due = new Date(a.due_date).getTime();
    if (!isNaN(due) && due < Date.now()) return 'expired';
  }
  return 'active';
}

export default function TeacherAssignments() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { t } = useTranslation();
  const { selectedClassId, selectedTargets } = useTeacherStore();
  const isEnabled = useFeatureFlag('electronic_assignments');
  const Q_TYPES = Q_TYPE_KEYS.map(qt => ({ ...qt, label: t(qt.labelKey) }));

  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDue, setNewDue] = useState('');
  const [creating, setCreating] = useState(false);

  // Questions
  const [showQuestions, setShowQuestions] = useState(false);
  const [currentAssignment, setCurrentAssignment] = useState<any>(null);
  // When creating for multiple targets, we hold the clone IDs here so every
  // question added to `currentAssignment` is mirrored to all clones too.
  const [cloneAssignmentIds, setCloneAssignmentIds] = useState<string[]>([]);
  const [qType, setQType] = useState('mcq');
  const [qContent, setQContent] = useState('');
  const [qOptions, setQOptions] = useState(['', '', '', '']);
  const [qCorrect, setQCorrect] = useState('');
  const [qPoints, setQPoints] = useState('10');
  const [addingQ, setAddingQ] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  // Submissions view
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

  // ConfirmSheet state — replaces inline Alert.alert confirms
  const [confirmState, setConfirmState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>({ visible: false, title: '', confirmLabel: '', onConfirm: () => {} });

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.getTeacherAssignmentsList(userId, selectedClassId || undefined);
      setAssignments(data);
    } catch (err) { console.error(err); } finally {
      setLoading(false);
    }
  }, [userId, selectedClassId]);

  useEffect(() => { loadData(); }, [userId, selectedClassId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  const handleCreate = async () => {
    if (!newTitle.trim()) { Alert.alert(t('common.error'), t('teacherAssignments.enterTitle')); return; }
    if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); return; }
    if (!userInstituteId) {
      Alert.alert(t('common.error'), t('teacherAITools.instituteNotLoaded', { defaultValue: 'بيانات المؤسسة غير محمّلة. أعد فتح التطبيق.' }));
      return;
    }
    // Multi-target: create one assignment per selected target (matching gallery flow).
    // Fall back to selectedClassId only when no targets are picked (backwards compat).
    const publishTargets = selectedTargets.length > 0
      ? selectedTargets
      : (selectedClassId ? [{ classId: selectedClassId, sectionId: null, subjectId: '', subjectName: '', displayName: '' }] : []);
    if (publishTargets.length === 0) {
      Alert.alert(t('common.error'), 'اختر صفاً/شعبة واحدة على الأقل قبل إنشاء الواجب');
      return;
    }
    setCreating(true);
    try {
      // Create one assignment per target. Keep the first created assignment as
      // the one we open the questions editor for — the rest are clones we'll
      // mirror every question into via handleAddQuestion.
      let firstAssignment: any = null;
      const cloneIds: string[] = [];
      for (const tgt of publishTargets) {
        const asgn = await api.createAssignment({
          instituteId: userInstituteId, teacherId: userId,
          classId: tgt.classId || selectedClassId || undefined,
          sectionId: tgt.sectionId || undefined,
          subjectId: tgt.subjectId || undefined,
          title: newTitle.trim(),
          description: newDesc.trim(),
          dueDate: newDue.trim() || undefined,
        });
        if (!firstAssignment) {
          firstAssignment = asgn;
        } else if (asgn?.id) {
          cloneIds.push(asgn.id);
        }
      }
      setShowCreate(false);
      setNewTitle(''); setNewDesc(''); setNewDue('');
      setCurrentAssignment(firstAssignment);
      setCloneAssignmentIds(cloneIds);
      setQuestions([]);
      setShowQuestions(true);
      await loadData();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!qContent.trim() || !currentAssignment) return;
    setAddingQ(true);
    try {
      const opts = qType === 'mcq' ? qOptions.filter(o => o.trim()) : qType === 'true_false' ? [t('teacherAssignments.true'), t('teacherAssignments.false')] : null;
      const qPayload = {
        type: qType, content: qContent.trim(),
        options: opts ? { choices: opts } : null,
        correctAnswer: qCorrect.trim() || undefined,
        points: parseInt(qPoints) || 10,
        orderNum: questions.length,
      };
      const q = await api.addAssignmentQuestion(currentAssignment.id, qPayload);
      setQuestions(prev => [...prev, q]);

      // Mirror the same question into every clone assignment so they don't
      // publish empty. If a clone insert fails, delete that clone row and
      // remove it from our tracked list so subsequent additions don't retry.
      if (cloneAssignmentIds.length > 0) {
        const stillAlive: string[] = [];
        const failedClones: string[] = [];
        for (const cid of cloneAssignmentIds) {
          try {
            await api.addAssignmentQuestion(cid, qPayload);
            stillAlive.push(cid);
          } catch (cloneErr: any) {
            console.error('clone question insert failed:', cid, cloneErr?.message);
            failedClones.push(cid);
            try { await api.deleteAssignment(cid); } catch (delErr) { console.error('clone cleanup failed:', delErr); }
          }
        }
        if (failedClones.length > 0) {
          setCloneAssignmentIds(stillAlive);
          Alert.alert(
            t('common.warning', { defaultValue: 'تنبيه' }),
            `تم تخطي ${failedClones.length} نسخة بسبب فشل الإدخال`
          );
          await loadData();
        }
      }

      setQContent(''); setQCorrect(''); setQOptions(['', '', '', '']);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setAddingQ(false);
    }
  };

  const handlePublish = (asgn: any) => {
    setConfirmState({
      visible: true,
      title: t('teacherAssignments.publishAssignment'),
      message: t('teacherAssignments.publishConfirm', { title: asgn.title }),
      confirmLabel: t('teacherAssignments.publish'),
      destructive: false,
      onConfirm: async () => {
        try {
          await api.publishAssignment(asgn.id);
          Alert.alert(t('common.success'), t('teacherAssignments.published'));
          loadData();
        } catch (err: any) { Alert.alert(t('common.error'), err.message); }
      },
    });
  };

  const openSubmissions = async (asgn: any) => {
    setCurrentAssignment(asgn);
    try {
      const subs = await api.getAssignmentSubmissions(asgn.id);
      setSubmissions(subs);
      setShowSubmissions(true);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  const handleGrade = async (subId: string) => {
    if (!gradeScore.trim()) return;
    const score = parseInt(gradeScore);
    if (isNaN(score) || score < 0) {
      Alert.alert(t('common.error'), t('teacherAssignments.invalidScore', { defaultValue: 'الدرجة يجب أن تكون رقم موجب' }));
      return;
    }
    const maxScore = (currentAssignment?.assignment_questions || [])
      .reduce((sum: number, q: any) => sum + (Number(q?.points) || 0), 0);
    if (maxScore > 0 && score > maxScore) {
      Alert.alert(
        t('common.error'),
        t('teacherAssignments.scoreExceedsMax', { defaultValue: `الدرجة أكبر من المجموع (${maxScore})`, max: maxScore }),
      );
      return;
    }
    try {
      await api.gradeSubmission(subId, score, gradeFeedback.trim(), userId || '');
      Alert.alert(t('common.success'), t('teacherAssignments.graded'));
      setGradingId(null); setGradeScore(''); setGradeFeedback('');
      if (currentAssignment) openSubmissions(currentAssignment);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  const handleSendAllGrades = async () => {
    if (!currentAssignment) return;
    setConfirmState({
      visible: true,
      title: t('teacherAssignments.sendGrades'),
      message: t('teacherAssignments.sendGradesConfirm'),
      confirmLabel: t('teacherAssignments.sendGrades'),
      destructive: false,
      onConfirm: async () => {
        try {
          await api.sendAssignmentGrades(currentAssignment.id);
          Alert.alert(t('common.success'), t('teacherAssignments.gradesSent'));
        } catch (err: any) { Alert.alert(t('common.error'), err.message); }
      },
    });
  };

  // Status counts (computed client-side from full list)
  const counts = useMemo(() => {
    const c = { all: assignments.length, active: 0, draft: 0, expired: 0 };
    for (const a of assignments) {
      const st = getStatus(a);
      c[st]++;
    }
    return c;
  }, [assignments]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return assignments;
    return assignments.filter(a => getStatus(a) === statusFilter);
  }, [assignments, statusFilter]);

  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <TeacherInnerHero title="الواجبات" fallbackRoute="/(teacher)/services" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={48} color={tokens.color.text4} />
          <Text style={{ fontSize: tokens.font.size.xl, color: tokens.color.text3, marginTop: 12 }}>{t('teacher.featureDisabled', { defaultValue: 'هذه الميزة غير مفعّلة' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderRow = ({ item: a }: { item: any }) => {
    const qCount = a.assignment_questions?.length || 0;
    const subCount = a.assignment_submissions?.length || 0;
    const st = getStatus(a);
    const tone: 'success' | 'neutral' | 'danger' =
      st === 'active' ? 'success' : st === 'expired' ? 'danger' : 'neutral';
    const statusLabel =
      st === 'active' ? t('teacherAssignments.publishedStatus') :
      st === 'expired' ? t('teacherAssignments.expired', { defaultValue: 'منتهي' }) :
      t('teacherAssignments.draftStatus');

    // Progress: submissions / class roster size — fall back to qCount if no class info
    const totalAssigned = (a.class_size as number) || subCount || 0;
    const pct = totalAssigned > 0 ? Math.min(100, Math.round((subCount / totalAssigned) * 100)) : 0;
    const className = a.classes?.name || a.sections?.name || '';

    const dueLabel = a.due_date ? new Date(a.due_date).toLocaleDateString('ar-IQ') : null;

    return (
      <View style={s.card}>
        {/* Header: title + status TagChip */}
        <View style={s.cardHeader}>
          <View style={{ flex: 1, alignItems: 'flex-end', gap: 6 }}>
            <Text style={s.cardTitle} numberOfLines={1}>{a.title}</Text>
          </View>
          <TagChip label={statusLabel} tone={tone} />
        </View>

        {/* Meta row */}
        <View style={s.metaRow}>
          {dueLabel && (
            <View style={s.metaItem}>
              <Ionicons name="calendar-outline" size={12} color={tokens.color.text3} />
              <Text style={s.metaText}>{dueLabel}</Text>
            </View>
          )}
          {className ? (
            <View style={s.classChip}>
              <Text style={s.classChipText} numberOfLines={1}>{className}</Text>
            </View>
          ) : null}
          <View style={s.metaItem}>
            <Ionicons name="help-circle-outline" size={12} color={tokens.color.text3} />
            <Text style={s.metaText}>{t('teacherAssignments.questionCount', { count: qCount })}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressOuter}>
          <LinearGradient
            colors={tokens.gradient.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[s.progressInner, { width: `${pct}%` }]}
          />
        </View>
        <Text style={s.progressLabel}>
          {t('teacherAssignments.submissionCount', { count: subCount })}
          {totalAssigned > 0 ? ` · ${pct}%` : ''}
        </Text>

        {/* Action row */}
        <View style={s.actionRow}>
          {!a.is_published && (
            <TouchableOpacity onPress={() => handlePublish(a)} style={s.actionPill}>
              <Text style={s.actionPillTextSuccess}>{t('teacherAssignments.publish')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => openSubmissions(a)} style={[s.actionPill, { backgroundColor: tokens.color.brand100 }]}>
            <Text style={[s.actionPillTextSuccess, { color: tokens.color.brand500 }]}>
              {t('teacherAssignments.submissions')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setConfirmState({
              visible: true,
              title: t('teacherAssignments.deleteAssignment', { defaultValue: 'حذف الواجب' }),
              message: t('teacherAssignments.deleteAssignmentConfirm', { defaultValue: `هل تريد حذف "${a.title}"؟`, title: a.title }),
              confirmLabel: t('common.delete', { defaultValue: 'حذف' }),
              destructive: true,
              onConfirm: () => api.deleteAssignment(a.id).then(() => loadData()).catch((err: any) => Alert.alert(t('common.error'), err?.message || '')),
            })}
            style={[s.actionPill, { backgroundColor: tokens.color.dangerBg, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
          >
            <Ionicons name="trash" size={12} color={tokens.color.danger} />
            <Text style={[s.actionPillTextSuccess, { color: tokens.color.danger }]}>
              {t('common.delete', { defaultValue: 'حذف' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title="الواجبات" fallbackRoute="/(teacher)/services" />

      {/* Status filter chips */}
      <View style={s.chipsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          <FilterChip label={t('common.all', { defaultValue: 'الكل' })} active={statusFilter === 'all'} count={counts.all} onPress={() => setStatusFilter('all')} />
          <View style={{ width: 8 }} />
          <FilterChip label={t('teacherAssignments.publishedStatus')} active={statusFilter === 'active'} count={counts.active} onPress={() => setStatusFilter('active')} />
          <View style={{ width: 8 }} />
          <FilterChip label={t('teacherAssignments.draftStatus')} active={statusFilter === 'draft'} count={counts.draft} onPress={() => setStatusFilter('draft')} />
          <View style={{ width: 8 }} />
          <FilterChip label={t('teacherAssignments.expired', { defaultValue: 'منتهي' })} active={statusFilter === 'expired'} count={counts.expired} onPress={() => setStatusFilter('expired')} />
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={tokens.color.brand500} style={{ paddingTop: 40 }} />
      ) : filtered.length === 0 ? (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="document-text-outline" size={48} color={tokens.color.text4} />
            <Text style={{ fontSize: tokens.font.size.lg, color: tokens.color.text3, marginTop: 12 }}>
              {t('teacherAssignments.noAssignments')}
            </Text>
          </View>
        </ScrollView>
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item: any) => item.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      {/* FAB — bottom-start, brand gradient */}
      <FAB
        icon="add"
        gradient="brand"
        onPress={() => setShowCreate(true)}
        accessibilityLabel={t('teacherAssignments.newAssignment')}
      />

      {/* Create Assignment Modal */}
      <SwipeableSheet visible={showCreate} onClose={() => setShowCreate(false)} maxHeight={0.9}>
        <View style={s.sheetBody}>
          <KeyboardAwareScroll showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Sheet header with icon + close */}
            <View style={s.createSheetHeader}>
              <View style={s.createSheetIcon}>
                <Ionicons name="document-text" size={22} color={tokens.color.brand500} />
              </View>
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={s.createSheetTitle}>{t('teacherAssignments.newAssignment')}</Text>
                <Text style={s.createSheetSubtitle}>أنشئ واجباً جديداً وأرسله لشعبك المختارة</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCreate(false)}
                style={s.createSheetClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={tokens.color.text2} />
              </TouchableOpacity>
            </View>

            {/* Title field */}
            <Text style={s.fieldLabel}>عنوان الواجب <Text style={s.fieldRequired}>*</Text></Text>
            <TextInput
              style={s.fieldInput}
              placeholder={t('teacherAssignments.assignmentTitle')}
              placeholderTextColor={tokens.color.text3}
              value={newTitle}
              onChangeText={setNewTitle}
              textAlign="right"
            />

            {/* Description */}
            <Text style={s.fieldLabel}>الوصف <Text style={s.fieldHint}>(اختياري)</Text></Text>
            <TextInput
              style={[s.fieldInput, { height: 88, textAlignVertical: 'top' }]}
              placeholder={t('teacherAssignments.descOptional')}
              placeholderTextColor={tokens.color.text3}
              value={newDesc}
              onChangeText={setNewDesc}
              textAlign="right"
              multiline
            />

            {/* Due date */}
            <Text style={s.fieldLabel}>تاريخ التسليم</Text>
            <View style={s.dueDateRow}>
              <Ionicons name="calendar" size={18} color={tokens.color.brand500} />
              <TextInput
                style={s.dueDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={tokens.color.text3}
                value={newDue}
                onChangeText={setNewDue}
                textAlign="center"
              />
              {newDue.length > 0 && (
                <TouchableOpacity onPress={() => setNewDue('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={tokens.color.text3} />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick-pick chips — saves typing YYYY-MM-DD by hand */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {[
                { label: 'غداً', days: 1 },
                { label: 'بعد 3 أيام', days: 3 },
                { label: 'بعد أسبوع', days: 7 },
                { label: 'بعد أسبوعين', days: 14 },
                { label: 'بعد شهر', days: 30 },
              ].map((p) => {
                const targetDate = (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + p.days);
                  return d.toISOString().slice(0, 10);
                })();
                const active = newDue === targetDate;
                return (
                  <TouchableOpacity
                    key={p.days}
                    onPress={() => { haptics.selection(); setNewDue(targetDate); }}
                    style={[s.quickChip, active && s.quickChipActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.quickChipText, active && s.quickChipTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Targets section */}
            <View style={{ marginTop: 4 }}>
              <TargetsPicker label="انشر الواجب لـ" />
            </View>

            {/* Action row */}
            <View style={s.createActionsRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={s.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1.4 }}>
                <PrimaryButton
                  label={selectedTargets.length > 1
                    ? `إنشاء لـ ${selectedTargets.length} أهداف`
                    : t('teacherAssignments.createAndAddQuestions')}
                  onPress={handleCreate}
                  loading={creating}
                  disabled={creating || selectedTargets.length === 0 || !newTitle.trim()}
                  fullWidth
                />
              </View>
            </View>

            {selectedTargets.length === 0 && (
              <Text style={s.warningHint}>
                <Ionicons name="warning-outline" size={11} color={tokens.color.warning} /> اختر شعبة واحدة على الأقل قبل الإنشاء
              </Text>
            )}
          </KeyboardAwareScroll>
        </View>
      </SwipeableSheet>

      {/* Questions Modal */}
      <SwipeableSheet visible={showQuestions} onClose={() => { setShowQuestions(false); setCloneAssignmentIds([]); }} maxHeight={0.9}>
          <View style={s.sheetBody}>
            <KeyboardAwareScroll showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                <Text style={s.modalTitle}>{t('teacherAssignments.assignmentQuestions', { count: questions.length })}</Text>

                {/* Existing questions */}
                {questions.map((q, i) => (
                  <View key={q.id} style={{ backgroundColor: tokens.color.surface2, borderRadius: tokens.radius.md, padding: 12, marginBottom: 6 }}>
                    <Text style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.text, textAlign: 'right' }}>{i + 1}. {q.content}</Text>
                    <Text style={{ fontSize: tokens.font.size.xs, color: tokens.color.text3, textAlign: 'right' }}>{q.type} — {q.points} {t('teacherAssignments.points')}</Text>
                  </View>
                ))}

                {/* Add question form */}
                <View style={{ backgroundColor: tokens.color.brand50, borderRadius: tokens.radius.lg, padding: 14, marginTop: 8 }}>
                  <Text style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.text, textAlign: 'right', marginBottom: 8 }}>{t('teacherAssignments.addQuestion')}</Text>

                  {/* Question type */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {Q_TYPES.map(qt => (
                        <TouchableOpacity key={qt.key} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: tokens.radius.sm, backgroundColor: qType === qt.key ? tokens.color.brand500 : tokens.color.surface, borderWidth: 1, borderColor: qType === qt.key ? tokens.color.brand500 : tokens.color.border }} onPress={() => setQType(qt.key)}>
                          <Text style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: qType === qt.key ? '#fff' : tokens.color.text }}>{qt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <TextInput style={s.input} placeholder={t('teacherAssignments.questionText')} placeholderTextColor={tokens.color.text3} value={qContent} onChangeText={setQContent} textAlign="right" multiline />

                  {qType === 'mcq' && (
                    <>
                      {qOptions.map((opt, i) => (
                        <TextInput key={i} style={[s.input, { marginBottom: 4 }]} placeholder={t('teacherAssignments.optionN', { n: i + 1 })} placeholderTextColor={tokens.color.text3} value={opt} onChangeText={v => { const n = [...qOptions]; n[i] = v; setQOptions(n); }} textAlign="right" />
                      ))}
                    </>
                  )}

                  {/* True/False: radio picker → normalized "0" / "1" so auto-grading works */}
                  {qType === 'true_false' ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                      <TouchableOpacity
                        style={{ flex: 1, padding: 12, borderRadius: tokens.radius.md, backgroundColor: qCorrect === '0' ? tokens.color.successBg : tokens.color.surface2, borderWidth: 1.5, borderColor: qCorrect === '0' ? tokens.color.success : tokens.color.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        onPress={() => setQCorrect('0')}
                      >
                        <Ionicons name={qCorrect === '0' ? 'radio-button-on' : 'radio-button-off'} size={16} color={qCorrect === '0' ? tokens.color.success : tokens.color.text3} />
                        <Text style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.heavy, color: qCorrect === '0' ? tokens.color.success : tokens.color.text }}>{t('teacherAssignments.true')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, padding: 12, borderRadius: tokens.radius.md, backgroundColor: qCorrect === '1' ? tokens.color.dangerBg : tokens.color.surface2, borderWidth: 1.5, borderColor: qCorrect === '1' ? tokens.color.danger : tokens.color.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        onPress={() => setQCorrect('1')}
                      >
                        <Ionicons name={qCorrect === '1' ? 'radio-button-on' : 'radio-button-off'} size={16} color={qCorrect === '1' ? tokens.color.danger : tokens.color.text3} />
                        <Text style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.heavy, color: qCorrect === '1' ? tokens.color.danger : tokens.color.text }}>{t('teacherAssignments.false')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TextInput style={s.input} placeholder={t('teacherAssignments.correctAnswer')} placeholderTextColor={tokens.color.text3} value={qCorrect} onChangeText={setQCorrect} textAlign="right" />
                  )}
                  <TextInput style={s.input} placeholder={t('teacherAssignments.points')} placeholderTextColor={tokens.color.text3} value={qPoints} onChangeText={setQPoints} textAlign="center" keyboardType="numeric" />

                  <PrimaryButton
                    label={t('teacherAssignments.addTheQuestion')}
                    onPress={handleAddQuestion}
                    loading={addingQ}
                    disabled={addingQ}
                    fullWidth
                  />
                </View>

                <TouchableOpacity style={[s.cancelBtn, { marginTop: 12 }]} onPress={() => { setShowQuestions(false); setCloneAssignmentIds([]); }}>
                  <Text style={s.cancelText}>{t('common.close')}</Text>
                </TouchableOpacity>
              </KeyboardAwareScroll>
          </View>
      </SwipeableSheet>

      {/* Submissions & Grading Modal */}
      <SwipeableSheet visible={showSubmissions} onClose={() => setShowSubmissions(false)} maxHeight={0.88}>
        <View style={s.sheetBody}>
          <KeyboardAwareScroll showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <TouchableOpacity onPress={handleSendAllGrades}>
                  <View style={{ backgroundColor: tokens.color.success, borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: '#fff' }}>{t('teacherAssignments.sendAllGrades')}</Text>
                  </View>
                </TouchableOpacity>
                <Text style={s.modalTitle}>{t('teacherAssignments.submissions')} ({submissions.length})</Text>
              </View>

              {submissions.length === 0 ? (
                <Text style={{ textAlign: 'center', color: tokens.color.text3, padding: 30 }}>{t('teacherAssignments.noSubmissions')}</Text>
              ) : (
                submissions.map((sub: any) => (
                  <View key={sub.id} style={{ backgroundColor: tokens.color.surface2, borderRadius: tokens.radius.lg, padding: 14, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ backgroundColor: sub.status === 'graded' ? tokens.color.successBg : sub.status === 'submitted' ? tokens.color.infoBg : tokens.color.warningBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: tokens.font.weight.bold, color: sub.status === 'graded' ? tokens.color.success : sub.status === 'submitted' ? tokens.color.info : tokens.color.warning }}>
                          {sub.status === 'graded' ? t('teacherAssignments.statusGraded') : sub.status === 'submitted' ? t('teacherAssignments.statusSubmitted') : sub.status === 'returned' ? t('teacherAssignments.statusReturned') : t('teacherAssignments.draftStatus')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.text }}>{(sub.users as any)?.full_name || t('roles.student')}</Text>
                    </View>

                    {sub.score !== null && (
                      <Text style={{ fontSize: tokens.font.size.base, color: tokens.color.brand500, textAlign: 'right', marginTop: 4 }}>{t('teacherAssignments.score')}: {sub.score}</Text>
                    )}

                    {/* Student's submitted answers — shown when grading so teacher can read
                        what the student actually wrote before assigning a score. Sorted by
                        question order_num so order matches how the student saw the form. */}
                    {gradingId === sub.id && Array.isArray(sub.assignment_answers) && sub.assignment_answers.length > 0 && (
                      <View style={{ marginTop: 10, backgroundColor: tokens.color.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: tokens.color.border }}>
                        {[...sub.assignment_answers]
                          .sort((a: any, b: any) => (a.assignment_questions?.order_num ?? 0) - (b.assignment_questions?.order_num ?? 0))
                          .map((ans: any, idx: number) => (
                            <View key={ans.id} style={{ marginBottom: idx < sub.assignment_answers.length - 1 ? 10 : 0, paddingBottom: idx < sub.assignment_answers.length - 1 ? 10 : 0, borderBottomWidth: idx < sub.assignment_answers.length - 1 ? 1 : 0, borderBottomColor: tokens.color.border2 }}>
                              <Text style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.text3, textAlign: 'right', marginBottom: 3 }}>
                                {t('teacherAssignments.question') || 'السؤال'} {idx + 1}{ans.assignment_questions?.points ? ` (${ans.assignment_questions.points})` : ''}
                              </Text>
                              {ans.assignment_questions?.content && (
                                <Text style={{ fontSize: tokens.font.size.base, color: tokens.color.text, textAlign: 'right', marginBottom: 4, lineHeight: 18 }}>
                                  {ans.assignment_questions.content}
                                </Text>
                              )}
                              <Text style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.brand500, textAlign: 'right', marginBottom: 2 }}>
                                {t('teacherAssignments.studentAnswer') || 'إجابة الطالب'}:
                              </Text>
                              <Text style={{ fontSize: tokens.font.size.md, color: tokens.color.text, textAlign: 'right', lineHeight: 19, fontStyle: ans.answer ? 'normal' : 'italic' }}>
                                {ans.answer || (t('teacherAssignments.noAnswer') || '— لم يجب —')}
                              </Text>
                              {ans.file_url && (
                                <Text style={{ fontSize: tokens.font.size.sm, color: tokens.color.brand500, textAlign: 'right', marginTop: 3 }} numberOfLines={1}>
                                  📎 {ans.file_url}
                                </Text>
                              )}
                            </View>
                          ))}
                      </View>
                    )}

                    {/* Grade button */}
                    {gradingId === sub.id ? (
                      <View style={{ marginTop: 8 }}>
                        <TextInput style={s.input} placeholder={t('teacherAssignments.points')} value={gradeScore} onChangeText={setGradeScore} textAlign="center" keyboardType="numeric" />
                        <TextInput style={s.input} placeholder={t('teacherAssignments.notesOptional')} value={gradeFeedback} onChangeText={setGradeFeedback} textAlign="right" />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity style={s.cancelBtn} onPress={() => setGradingId(null)}>
                            <Text style={s.cancelText}>{t('common.cancel')}</Text>
                          </TouchableOpacity>
                          <View style={{ flex: 1 }}>
                            <PrimaryButton
                              label={t('common.save')}
                              onPress={() => handleGrade(sub.id)}
                              fullWidth
                            />
                          </View>
                        </View>
                      </View>
                    ) : sub.status === 'submitted' ? (
                      <TouchableOpacity style={{ marginTop: 8 }} onPress={() => { setGradingId(sub.id); setGradeScore(''); setGradeFeedback(''); }}>
                        <Text style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.bold, color: tokens.color.brand500, textAlign: 'center' }}>{t('teacherAssignments.grade')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              )}

              <TouchableOpacity style={[s.cancelBtn, { marginTop: 12 }]} onPress={() => setShowSubmissions(false)}>
                <Text style={s.cancelText}>{t('common.close')}</Text>
              </TouchableOpacity>
          </KeyboardAwareScroll>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  chipsRow: { paddingVertical: 10, backgroundColor: tokens.color.surface, borderBottomWidth: 1, borderBottomColor: tokens.color.border2 },

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border2,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right' },

  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: tokens.font.size.sm, color: tokens.color.text3 },
  classChip: {
    backgroundColor: tokens.color.brand100,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: 140,
  },
  classChipText: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.brand600 },

  progressOuter: {
    height: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface2,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressInner: {
    height: '100%',
    borderRadius: tokens.radius.pill,
  },
  progressLabel: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 4,
  },

  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  actionPill: { backgroundColor: tokens.color.successBg, borderRadius: tokens.radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  actionPillTextSuccess: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.success },

  sheetBody: { flex: 1, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  modalTitle: { fontSize: tokens.font.size['2xl'], fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right', marginBottom: 16 },
  input: { backgroundColor: tokens.color.surface2, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.semi, color: tokens.color.text, marginBottom: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: tokens.radius.lg, backgroundColor: tokens.color.surface2, alignItems: 'center' },
  cancelText: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.text2 },

  // ── Create-assignment sheet ──────────────────────────────────────────
  createSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
  },
  createSheetIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center', justifyContent: 'center',
  },
  createSheetTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  createSheetSubtitle: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  createSheetClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 12,
    marginBottom: 6,
  },
  fieldRequired: { color: tokens.color.danger, fontSize: tokens.font.size.md },
  fieldHint: { color: tokens.color.text3, fontWeight: tokens.font.weight.semi, fontSize: tokens.font.size.xs },
  fieldInput: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  dueDateInput: {
    flex: 1,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    paddingVertical: 10,
    letterSpacing: 1,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.brand50,
    borderWidth: 1,
    borderColor: tokens.color.brand100,
  },
  quickChipActive: {
    backgroundColor: tokens.color.brand500,
    borderColor: tokens.color.brand500,
  },
  quickChipText: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.brand500,
    fontWeight: tokens.font.weight.bold,
  },
  quickChipTextActive: { color: '#fff' },
  createActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  warningHint: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.warning,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: tokens.font.weight.semi,
  },
});
