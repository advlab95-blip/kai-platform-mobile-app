// TeacherMyWeek — unified 7-day overview combining timetable lessons + scheduled
// exams + active announcements for the institute.
//
// Different from (teacher)/schedule.tsx:
//   - schedule.tsx is the recurring weekly timetable (no calendar dates,
//     just day_of_week 0-6).
//   - my-week.tsx is a CALENDAR view of a specific week (Sun-Sat by default,
//     adjustable Sat-Fri for institutes) — useful to spot exam clashes,
//     plan ahead, or review what already happened.
//
// Multi-tenant: every query is filtered by teacher_id = me OR institute_id =
// my institute. RLS on the underlying tables is the second line of defense.
//
// No new deps; uses the existing timetables + exam_schedule_items + announcements
// schemas already exposed in services/api.ts.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SectionLabel from '../../components/institute/SectionLabel';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { supabase } from '../../services/supabase';

// ─────────────────────────────────────────────────────────────────────────
// Date helpers — kept inline to avoid pulling a date library for one screen.
// ─────────────────────────────────────────────────────────────────────────

const DAY_LABELS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Snap to the Sunday at-or-before the given date (Iraqi school week starts Sun).
function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = Sunday
  return addDays(x, -day);
}

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type Lesson = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string | null;
  class_name?: string | null;
  room: string | null;
};

type ExamItem = {
  id: string;
  exam_date: string;
  start_time: string;
  duration_minutes: number;
  subject_name: string;
  hall: string | null;
  class_name?: string | null;
};

type DayBundle = {
  date: Date;
  ymd: string;
  weekday: number;     // 0 (Sun) … 6 (Sat)
  lessons: Lesson[];
  exams: ExamItem[];
};

// ─────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────

export default function TeacherMyWeek() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();

  // anchor is any date inside the current visible week; we snap it to weekStart.
  const [anchor, setAnchor] = useState<Date>(new Date());
  const start = useMemo(() => weekStart(anchor), [anchor]);
  const end = useMemo(() => addDays(start, 6), [start]);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isThisWeek = useMemo(() => {
    const tw = weekStart(new Date());
    return tw.getTime() === start.getTime();
  }, [start]);

  // Pull this teacher's recurring timetable (institute-wide rows for me) + the
  // exams scheduled in this week. Both queries are bounded + teacher-scoped.
  const load = useCallback(async () => {
    if (!userId || !userInstituteId) return;
    setLoading(true);
    try {
      const startYmd = toYmd(start);
      const endYmd = toYmd(end);

      const [tt, ex] = await Promise.all([
        supabase
          .from('timetables')
          .select('id, day_of_week, start_time, end_time, subject, room, class_id')
          .eq('institute_id', userInstituteId)
          .eq('teacher_id', userId)
          .order('day_of_week')
          .order('start_time')
          .limit(200),
        supabase
          .from('exam_schedule_items')
          .select('id, exam_date, start_time, duration_minutes, subject_name, hall, class_id')
          .eq('institute_id', userInstituteId)
          .eq('teacher_id', userId)
          .gte('exam_date', startYmd)
          .lte('exam_date', endYmd)
          .order('exam_date')
          .order('start_time')
          .limit(100),
      ]);

      if (tt.error) throw tt.error;
      if (ex.error) throw ex.error;

      setLessons((tt.data as any[] as Lesson[]) || []);
      setExams((ex.data as any[] as ExamItem[]) || []);
    } catch (err) {
      if (__DEV__) console.error('[my-week] load', err);
    } finally {
      setLoading(false);
    }
  }, [userId, userInstituteId, start, end]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Build 7 day buckets, each enriched with lessons whose day_of_week matches
  // + exams whose exam_date matches the bucket's calendar date.
  const days: DayBundle[] = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(start, i);
      const ymd = toYmd(date);
      const wd = date.getDay();
      return {
        date,
        ymd,
        weekday: wd,
        lessons: lessons.filter((l) => l.day_of_week === wd),
        exams: exams.filter((e) => e.exam_date === ymd),
      };
    });
  }, [start, lessons, exams]);

  const goPrev = () => { haptics.selection(); setAnchor(addDays(anchor, -7)); };
  const goNext = () => { haptics.selection(); setAnchor(addDays(anchor, 7)); };
  const goToday = () => { haptics.selection(); setAnchor(new Date()); };

  const headerLabel = useMemo(() => {
    const s = start.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' });
    const e = end.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' });
    return `${s} → ${e}`;
  }, [start, end]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="أسبوعي"
        subtitle="الدروس + الامتحانات + الإعلانات"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        fallbackRoute="/(teacher)/services"
      />

      {/* Week navigator */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={goPrev} style={styles.navBtn} activeOpacity={0.8}>
          <Ionicons name="chevron-forward" size={18} color={tokens.text[2]} />
        </TouchableOpacity>
        <View style={styles.navLabelWrap}>
          <Text style={styles.navLabel}>{headerLabel}</Text>
          {!isThisWeek && (
            <TouchableOpacity onPress={goToday} activeOpacity={0.8} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>اليوم</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={goNext} style={styles.navBtn} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={18} color={tokens.text[2]} />
        </TouchableOpacity>
      </View>

      {loading && lessons.length === 0 && exams.length === 0 ? (
        <View style={{ paddingTop: 60 }}>
          <ActivityIndicator color={tokens.brand[500]} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
          }
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            {days.map((d, idx) => {
              const isToday = toYmd(new Date()) === d.ymd;
              const isEmpty = d.lessons.length === 0 && d.exams.length === 0;
              return (
                <FadeSlideIn key={d.ymd} delay={idx * 30} translateFrom={10}>
                  <View style={[styles.dayCard, isToday && styles.dayCardToday]}>
                    {/* Day header */}
                    <View style={styles.dayHeader}>
                      <View style={styles.dayCounts}>
                        {d.lessons.length > 0 && (
                          <View style={[styles.countPill, { backgroundColor: tokens.brand[100] }]}>
                            <Text style={[styles.countText, { color: tokens.brand[500] }]}>
                              {d.lessons.length} حصة
                            </Text>
                          </View>
                        )}
                        {d.exams.length > 0 && (
                          <View style={[styles.countPill, { backgroundColor: tokens.semantic.dangerBg }]}>
                            <Text style={[styles.countText, { color: tokens.semantic.danger }]}>
                              {d.exams.length} امتحان
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.dayLabelWrap}>
                        <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                          {DAY_LABELS[d.weekday]}
                        </Text>
                        <Text style={styles.daySub}>
                          {d.date.toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' })}
                          {isToday ? ' — اليوم' : ''}
                        </Text>
                      </View>
                    </View>

                    {isEmpty ? (
                      <Text style={styles.emptyDay}>لا يوجد شيء مجدول هذا اليوم</Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {d.exams.map((e) => (
                          <View key={`ex-${e.id}`} style={[styles.row, styles.examRow]}>
                            <View style={styles.rowIconWrap}>
                              <Ionicons name="flask-outline" size={16} color={tokens.semantic.danger} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {e.subject_name}
                              </Text>
                              <Text style={styles.rowSub} numberOfLines={1}>
                                {e.start_time.slice(0, 5)} • {e.duration_minutes} د
                                {e.hall ? ` • ${e.hall}` : ''}
                              </Text>
                            </View>
                            <View style={[styles.rowBadge, { backgroundColor: tokens.semantic.dangerBg }]}>
                              <Text style={[styles.rowBadgeText, { color: tokens.semantic.danger }]}>
                                امتحان
                              </Text>
                            </View>
                          </View>
                        ))}
                        {d.lessons.map((l) => (
                          <View key={`l-${l.id}`} style={styles.row}>
                            <View style={[styles.rowIconWrap, { backgroundColor: tokens.brand[100] }]}>
                              <Ionicons name="book-outline" size={16} color={tokens.brand[500]} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {l.subject || 'حصة'}
                              </Text>
                              <Text style={styles.rowSub} numberOfLines={1}>
                                {l.start_time?.slice(0, 5)}—{l.end_time?.slice(0, 5)}
                                {l.room ? ` • ${l.room}` : ''}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </FadeSlideIn>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },

  navRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1, borderColor: tokens.border[2],
    alignItems: 'center', justifyContent: 'center',
  },
  navLabelWrap: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'center',
  },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: tokens.brand[100],
  },
  todayBtnText: { fontSize: 11, fontWeight: '700', color: tokens.brand[500] },

  dayCard: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    padding: 14,
    gap: 10,
    ...tokens.shadow.xs,
  },
  dayCardToday: {
    borderColor: tokens.brand[500],
    borderWidth: 1.5,
  },
  dayHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayLabelWrap: {
    alignItems: 'flex-end',
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: tokens.text[1],
  },
  dayLabelToday: { color: tokens.brand[500] },
  daySub: {
    fontSize: 11,
    color: tokens.text[3],
    marginTop: 2,
  },
  dayCounts: {
    flexDirection: 'row-reverse',
    gap: 6,
  },
  countPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  countText: { fontSize: 11, fontWeight: '700' },

  emptyDay: {
    fontSize: 12,
    color: tokens.text[4],
    textAlign: 'right',
    paddingVertical: 6,
  },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2,
  },
  examRow: {
    backgroundColor: tokens.semantic.dangerBg + '40',
  },
  rowIconWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: tokens.semantic.dangerBg,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
  },
  rowSub: {
    fontSize: 11,
    color: tokens.text[3],
    textAlign: 'right',
    marginTop: 2,
  },
  rowBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  rowBadgeText: { fontSize: 10, fontWeight: '800' },
});
