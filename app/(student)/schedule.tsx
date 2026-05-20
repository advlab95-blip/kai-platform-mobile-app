import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useStudentStore from '../../stores/studentStore';
import useDataStore from '../../stores/dataStore';
import { exportSchedulePDF } from '../../services/pdfExport';
import { syncToCalendar } from '../../services/calendarSync';
import { haptics } from '../../utils/haptics';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import DayChip from '../../components/teacher/chips/DayChip';
import TagChip from '../../components/teacher/chips/TagChip';
import IconButton from '../../components/teacher/buttons/IconButton';

// Full week — filtered by institution type inside component
const ALL_DAYS = [
  { index: 6, label: 'السبت', num: 1 },
  { index: 0, label: 'الأحد', num: 2 },
  { index: 1, label: 'الإثنين', num: 3 },
  { index: 2, label: 'الثلاثاء', num: 4 },
  { index: 3, label: 'الأربعاء', num: 5 },
  { index: 4, label: 'الخميس', num: 6 },
  { index: 5, label: 'الجمعة', num: 7 },
];

// Deterministic subject color palette — hash into fixed gradients so the same
// subject always renders with the same accent bar across sessions/devices.
const SUBJECT_COLORS: Record<string, string[]> = {
  default: ['#0F766E', '#14B8A6'],
  0: ['#0D9488', '#14B8A6'],
  1: ['#1E3A8A', '#3B82F6'],
  2: ['#7C3AED', '#8B5CF6'],
  3: ['#B45309', '#F59E0B'],
  4: ['#065F46', '#10B981'],
  5: ['#DC2626', '#EF4444'],
  6: ['#0369A1', '#0EA5E9'],
};

function getSubjectColor(subject: string): string[] {
  const hash = subject.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const key = String(hash % 7);
  return SUBJECT_COLORS[key] || SUBJECT_COLORS.default;
}

const formatTime = (t: string) => {
  if (!t) return '';
  const match = t.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : t.slice(0, 5);
};

export default function StudentSchedule() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { weeklyTimetable, classId, selectedClassId, loadTimetable } = useStudentStore();
  const { institutes, userInstituteId } = useDataStore();

  const instType = (institutes.find(i => i.id === userInstituteId) as any)?.type || 'school';
  // School: sat-thu (6 days, no friday). Institute: sat-fri (7 days).
  const DAYS = useMemo(
    () => (instType === 'institute' ? ALL_DAYS : ALL_DAYS.filter(d => d.index !== 5)),
    [instType]
  );

  const initialToday = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(DAYS.some(d => d.index === initialToday) ? initialToday : DAYS[0].index);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  // Auto-select today every time the screen is focused — handles tab returns
  // and date rollovers (e.g. user opened app at night, comes back next day).
  useFocusEffect(
    useCallback(() => {
      const today = new Date().getDay();
      const next = DAYS.some(d => d.index === today) ? today : DAYS[0].index;
      setSelectedDay(next);
    }, [DAYS])
  );

  const [refreshing, setRefreshing] = useState(false);

  const activeClassId = selectedClassId || classId;

  useEffect(() => {
    if (activeClassId) {
      loadTimetable(activeClassId);
    }
  }, [activeClassId]);

  // Fetch publish state so the student sees whether the timetable they view is published.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userInstituteId) return;
      try {
        const { supabase: sb } = await import('../../services/supabase');
        const { data: ps } = await sb
          .from('timetable_publish_state')
          .select('published_at')
          .eq('institute_id', userInstituteId)
          .maybeSingle();
        if (!cancelled) setPublishedAt((ps as any)?.published_at || null);
      } catch { /* silent — badge stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, [userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (activeClassId) await loadTimetable(activeClassId);
    } finally {
      setRefreshing(false);
    }
  }, [activeClassId]);

  const handleExportPDF = useCallback(() => {
    haptics.selection();
    exportSchedulePDF(weeklyTimetable, 'الجدول الأسبوعي');
  }, [weeklyTimetable]);

  const handleSyncCalendar = useCallback(() => {
    haptics.selection();
    syncToCalendar(weeklyTimetable);
  }, [weeklyTimetable]);

  const dayLessons = weeklyTimetable.filter((tt: any) => tt.day_of_week === selectedDay);

  const headerActions = (
    <View style={styles.headerActions}>
      <IconButton
        icon="download-outline"
        onPress={handleExportPDF}
        accessibilityLabel="تنزيل PDF"
      />
      <IconButton
        icon="calendar-outline"
        onPress={handleSyncCalendar}
        accessibilityLabel="مزامنة مع التقويم"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('common.schedule')}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
        showBack={true}
        fallbackRoute="/(student)/services"
        right={headerActions}
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
      >
        {/* Published pill */}
        {publishedAt ? (
          <View style={styles.pillRow}>
            <TagChip
              tone="success"
              icon="checkmark-circle"
              label={`منشور · ${new Date(publishedAt).toLocaleDateString('ar-IQ')}`}
            />
          </View>
        ) : null}

        {/* Day chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayScroll}
          contentContainerStyle={styles.dayContainer}
        >
          {DAYS.map((day) => (
            <DayChip
              key={day.index}
              label={day.label}
              dayNumber={day.num}
              active={selectedDay === day.index}
              accent="student"
              showNumber={false}
              onPress={() => setSelectedDay(day.index)}
            />
          ))}
        </ScrollView>

        {/* Lessons */}
        <View style={styles.contentArea}>
          {dayLessons.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="calendar-outline" size={44} color={tokens.color.teal600} />
              </View>
              <Text style={styles.emptyTitle}>{t('student.noClasses')}</Text>
              <Text style={styles.emptySubtitle}>{t('student.noClassesForDay')}</Text>
            </View>
          ) : (
            dayLessons.map((lesson: any, idx: number) => {
              const colors = getSubjectColor(lesson.subject || '');
              return (
                <View key={lesson.id || idx} style={styles.lessonCard}>
                  <LinearGradient
                    colors={colors as [string, string]}
                    style={styles.lessonColorBar}
                  />
                  <View style={styles.lessonTime}>
                    <Text style={styles.lessonTimeStart}>
                      {formatTime(lesson.start_time || '')}
                    </Text>
                    <View style={styles.timeLine} />
                    <Text style={styles.lessonTimeEnd}>
                      {formatTime(lesson.end_time || '')}
                    </Text>
                  </View>
                  <View style={styles.lessonInfo}>
                    <Text style={styles.lessonSubject} numberOfLines={1}>
                      {lesson.subject || t('student.subjectFallback')}
                    </Text>
                    <View style={styles.lessonMetaRow}>
                      <View style={styles.lessonMetaItem}>
                        <Ionicons name="person-outline" size={12} color={tokens.color.text3} />
                        <Text style={styles.lessonMetaText} numberOfLines={1}>
                          {lesson.users?.full_name || t('student.theTeacher')}
                        </Text>
                      </View>
                      {lesson.room ? (
                        <View style={styles.lessonMetaItem}>
                          <Ionicons name="location-outline" size={12} color={tokens.color.text3} />
                          <Text style={styles.lessonMetaText} numberOfLines={1}>{lesson.room}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  dayScroll: {
    marginTop: 14,
    marginBottom: 16,
  },
  dayContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  contentArea: {
    paddingHorizontal: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: tokens.color.teal50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  emptySubtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
  },
  lessonCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  lessonColorBar: {
    width: 5,
  },
  lessonTime: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  lessonTimeStart: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    fontVariant: ['tabular-nums'],
  },
  timeLine: {
    width: 1,
    height: 16,
    backgroundColor: tokens.color.border,
    marginVertical: 4,
  },
  lessonTimeEnd: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text3,
    fontVariant: ['tabular-nums'],
  },
  lessonInfo: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: tokens.color.border2,
    justifyContent: 'center',
  },
  lessonSubject: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  lessonMetaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 14,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  lessonMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lessonMetaText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
  },
});
