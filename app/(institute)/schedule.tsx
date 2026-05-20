// schedule — institute timetable management screen.
// Orchestration only: state, effects, handlers; presentation lives in components/institute/schedule/.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import useAuthStore from '../../stores/authStore';
import { api } from '../../services/api';
import { confirmAlert } from '../../utils/alerts';
import { useTranslation } from 'react-i18next';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens as dtokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';
import SectionLabel from '../../components/institute/SectionLabel';

import ScheduleDayTabs from '../../components/institute/schedule/ScheduleDayTabs';
import ScheduleSlotList from '../../components/institute/schedule/ScheduleSlotList';
import ScheduleExamList from '../../components/institute/schedule/ScheduleExamList';
import {
  AddSlotButton,
  SmartGenerateButton,
  SecondaryActionRow,
} from '../../components/institute/schedule/ScheduleActionButtons';
import { exportSchedulePDF } from '../../services/pdfExport';
import ScheduleSlotEditSheet from '../../components/institute/schedule/sheets/ScheduleSlotEditSheet';
import PickerListSheet from '../../components/institute/schedule/sheets/PickerListSheet';
import SkippedSlotsSheet from '../../components/institute/schedule/sheets/SkippedSlotsSheet';
import {
  HHMM_REGEX,
  TIME_PRESETS,
  toMinutes,
  findConflict,
  getDaysForInstType,
} from '../../components/institute/schedule/_helpers';
import { runSmartGenerate, type SkippedSlot } from '../../components/institute/schedule/_smartGenerate';

// FilterChip — small pill button used to expose class/teacher filters above
// the slot list. When `activeLabel` is set we show it + a small X to clear;
// otherwise we show `defaultLabel`. Kept in-file because it's only used here.
type FilterChipProps = {
  icon: keyof typeof Ionicons.glyphMap;
  activeLabel: string | null;
  defaultLabel: string;
  onPress: () => void;
  onClear?: () => void;
};

function FilterChip({ icon, activeLabel, defaultLabel, onPress, onClear }: FilterChipProps) {
  const isActive = !!activeLabel;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[chipStyles.chip, isActive && chipStyles.chipActive]}
    >
      <Ionicons
        name={icon}
        size={14}
        color={isActive ? dtokens.color.brand600 : dtokens.color.text2}
      />
      <Text
        style={[chipStyles.chipText, isActive && chipStyles.chipTextActive]}
        numberOfLines={1}
      >
        {activeLabel || defaultLabel}
      </Text>
      {isActive && onClear ? (
        <TouchableOpacity
          onPress={onClear}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="close-circle" size={14} color={dtokens.color.brand600} />
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-down" size={12} color={dtokens.color.text3} />
      )}
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: dtokens.color.surface,
    borderWidth: 1,
    borderColor: dtokens.color.border,
  },
  chipActive: {
    backgroundColor: dtokens.color.brand100,
    borderColor: 'rgba(47,47,186,0.18)',
  },
  chipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: dtokens.color.text2,
    textAlign: 'center',
  },
  chipTextActive: {
    color: dtokens.color.brand600,
    fontWeight: '800',
  },
});

export default function InstituteSchedule() {
  const { t } = useTranslation();
  const { userInstituteId, institutes, isFetching, detectInstitute } = useDataStore();
  const { userId } = useAuthStore();

  // Detect institution type
  const currentInst = institutes.find(i => i.id === userInstituteId);
  const instType = (currentInst as any)?.type || 'school';

  // Schools: Sat-Thu (6 days) | Institutes: All week (7 days)
  const DAYS = useMemo(() => getDaysForInstType(instType), [instType]);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  // Reference lists for pickers (loaded once with timetable)
  const [teachers, setTeachers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  // Edit slot sheet
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editSlot, setEditSlot] = useState<any>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editTeacherId, setEditTeacherId] = useState<string | null>(null);
  const [editClassId, setEditClassId] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState('');
  const [editStartTime, setEditStartTime] = useState('08:00');
  const [editEndTime, setEditEndTime] = useState('09:00');
  const [saving, setSaving] = useState(false);

  // Nested pickers (inside the edit sheet)
  const [showTeacherPicker, setShowTeacherPicker] = useState(false);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Smart generation
  const [generating, setGenerating] = useState(false);
  const spinAnim = useState(new Animated.Value(0))[0];
  const [skippedSlots, setSkippedSlots] = useState<SkippedSlot[]>([]);
  const [skippedSheetVisible, setSkippedSheetVisible] = useState(false);

  // Feature 5: Publish timetable
  const [publishing, setPublishing] = useState(false);

  // PDF export class filter
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exporting, setExporting] = useState(false);

  // View filter — restricts which slots are shown in the day list.
  // null = show all. We deliberately filter on the client (data is already
  // loaded for the institute) instead of refetching, to keep the toggle
  // instant and free of network calls.
  const [filterClassId, setFilterClassId] = useState<string | null>(null);
  const [filterTeacherId, setFilterTeacherId] = useState<string | null>(null);
  const [showClassFilter, setShowClassFilter] = useState(false);
  const [showTeacherFilter, setShowTeacherFilter] = useState(false);

  const loadData = useCallback(async () => {
    if (!userInstituteId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [tt, ex, tchs, cls] = await Promise.all([
        api.getTimetableByInstitute(userInstituteId),
        api.getExamsByInstitute(userInstituteId),
        api.getTeachersByInstitute(userInstituteId),
        api.getClassesByInstitute(userInstituteId),
      ]);
      setTimetable(tt);
      setExams(ex);
      setTeachers(tchs || []);
      setClasses((cls || []).map((c: any) => ({ id: c.id, name: c.name })));
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => {
    loadData();
  }, [userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  // Apply day + optional class/teacher filters. Memoizing isn't strictly
  // necessary (timetable is small) but keeps re-renders cheap during sheet
  // open/close churn.
  const slotsForDay = useMemo(() => {
    return timetable.filter((s) => {
      if (s.day_of_week !== selectedDay) return false;
      if (filterClassId && s.class_id !== filterClassId) return false;
      if (filterTeacherId && s.teacher_id !== filterTeacherId) return false;
      return true;
    });
  }, [timetable, selectedDay, filterClassId, filterTeacherId]);

  const filterClassLabel = filterClassId
    ? (classes.find((c) => c.id === filterClassId)?.name || null)
    : null;
  const filterTeacherLabel = filterTeacherId
    ? (teachers.find((t) => t.id === filterTeacherId)?.full_name || null)
    : null;

  const openEditModal = (slot: any) => {
    setEditSlot(slot);
    setEditSubject(slot.subject || '');
    setEditTeacherId(slot.teacher_id || null);
    setEditClassId(slot.class_id || null);
    setEditRoom(slot.room || '');
    setEditStartTime(slot.start_time?.slice(0, 5) || '08:00');
    setEditEndTime(slot.end_time?.slice(0, 5) || '09:00');
    setEditModalVisible(true);
  };

  const openNewSlot = () => {
    setEditSlot(null);
    setEditSubject('');
    setEditTeacherId(null);
    setEditClassId(null);
    setEditRoom('');
    setEditStartTime('08:00');
    setEditEndTime('09:00');
    setEditModalVisible(true);
  };

  const handleSaveSlot = async () => {
    // Validation chain — surface each issue clearly so non-developers understand what to fix.
    if (!editSubject.trim()) {
      Alert.alert('ناقص', 'اكتب اسم المادة');
      return;
    }
    if (!editClassId) {
      Alert.alert('ناقص', 'اختر الصف');
      return;
    }
    if (!editTeacherId) {
      Alert.alert('ناقص', 'اختر الأستاذ');
      return;
    }
    if (!HHMM_REGEX.test(editStartTime) || !HHMM_REGEX.test(editEndTime)) {
      Alert.alert('خطأ', 'صيغة الوقت يجب أن تكون HH:MM (مثل 08:30)');
      return;
    }
    if (toMinutes(editEndTime) <= toMinutes(editStartTime)) {
      Alert.alert('خطأ', 'وقت الانتهاء لازم يكون بعد وقت البداية');
      return;
    }
    const conflict = findConflict({
      day: selectedDay,
      start: editStartTime,
      end: editEndTime,
      teacherId: editTeacherId,
      classId: editClassId,
      excludeSlotId: editSlot?.id,
      timetable,
      teachers,
      classes,
    });
    if (conflict) {
      Alert.alert('تعارض زمني', conflict);
      return;
    }
    setSaving(true);
    try {
      await api.upsertTimetableSlot({
        id: editSlot?.id,
        institute_id: userInstituteId || '',
        class_id: editClassId,
        teacher_id: editTeacherId,
        subject: editSubject.trim(),
        day_of_week: selectedDay,
        start_time: editStartTime,
        end_time: editEndTime,
        room: editRoom.trim(),
      });
      setEditModalVisible(false);
      haptics.success();
      loadData();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('institute.lessonFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlot = (slotId: string) => {
    confirmAlert(t('institute.deleteLesson'), t('institute.deleteLessonConfirm'), async () => {
      try {
        await api.deleteTimetableSlot(slotId);
        loadData();
      } catch (err: any) {
        Alert.alert(t('common.error'), err?.message || 'فشل حذف الحصة');
      }
    }, true);
  };

  const handleSmartGenerate = () => {
    confirmAlert(t('institute.generateSmartSchedule'), t('institute.generateConfirm'), async () => {
      setGenerating(true);
      const spin = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      );
      spin.start();
      try {
        const result = await runSmartGenerate({
          userInstituteId: userInstituteId || '',
          instType: instType === 'school' ? 'school' : 'institute',
          dayKeys: DAYS.map((d) => d.key),
        });
        if (result.kind === 'noTeachersOrClasses') {
          Alert.alert(t('common.warning'), t('institute.noTeachersOrClasses'));
          spin.stop();
          spinAnim.setValue(0);
          setGenerating(false);
          return;
        }
        const baseMsg = t('institute.lessonsGenerated', { count: result.count });
        setSkippedSlots(result.skipped);
        if (result.skipped.length > 0) {
          Alert.alert(
            t('common.success'),
            `${baseMsg}\nتم تخطي ${result.skipped.length} حصة لعدم وجود أستاذ معيّن — اضغط لعرض التفاصيل`,
            [
              { text: 'لاحقاً', style: 'cancel' },
              { text: 'عرض التفاصيل', onPress: () => setSkippedSheetVisible(true) },
            ],
          );
        } else {
          Alert.alert(t('common.success'), baseMsg);
        }
        loadData();
      } catch (err: any) {
        Alert.alert(t('common.error'), err.message || t('institute.generateFailed'));
      } finally {
        spin.stop();
        spinAnim.setValue(0);
        setGenerating(false);
      }
    });
  };

  // Feature 5: Publish timetable and notify teachers
  const handlePublishTimetable = () => {
    confirmAlert(t('institute.publishSchedule'), t('institute.publishConfirm'), async () => {
      setPublishing(true);
      try {
        if (!userInstituteId) throw new Error('institute not loaded');
        // Persist the publish state so the UI can show "published at …" and prevent spam
        const { supabase: sb } = await import('../../services/supabase');
        await sb.from('timetable_publish_state').upsert({
          institute_id: userInstituteId,
          published_at: new Date().toISOString(),
          published_by: userId,
        }, { onConflict: 'institute_id' });

        await api.createAnnouncement(
          t('institute.scheduleUpdated'),
          t('institute.scheduleUpdated'),
          'teacher',
          userInstituteId || undefined
        );
        // sendPushToRole now requires senderId + institute scope for correct delivery
        await api.sendPushToRole(
          t('institute.scheduleUpdated'),
          t('institute.scheduleUpdated'),
          'teacher',
          undefined,
          userInstituteId,
          userId || undefined,
          'institute'
        );
        Alert.alert(t('common.success'), t('institute.schedulePublished'));
      } catch (err: any) {
        Alert.alert(t('common.error'), err.message || t('institute.publishFailed'));
      } finally {
        setPublishing(false);
      }
    });
  };

  const handleExportPDF = useCallback(async (filterClassId: string | null) => {
    if (timetable.length === 0) {
      Alert.alert('فارغ', 'لا توجد حصص لتصديرها');
      return;
    }
    setExporting(true);
    try {
      const filtered = filterClassId
        ? timetable.filter((s: any) => s.class_id === filterClassId)
        : timetable;
      if (filtered.length === 0) {
        Alert.alert('فارغ', 'لا توجد حصص لهذا الصف');
        return;
      }
      const className = filterClassId
        ? (classes.find((c) => c.id === filterClassId)?.name || '')
        : '';
      const title = filterClassId
        ? `جدول ${className}`
        : 'الجدول الأسبوعي للمؤسسة';
      const subtitle = filterClassId
        ? `${filtered.length} حصة`
        : `${classes.length} صف · ${timetable.length} حصة`;
      // Build a per-class grid in landscape (rows = periods, cols = days).
      // Pass institute name + active days so the PDF header is meaningful and
      // the grid drops Friday for schools.
      await exportSchedulePDF(filtered, title, subtitle, {
        showClass: !filterClassId,
        instituteName: currentInst?.name,
        dayKeys: DAYS.map((d) => d.key),
        gridMode: !!filterClassId, // grid layout when exporting a single class
      });
      haptics.success();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تصدير PDF');
    } finally {
      setExporting(false);
    }
  }, [timetable, classes, currentInst?.name, DAYS]);

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Retry detect if not found yet
  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) {
      detectInstitute(userId);
    }
  }, [userInstituteId, userId, isFetching]);

  // Top-of-page stats summary — must be declared BEFORE any early return,
  // otherwise React sees a different hook count between renders ("Rendered
  // more hooks than during the previous render"). The memo handles the
  // empty-timetable case gracefully.
  const scheduleStats = useMemo(() => {
    const uniqueClasses = new Set(timetable.map((s) => s.class_id).filter(Boolean));
    const uniqueTeachers = new Set(timetable.map((s) => s.teacher_id).filter(Boolean));
    const uniqueDays = new Set(timetable.map((s) => s.day_of_week));
    return {
      totalSlots: timetable.length,
      classes: uniqueClasses.size,
      teachers: uniqueTeachers.size,
      days: uniqueDays.size,
    };
  }, [timetable]);

  if (!userInstituteId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ fontSize: 14, color: '#64748B', marginTop: 12 }}>{t('common.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dayLabel = DAYS.find((d) => d.key === selectedDay)?.label || '';
  const className = editClassId ? (classes.find((c) => c.id === editClassId)?.name || null) : null;
  const teacherName = editTeacherId ? (teachers.find((tt) => tt.id === editTeacherId)?.full_name || null) : null;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('common.schedule')}
        subtitle={`${timetable.length} حصة مسجلة`}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.contentArea}>
          {/* Stats summary — 4-card pulse of the institute's schedule coverage. */}
          {scheduleStats.totalSlots > 0 && (
            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: '#EEF2FF' }]}>
                <View style={[styles.statIcon, { backgroundColor: '#4F46E520' }]}>
                  <Ionicons name="time" size={16} color="#4F46E5" />
                </View>
                <Text style={styles.statValue}>{scheduleStats.totalSlots}</Text>
                <Text style={styles.statLabel}>إجمالي الحصص</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#F0FDFA' }]}>
                <View style={[styles.statIcon, { backgroundColor: '#0D948820' }]}>
                  <Ionicons name="school" size={16} color="#0D9488" />
                </View>
                <Text style={styles.statValue}>{scheduleStats.classes}</Text>
                <Text style={styles.statLabel}>صفوف/شعب</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#FEF3C7' }]}>
                <View style={[styles.statIcon, { backgroundColor: '#B4530920' }]}>
                  <Ionicons name="person" size={16} color="#B45309" />
                </View>
                <Text style={styles.statValue}>{scheduleStats.teachers}</Text>
                <Text style={styles.statLabel}>أساتذة</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#FCE7F3' }]}>
                <View style={[styles.statIcon, { backgroundColor: '#BE185D20' }]}>
                  <Ionicons name="calendar" size={16} color="#BE185D" />
                </View>
                <Text style={styles.statValue}>{scheduleStats.days}</Text>
                <Text style={styles.statLabel}>أيام نشطة</Text>
              </View>
            </View>
          )}

          {/* Primary CTA — Smart Generate gets the visual weight at the top,
              because that's the highest-value action on an empty schedule. */}
          <SmartGenerateButton
            generating={generating}
            generatingLabel={t('institute.generatingSchedule')}
            generateLabel={t('institute.generateSmartSchedule')}
            spinInterpolation={spinInterpolation}
            onPress={handleSmartGenerate}
          />

          {/* Secondary actions — Publish + Export as a compact paired row. */}
          <SecondaryActionRow
            publishing={publishing}
            exporting={exporting}
            publishLabel={t('institute.publishSchedule')}
            exportLabel="تصدير PDF"
            onPublish={handlePublishTimetable}
            onExport={() => { haptics.light(); setShowExportPicker(true); }}
          />

          <ScheduleDayTabs
            days={DAYS}
            selectedDay={selectedDay}
            countForDay={(key) => timetable.filter((s) => s.day_of_week === key).length}
            onSelectDay={setSelectedDay}
          />

          {/* Filter chips — class + teacher. Each chip toggles a sheet picker;
              when a filter is active the chip shows the active value + an X. */}
          <View style={styles.filterRow}>
            <FilterChip
              icon="school-outline"
              activeLabel={filterClassLabel}
              defaultLabel="كل الصفوف"
              onPress={() => { haptics.light(); setShowClassFilter(true); }}
              onClear={filterClassId ? () => setFilterClassId(null) : undefined}
            />
            <FilterChip
              icon="person-outline"
              activeLabel={filterTeacherLabel}
              defaultLabel="كل الأساتذة"
              onPress={() => { haptics.light(); setShowTeacherFilter(true); }}
              onClear={filterTeacherId ? () => setFilterTeacherId(null) : undefined}
            />
          </View>

          <ScheduleSlotList
            slots={slotsForDay}
            emptyLabel={t('institute.noLessonsToday')}
            unspecifiedLabel={t('common.unspecified')}
            onSlotPress={openEditModal}
            onSlotDelete={handleDeleteSlot}
          />

          <AddSlotButton
            label={t('institute.addLesson')}
            onPress={openNewSlot}
          />

          <View style={{ marginTop: 8, marginBottom: 4 }}>
            <SectionLabel title={t('institute.examSchedule')} icon="document-text-outline" />
          </View>
          <ScheduleExamList
            exams={exams}
            emptyLabel={t('institute.noExams')}
            statusActiveLabel={t('institute.statusActive')}
            statusDraftLabel={t('institute.statusDraft')}
          />

          <View style={{ height: 30 }} />
        </View>
      </ScrollView>

      {/* Edit Slot Sheet */}
      <ScheduleSlotEditSheet
        visible={editModalVisible}
        isEditing={!!editSlot}
        dayLabel={dayLabel}
        subject={editSubject}
        room={editRoom}
        startTime={editStartTime}
        endTime={editEndTime}
        classId={editClassId}
        teacherId={editTeacherId}
        className={className}
        teacherName={teacherName}
        saving={saving}
        onClose={() => setEditModalVisible(false)}
        onChangeSubject={setEditSubject}
        onChangeRoom={setEditRoom}
        onOpenClassPicker={() => setShowClassPicker(true)}
        onOpenTeacherPicker={() => setShowTeacherPicker(true)}
        onOpenStartTimePicker={() => setShowStartTimePicker(true)}
        onOpenEndTimePicker={() => setShowEndTimePicker(true)}
        onSave={handleSaveSlot}
      />

      {/* Class picker sheet */}
      <PickerListSheet
        visible={showClassPicker}
        title="اختر الصف"
        emptyLabel="لا توجد صفوف — أضف صفاً من صفحة الصفوف أولاً"
        options={classes.map((c) => ({ id: c.id, label: c.name }))}
        selectedId={editClassId}
        onSelect={(id) => { setEditClassId(id); setShowClassPicker(false); }}
        onClose={() => setShowClassPicker(false)}
      />

      {/* Teacher picker sheet */}
      <PickerListSheet
        visible={showTeacherPicker}
        title="اختر الأستاذ"
        emptyLabel="لا يوجد أساتذة مسجّلون بعد"
        options={teachers.map((tt) => ({ id: tt.id, label: tt.full_name }))}
        selectedId={editTeacherId}
        onSelect={(id) => { setEditTeacherId(id); setShowTeacherPicker(false); }}
        onClose={() => setShowTeacherPicker(false)}
      />

      {/* Start time picker */}
      <PickerListSheet
        visible={showStartTimePicker}
        title="وقت البداية"
        maxHeight={0.65}
        options={TIME_PRESETS.map((time) => ({ id: time, label: time }))}
        selectedId={editStartTime}
        onSelect={(id) => { setEditStartTime(id); setShowStartTimePicker(false); }}
        onClose={() => setShowStartTimePicker(false)}
      />

      {/* End time picker — disable options <= start time so user can't pick an invalid range */}
      <PickerListSheet
        visible={showEndTimePicker}
        title="وقت النهاية"
        maxHeight={0.65}
        options={TIME_PRESETS.map((time) => ({
          id: time,
          label: time,
          disabled: toMinutes(time) <= toMinutes(editStartTime),
        }))}
        selectedId={editEndTime}
        onSelect={(id) => { setEditEndTime(id); setShowEndTimePicker(false); }}
        onClose={() => setShowEndTimePicker(false)}
      />

      {/* Skipped slots after Smart Generate — admin sees exactly which slots couldn't be filled */}
      <SkippedSlotsSheet
        visible={skippedSheetVisible}
        skipped={skippedSlots}
        onClose={() => setSkippedSheetVisible(false)}
      />

      {/* PDF export class filter — pick "all" or a specific class */}
      <PickerListSheet
        visible={showExportPicker}
        title="اختر ما يُصدَّر"
        emptyLabel="لا توجد صفوف"
        options={[
          { id: '__all__', label: 'كل الصفوف (جدول كامل)' },
          ...classes.map((c) => ({ id: c.id, label: c.name })),
        ]}
        selectedId={null}
        onSelect={(id) => {
          setShowExportPicker(false);
          handleExportPDF(id === '__all__' ? null : id);
        }}
        onClose={() => setShowExportPicker(false)}
      />

      {/* View-filter sheets — purely client-side filters over the loaded
          timetable; no extra network calls. */}
      <PickerListSheet
        visible={showClassFilter}
        title="فلترة حسب الصف"
        emptyLabel="لا توجد صفوف"
        options={[
          { id: '__all__', label: 'كل الصفوف' },
          ...classes.map((c) => ({ id: c.id, label: c.name })),
        ]}
        selectedId={filterClassId ?? '__all__'}
        onSelect={(id) => {
          setFilterClassId(id === '__all__' ? null : id);
          setShowClassFilter(false);
        }}
        onClose={() => setShowClassFilter(false)}
      />

      <PickerListSheet
        visible={showTeacherFilter}
        title="فلترة حسب الأستاذ"
        emptyLabel="لا يوجد أساتذة"
        options={[
          { id: '__all__', label: 'كل الأساتذة' },
          ...teachers.map((tt) => ({ id: tt.id, label: tt.full_name })),
        ]}
        selectedId={filterTeacherId ?? '__all__'}
        onSelect={(id) => {
          setFilterTeacherId(id === '__all__' ? null : id);
          setShowTeacherFilter(false);
        }}
        onClose={() => setShowTeacherFilter(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  contentArea: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'flex-start',
  },
  statIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
});
