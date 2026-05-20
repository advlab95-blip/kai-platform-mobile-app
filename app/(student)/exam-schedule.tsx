// شاشة الطالب — جدول الامتحانات الموحَّد.
// يدمج: امتحانات الإدارة (الشهرية/النهائية) + الامتحانات الفصلية للأستاذ.
// الامتحان اللي يعبر تاريخه ينظهر بشطب رمادي حتى يعرف الطالب انه خلص.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import { getStudentUpcomingExams, type UpcomingExam } from '../../services/examScheduleService';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { haptics } from '../../utils/haptics';

function fmtArDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch { return iso; }
}

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function StudentExamSchedule() {
  const { userId } = useAuthStore();
  const [items, setItems] = useState<UpcomingExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await getStudentUpcomingExams(userId);
      setItems(list);
    } catch (err) {
      console.error('load student exams', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const up: UpcomingExam[] = [];
    const ps: UpcomingExam[] = [];
    for (const it of items) (it.is_past ? ps : up).push(it);
    // past sorted descending (latest first), upcoming ascending (soonest first)
    ps.sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time));
    return { upcoming: up, past: ps };
  }, [items]);

  const visible = tab === 'upcoming' ? upcoming : past;
  const grouped = useMemo(() => {
    const m = new Map<string, UpcomingExam[]>();
    for (const it of visible) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    return Array.from(m.entries());
  }, [visible]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="جدول الامتحانات"
        subtitle="الإداري والفصلي بمكان واحد"
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
      />

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TabPill
          label={`القادمة · ${upcoming.length}`}
          active={tab === 'upcoming'}
          onPress={() => { haptics.selection(); setTab('upcoming'); }}
        />
        <TabPill
          label={`المنتهية · ${past.length}`}
          active={tab === 'past'}
          onPress={() => { haptics.selection(); setTab('past'); }}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={tokens.color.teal600} style={{ marginTop: 60 }} />
      ) : visible.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons
              name={tab === 'upcoming' ? 'calendar-clear-outline' : 'checkmark-done-outline'}
              size={44}
              color={tokens.color.teal600}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {tab === 'upcoming' ? 'لا توجد امتحانات قادمة' : 'لا توجد امتحانات منتهية'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {tab === 'upcoming'
              ? 'ستظهر الامتحانات هنا عند جدولتها من الإدارة أو الأستاذ'
              : 'الامتحانات التي مضى موعدها تنتقل هنا'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 60, paddingHorizontal: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.teal600} />
          }
          showsVerticalScrollIndicator={false}
        >
          {grouped.map(([date, dayItems]) => {
            const days = daysUntil(date);
            const isPast = days < 0;
            const dayBadge = isPast
              ? { text: 'انتهى', color: tokens.color.text3, bg: tokens.color.surface2 }
              : days === 0
                ? { text: 'اليوم', color: tokens.color.danger, bg: tokens.color.dangerBg }
                : days === 1
                  ? { text: 'غداً', color: tokens.color.warning, bg: tokens.color.warningBg }
                  : days <= 7
                    ? { text: `بعد ${days} أيام`, color: tokens.color.teal600, bg: tokens.color.teal50 }
                    : { text: `بعد ${days} يوم`, color: tokens.color.text2, bg: tokens.color.surface2 };

            return (
              <View key={date} style={styles.dayBlock}>
                <View style={styles.dayHeader}>
                  <View style={[styles.dayBadge, { backgroundColor: dayBadge.bg }]}>
                    <Text style={[styles.dayBadgeText, { color: dayBadge.color }]}>{dayBadge.text}</Text>
                  </View>
                  <Text style={[styles.dayTitle, isPast && styles.passedText]}>{fmtArDate(date)}</Text>
                </View>
                {dayItems.map(it => <ExamCard key={`${it.source}-${it.id}`} item={it} />)}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TabPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        onPress={onPress}
        style={[styles.tab, active && styles.tabActive]}
      >
        {label}
      </Text>
    </View>
  );
}

function ExamCard({ item }: { item: UpcomingExam }) {
  const isInstitute = item.source === 'institute';
  const past = item.is_past;
  return (
    <View style={[styles.examCard, past && styles.examCardPast]}>
      <View style={[styles.examIconWrap, isInstitute ? styles.iconInstitute : styles.iconTeacher]}>
        <Ionicons
          name={isInstitute ? 'document-text' : 'school'}
          size={20}
          color={isInstitute ? tokens.color.teal600 : '#0284C7'}
        />
      </View>
      <View style={styles.examMain}>
        <View style={styles.titleRow}>
          <View style={[styles.sourceBadge, isInstitute ? styles.badgeInstitute : styles.badgeTeacher]}>
            <Text style={[styles.sourceBadgeText, isInstitute ? styles.badgeTextInstitute : styles.badgeTextTeacher]}>
              {isInstitute ? 'إداري' : 'فصلي'}
            </Text>
          </View>
          <Text
            style={[styles.examSubject, past && styles.passedText, past && styles.strike]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
        </View>
        {item.topic ? (
          <Text style={[styles.topicText, past && styles.passedText]} numberOfLines={2}>
            الموضوع: {item.topic}
          </Text>
        ) : null}
        <View style={styles.examMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={12} color={tokens.color.text3} />
            <Text style={styles.metaText}>
              {(item.start_time || '').slice(0, 5)} · {item.duration_minutes} د
            </Text>
          </View>
          {item.hall ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={tokens.color.text3} />
              <Text style={styles.metaText}>{item.hall}</Text>
            </View>
          ) : null}
          {item.teacher_name ? (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={12} color={tokens.color.text3} />
              <Text style={styles.metaText}>{item.teacher_name}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {past && (
        <View style={styles.passedTag}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: tokens.color.teal50,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text },
  emptySubtitle: { fontSize: tokens.font.size.md, color: tokens.color.text3, textAlign: 'center' },

  tabsRow: {
    flexDirection: 'row-reverse', gap: 8,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  tab: {
    textAlign: 'center', paddingVertical: 9,
    fontSize: 13, fontWeight: '800',
    color: tokens.color.text2,
    backgroundColor: tokens.color.surface2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  tabActive: { backgroundColor: tokens.color.teal600, color: '#fff' },

  dayBlock: { marginTop: 12 },
  dayHeader: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    marginBottom: 8, paddingHorizontal: 4,
  },
  dayBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  dayBadgeText: { fontSize: 11, fontWeight: '800' },
  dayTitle: {
    flex: 1, fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold,
    color: tokens.color.text, textAlign: 'right',
  },

  examCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: tokens.color.surface,
    padding: 12,
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.color.border,
    marginBottom: 8,
    ...tokens.shadow.xs,
  },
  examCardPast: { backgroundColor: tokens.color.surface2, opacity: 0.85 },
  examIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  iconInstitute: { backgroundColor: tokens.color.teal50 },
  iconTeacher:   { backgroundColor: '#E0F2FE' },
  examMain: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 3 },
  examSubject: {
    flex: 1, fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text, textAlign: 'right',
  },
  topicText: { fontSize: 12, color: tokens.color.text2, textAlign: 'right', marginBottom: 4 },
  examMeta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  metaText: { fontSize: tokens.font.size.sm, color: tokens.color.text2, fontWeight: '600' },

  sourceBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 },
  badgeInstitute: { backgroundColor: tokens.color.teal50 },
  badgeTeacher:   { backgroundColor: '#E0F2FE' },
  sourceBadgeText: { fontSize: 10, fontWeight: '800' },
  badgeTextInstitute: { color: tokens.color.teal600 },
  badgeTextTeacher:   { color: '#0284C7' },

  passedText: { color: tokens.color.text3 },
  strike: { textDecorationLine: 'line-through' as const },
  passedTag: { paddingLeft: 4 },
});
