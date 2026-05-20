// محرر بناء جدول امتحانات للإدارة.
// يدعم وضعين: إنشاء جديد (mode=new) وتعديل موجود (id=...).
//
// التدفق:
//   1) معلومات أساسية: الاسم + وصف + تاريخ بداية + تاريخ نهاية
//   2) اختيار الصفوف والمواد (multi-select chips)
//   3) توليد تلقائي ذكي (RPC) — تاريخ بداية + توزيع X مواد/يوم
//   4) محرّر بنود قابل للتعديل: تعديل/حذف/إضافة يدوية + تنبيهات تعارض
//   5) نشر — يطلق إشعارات للأطراف المعنية فقط (طلاب/أساتذة/أولياء)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import {
  getExamSchedule, getExamScheduleItems, createExamSchedule, updateExamSchedule,
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
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { api } from '../../services/api';

type TeacherOption = { id: string; full_name: string };

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

// ────────────────── component ──────────────────
export default function ExamScheduleBuilder() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; mode?: string }>();
  const isEdit = !!params.id;

  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [items, setItems] = useState<ExamScheduleItem[]>([]);

  // form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [periodStart, setPeriodStart] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());

  // generate options
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [genStartDate, setGenStartDate] = useState(todayISO());
  const [genStartTime, setGenStartTime] = useState('09:00');
  const [genDuration, setGenDuration] = useState('60');
  const [genPerDay, setGenPerDay] = useState('1');

  // teachers list (for picker UI)
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);

  // editing item modal
  const [editItem, setEditItem] = useState<ExamScheduleItem | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState('60');
  const [editHall, setEditHall] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTeacherId, setEditTeacherId] = useState<string | null>(null);
  const [showTeacherPickerEdit, setShowTeacherPickerEdit] = useState(false);

  // manual add item sheet
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addClassId, setAddClassId] = useState<string | null>(null);
  const [addSubjectId, setAddSubjectId] = useState<string | null>(null);
  const [addSubjectName, setAddSubjectName] = useState('');
  const [addTeacherId, setAddTeacherId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState(todayISO());
  const [addTime, setAddTime] = useState('09:00');
  const [addDuration, setAddDuration] = useState('60');
  const [addHall, setAddHall] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [showTeacherPickerAdd, setShowTeacherPickerAdd] = useState(false);

  // ───── load existing ─────
  const loadSchedule = useCallback(async () => {
    if (!userInstituteId) return;
    setLoading(true);
    try {
      // pickers data
      const [cls, subs, tchrs] = await Promise.all([
        getInstituteClasses(userInstituteId),
        getInstituteSubjects(userInstituteId),
        api.getTeachersByInstitute(userInstituteId),
      ]);
      setClasses(cls);
      setSubjects(subs);
      setTeachers((tchrs || []).map((t: any) => ({ id: t.id, full_name: t.full_name })));

      if (isEdit && params.id) {
        const s = await getExamSchedule(params.id);
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
        setGenStartDate(s.period_start);
        const its = await getExamScheduleItems(s.id);
        setItems(its);
        // pre-select used classes/subjects
        setSelectedClassIds(new Set(its.map(i => i.class_id).filter(Boolean) as string[]));
        setSelectedSubjectIds(new Set(its.map(i => i.subject_id).filter(Boolean) as string[]));
      }
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId, isEdit, params.id, router]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  // ───── save schedule meta ─────
  const handleSaveMeta = async () => {
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
    if (!userInstituteId || !userId) return;

    setSaving(true);
    try {
      if (isEdit && schedule) {
        await updateExamSchedule(schedule.id, {
          name: n, description: description.trim() || null as any,
          period_start: periodStart, period_end: periodEnd,
        });
        setSchedule({ ...schedule, name: n, description: description.trim() || null,
          period_start: periodStart, period_end: periodEnd });
      } else {
        const created = await createExamSchedule({
          institute_id: userInstituteId,
          name: n,
          description: description.trim() || undefined,
          period_start: periodStart,
          period_end: periodEnd,
          created_by: userId,
        });
        setSchedule(created);
        // update URL silently to edit mode
        router.setParams({ id: created.id, mode: 'edit' } as any);
      }
      haptics.success();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  // ───── generate items ─────
  const handleGenerate = async () => {
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
      Alert.alert('تم', `تم توليد ${count} بنداً. يمكنك تعديل أي بند بشكل منفرد.`);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل التوليد');
    } finally {
      setGenerating(false);
    }
  };

  // ───── publish ─────
  const handlePublish = async () => {
    if (!schedule) return;
    if (items.length === 0) {
      Alert.alert('تنبيه', 'لا توجد بنود للنشر');
      return;
    }
    confirmAlert(
      schedule.status === 'published' ? 'إعادة نشر' : 'نشر الجدول',
      schedule.status === 'published'
        ? 'سيتم إرسال إشعار تحديث لكل الأطراف. متابعة؟'
        : 'بعد النشر سيرى الجدول الطلاب وأولياء الأمور والأساتذة المعنيون. متابعة؟',
      async () => {
        setPublishing(true);
        try {
          await publishExamSchedule(schedule.id);
          const updated = await getExamSchedule(schedule.id);
          if (updated) setSchedule(updated);
          Alert.alert('تم النشر', 'وصلت الإشعارات لكل الأطراف');
        } catch (err: any) {
          Alert.alert('خطأ', err?.message || 'فشل النشر');
        } finally {
          setPublishing(false);
        }
      },
      false
    );
  };

  // ───── edit single item ─────
  const openEditItem = (it: ExamScheduleItem) => {
    setEditItem(it);
    setEditDate(it.exam_date);
    setEditTime(it.start_time?.slice(0, 5) || '09:00');
    setEditDuration(String(it.duration_minutes || 60));
    setEditHall(it.hall || '');
    setEditNotes(it.notes || '');
    setEditTeacherId(it.teacher_id);
  };

  const saveItemEdit = async () => {
    if (!editItem) return;
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
        teacher_id: editTeacherId,
        notes: editNotes.trim() || null,
      });
      const fresh = await getExamScheduleItems(schedule!.id);
      setItems(fresh);
      setEditItem(null);
      haptics.success();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل الحفظ');
    }
  };

  // ───── manual add ─────
  const openAddSheet = () => {
    setAddClassId(null);
    setAddSubjectId(null);
    setAddSubjectName('');
    setAddTeacherId(null);
    setAddDate(genStartDate);
    setAddTime(genStartTime);
    setAddDuration(genDuration || '60');
    setAddHall('');
    setShowAddSheet(true);
  };

  const submitAddItem = async () => {
    if (!schedule || !userInstituteId) return;
    if (!addClassId) { Alert.alert('تنبيه', 'اختر الصف'); return; }
    const subjectName = addSubjectName.trim() || subjects.find(s => s.id === addSubjectId)?.name || '';
    if (!subjectName) { Alert.alert('تنبيه', 'اختر مادة أو اكتب اسم المادة'); return; }
    if (!isValidDate(addDate)) { Alert.alert('تنبيه', 'صيغة التاريخ غير صحيحة'); return; }
    if (!isValidTime(addTime)) { Alert.alert('تنبيه', 'صيغة الوقت غير صحيحة'); return; }
    const dur = parseInt(addDuration, 10);
    if (!dur || dur < 15 || dur > 480) { Alert.alert('تنبيه', 'مدة غير صحيحة'); return; }

    setAddingItem(true);
    try {
      await addExamScheduleItem({
        schedule_id: schedule.id,
        institute_id: userInstituteId,
        class_id: addClassId,
        subject_id: addSubjectId,
        subject_name: subjectName,
        teacher_id: addTeacherId,
        exam_date: addDate,
        start_time: addTime + ':00',
        duration_minutes: dur,
        hall: addHall.trim() || null,
      });
      const fresh = await getExamScheduleItems(schedule.id);
      setItems(fresh);
      setShowAddSheet(false);
      haptics.success();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل الإضافة');
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteItem = (it: ExamScheduleItem) => {
    confirmAlert(
      'حذف البند',
      `حذف امتحان "${it.subject_name}" للصف "${it.class_name || ''}"؟`,
      async () => {
        try {
          await deleteExamScheduleItem(it.id);
          setItems((prev) => prev.filter(x => x.id !== it.id));
        } catch (err: any) {
          Alert.alert('خطأ', err?.message || 'فشل الحذف');
        }
      },
      true
    );
  };

  // ───── conflicts ─────
  const conflicts: Conflict[] = useMemo(() => detectConflicts(items), [items]);
  const conflictItemIds = useMemo(() => new Set(conflicts.flatMap(c => c.ids)), [conflicts]);

  // عرض البنود: حسب التاريخ (افتراضي) أو حسب الصف. المستخدم طلب ترتيب حسب
  // الصفوف والشعب، فأضفنا toggle. كل وضع يرتّب داخلياً بمنطقه الخاص.
  const [viewMode, setViewMode] = useState<'date' | 'class'>('date');

  // group items by date — sorted ascending, then by start_time inside the day.
  const groupedByDate = useMemo(() => {
    const m = new Map<string, ExamScheduleItem[]>();
    for (const it of items) {
      const k = it.exam_date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    // sort items inside each day by start_time so "9:00 then 11:00" reads naturally
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  // group items by class — bucket by class_id, sort buckets by class name (Arabic-aware),
  // and inside each bucket sort by exam_date then start_time.
  const groupedByClass = useMemo(() => {
    const m = new Map<string, { name: string; items: ExamScheduleItem[] }>();
    for (const it of items) {
      const key = it.class_id || '__nocls__';
      const name = it.class_name || (it.class_id ? 'صف' : 'بدون صف');
      if (!m.has(key)) m.set(key, { name, items: [] });
      m.get(key)!.items.push(it);
    }
    for (const bucket of m.values()) {
      bucket.items.sort((a, b) => {
        const d = (a.exam_date || '').localeCompare(b.exam_date || '');
        return d !== 0 ? d : (a.start_time || '').localeCompare(b.start_time || '');
      });
    }
    return Array.from(m.entries()).sort(([, A], [, B]) =>
      A.name.localeCompare(B.name, 'ar')
    );
  }, [items]);

  // Daily summary strip — count items per date for an at-a-glance overview.
  // Helps the admin spot empty days or accidental cluster days before publish.
  const dailyCounts = useMemo(() => {
    return groupedByDate.map(([date, dayItems]) => ({ date, count: dayItems.length }));
  }, [groupedByDate]);

  // ───── selection helpers ─────
  const toggleClass = (id: string) => {
    setSelectedClassIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSubject = (id: string) => {
    setSelectedSubjectIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ───── render ─────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title={isEdit ? 'تعديل جدول' : 'جدول جديد'}
          gradient={dtokens.gradient.brand}
          glowAccent="rgba(59,130,246,0.30)"
        />
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const isPublished = schedule?.status === 'published';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={isPublished ? 'جدول منشور' : (isEdit ? 'تعديل جدول' : 'جدول جديد')}
        subtitle={isPublished ? 'أي تعديل سيرسل إشعار تحديث للأطراف' : 'املأ المعلومات ثم ولّد البنود'}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Meta ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>معلومات الجدول</Text>
          <Text style={styles.fieldLabel}>الاسم</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="مثال: امتحانات نصف السنة"
            placeholderTextColor={tokens.text[4]}
            textAlign="right"
          />
          <Text style={styles.fieldLabel}>وصف (اختياري)</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="ملاحظات تظهر مع الجدول"
            placeholderTextColor={tokens.text[4]}
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
                placeholderTextColor={tokens.text[4]}
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
                placeholderTextColor={tokens.text[4]}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                textAlign="center"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            onPress={handleSaveMeta}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Ionicons name="save-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {saving ? 'جاري الحفظ...' : (schedule ? 'حفظ التغييرات' : 'حفظ ومتابعة')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 2. Selectors (only after schedule saved) ── */}
        {schedule && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>اختر الصفوف ({selectedClassIds.size})</Text>
              {classes.length === 0 ? (
                <Text style={styles.muted}>لا توجد صفوف. أضف صفوف من قسم الصفوف والشعب.</Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {classes.map(c => {
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
                  {subjects.map(s => {
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
                    placeholderTextColor={tokens.text[4]}
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
                    placeholderTextColor={tokens.text[4]}
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
                    placeholderTextColor={tokens.text[4]}
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
                    placeholderTextColor={tokens.text[4]}
                    textAlign="center"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, generating && { opacity: 0.6 }]}
                onPress={handleGenerate}
                disabled={generating}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {generating ? 'جاري التوليد...' : 'توليد البنود تلقائياً'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.muted}>
                ينشئ بنداً لكل (صف × مادة) ويوزّع التواريخ تصاعدياً. الأستاذ يُجلب تلقائياً من تعيينات المواد.
              </Text>
            </View>

            {/* ── 3. Conflicts banner ── */}
            {conflicts.length > 0 && (
              <View style={styles.conflictBox}>
                <View style={styles.conflictHeader}>
                  <Ionicons name="warning" size={18} color={tokens.semantic.danger} />
                  <Text style={styles.conflictTitle}>{conflicts.length} تعارض</Text>
                </View>
                {conflicts.slice(0, 5).map((c, i) => (
                  <Text key={i} style={styles.conflictText}>• {c.message}</Text>
                ))}
                <Text style={styles.conflictHint}>يمكن النشر رغم التعارضات لكن يُنصح بمراجعتها.</Text>
              </View>
            )}

            {/* ── 4. Items list ── */}
            <View style={styles.section}>
              <View style={styles.itemsHeader}>
                <TouchableOpacity
                  style={styles.addManualBtn}
                  onPress={() => { haptics.light(); openAddSheet(); }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={16} color={tokens.brand[500]} />
                  <Text style={styles.addManualBtnText}>إضافة يدوية</Text>
                </TouchableOpacity>
                <Text style={styles.sectionTitle}>البنود ({items.length})</Text>
              </View>

              {/* View mode toggle — admin's choice between date-grouped or class-grouped */}
              {items.length > 0 && (
                <View style={styles.viewToggleRow}>
                  <TouchableOpacity
                    style={[styles.viewToggleBtn, viewMode === 'class' && styles.viewToggleBtnActive]}
                    onPress={() => { haptics.light(); setViewMode('class'); }}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="school-outline"
                      size={13}
                      color={viewMode === 'class' ? '#fff' : tokens.text[2]}
                    />
                    <Text style={[styles.viewToggleText, viewMode === 'class' && styles.viewToggleTextActive]}>
                      حسب الصف
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.viewToggleBtn, viewMode === 'date' && styles.viewToggleBtnActive]}
                    onPress={() => { haptics.light(); setViewMode('date'); }}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color={viewMode === 'date' ? '#fff' : tokens.text[2]}
                    />
                    <Text style={[styles.viewToggleText, viewMode === 'date' && styles.viewToggleTextActive]}>
                      حسب التاريخ
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Daily summary strip — visible only in date view, gives an at-a-glance
                  load per day. Helps admin re-balance before publish. */}
              {items.length > 0 && viewMode === 'date' && dailyCounts.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayStripContent}
                  style={styles.dayStrip}
                >
                  {dailyCounts.map((d) => (
                    <View key={d.date} style={styles.dayStripItem}>
                      <Text style={styles.dayStripDate}>{fmtArDate(d.date)}</Text>
                      <Text style={[
                        styles.dayStripCount,
                        d.count > 2 && { color: tokens.semantic.warning },
                      ]}>{d.count}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}

              {items.length === 0 ? (
                <Text style={styles.muted}>لا توجد بنود. ولّد تلقائياً أو أضف يدوياً.</Text>
              ) : viewMode === 'date' ? (
                groupedByDate.map(([date, dayItems]) => (
                  <View key={date} style={styles.dayBlock}>
                    <Text style={styles.dayHeader}>{fmtArDate(date)} · {date}</Text>
                    {dayItems.map(it => {
                      const conflicting = conflictItemIds.has(it.id);
                      return (
                        <View key={it.id} style={[styles.itemRow, conflicting && styles.itemRowConflict]}>
                          <View style={styles.itemMain}>
                            <Text style={styles.itemSubject} numberOfLines={1}>{it.subject_name}</Text>
                            <View style={styles.itemMeta}>
                              <View style={styles.itemMetaItem}>
                                <Ionicons name="school-outline" size={11} color={tokens.text[4]} />
                                <Text style={styles.itemMetaText}>{it.class_name || '—'}</Text>
                              </View>
                              <View style={styles.itemMetaItem}>
                                <Ionicons name="time-outline" size={11} color={tokens.text[4]} />
                                <Text style={styles.itemMetaText}>{(it.start_time || '').slice(0, 5)} · {it.duration_minutes}د</Text>
                              </View>
                              {it.teacher_name && (
                                <View style={styles.itemMetaItem}>
                                  <Ionicons name="person-outline" size={11} color={tokens.text[4]} />
                                  <Text style={styles.itemMetaText}>{it.teacher_name}</Text>
                                </View>
                              )}
                              {it.hall && (
                                <View style={styles.itemMetaItem}>
                                  <Ionicons name="location-outline" size={11} color={tokens.text[4]} />
                                  <Text style={styles.itemMetaText}>{it.hall}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <View style={styles.itemActions}>
                            <TouchableOpacity onPress={() => openEditItem(it)} style={styles.iconBtn} activeOpacity={0.8}>
                              <Ionicons name="create-outline" size={18} color={tokens.brand[500]} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteItem(it)} style={styles.iconBtn} activeOpacity={0.8}>
                              <Ionicons name="trash-outline" size={18} color={tokens.semantic.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))
              ) : (
                // class view — same row layout, headed by class name with count
                groupedByClass.map(([key, bucket]) => (
                  <View key={key} style={styles.dayBlock}>
                    <Text style={styles.dayHeader}>{bucket.name} · {bucket.items.length} امتحان</Text>
                    {bucket.items.map(it => {
                      const conflicting = conflictItemIds.has(it.id);
                      return (
                        <View key={it.id} style={[styles.itemRow, conflicting && styles.itemRowConflict]}>
                          <View style={styles.itemMain}>
                            <Text style={styles.itemSubject} numberOfLines={1}>{it.subject_name}</Text>
                            <View style={styles.itemMeta}>
                              <View style={styles.itemMetaItem}>
                                <Ionicons name="calendar-outline" size={11} color={tokens.text[4]} />
                                <Text style={styles.itemMetaText}>{fmtArDate(it.exam_date)}</Text>
                              </View>
                              <View style={styles.itemMetaItem}>
                                <Ionicons name="time-outline" size={11} color={tokens.text[4]} />
                                <Text style={styles.itemMetaText}>{(it.start_time || '').slice(0, 5)} · {it.duration_minutes}د</Text>
                              </View>
                              {it.teacher_name && (
                                <View style={styles.itemMetaItem}>
                                  <Ionicons name="person-outline" size={11} color={tokens.text[4]} />
                                  <Text style={styles.itemMetaText}>{it.teacher_name}</Text>
                                </View>
                              )}
                              {it.hall && (
                                <View style={styles.itemMetaItem}>
                                  <Ionicons name="location-outline" size={11} color={tokens.text[4]} />
                                  <Text style={styles.itemMetaText}>{it.hall}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <View style={styles.itemActions}>
                            <TouchableOpacity onPress={() => openEditItem(it)} style={styles.iconBtn} activeOpacity={0.8}>
                              <Ionicons name="create-outline" size={18} color={tokens.brand[500]} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteItem(it)} style={styles.iconBtn} activeOpacity={0.8}>
                              <Ionicons name="trash-outline" size={18} color={tokens.semantic.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </View>

            {/* ── 5. Publish ── */}
            <View style={styles.section}>
              <TouchableOpacity
                style={[styles.publishBtn, (publishing || items.length === 0) && { opacity: 0.6 }]}
                onPress={handlePublish}
                disabled={publishing || items.length === 0}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={dtokens.gradient.brand as any}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.publishGradient}
                >
                  <Ionicons name={isPublished ? 'cloud-upload' : 'paper-plane'} size={18} color="#fff" />
                  <Text style={styles.publishBtnText}>
                    {publishing ? 'جاري النشر...' : (isPublished ? 'إعادة النشر + إشعار تحديث' : 'نشر الجدول وإرسال الإشعارات')}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              {isPublished && (
                <Text style={[styles.muted, { textAlign: 'center', marginTop: 6 }]}>
                  هذا الجدول منشور — أي تعديل بند يرسل إشعار تحديث تلقائياً
                </Text>
              )}
            </View>
          </>
        )}
      </KeyboardAwareScroll>

      {/* ── Edit Item sheet (SwipeableSheet — swipe-down to dismiss) ── */}
      <SwipeableSheet visible={!!editItem} onClose={() => setEditItem(null)} maxHeight={0.92}>
        {editItem && (
          <View style={{ flex: 0 }}>
            <View style={styles.editHeader}>
              <TouchableOpacity onPress={() => setEditItem(null)} style={styles.iconBtn}>
                <Ionicons name="close" size={22} color={tokens.text[2]} />
              </TouchableOpacity>
              <Text style={styles.editTitle}>تعديل بند</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.editSubject}>{editItem.subject_name}</Text>
              <Text style={styles.muted}>{editItem.class_name || ''}</Text>

              <Text style={styles.fieldLabel}>التاريخ</Text>
              <TextInput
                style={styles.input}
                value={editDate}
                onChangeText={setEditDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={tokens.text[4]}
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
                    placeholderTextColor={tokens.text[4]}
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
                placeholderTextColor={tokens.text[4]}
                textAlign="right"
              />

              <Text style={styles.fieldLabel}>الأستاذ المسؤول (المراقبة)</Text>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => { haptics.light(); setShowTeacherPickerEdit(v => !v); }}
                activeOpacity={0.85}
              >
                <Ionicons name="chevron-down" size={16} color={tokens.text[3]} />
                <Text style={[styles.pickerBtnText, !editTeacherId && styles.pickerBtnPlaceholder]}>
                  {editTeacherId
                    ? (teachers.find(t => t.id === editTeacherId)?.full_name || 'أستاذ')
                    : 'اختر أستاذاً (اختياري)'}
                </Text>
              </TouchableOpacity>
              {showTeacherPickerEdit && (
                <View style={styles.pickerList}>
                  <TouchableOpacity
                    style={styles.pickerItem}
                    onPress={() => { setEditTeacherId(null); setShowTeacherPickerEdit(false); }}
                  >
                    <Text style={[styles.pickerItemText, !editTeacherId && { color: tokens.brand[500], fontWeight: '800' }]}>
                      بدون أستاذ
                    </Text>
                  </TouchableOpacity>
                  {teachers.map(t => (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.pickerItem}
                      onPress={() => { setEditTeacherId(t.id); setShowTeacherPickerEdit(false); }}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        editTeacherId === t.id && { color: tokens.brand[500], fontWeight: '800' },
                      ]}>
                        {t.full_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {teachers.length === 0 && (
                    <Text style={styles.muted}>لا يوجد أساتذة في المؤسسة بعد.</Text>
                  )}
                </View>
              )}

              <Text style={styles.fieldLabel}>ملاحظات</Text>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="ملاحظات داخلية للإدارة"
                placeholderTextColor={tokens.text[4]}
                textAlign="right"
                multiline
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={saveItemEdit} activeOpacity={0.85}>
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>حفظ التعديل</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </SwipeableSheet>

      {/* ── Manual Add Item sheet (SwipeableSheet — swipe-down to dismiss) ── */}
      <SwipeableSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} maxHeight={0.92}>
        {showAddSheet && (
          <View style={{ flex: 0 }}>
            <View style={styles.editHeader}>
              <TouchableOpacity onPress={() => setShowAddSheet(false)} style={styles.iconBtn}>
                <Ionicons name="close" size={22} color={tokens.text[2]} />
              </TouchableOpacity>
              <Text style={styles.editTitle}>إضافة بند يدوي</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>الصف</Text>
              <View style={styles.chipsWrap}>
                {classes.map(c => {
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
              {classes.length === 0 && <Text style={styles.muted}>لا توجد صفوف.</Text>}

              <Text style={styles.fieldLabel}>المادة</Text>
              <View style={styles.chipsWrap}>
                {subjects.map(s => {
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
              <Text style={styles.fieldLabel}>أو اكتب اسم مادة مخصصة</Text>
              <TextInput
                style={styles.input}
                value={addSubjectName}
                onChangeText={(v) => { setAddSubjectName(v); setAddSubjectId(null); }}
                placeholder="اسم المادة"
                placeholderTextColor={tokens.text[4]}
                textAlign="right"
              />

              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>التاريخ</Text>
                  <TextInput
                    style={styles.input}
                    value={addDate}
                    onChangeText={setAddDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={tokens.text[4]}
                    textAlign="center"
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>الوقت</Text>
                  <TextInput
                    style={styles.input}
                    value={addTime}
                    onChangeText={setAddTime}
                    placeholder="HH:MM"
                    placeholderTextColor={tokens.text[4]}
                    textAlign="center"
                  />
                </View>
              </View>

              <View style={styles.dateRow}>
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
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>القاعة</Text>
                  <TextInput
                    style={styles.input}
                    value={addHall}
                    onChangeText={setAddHall}
                    placeholder="قاعة 1"
                    placeholderTextColor={tokens.text[4]}
                    textAlign="center"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>الأستاذ المسؤول (اختياري)</Text>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => { haptics.light(); setShowTeacherPickerAdd(v => !v); }}
                activeOpacity={0.85}
              >
                <Ionicons name="chevron-down" size={16} color={tokens.text[3]} />
                <Text style={[styles.pickerBtnText, !addTeacherId && styles.pickerBtnPlaceholder]}>
                  {addTeacherId
                    ? (teachers.find(t => t.id === addTeacherId)?.full_name || 'أستاذ')
                    : 'بدون أستاذ'}
                </Text>
              </TouchableOpacity>
              {showTeacherPickerAdd && (
                <View style={styles.pickerList}>
                  <TouchableOpacity
                    style={styles.pickerItem}
                    onPress={() => { setAddTeacherId(null); setShowTeacherPickerAdd(false); }}
                  >
                    <Text style={[styles.pickerItemText, !addTeacherId && { color: tokens.brand[500], fontWeight: '800' }]}>
                      بدون أستاذ
                    </Text>
                  </TouchableOpacity>
                  {teachers.map(t => (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.pickerItem}
                      onPress={() => { setAddTeacherId(t.id); setShowTeacherPickerAdd(false); }}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        addTeacherId === t.id && { color: tokens.brand[500], fontWeight: '800' },
                      ]}>
                        {t.full_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {teachers.length === 0 && (
                    <Text style={styles.muted}>لا يوجد أساتذة في المؤسسة بعد.</Text>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, addingItem && { opacity: 0.6 }]}
                onPress={submitAddItem}
                disabled={addingItem}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {addingItem ? 'جاري الإضافة...' : 'إضافة البند'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },

  section: {
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginTop: 12,
    padding: 14,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '800', color: tokens.text[1],
    textAlign: 'right', marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: tokens.text[3],
    textAlign: 'right', marginTop: 8, marginBottom: 4,
  },
  input: {
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[2],
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: tokens.text[1],
  },
  dateRow: { flexDirection: 'row-reverse', gap: 10 },
  dateField: { flex: 1 },
  muted: { fontSize: 11, color: tokens.text[4], textAlign: 'right', marginTop: 6 },

  primaryBtn: {
    marginTop: 12,
    backgroundColor: tokens.brand[500],
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  chipsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1, borderColor: tokens.border[2],
    backgroundColor: tokens.surface.surface2,
  },
  chipActive: {
    backgroundColor: tokens.brand[500],
    borderColor: tokens.brand[500],
  },
  chipText: { fontSize: 12, color: tokens.text[1], fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  conflictBox: {
    backgroundColor: tokens.semantic.dangerBg,
    borderWidth: 1, borderColor: tokens.semantic.danger,
    marginHorizontal: 14, marginTop: 12,
    padding: 12, borderRadius: tokens.radius.lg,
  },
  conflictHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 6 },
  conflictTitle: { fontSize: 13, fontWeight: '800', color: tokens.semantic.danger },
  conflictText: { fontSize: 12, color: tokens.semantic.danger, textAlign: 'right', marginTop: 2 },
  conflictHint: { fontSize: 11, color: tokens.semantic.danger, textAlign: 'right', marginTop: 6, fontStyle: 'italic' },

  dayBlock: { marginTop: 8 },
  dayHeader: {
    fontSize: 12, fontWeight: '800', color: tokens.brand[500],
    textAlign: 'right',
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: tokens.brand[100],
    borderRadius: tokens.radius.sm,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.border[2],
    marginBottom: 6,
    backgroundColor: tokens.surface.surface,
  },
  itemRowConflict: {
    borderColor: tokens.semantic.danger,
    backgroundColor: tokens.semantic.dangerBg,
  },
  itemMain: { flex: 1, minWidth: 0 },
  itemSubject: {
    fontSize: 13, fontWeight: '800', color: tokens.text[1],
    textAlign: 'right', marginBottom: 4,
  },
  itemMeta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  itemMetaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  itemMetaText: { fontSize: 10, color: tokens.text[3], fontWeight: '600' },
  itemActions: { flexDirection: 'row-reverse', gap: 4 },
  iconBtn: { padding: 6 },

  publishBtn: { borderRadius: tokens.radius.md, overflow: 'hidden' },
  publishGradient: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  publishBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  editOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  editPanel: {
    backgroundColor: tokens.surface.bg,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    maxHeight: '85%',
  },
  editHeader: {
    flexDirection: 'row-reverse', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: tokens.border[2],
    gap: 8,
  },
  editTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  editSubject: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },

  itemsHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  addManualBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.brand[500],
    backgroundColor: tokens.brand[100],
  },
  addManualBtnText: { fontSize: 12, fontWeight: '800', color: tokens.brand[500] },

  viewToggleRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    marginBottom: 10,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 5,
    paddingVertical: 8, paddingHorizontal: 8,
    borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.border[2],
    backgroundColor: tokens.surface.surface2,
  },
  viewToggleBtnActive: {
    backgroundColor: tokens.brand[500], borderColor: tokens.brand[500],
  },
  viewToggleText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  viewToggleTextActive: { color: '#fff' },

  dayStrip: {
    flexGrow: 0,
    marginBottom: 8,
  },
  dayStripContent: {
    gap: 6,
    paddingVertical: 4,
  },
  dayStripItem: {
    minWidth: 70,
    paddingVertical: 6, paddingHorizontal: 8,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.brand[100],
    alignItems: 'center',
  },
  dayStripDate: { fontSize: 10, color: tokens.text[2], fontWeight: '700' },
  dayStripCount: { fontSize: 14, color: tokens.brand[500], fontWeight: '900', marginTop: 2 },

  pickerBtn: {
    flexDirection: 'row-reverse', alignItems: 'center',
    gap: 6, paddingHorizontal: 12, paddingVertical: 11,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[2],
    borderRadius: tokens.radius.md,
  },
  pickerBtnText: { flex: 1, fontSize: 13, fontWeight: '600', color: tokens.text[1], textAlign: 'right' },
  pickerBtnPlaceholder: { color: tokens.text[4], fontWeight: '500' },
  pickerList: {
    marginTop: 6,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[2],
    borderRadius: tokens.radius.md,
    maxHeight: 220,
    paddingVertical: 4,
  },
  pickerItem: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.border[2],
  },
  pickerItemText: { fontSize: 13, color: tokens.text[1], textAlign: 'right', fontWeight: '600' },
});
