// StudentCalendar — read-only academic calendar (holidays, exam weeks, events)
// pulled from the same academic_calendar_events table the institute admin
// manages. RLS on the table already permits institute members to SELECT.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SectionLabel from '../../components/institute/SectionLabel';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  getCalendarEventsForStudent, type CalendarEventPublic,
} from '../../services/studentService';

const CATEGORY_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }> = {
  holiday:    { label: 'عطلة',       icon: 'sunny-outline',    bg: tokens.semantic.warningBg, fg: tokens.semantic.warning },
  exam:       { label: 'امتحان',     icon: 'flask-outline',    bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger },
  conference: { label: 'مؤتمر',      icon: 'megaphone-outline', bg: tokens.semantic.infoBg,   fg: tokens.semantic.info },
  meeting:    { label: 'اجتماع',     icon: 'people-outline',   bg: tokens.semantic.purpleBg,  fg: tokens.semantic.purple },
  event:      { label: 'فعالية',     icon: 'sparkles-outline', bg: tokens.brand[100],         fg: tokens.brand[500] },
  general:    { label: 'عام',        icon: 'calendar-outline', bg: tokens.surface.surface2,   fg: tokens.text[2] },
};

type Filter = 'upcoming' | 'all' | 'past';

export default function StudentCalendar() {
  const { userInstituteId } = useDataStore();
  const [events, setEvents] = useState<CalendarEventPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('upcoming');

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const data = await getCalendarEventsForStudent(userInstituteId);
      setEvents(data);
    } catch (err) {
      if (__DEV__) console.error('[calendar] load', err);
    }
  }, [userInstituteId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (filter === 'all') return events;
    if (filter === 'past') {
      return events.filter((e) => e.end_date < today)
        .sort((a, b) => b.start_date.localeCompare(a.start_date));
    }
    // upcoming = end_date >= today
    return events.filter((e) => e.end_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [events, filter]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="التقويم الأكاديمي"
        subtitle="العطل والفعاليات والمواعيد"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(124,58,237,0.30)"
        fallbackRoute="/(student)/services"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}>
        {([
          { k: 'upcoming', label: 'القادمة' },
          { k: 'all',      label: 'الكل' },
          { k: 'past',     label: 'السابقة' },
        ] as { k: Filter; label: string }[]).map((f) => {
          const active = filter === f.k;
          return (
            <TouchableOpacity key={f.k}
              onPress={() => { haptics.selection(); setFilter(f.k); }}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.85}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={5} cardHeight={88} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="calendar-clear-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد أحداث</Text>
            <Text style={styles.emptyHint}>
              {filter === 'upcoming' ? 'لا توجد فعاليات قادمة حالياً' : 'لا توجد أحداث للعرض'}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            {filtered.map((ev, idx) => {
              const meta = CATEGORY_META[ev.category] || CATEGORY_META.general;
              const single = ev.start_date === ev.end_date;
              const dateLabel = single
                ? formatDate(ev.start_date)
                : `${formatDate(ev.start_date)} → ${formatDate(ev.end_date)}`;
              const accent = ev.color || meta.fg;
              return (
                <FadeSlideIn key={ev.id} delay={idx * 30} translateFrom={8}>
                  <View style={styles.card}>
                    <View style={[styles.colorBar, { backgroundColor: accent }]} />
                    <View style={styles.cardBody}>
                      <View style={styles.cardHeader}>
                        <View style={[styles.chip, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={12} color={meta.fg} />
                          <Text style={[styles.chipText, { color: meta.fg }]}>
                            {meta.label}
                          </Text>
                        </View>
                        <Text style={styles.titleText} numberOfLines={2}>{ev.title}</Text>
                      </View>
                      <Text style={styles.dateText}>{dateLabel}</Text>
                      {!ev.all_day && ev.start_time ? (
                        <Text style={styles.timeText}>
                          {ev.start_time.slice(0, 5)}{ev.end_time ? ` — ${ev.end_time.slice(0, 5)}` : ''}
                        </Text>
                      ) : null}
                      {ev.description ? (
                        <Text style={styles.descText} numberOfLines={3}>{ev.description}</Text>
                      ) : null}
                    </View>
                  </View>
                </FadeSlideIn>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(ymd: string): string {
  try {
    return new Date(ymd).toLocaleDateString('ar-IQ', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return ymd; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row-reverse' },
  chip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2],
  },
  chipActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  chipTextActive: { color: '#fff' },

  card: {
    flexDirection: 'row-reverse',
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    overflow: 'hidden',
    ...tokens.shadow.xs,
  },
  colorBar: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleText: { flex: 1, fontSize: 14, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  dateText: { fontSize: 12, fontWeight: '700', color: tokens.text[2], textAlign: 'right' },
  timeText: { fontSize: 11, color: tokens.text[3], textAlign: 'right' },
  descText: { fontSize: 12, color: tokens.text[2], lineHeight: 18, textAlign: 'right' },

  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 80, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
