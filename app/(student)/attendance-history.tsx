// StudentAttendanceHistory — day-by-day attendance log so the student can see
// exactly which days they were absent / late and what the reason was (when the
// admin recorded one). Complements the summary on stats.tsx.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  getMyAttendanceHistory, type AttendanceRow,
} from '../../services/studentService';

type StatusKey = 'present' | 'absent' | 'late' | 'excused';
const STATUS_STYLE: Record<string, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  present: { bg: tokens.semantic.successBg, fg: tokens.semantic.success, icon: 'checkmark-circle', label: 'حاضر' },
  late:    { bg: tokens.semantic.warningBg, fg: tokens.semantic.warning, icon: 'time',             label: 'متأخر' },
  absent:  { bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger,  icon: 'close-circle',     label: 'غائب' },
  excused: { bg: tokens.surface.surface2,   fg: tokens.text[3],          icon: 'document-text-outline', label: 'بعذر' },
};

type Filter = 'all' | StatusKey;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',     label: 'الكل' },
  { key: 'absent',  label: 'الغياب' },
  { key: 'late',    label: 'التأخر' },
  { key: 'present', label: 'الحضور' },
];

export default function StudentAttendanceHistory() {
  const { userId } = useAuthStore();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getMyAttendanceHistory(userId, { limit: 180 });
      setRows(data);
    } catch (err) {
      if (__DEV__) console.error('[attendance-history] load', err);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0, total: rows.length };
    for (const r of rows) {
      const s = (r.status || '').toLowerCase();
      if (s in c) (c as any)[s]++;
    }
    return c;
  }, [rows]);

  const rate = counts.total > 0
    ? Math.round(((counts.present + counts.late) / counts.total) * 100)
    : 0;

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => (r.status || '').toLowerCase() === filter);
  }, [rows, filter]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="سجل الحضور"
        subtitle="يوم بيوم"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        fallbackRoute="/(student)/services"
      />

      {/* Summary strip */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{rate}%</Text>
          <Text style={styles.summaryLabel}>نسبة الحضور</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: tokens.semantic.success }]}>{counts.present}</Text>
          <Text style={styles.summaryLabel}>حاضر</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: tokens.semantic.warning }]}>{counts.late}</Text>
          <Text style={styles.summaryLabel}>متأخر</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: tokens.semantic.danger }]}>{counts.absent}</Text>
          <Text style={styles.summaryLabel}>غائب</Text>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity key={f.key}
              onPress={() => { haptics.selection(); setFilter(f.key); }}
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
            <SkeletonList count={8} cardHeight={56} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="calendar-clear-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>
              {filter === 'all' ? 'لا توجد سجلات' : 'لا توجد سجلات مطابقة'}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
            {filtered.map((r, idx) => {
              const st = STATUS_STYLE[(r.status || '').toLowerCase()] || STATUS_STYLE.absent;
              return (
                <FadeSlideIn key={r.id} delay={Math.min(idx * 15, 300)} translateFrom={6}>
                  <View style={styles.row}>
                    <View style={[styles.iconWrap, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={18} color={st.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dateText}>{formatArDate(r.date)}</Text>
                      {r.justification_text ? (
                        <Text style={styles.justifyText} numberOfLines={2}>
                          {r.justification_text}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.statusLabel, { color: st.fg }]}>{st.label}</Text>
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

function formatArDate(ymd: string): string {
  try {
    return new Date(ymd).toLocaleDateString('ar-IQ', {
      weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return ymd; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  summary: {
    flexDirection: 'row-reverse',
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingVertical: 12,
    ...tokens.shadow.xs,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '900', color: tokens.text[1] },
  summaryLabel: { fontSize: 10, color: tokens.text[3], marginTop: 4 },
  divider: { width: 1, marginVertical: 8, backgroundColor: tokens.border[2] },
  chipsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row-reverse',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[2],
  },
  chipActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  chipTextActive: { color: '#fff' },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[2],
  },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 13, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },
  justifyText: { fontSize: 11, color: tokens.text[3], marginTop: 2, textAlign: 'right' },
  statusLabel: { fontSize: 12, fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 80, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
});
