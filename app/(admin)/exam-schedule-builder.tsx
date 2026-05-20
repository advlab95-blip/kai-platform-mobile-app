// محرّر بناء جدول الامتحانات الورقية للإدارة العامة (Platform Admin).
//
// وضعان:
//   • Mode A — جدول جديد (id === 'NEW') → wizard من 3 خطوات + شريط تقدّم:
//       1) اختيار المؤسسة + الاسم/الوصف + فترة الامتحانات
//       2) اختيار الصفوف والمواد + إعدادات التوليد التلقائي → توليد عبر RPC
//       3) محرّر الجدول (نفس Mode B)
//   • Mode B — جدول موجود (id = UUID) → يدخل مباشرة لمحرّر الجدول.
//
// محرّر الجدول:
//   - تجميع البنود حسب التاريخ.
//   - تعديل بند: bottom-sheet inline يستدعي update_exam_schedule_item RPC.
//   - إضافة يدوية: زر داخل كل يوم.
//   - حذف بند مع تأكيد.
//   - بانر تعارضات (warning, لا يحجب النشر).
//   - زر إعادة توليد (drafts فقط) يفتح إعدادات التوليد كـ sheet.
//   - زر نشر (drafts فقط): تأكيد ثم publish_exam_schedule.
//   - بعد النشر: تظهر لافتة "أي تعديل يرسل إشعار تحديث".
//
// كل استدعاءات Supabase تمرّ عبر services/examScheduleService.ts. لا access مباشر.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import {
  getExamSchedule, getExamScheduleItems, createExamSchedule,
  generateExamScheduleItems, publishExamSchedule, updateExamScheduleItem,
  deleteExamScheduleItem, addExamScheduleItem,
  getInstituteClasses, getInstituteSubjects,
  detectConflicts,
  type ExamSchedule, type ExamScheduleItem,
  type ClassOption, type SubjectOption, type Conflict,
} from '../../services/examScheduleService';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { confirmAlert } from '../../utils/alerts';
import { haptics } from '../../utils/haptics';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';

// ────────────────── helpers ──────────────────
function pad(n: number) { return String(n).padStart(2, '0'); }
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return !Number.isNaN(dt.getTime());
}
function isValidTime(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}
function fmtArDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

type WizardStep = 1 | 2 | 3;

// ────────────────── component ──────────────────
export default function AdminExamScheduleBuilder() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isNew = params.id === 'NEW' || !params.id;

  const { userId } = useAuthStore();
  const { institutes, loadInstitutes } = useDataStore();

  // ───── overall ─────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [step, setStep] = useState<WizardStep>(1);

  // ───── schedule state (works for both modes) ─────
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [items, setItems] = useState<ExamScheduleItem[]>([]);

  // The institute_id this schedule belongs to. Sourced from:
  //   - the picker (Mode A, step 1)
  //   - schedule.institute_id (Mode B, when loaded)
  const [scheduleInstituteId, setScheduleInstituteId] = useState<string | null>(null);

  // ───── form (Mode A step 1) ─────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [periodStart, setPeriodStart] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());

  // ───── generate options (Mode A step 2 + regenerate sheet) ─────
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [genStartDate, setGenStartDate] = useState(todayISO());
  const [genStartTime, setGenStartTime] = useState('09:00');
  const [genDuration, setGenDuration] = useState('60');
  const [genPerDay, setGenPerDay] = useState('1');

  // Regenerate-as-sheet (visible while editing an existing draft).
  const [showRegenerateSheet, setShowRegenerateSheet] = useState(false);

  // ───── editing item modal ─────
  const [editItem, setEditItem] = useState<ExamScheduleItem | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState('60');
  const [editHall, setEditHall] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // ───── add manual item modal ─────
  const [addingForDate, setAddingForDate] = useState<string | null>(null);
  const [addClassId, setAddClassId] = useState<string | null>(null);
  const [addSubjectName, setAddSubjectName] = useState('');
  const [addSubjectId, setAddSubjectId] = useState<string | null>(null);
  const [addStartTime, setAddStartTime] = useState('09:00');
  const [addDuration, setAddDuration] = useState('60');
  const [addHall, setAddHall] = useState('');

  // ────────────────── pickers data loader ──────────────────
  // Loads classes + subjects for a given institute (cached only by institute_id).
  // Called when scheduleInstituteId changes.
  const loadPickersFor = useCallback(async (instId: string) => {
    try {
      const [cls, subs] = await Promise.all([
        getInstituteClasses(instId),
        getInstituteSubjects(instId),
      ]);
      setClasses(cls);
      setSubjects(subs);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تحميل بيانات المؤسسة');
    }
  }, []);

  // ────────────────── initial load ──────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Always need the institutes list for the picker (Mode A) or to display
        // the institute name (Mode B).
        if (!institutes || institutes.length === 0) {
          await loadInstitutes();
        }

        if (isNew) {
          // Pre-fill nothing — admin picks institute in step 1.
          setStep(1);
          if (cancelled) return;
        } else if (params.id) {
          const s = await getExamSchedule(params.id);
          if (cancelled) return;
          if (!s) {
            Alert.alert('خطأ', 'الجدول غير موجود');
            router.back();
            return;
          }
          setSchedule(s);
          setName(s.name);
          setDescription(s.description || '');
          setPeriodStart(s.period_start);
          setPeriodEnd(s.period_end);
          setScheduleInstituteId(s.institute_id);
          setGenStartDate(s.period_start);
          await loadPickersFor(s.institute_id);
          const its = await getExamScheduleItems(s.id);
          if (cancelled) return;
          setItems(its);
          setSelectedClassIds(new Set(its.map((i) => i.class_id).filter(Boolean) as string[]));
          setSelectedSubjectIds(new Set(its.map((i) => i.subject_id).filter(Boolean) as string[]));
          // Existing schedule jumps directly to the editor.
          setStep(3);
        }
      } catch (err: any) {
        if (!cancelled) Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // ────────────────── derived ──────────────────
  const conflicts: Conflict[] = useMemo(() => detectConflicts(items), [items]);
  const conflictItemIds = useMemo(() => new Set(conflicts.flatMap((c) => c.ids)), [conflicts]);

  const grouped = useMemo(() => {
    const m = new Map<string, ExamScheduleItem[]>();
    for (const it of items) {
      const k = it.exam_date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const isPublished = schedule?.status === 'published';
  const isDraft = schedule?.status === 'draft';
  const instituteName = useMemo(() => {
    if (!scheduleInstituteId) return '';
    return (institutes || []).find((i: any) => i.id === scheduleInstituteId)?.name || '';
  }, [institutes, scheduleInstituteId]);

  // ────────────────── selectors ──────────────────
  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ────────────────── step 1 → step 2 ──────────────────
  const goToStep2 = async () => {
    if (!scheduleInstituteId) {
      Alert.alert('تنبيه', 'اختر المؤسسة أولاً');
      return;
    }
    const n = name.trim();
    if (!n) { Alert.alert('تنبيه', 'الاسم إلزامي'); return; }
    if (!isValidDate(periodStart) || !isValidDate(periodEnd)) {
      Alert.alert('تنبيه', 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');
      return;
    }
    if (periodEnd < periodStart) {
      Alert.alert('تنبيه', 'تاريخ النهاية قبل تاريخ البداية');
      return;
    }
    if (!userId) {
      Alert.alert('خطأ', 'لم يتم التعرف على المستخدم');
      return;
    }

    setSaving(true);
    try {
      const created = await createExamSchedule({
        institute_id: scheduleInstituteId,
        name: n,
        description: description.trim() || undefined,
        period_start: periodStart,
        period_end: periodEnd,
        created_by: userId,
      });
      setSchedule(created);
      setGenStartDate(created.period_start);
      // Update the URL silently so a refresh / back doesn't lose context.
      try { router.setParams({ id: created.id } as any); } catch { /* expo-router fallback */ }
      haptics.success();
      setStep(2);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  // ────────────────── step 2 → step 3 (generate) ──────────────────
  const handleGenerate = async (fromSheet = false) => {
    if (!schedule) {
      Alert.alert('تنبيه', 'احفظ بيانات الجدول أولاً');
      return;
    }
    if (selectedClassIds.size === 0 || selectedSubjectIds.size === 0) {
      Alert.alert('تنبيه', 'اختر الصفوف والمواد أولاً');
      return;
    }
    if (!isValidDate(genStartDate)) { Alert.alert('تنبيه', 'تاريخ بداية التوليد غير صحيح'); return; }
    if (!isValidTime(genStartTime)) { Alert.alert('تنبيه', 'الوقت يجب أن يكون HH:MM'); return; }
    const dur = parseInt(genDuration, 10);
    const perDay = parseInt(genPerDay, 10);
    if (!dur || dur < 15 || dur > 480) { Alert.alert('تنبيه', 'المدة يجب أن تكون بين 15 و 480 دقيقة'); return; }
    if (!perDay || perDay < 1 || perDay > 10) { Alert.alert('تنبيه', 'مواد/يوم يجب أن تكون بين 1 و 10'); return; }

    if (items.length > 0) {
      const ok = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'إعادة التوليد',
          'سيتم حذف البنود الحالية وإعادة التوليد من جديد. هل تريد المتابعة؟',
          [
            { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
            { text: 'متابعة', style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });
      if (!ok) return;
    }

    setGenerating(true);
    try {
      const count = await generateExamScheduleItems({
        schedule_id: schedule.id,
        class_ids: Array.from(selectedClassIds),
        subject_ids: Array.from(selectedSubjectIds),
        start_date: genStartDate,
        default_start_time: genStartTime,
        default_duration: dur,
        subjects_per_day: perDay,
      });
      const fresh = await getExamScheduleItems(schedule.id);
      setItems(fresh);
      haptics.success();
      Alert.alert('تم', `تم توليد ${count} بنداً. يمكنك تعديل أي بند بشكل منفرد.`);
      if (fromSheet) setShowRegenerateSheet(false);
      setStep(3);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل التوليد');
    } finally {
      setGenerating(false);
    }
  };

  // ────────────────── publish ──────────────────
  const handlePublish = async () => {
    if (!schedule) return;
    if (items.length === 0) {
      Alert.alert('تنبيه', 'لا توجد بنود للنشر');
      return;
    }
    confirmAlert(
      'نشر الجدول',
      'هل أنت متأكد؟ سيتم إرسال إشعارات لكل الأطراف.',
      async () => {
        setPublishing(true);
        try {
          await publishExamSchedule(schedule.id);
          // Reload schedule + items so the published banner & status flip.
          const [updated, fresh] = await Promise.all([
            getExamSchedule(schedule.id),
            getExamScheduleItems(schedule.id),
          ]);
          if (updated) setSchedule(updated);
          setItems(fresh);
          haptics.success();
          Alert.alert('تم النشر', 'وصلت الإشعارات لكل الأطراف');
        } catch (err: any) {
          Alert.alert('خطأ', err?.message || 'فشل النشر');
        } finally {
          setPublishing(false);
        }
      },
      false,
      'نشر'
    );
  };

  // ────────────────── edit single item ──────────────────
  const openEditItem = (it: ExamScheduleItem) => {
    haptics.light();
    setEditItem(it);
    setEditDate(it.exam_date);
    setEditTime((it.start_time || '09:00').slice(0, 5));
    setEditDuration(String(it.duration_minutes || 60));
    setEditHall(it.hall || '');
    setEditNotes(it.notes || '');
  };

  const saveItemEdit = async () => {
    if (!editItem || !schedule) return;
    if (!isValidDate(editDate) || !isValidTime(editTime)) {
      Alert.alert('تنبيه', 'صيغة التاريخ أو الوقت غير صحيحة');
      return;
    }
    const dur = parseInt(editDuration, 10);
    if (!dur || dur < 15 || dur > 480) { Alert.alert('تنبيه', 'مدة غير صحيحة'); return; }

    try {
      await updateExamScheduleItem({
        item_id: editItem.id,
        exam_date: editDate,
        start_time: editTime + ':00',
        duration_minutes: dur,
        hall: editHall.trim() || null,
        teacher_id: editItem.teacher_id, // keep existing teacher
        notes: editNotes.trim() || null,
      });
      const fresh = await getExamScheduleItems(schedule.id);
      setItems(fresh);
      setEditItem(null);
      haptics.success();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل الحفظ');
    }
  };

  const handleDeleteItem = (it: ExamScheduleItem) => {
    confirmAlert(
      'حذف البند',
      `حذف امتحان "${it.subject_name}" للصف "${it.class_name || ''}"؟`,
      async () => {
        try {
          await deleteExamScheduleItem(it.id);
          setItems((prev) => prev.filter((x) => x.id !== it.id));
        } catch (err: any) {
          Alert.alert('خطأ', err?.message || 'فشل الحذف');
        }
      },
      true
    );
  };

  // ────────────────── add manual item ──────────────────
  const openAddItem = (date?: string) => {
    haptics.light();
    setAddingForDate(date || todayISO());
    setAddClassId(null);
    setAddSubjectName('');
    setAddSubjectId(null);
    setAddStartTime('09:00');
    setAddDuration('60');
    setAddHall('');
  };

  const saveAddItem = async () => {
    if (!schedule || !scheduleInstituteId || !addingForDate) return;
    if (!addClassId) { Alert.alert('تنبيه', 'اختر الصف'); return; }
    if (!addSubjectName.trim()) { Alert.alert('تنبيه', 'اسم المادة إلزامي'); return; }
    if (!isValidDate(addingForDate) || !isValidTime(addStartTime)) {
      Alert.alert('تنبيه', 'تاريخ أو وقت غير صحيح'); return;
    }
    const dur = parseInt(addDuration, 10);
    if (!dur || dur < 15 || dur > 480) { Alert.alert('تنبيه', 'مدة غير صحيحة'); return; }

    try {
      await addExamScheduleItem({
        schedule_id: schedule.id,
        institute_id: scheduleInstituteId,
        class_id: addClassId,
        subject_id: addSubjectId || null,
        subject_name: addSubjectName.trim(),
        teacher_id: null,
        exam_date: addingForDate,
        start_time: addStartTime + ':00',
        duration_minutes: dur,
        hall: addHall.trim() || null,
      });
      const fresh = await getExamScheduleItems(schedule.id);
      setItems(fresh);
      setAddingForDate(null);
      haptics.success();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل الإضافة');
    }
  };

  // ────────────────── render ──────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title={isNew ? 'جدول جديد' : 'تعديل جدول'}
          gradient={tokens.gradient.brand}
          glowAccent="rgba(47,47,186,0.30)"
        />
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={isPublished ? 'جدول منشور' : (isNew ? 'جدول جديد' : 'تعديل جدول')}
        subtitle={
          isPublished
            ? 'أي تعديل سيرسل إشعار تحديث للأطراف'
            : isNew
              ? `الخطوة ${step} من 3`
              : (instituteName || 'محرّر الجدول')
        }
        gradient={tokens.gradient.brand}
        glowAccent="rgba(47,47,186,0.30)"
      />

      {/* progress bar (Mode A only) */}
      {isNew && !isPublished && <ProgressBar step={step} />}

      {/* published banner */}
      {isPublished && (
        <View style={styles.publishedBanner}>
          <Ionicons name="cloud-done" size={14} color={tokens.color.success} />
          <Text style={styles.publishedBannerText}>الجدول منشور — أي تعديل يرسل إشعار تحديث</Text>
        </View>
      )}

      {/* conflicts banner — warning only, doesn't block publishing */}
      {step === 3 && conflicts.length > 0 && (
        <View style={styles.conflictBox}>
          <View style={styles.conflictHeader}>
            <Ionicons name="warning" size={16} color={tokens.color.danger} />
            <Text style={styles.conflictTitle}>{conflicts.length} تعارض</Text>
          </View>
          {conflicts.slice(0, 5).map((c, i) => (
            <Text key={i} style={styles.conflictText} numberOfLines={2}>• {c.message}</Text>
          ))}
          <Text style={styles.conflictHint}>تنبيه فقط — يمكن النشر، لكن يُنصح بالمراجعة.</Text>
        </View>
      )}

      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─────────────────── STEP 1: meta + institute ─────────────────── */}
        {isNew && step === 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>المؤسسة</Text>
            {(!institutes || institutes.length === 0) ? (
              <Text style={styles.muted}>لا توجد مؤسسات. أنشئ مؤسسة أولاً من قسم المؤسسات.</Text>
            ) : (
              <View style={styles.chipsWrap}>
                {institutes.map((inst: any) => {
                  const active = scheduleInstituteId === inst.id;
                  return (
                    <TouchableOpacity
                      key={inst.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        haptics.selection();
                        setScheduleInstituteId(inst.id);
                        loadPickersFor(inst.id);
                      }}
                      activeOpacity={0.85}
                    >
                      {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                      <Ionicons
                        name={inst.type === 'school' ? 'school-outline' : 'business-outline'}
                        size={12}
                        color={active ? '#fff' : tokens.color.text2}
                      />
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                        {inst.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={styles.sectionTitle}>معلومات الجدول</Text>
            <Text style={styles.fieldLabel}>الاسم</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="مثال: امتحانات نصف السنة"
              placeholderTextColor={tokens.color.text3}
              textAlign="right"
            />
            <Text style={styles.fieldLabel}>وصف (اختياري)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="ملاحظات تظهر مع الجدول"
              placeholderTextColor={tokens.color.text3}
              textAlign="right"
              multiline
            />
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.fieldLabel}>من تاريخ</Text>
                <TextInput
                  style={styles.input}
                  value={periodStart}
                  onChangeText={setPeriodStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={tokens.color.text3}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  textAlign="center"
                />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.fieldLabel}>إلى تاريخ</Text>
                <TextInput
                  style={styles.input}
                  value={periodEnd}
                  onChangeText={setPeriodEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={tokens.color.text3}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  textAlign="center"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
              onPress={goToStep2}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {saving ? 'جاري الحفظ...' : 'حفظ ومتابعة'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─────────────────── STEP 2: pickers + generate ─────────────────── */}
        {isNew && step === 2 && schedule && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>اختر الصفوف ({selectedClassIds.size})</Text>
              {classes.length === 0 ? (
                <Text style={styles.muted}>لا توجد صفوف. أضف صفوف من قسم الصفوف لهذه المؤسسة.</Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {classes.map((c) => {
                    const active = selectedClassIds.has(c.id);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { haptics.selection(); toggleClass(c.id); }}
                        activeOpacity={0.85}
                      >
                        {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>اختر المواد ({selectedSubjectIds.size})</Text>
              {subjects.length === 0 ? (
                <Text style={styles.muted}>لا توجد مواد. أضف مواد من إعدادات المؤسسة.</Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {subjects.map((s) => {
                    const active = selectedSubjectIds.has(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { haptics.selection(); toggleSubject(s.id); }}
                        activeOpacity={0.85}
                      >
                        {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>إعدادات التوليد التلقائي</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>تاريخ بداية التوليد</Text>
                  <TextInput
                    style={styles.input}
                    value={genStartDate}
                    onChangeText={setGenStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={tokens.color.text3}
                    textAlign="center"
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>وقت البدء</Text>
                  <TextInput
                    style={styles.input}
                    value={genStartTime}
                    onChangeText={setGenStartTime}
                    placeholder="HH:MM"
                    placeholderTextColor={tokens.color.text3}
                    textAlign="center"
                  />
                </View>
              </View>
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>المدة (دقيقة)</Text>
                  <TextInput
                    style={styles.input}
                    value={genDuration}
                    onChangeText={setGenDuration}
                    keyboardType="number-pad"
                    placeholder="60"
                    placeholderTextColor={tokens.color.text3}
                    textAlign="center"
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>مواد / يوم</Text>
                  <TextInput
                    style={styles.input}
                    value={genPerDay}
                    onChangeText={setGenPerDay}
                    keyboardType="number-pad"
                    placeholder="1"
                    placeholderTextColor={tokens.color.text3}
                    textAlign="center"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, generating && { opacity: 0.6 }]}
                onPress={() => handleGenerate(false)}
                disabled={generating}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {generating ? 'جاري التوليد...' : 'توليد تلقائي'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.muted}>
                ينشئ بنداً لكل (صف × مادة) ويوزّع التواريخ تصاعدياً. الأستاذ يُجلب تلقائياً من تعيينات المواد.
              </Text>
            </View>

            <View style={[styles.section, { backgroundColor: 'transparent', borderWidth: 0 }]}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setStep(1)}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-forward-outline" size={16} color={Colors.primary} />
                <Text style={styles.secondaryBtnText}>السابق</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ─────────────────── STEP 3: editor table ─────────────────── */}
        {step === 3 && schedule && (
          <>
            {/* schedule header card */}
            <View style={styles.headerCard}>
              <Text style={styles.headerCardTitle} numberOfLines={1}>{schedule.name}</Text>
              <View style={styles.headerCardMeta}>
                {!!instituteName && (
                  <View style={styles.headerCardMetaItem}>
                    <Ionicons name="business-outline" size={12} color={tokens.color.text2} />
                    <Text style={styles.headerCardMetaText}>{instituteName}</Text>
                  </View>
                )}
                <View style={styles.headerCardMetaItem}>
                  <Ionicons name="calendar-outline" size={12} color={tokens.color.text3} />
                  <Text style={styles.headerCardMetaText}>
                    {schedule.period_start} ← {schedule.period_end}
                  </Text>
                </View>
                <View style={styles.headerCardMetaItem}>
                  <Ionicons name="list-outline" size={12} color={tokens.color.text3} />
                  <Text style={styles.headerCardMetaText}>{items.length} بند</Text>
                </View>
              </View>

              {/* regenerate button (drafts only) */}
              {isDraft && (
                <TouchableOpacity
                  style={styles.headerCardAction}
                  onPress={() => { haptics.light(); setShowRegenerateSheet(true); }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={14} color={Colors.primary} />
                  <Text style={styles.headerCardActionText}>إعادة التوليد</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* items list grouped by date */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>البنود</Text>
                <TouchableOpacity
                  onPress={() => openAddItem()}
                  activeOpacity={0.85}
                  style={styles.addInlineBtn}
                >
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.addInlineBtnText}>إضافة بند</Text>
                </TouchableOpacity>
              </View>

              {items.length === 0 ? (
                <Text style={styles.muted}>لا توجد بنود. ولّد تلقائياً أو أضف يدوياً.</Text>
              ) : (
                grouped.map(([date, dayItems]) => (
                  <View key={date} style={styles.dayBlock}>
                    <View style={styles.dayHeaderRow}>
                      <TouchableOpacity
                        onPress={() => openAddItem(date)}
                        activeOpacity={0.85}
                        style={styles.addDayBtn}
                      >
                        <Ionicons name="add" size={12} color={Colors.primary} />
                      </TouchableOpacity>
                      <Text style={styles.dayHeader} numberOfLines={1}>
                        {fmtArDate(date)} · {date}
                      </Text>
                    </View>
                    {dayItems.map((it) => {
                      const conflicting = conflictItemIds.has(it.id);
                      return (
                        <TouchableOpacity
                          key={it.id}
                          style={[styles.itemRow, conflicting && styles.itemRowConflict]}
                          onPress={() => openEditItem(it)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.itemMain}>
                            <Text style={styles.itemSubject} numberOfLines={1}>{it.subject_name}</Text>
                            <View style={styles.itemMeta}>
                              <View style={styles.itemMetaItem}>
                                <Ionicons name="school-outline" size={11} color={tokens.color.text3} />
                                <Text style={styles.itemMetaText}>{it.class_name || '—'}</Text>
                              </View>
                              <View style={styles.itemMetaItem}>
                                <Ionicons name="time-outline" size={11} color={tokens.color.text3} />
                                <Text style={styles.itemMetaText}>{(it.start_time || '').slice(0, 5)} · {it.duration_minutes}د</Text>
                              </View>
                              {it.teacher_name && (
                                <View style={styles.itemMetaItem}>
                                  <Ionicons name="person-outline" size={11} color={tokens.color.text3} />
                                  <Text style={styles.itemMetaText}>{it.teacher_name}</Text>
                                </View>
                              )}
                              {it.hall && (
                                <View style={styles.itemMetaItem}>
                                  <Ionicons name="location-outline" size={11} color={tokens.color.text3} />
                                  <Text style={styles.itemMetaText}>{it.hall}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <View style={styles.itemActions}>
                            <TouchableOpacity onPress={() => openEditItem(it)} style={styles.iconBtn} activeOpacity={0.8}>
                              <Ionicons name="create-outline" size={18} color={Colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteItem(it)} style={styles.iconBtn} activeOpacity={0.8}>
                              <Ionicons name="trash-outline" size={18} color={tokens.color.danger} />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
              )}
            </View>

            {/* publish CTA — only when draft */}
            {isDraft && (
              <View style={styles.section}>
                <TouchableOpacity
                  style={[styles.publishBtn, (publishing || items.length === 0) && { opacity: 0.6 }]}
                  onPress={handlePublish}
                  disabled={publishing || items.length === 0}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={tokens.gradient.brand}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.publishGradient}
                  >
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={styles.publishBtnText}>
                      {publishing ? 'جاري النشر...' : 'نشر الجدول وإرسال الإشعارات'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <Text style={[styles.muted, { textAlign: 'center', marginTop: 6 }]}>
                  بعد النشر يصل إشعار للطلاب وأولياء الأمور والأساتذة المعنيين.
                </Text>
              </View>
            )}
          </>
        )}
      </KeyboardAwareScroll>

      {/* ─────────────────── Edit Item bottom sheet ─────────────────── */}
      {editItem && (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setEditItem(null)} style={styles.iconBtn} accessibilityLabel="إغلاق">
                <Ionicons name="close" size={22} color={tokens.color.text2} />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>تعديل بند</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.editSubject}>{editItem.subject_name}</Text>
              <Text style={styles.muted}>{editItem.class_name || ''}</Text>

              <Text style={styles.fieldLabel}>التاريخ</Text>
              <TextInput
                style={styles.input}
                value={editDate}
                onChangeText={setEditDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={tokens.color.text3}
                textAlign="center"
              />
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>الوقت</Text>
                  <TextInput
                    style={styles.input}
                    value={editTime}
                    onChangeText={setEditTime}
                    placeholder="HH:MM"
                    placeholderTextColor={tokens.color.text3}
                    textAlign="center"
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>المدة (دقيقة)</Text>
                  <TextInput
                    style={styles.input}
                    value={editDuration}
                    onChangeText={setEditDuration}
                    keyboardType="number-pad"
                    textAlign="center"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>القاعة</Text>
              <TextInput
                style={styles.input}
                value={editHall}
                onChangeText={setEditHall}
                placeholder="مثال: قاعة 3"
                placeholderTextColor={tokens.color.text3}
                textAlign="right"
              />

              <Text style={styles.fieldLabel}>ملاحظات</Text>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="ملاحظات داخلية للإدارة"
                placeholderTextColor={tokens.color.text3}
                textAlign="right"
                multiline
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={saveItemEdit} activeOpacity={0.85}>
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>حفظ التعديل</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ─────────────────── Add Item bottom sheet ─────────────────── */}
      {addingForDate && (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setAddingForDate(null)} style={styles.iconBtn} accessibilityLabel="إغلاق">
                <Ionicons name="close" size={22} color={tokens.color.text2} />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>إضافة بند جديد</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>التاريخ</Text>
              <TextInput
                style={styles.input}
                value={addingForDate}
                onChangeText={setAddingForDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={tokens.color.text3}
                textAlign="center"
              />

              <Text style={styles.fieldLabel}>الصف</Text>
              {classes.length === 0 ? (
                <Text style={styles.muted}>لا توجد صفوف لهذه المؤسسة.</Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {classes.map((c) => {
                    const active = addClassId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { haptics.selection(); setAddClassId(c.id); }}
                        activeOpacity={0.85}
                      >
                        {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={styles.fieldLabel}>المادة</Text>
              {/* Subject can be picked from list (sets subject_id + name) or typed manually. */}
              {subjects.length > 0 && (
                <View style={[styles.chipsWrap, { marginBottom: 6 }]}>
                  {subjects.map((s) => {
                    const active = addSubjectId === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          haptics.selection();
                          setAddSubjectId(s.id);
                          setAddSubjectName(s.name);
                        }}
                        activeOpacity={0.85}
                      >
                        {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <TextInput
                style={styles.input}
                value={addSubjectName}
                onChangeText={(t) => { setAddSubjectName(t); setAddSubjectId(null); }}
                placeholder="أو اكتب اسم المادة"
                placeholderTextColor={tokens.color.text3}
                textAlign="right"
              />

              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>الوقت</Text>
                  <TextInput
                    style={styles.input}
                    value={addStartTime}
                    onChangeText={setAddStartTime}
                    placeholder="HH:MM"
                    placeholderTextColor={tokens.color.text3}
                    textAlign="center"
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>المدة (دقيقة)</Text>
                  <TextInput
                    style={styles.input}
                    value={addDuration}
                    onChangeText={setAddDuration}
                    keyboardType="number-pad"
                    textAlign="center"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>القاعة</Text>
              <TextInput
                style={styles.input}
                value={addHall}
                onChangeText={setAddHall}
                placeholder="مثال: قاعة 3"
                placeholderTextColor={tokens.color.text3}
                textAlign="right"
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={saveAddItem} activeOpacity={0.85}>
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>إضافة</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ─────────────────── Regenerate sheet (drafts only) ─────────────────── */}
      {showRegenerateSheet && (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setShowRegenerateSheet(false)} style={styles.iconBtn} accessibilityLabel="إغلاق">
                <Ionicons name="close" size={22} color={tokens.color.text2} />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>إعادة التوليد</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.muted}>سيتم حذف البنود الحالية وإعادة التوليد.</Text>

              <Text style={styles.fieldLabel}>الصفوف ({selectedClassIds.size})</Text>
              <View style={styles.chipsWrap}>
                {classes.map((c) => {
                  const active = selectedClassIds.has(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => { haptics.selection(); toggleClass(c.id); }}
                      activeOpacity={0.85}
                    >
                      {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>المواد ({selectedSubjectIds.size})</Text>
              <View style={styles.chipsWrap}>
                {subjects.map((s) => {
                  const active = selectedSubjectIds.has(s.id);
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => { haptics.selection(); toggleSubject(s.id); }}
                      activeOpacity={0.85}
                    >
                      {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>تاريخ البداية</Text>
                  <TextInput
                    style={styles.input}
                    value={genStartDate}
                    onChangeText={setGenStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={tokens.color.text3}
                    textAlign="center"
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>وقت البدء</Text>
                  <TextInput
                    style={styles.input}
                    value={genStartTime}
                    onChangeText={setGenStartTime}
                    placeholder="HH:MM"
                    placeholderTextColor={tokens.color.text3}
                    textAlign="center"
                  />
                </View>
              </View>
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>المدة (دقيقة)</Text>
                  <TextInput
                    style={styles.input}
                    value={genDuration}
                    onChangeText={setGenDuration}
                    keyboardType="number-pad"
                    textAlign="center"
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>مواد / يوم</Text>
                  <TextInput
                    style={styles.input}
                    value={genPerDay}
                    onChangeText={setGenPerDay}
                    keyboardType="number-pad"
                    textAlign="center"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, generating && { opacity: 0.6 }]}
                onPress={() => handleGenerate(true)}
                disabled={generating}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {generating ? 'جاري التوليد...' : 'إعادة التوليد'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ────────────────── ProgressBar ──────────────────
function ProgressBar({ step }: { step: WizardStep }) {
  const labels: Record<WizardStep, string> = { 1: 'المعلومات', 2: 'الصفوف والمواد', 3: 'المراجعة والنشر' };
  return (
    <View style={progress.row}>
      {([1, 2, 3] as WizardStep[]).map((s) => {
        const active = step >= s;
        return (
          <React.Fragment key={s}>
            <View style={progress.stepWrap}>
              <View style={[progress.dot, active && progress.dotActive]}>
                <Text style={[progress.dotNum, active && progress.dotNumActive]}>{s}</Text>
              </View>
              <Text style={[progress.label, active && progress.labelActive]} numberOfLines={1}>
                {labels[s]}
              </Text>
            </View>
            {s < 3 && <View style={[progress.bar, step > s && progress.barActive]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ────────────────── styles ──────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },

  publishedBanner: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    marginHorizontal: 14, marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: tokens.color.successBg,
    borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.color.success,
  },
  publishedBannerText: { fontSize: 12, fontWeight: '700', color: tokens.color.success, textAlign: 'right', flex: 1 },

  conflictBox: {
    backgroundColor: tokens.color.dangerBg,
    borderWidth: 1, borderColor: tokens.color.danger,
    marginHorizontal: 14, marginTop: 10,
    padding: 12, borderRadius: tokens.radius.lg,
  },
  conflictHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 6 },
  conflictTitle: { fontSize: 13, fontWeight: '800', color: tokens.color.danger },
  conflictText: { fontSize: 12, color: tokens.color.danger, textAlign: 'right', marginTop: 2 },
  conflictHint: { fontSize: 11, color: tokens.color.danger, textAlign: 'right', marginTop: 6, fontStyle: 'italic' },

  section: {
    backgroundColor: tokens.color.surface,
    marginHorizontal: 14,
    marginTop: 12,
    padding: 14,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '800', color: tokens.color.text,
    textAlign: 'right', marginBottom: 10, marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },

  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: tokens.color.text2,
    textAlign: 'right', marginTop: 8, marginBottom: 4,
  },
  input: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1, borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: tokens.color.text,
  },
  dateRow: { flexDirection: 'row-reverse', gap: 10 },
  dateField: { flex: 1 },
  muted: { fontSize: 11, color: tokens.color.text3, textAlign: 'right', marginTop: 6 },

  primaryBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  secondaryBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: Colors.primary,
    backgroundColor: tokens.color.surface,
  },
  secondaryBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },

  chipsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1, borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface2,
    maxWidth: 240,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: { fontSize: 12, color: tokens.color.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  // header card (step 3)
  headerCard: {
    backgroundColor: tokens.color.surface,
    marginHorizontal: 14, marginTop: 12,
    padding: 14, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  headerCardTitle: { fontSize: 16, fontWeight: '800', color: tokens.color.text, textAlign: 'right', marginBottom: 6 },
  headerCardMeta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  headerCardMetaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  headerCardMetaText: { fontSize: 11, color: tokens.color.text2, fontWeight: '600' },
  headerCardAction: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: tokens.color.brand100,
  },
  headerCardActionText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  addInlineBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  addInlineBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  dayBlock: { marginTop: 8 },
  dayHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 6 },
  addDayBtn: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.brand100,
  },
  dayHeader: {
    flex: 1,
    fontSize: 12, fontWeight: '800', color: Colors.primary,
    textAlign: 'right',
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: tokens.color.brand100,
    borderRadius: tokens.radius.sm,
  },
  itemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.color.border,
    marginBottom: 6,
    backgroundColor: tokens.color.surface,
  },
  itemRowConflict: {
    borderColor: tokens.color.danger,
    backgroundColor: tokens.color.dangerBg,
  },
  itemMain: { flex: 1, minWidth: 0 },
  itemSubject: {
    fontSize: 13, fontWeight: '800', color: tokens.color.text,
    textAlign: 'right', marginBottom: 4,
  },
  itemMeta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  itemMetaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  itemMetaText: { fontSize: 10, color: tokens.color.text2, fontWeight: '600' },
  itemActions: { flexDirection: 'row-reverse', gap: 4 },
  iconBtn: { padding: 6 },

  publishBtn: { borderRadius: tokens.radius.md, overflow: 'hidden' },
  publishGradient: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  publishBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.color.bg,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row-reverse', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: tokens.color.border,
    gap: 8,
  },
  sheetTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: tokens.color.text, textAlign: 'right' },
  editSubject: { fontSize: 16, fontWeight: '800', color: tokens.color.text, textAlign: 'right' },
});

const progress = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 4,
  },
  stepWrap: {
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  dot: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: tokens.color.surface2,
    borderWidth: 1, borderColor: tokens.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dotNum: { fontSize: 11, fontWeight: '800', color: tokens.color.text3 },
  dotNumActive: { color: '#fff' },
  label: { fontSize: 10, color: tokens.color.text3, fontWeight: '700', textAlign: 'center' },
  labelActive: { color: tokens.color.text },
  bar: {
    flex: 1,
    height: 2,
    backgroundColor: tokens.color.border,
    marginHorizontal: 2,
  },
  barActive: { backgroundColor: Colors.primary },
});
