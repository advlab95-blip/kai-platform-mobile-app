// ParentSchedule — child weekly schedule (brief §7.6).
// Data preserved verbatim:
//   api.getChildSchedule(selectedChildId, childInstituteId) — multi-tenant required
//   getSubjectColor() deterministic hash — same subject always same color
//   selectedDay defaults to today if in 0-4 range, else 0
//   cancelled status → row dimmed + red "ملغاة" pill
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';

import useParentStore from '../../stores/parentStore';
import ChildSwitcher from '../../components/shared/ChildSwitcher';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import DayChip from '../../components/parent/schedule/DayChip';
import LessonRow from '../../components/parent/schedule/LessonRow';
import { api } from '../../services/api';
import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const SUBJECT_COLORS = ['#1D4ED8', '#059669', '#B45309', '#7C3AED', '#DC2626', '#0891B2', '#CA8A04'];

function getSubjectColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return SUBJECT_COLORS[Math.abs(h) % SUBJECT_COLORS.length];
}

export default function ParentSchedule() {
  const { t } = useTranslation();
  const { selectedChildId, children } = useParentStore();
  const [schedule, setSchedule] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date().getDay();
    return d >= 0 && d <= 4 ? d : 0;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSchedule = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      setLoadError(null);
      const childInstituteId = children.find((c) => c.id === selectedChildId)?.instituteId;
      const data = await api.getChildSchedule(selectedChildId, childInstituteId || undefined);
      setSchedule(data);
    } catch (err: any) {
      setLoadError(err?.message || t('common.loadFailed', { defaultValue: 'فشل التحميل' }));
    }
  }, [selectedChildId, children, t]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  // Re-select today's day on every screen focus (so opening Monday morning
  // after using the app on Sunday lands on the correct day automatically).
  useFocusEffect(useCallback(() => {
    const d = new Date().getDay();
    if (d >= 0 && d <= 4) setSelectedDay(d);
  }, []));

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadSchedule(); } finally { setRefreshing(false); }
  }, [loadSchedule]);

  const todaySlots = schedule.filter((s: any) => s.day_of_week === selectedDay);
  const childName = children.find((c: any) => c.id === selectedChildId)?.name || '';
  const todayIdx = (() => {
    const d = new Date().getDay();
    return d >= 0 && d <= 4 ? d : -1;
  })();

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={
          childName
            ? t('parent.scheduleOf', { name: childName, defaultValue: 'جدول {{name}}' })
            : t('parent.scheduleTitle', { defaultValue: 'الجدول الأسبوعي' })
        }
        subtitle={t('parent.classCount', {
          count: todaySlots.length,
          day: DAYS[selectedDay],
          defaultValue: '{{count}} حصة — {{day}}',
        })}
        gradient={tokens.gradient.parent}
        glowAccent="rgba(167,139,250,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.p600} />
        }
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <ChildSwitcher />

        {/* Day tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayTabsScroll}
        >
          <View style={styles.dayTabsRow}>
            {DAYS.map((day, i) => (
              <DayChip
                key={i}
                label={day}
                count={schedule.filter((sl: any) => sl.day_of_week === i).length}
                active={selectedDay === i}
                isToday={todayIdx === i}
                onPress={() => { haptics.selection(); setSelectedDay(i); }}
              />
            ))}
          </View>
        </ScrollView>

        {/* Lessons */}
        <View style={{ paddingHorizontal: 16 }}>
          {todaySlots.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="calendar-outline" size={42} color={tokens.color.p600} />
              </View>
              <Text style={styles.emptyTitle}>
                {t('parent.noLessons', { defaultValue: 'لا توجد حصص' })}
              </Text>
              <Text style={styles.emptyHint}>
                {selectedChildId
                  ? `لا توجد حصص مسجلة يوم ${DAYS[selectedDay]}`
                  : 'اختر طفلاً من الأعلى لعرض جدوله'}
              </Text>
            </View>
          ) : (
            todaySlots.map((slot: any) => (
              <LessonRow
                key={slot.id}
                subject={slot.subject}
                startTime={slot.start_time}
                endTime={slot.end_time}
                teacherName={(slot.users as any)?.full_name}
                room={slot.room}
                cancelled={slot.status === 'cancelled'}
                accentColor={getSubjectColor(slot.subject || '')}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  subHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  subTitle: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  subSubtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 4,
  },
  dayTabsScroll: { paddingHorizontal: 16, marginBottom: 16, flexGrow: 0 },
  dayTabsRow: { flexDirection: 'row', gap: 8 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(167,139,250,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: 6,
  },
});
