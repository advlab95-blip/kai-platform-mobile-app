// شاشة ولي الأمر — جدول امتحانات أبنائه (متعدد الأبناء — تابز فرعية).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import { getParentUpcomingExams, type UpcomingExam } from '../../services/examScheduleService';
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

export default function ParentExamSchedule() {
  const { userId } = useAuthStore();
  const [byChild, setByChild] = useState<Record<string, UpcomingExam[]>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getParentUpcomingExams(userId);
      setByChild(data);
      const keys = Object.keys(data);
      if (keys.length > 0) setActiveKey(keys[0]);
    } catch (err) {
      console.error('load parent exams', err);
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

  const childKeys = useMemo(() => Object.keys(byChild), [byChild]);
  const allItems = activeKey ? (byChild[activeKey] || []) : [];
  const upcomingCount = allItems.filter((i) => !i.is_past).length;
  const pastCount = allItems.length - upcomingCount;
  const activeItems = allItems.filter((i) => tab === 'upcoming' ? !i.is_past : i.is_past);

  const grouped = useMemo(() => {
    const m = new Map<string, UpcomingExam[]>();
    for (const it of activeItems) {
      const k = it.date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    const entries = Array.from(m.entries());
    return tab === 'upcoming'
      ? entries.sort(([a], [b]) => a.localeCompare(b))
      : entries.sort(([a], [b]) => b.localeCompare(a));
  }, [activeItems, tab]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="جدول امتحانات أبنائك"
        subtitle="الإداري والفصلي بمكان واحد"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : childKeys.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="people-outline" size={44} color={tokens.brand[500]} />
          </View>
          <Text style={styles.emptyTitle}>لا يوجد أبناء مسجلون</Text>
          <Text style={styles.emptySubtitle}>راجع الإدارة لربط حسابك بأبنائك</Text>
        </View>
      ) : (
        <>
          {/* تابز الأبناء */}
          {childKeys.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 12 }}
            >
              {childKeys.map(k => {
                const name = k.split('|')[0];
                const active = k === activeKey;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => { haptics.selection(); setActiveKey(k); }}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="person"
                      size={12}
                      color={active ? '#fff' : tokens.text[3]}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Tabs: upcoming / past */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabPill, tab === 'upcoming' && styles.tabPillActive]}
              onPress={() => { haptics.selection(); setTab('upcoming'); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}>
                القادمة · {upcomingCount}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabPill, tab === 'past' && styles.tabPillActive]}
              onPress={() => { haptics.selection(); setTab('past'); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, tab === 'past' && styles.tabTextActive]}>
                المنتهية · {pastCount}
              </Text>
            </TouchableOpacity>
          </View>

          {activeItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Ionicons
                  name={tab === 'upcoming' ? 'calendar-clear-outline' : 'checkmark-done-outline'}
                  size={44}
                  color={tokens.brand[500]}
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
              contentContainerStyle={{ paddingTop: 4, paddingBottom: 60, paddingHorizontal: 16 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
              }
              showsVerticalScrollIndicator={false}
            >
              {grouped.map(([date, dayItems]) => (
                <View key={date} style={styles.dayBlock}>
                  <Text style={styles.dayTitle}>{fmtArDate(date)}</Text>
                  {dayItems.map(it => {
                    const isInstitute = it.source === 'institute';
                    const past = it.is_past;
                    return (
                      <View key={`${it.source}-${it.id}`} style={[styles.examCard, past && { backgroundColor: dtokens.color.surface2, opacity: 0.85 }]}>
                        <View style={[styles.examIconWrap, !isInstitute && { backgroundColor: '#E0F2FE' }]}>
                          <Ionicons
                            name={isInstitute ? 'document-text' : 'school'}
                            size={20}
                            color={isInstitute ? tokens.brand[500] : '#0284C7'}
                          />
                        </View>
                        <View style={styles.examMain}>
                          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <View style={[styles.sourceBadge, !isInstitute && { backgroundColor: '#E0F2FE' }]}>
                              <Text style={[styles.sourceBadgeText, { color: isInstitute ? tokens.brand[500] : '#0284C7' }]}>
                                {isInstitute ? 'إداري' : 'فصلي'}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.examSubject,
                                past && { color: tokens.text[3], textDecorationLine: 'line-through' as const },
                              ]}
                              numberOfLines={1}
                            >
                              {it.title}
                            </Text>
                          </View>
                          {it.topic ? (
                            <Text style={{ fontSize: 12, color: tokens.text[2], textAlign: 'right', marginBottom: 4 }} numberOfLines={2}>
                              الموضوع: {it.topic}
                            </Text>
                          ) : null}
                          <View style={styles.examMeta}>
                            <View style={styles.metaItem}>
                              <Ionicons name="time-outline" size={12} color={tokens.text[3]} />
                              <Text style={styles.metaText}>
                                {(it.start_time || '').slice(0, 5)} · {it.duration_minutes} د
                              </Text>
                            </View>
                            {it.hall ? (
                              <View style={styles.metaItem}>
                                <Ionicons name="location-outline" size={12} color={tokens.text[3]} />
                                <Text style={styles.metaText}>{it.hall}</Text>
                              </View>
                            ) : null}
                            {it.teacher_name ? (
                              <View style={styles.metaItem}>
                                <Ionicons name="person-outline" size={12} color={tokens.text[3]} />
                                <Text style={styles.metaText}>{it.teacher_name}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: tokens.text[1] },
  emptySubtitle: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },

  chip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1, borderColor: tokens.border[2],
    backgroundColor: tokens.surface.surface,
  },
  chipActive: {
    backgroundColor: tokens.brand[500],
    borderColor: tokens.brand[500],
  },
  chipText: { fontSize: 12, color: tokens.text[1], fontWeight: '700' },
  chipTextActive: { color: '#fff' },

  dayBlock: { marginTop: 12 },
  dayTitle: {
    fontSize: 13, fontWeight: '800', color: tokens.brand[500],
    textAlign: 'right', marginBottom: 8,
    paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: tokens.brand[100],
    borderRadius: tokens.radius.sm,
  },
  examCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: tokens.surface.surface,
    padding: 12,
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2],
    marginBottom: 8,
    ...tokens.shadow.xs,
  },
  examIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  examMain: { flex: 1, minWidth: 0 },
  examSubject: {
    fontSize: 14, fontWeight: '800',
    color: tokens.text[1], textAlign: 'right', marginBottom: 4,
  },
  examMeta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: tokens.text[3], fontWeight: '600' },

  tabsRow: {
    flexDirection: 'row-reverse', gap: 8,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4,
  },
  tabPill: {
    flex: 1, paddingVertical: 9, borderRadius: 999,
    backgroundColor: dtokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  tabPillActive: { backgroundColor: tokens.brand[500] },
  tabText: { fontSize: 13, fontWeight: '800', color: tokens.text[2] },
  tabTextActive: { color: '#fff' },

  sourceBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
    backgroundColor: tokens.brand[100],
  },
  sourceBadgeText: { fontSize: 10, fontWeight: '800' },
});
