import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { exportSchedulePDF } from '../../services/pdfExport';
import { syncToCalendar } from '../../services/calendarSync';
import { haptics } from '../../utils/haptics';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import DayChip from '../../components/teacher/chips/DayChip';
import TagChip from '../../components/teacher/chips/TagChip';
import PrimaryButton from '../../components/teacher/buttons/PrimaryButton';
import LessonNoteSheet from '../../components/teacher/schedule/LessonNoteSheet';
const SUBJECT_COLORS = ['#1D4ED8', '#059669', '#B45309', '#7C3AED', '#DC2626', '#0891B2', '#CA8A04'];

function getSubjectColor(subject: string) {
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = subject.charCodeAt(i) + ((hash << 5) - hash);
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
}

function formatTime(t: string) {
  if (!t) return '';
  return t.substring(0, 5);
}

export default function TeacherSchedule() {
  const { userId } = useAuthStore();
  const { t } = useTranslation();
  const { institutes, userInstituteId } = useDataStore();
  const isInteractiveEnabled = useFeatureFlag('interactive_schedule');

  // Lesson-notes sheet — opens on long-press of a slot. We compute the
  // calendar date that the selected day_of_week falls on within the current
  // week so the note is attached to the correct occurrence.
  const [lessonNoteSlot, setLessonNoteSlot] = useState<any | null>(null);

  const instType = (institutes.find(i => i.id === userInstituteId) as any)?.type || 'school';
  const ALL_DAYS = [t('teacherSchedule.saturday'), t('teacherSchedule.sunday'), t('teacherSchedule.monday'), t('teacherSchedule.tuesday'), t('teacherSchedule.wednesday'), t('teacherSchedule.thursday'), t('teacherSchedule.friday')];
  const DAY_INDICES = instType === 'institute' ? [6, 0, 1, 2, 3, 4, 5] : [6, 0, 1, 2, 3, 4];
  const DAYS = DAY_INDICES.map(i => ALL_DAYS[i === 6 ? 0 : i === 5 ? 6 : i + 1]); // Map to labels

  const [schedule, setSchedule] = useState<any[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date().getDay();
    return DAY_INDICES.includes(d) ? DAY_INDICES.indexOf(d) : 0;
  });
  // Re-sync when institute type resolves from default 'school' to actual
  const [didDayInit, setDidDayInit] = useState(false);
  useEffect(() => {
    if (!didDayInit && userInstituteId) {
      const d = new Date().getDay();
      setSelectedDay(DAY_INDICES.includes(d) ? DAY_INDICES.indexOf(d) : 0);
      setDidDayInit(true);
    }
  }, [userInstituteId, instType]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSchedule = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.getTeacherSchedule(userId);
      setSchedule(data);
      // Fetch publish state to surface a muted "last published" pill for the teacher
      if (userInstituteId) {
        try {
          const { supabase: sb } = await import('../../services/supabase');
          const { data: ps } = await sb
            .from('timetable_publish_state')
            .select('published_at')
            .eq('institute_id', userInstituteId)
            .maybeSingle();
          setPublishedAt((ps as any)?.published_at || null);
        } catch { /* silent — badge stays hidden */ }
      }
      // Schedule reminders
      try {
        const { scheduleClassReminders } = await import('../../services/classReminders');
        await scheduleClassReminders(data || []);
      } catch { /* silent */ }
    } catch (err) { console.error(err); } finally {
      setLoading(false);
    }
  }, [userId, userInstituteId]);

  useEffect(() => { loadSchedule(); }, [userId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadSchedule(); } finally { setRefreshing(false); }
  }, [loadSchedule]);

  const todaySlots = schedule
    .filter((s: any) => s.day_of_week === selectedDay)
    .sort((a: any, b: any) => (a.start_time || '').localeCompare(b.start_time || ''));

  // Find current/next class
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = now.getDay() === DAY_INDICES[selectedDay];

  const toMin = (t: string) => {
    const [h, m] = (t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const nextSlotId = isToday
    ? todaySlots.find((s: any) => toMin(s.start_time) > currentMinutes)?.id
    : null;

  // Weekly summary for the hero strip — lightweight, no extra queries.
  // schedule rows use the picker-index for day_of_week (preserved from existing logic above).
  const totalSlotsThisWeek = schedule.length;
  const busiestDayIdx = (() => {
    const counts = DAYS.map((_, i) => schedule.filter((s: any) => s.day_of_week === i).length);
    const max = Math.max(...counts);
    if (max === 0) return -1;
    return counts.indexOf(max);
  })();

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title={t('common.schedule')} showBack={false} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <View style={s.header}>
          <Text style={s.subtitle}>{t('teacherSchedule.lessonCount', { count: todaySlots.length })} — {DAYS[selectedDay]}</Text>
          {publishedAt && (
            <View style={s.publishPillWrap}>
              <TagChip
                tone="neutral"
                icon="checkmark-circle"
                label={`الجدول منشور · آخر تحديث ${new Date(publishedAt).toLocaleDateString('ar-IQ')}`}
              />
            </View>
          )}
        </View>

        {/* Weekly summary strip — 2 quick stats so the teacher gets context at a glance. */}
        {totalSlotsThisWeek > 0 && (
          <View style={s.statsStrip}>
            <View style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: tokens.color.infoBg }]}>
                <Ionicons name="calendar-clear" size={16} color={tokens.color.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.statLabel}>إجمالي الحصص الأسبوعية</Text>
                <Text style={s.statValue}>{totalSlotsThisWeek}</Text>
              </View>
            </View>
            {busiestDayIdx >= 0 && (
              <View style={s.statCard}>
                <View style={[s.statIconWrap, { backgroundColor: tokens.color.warningBg }]}>
                  <Ionicons name="flame" size={16} color={tokens.color.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.statLabel}>أكثر يوم ازدحاماً</Text>
                  <Text style={s.statValue}>{DAYS[busiestDayIdx]}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Day tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 16, flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DAYS.map((day, i) => {
              const isActive = selectedDay === i;
              // Friday is the last entry in DAY_INDICES for institute type — muted for school type it's not present.
              const realDow = DAY_INDICES[i];
              const isFriday = realDow === 5;
              return (
                <DayChip
                  key={i}
                  label={day}
                  dayNumber={i + 1}
                  active={isActive}
                  muted={isFriday && instType !== 'institute' ? false : isFriday}
                  onPress={() => setSelectedDay(i)}
                />
              );
            })}
          </View>
        </ScrollView>

        {/* Lessons */}
        <View style={{ paddingHorizontal: 16 }}>
          {todaySlots.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={tokens.color.text3} />
              <Text style={s.emptyText}>{t('teacherSchedule.noLessonsToday')}</Text>
            </View>
          ) : (
            todaySlots.map((slot: any) => {
              const color = slot.color || getSubjectColor(slot.subject || '');
              const startMin = toMin(slot.start_time);
              const endMin = toMin(slot.end_time);
              const isCurrent = isToday && currentMinutes >= startMin && currentMinutes < endMin;
              const isNext = slot.id === nextSlotId;
              const isPast = isToday && currentMinutes >= endMin;
              const isCancelled = slot.status === 'cancelled';

              return (
                <TouchableOpacity
                  key={slot.id}
                  onLongPress={() => { haptics.medium(); setLessonNoteSlot(slot); }}
                  delayLongPress={350}
                  activeOpacity={0.9}
                  style={[s.slotCard, isCancelled && { opacity: 0.5 }, isPast && !isCurrent && { opacity: 0.6 }, isCurrent && { borderColor: tokens.color.success, borderWidth: 1.5 }]}
                >
                  <View style={[s.slotColorBar, { backgroundColor: color }]} />
                  <View style={s.slotContent}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {isCurrent && (
                          <View style={[s.badge, { backgroundColor: tokens.color.successBg, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.color.success }} />
                            <Text style={{ fontSize: 9, fontWeight: '800', color: tokens.color.success }}>{t('teacherSchedule.now')}</Text>
                          </View>
                        )}
                        {isNext && (
                          <View style={[s.badge, { backgroundColor: tokens.color.brand500 + '20' }]}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: tokens.color.brand500 }}>التالي</Text>
                          </View>
                        )}
                        {isCancelled && (
                          <View style={[s.badge, { backgroundColor: tokens.color.dangerBg }]}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: tokens.color.danger }}>{t('teacherSchedule.cancelled')}</Text>
                          </View>
                        )}
                        {slot.status === 'substitute' && (
                          <View style={[s.badge, { backgroundColor: tokens.color.warningBg }]}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: tokens.color.warning }}>{t('teacherSchedule.substitute')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.slotSubject}>{slot.subject}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={s.slotTime}>{formatTime(slot.start_time)} - {formatTime(slot.end_time)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {slot.room && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={s.slotMeta}>{slot.room}</Text>
                            <Ionicons name="location" size={12} color={tokens.color.text3} />
                          </View>
                        )}
                        {(slot.classes as any)?.name && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={s.slotMeta}>{(slot.classes as any).name}</Text>
                            <Ionicons name="people" size={12} color={tokens.color.text3} />
                          </View>
                        )}
                      </View>
                    </View>
                    {slot.notes && (
                      <Text style={{ fontSize: 11, color: tokens.color.warning, marginTop: 4, textAlign: 'right' }}>{slot.notes}</Text>
                    )}
                    {/* Discoverability hint — long-press affordance. */}
                    <Text style={s.longPressHint}>اضغط مطوّلاً لإضافة ملاحظة الدرس</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Bottom actions */}
        {isInteractiveEnabled && (
          <View style={s.actionRow}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={t('teacherSchedule.exportPdf', { defaultValue: 'تصدير PDF' })}
                icon="document"
                gradient="info"
                fullWidth
                onPress={() => exportSchedulePDF(schedule, t('teacher.scheduleTitle'))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={t('teacherSchedule.calendarSync', { defaultValue: 'مزامنة التقويم' })}
                icon="calendar"
                gradient="success"
                fullWidth
                onPress={() => syncToCalendar(schedule)}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Lesson note sheet — opens on long-press of a slot card. lessonDate is
          computed to the actual calendar date of the selected weekday within
          the current week so the note attaches to the right occurrence. */}
      {lessonNoteSlot && userId && userInstituteId ? (() => {
        const today = new Date();
        const selectedDow = DAY_INDICES[selectedDay];
        const deltaDays = (selectedDow - today.getDay() + 7) % 7;
        // If the slot is today's day_of_week — use today; else use the upcoming
        // occurrence within this week. Past slots also resolve to "today" plus
        // delta (which lands on the next week's instance) — close enough; the
        // teacher can edit the date semantics in a future iteration.
        const d = new Date(today);
        d.setDate(d.getDate() + deltaDays);
        const lessonDate = d.toISOString().slice(0, 10);
        const timeLabel = `${formatTime(lessonNoteSlot.start_time)}—${formatTime(lessonNoteSlot.end_time)}`;
        return (
          <LessonNoteSheet
            visible={!!lessonNoteSlot}
            onClose={() => setLessonNoteSlot(null)}
            instituteId={userInstituteId}
            teacherId={userId}
            timetableId={lessonNoteSlot.id}
            lessonDate={lessonDate}
            subject={lessonNoteSlot.subject}
            timeLabel={timeLabel}
          />
        );
      })() : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: tokens.color.text, textAlign: 'right' },
  subtitle: { fontSize: 13, color: tokens.color.text2, textAlign: 'right', marginTop: 4 },
  slotCard: { flexDirection: 'row', backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, marginBottom: 10, borderWidth: 1, borderColor: tokens.color.border, overflow: 'hidden' },
  longPressHint: { fontSize: 10, color: tokens.color.text4, marginTop: 6, textAlign: 'right' },
  slotColorBar: { width: 5 },
  slotContent: { flex: 1, padding: 14 },
  slotSubject: { fontSize: 15, fontWeight: '800', color: tokens.color.text },
  slotTime: { fontSize: 12, fontWeight: '600', color: tokens.color.brand500 },
  slotMeta: { fontSize: 11, color: tokens.color.text3 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: tokens.color.text3, marginTop: 12 },
  publishPillWrap: {
    alignSelf: 'flex-end',
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  statsStrip: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  statLabel: { fontSize: 10, color: tokens.color.text3, fontWeight: '700', textAlign: 'right' },
  statValue: { fontSize: 14, color: tokens.color.text, fontWeight: '900', textAlign: 'right' },
});
