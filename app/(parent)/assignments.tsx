// ParentChildAssignments — parent's read-only view of their child's
// assignments + submission status (pending/submitted/late/graded).
//
// Bucketed by submission status so the parent can immediately spot what's
// outstanding. Tapping a card is read-only (no submit path here — submission
// stays in the student app).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useParentStore from '../../stores/parentStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import ChildSwitcher from '../../components/shared/ChildSwitcher';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  getChildAssignments, type ChildAssignmentRow,
} from '../../services/parentService';

const STATUS_META: Record<ChildAssignmentRow['submission_status'], { label: string; bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:   { label: 'لم يُسلَّم',     bg: tokens.semantic.warningBg, fg: tokens.semantic.warning, icon: 'time-outline' },
  submitted: { label: 'مُسلَّم',        bg: tokens.semantic.infoBg,    fg: tokens.semantic.info,    icon: 'checkmark-circle-outline' },
  graded:    { label: 'صُحِّح',         bg: tokens.semantic.successBg, fg: tokens.semantic.success, icon: 'trophy-outline' },
  late:      { label: 'متأخر',          bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger,  icon: 'alert-circle-outline' },
};

type Filter = 'all' | ChildAssignmentRow['submission_status'];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',       label: 'الكل' },
  { key: 'pending',   label: 'لم يُسلَّم' },
  { key: 'late',      label: 'متأخر' },
  { key: 'submitted', label: 'مُسلَّم' },
  { key: 'graded',    label: 'مُصحَّح' },
];

export default function ParentChildAssignments() {
  const { selectedChildId, children } = useParentStore();
  const selectedChild = children.find((c) => c.id === selectedChildId);
  const childInstituteId = (selectedChild as any)?.instituteId || null;

  const [items, setItems] = useState<ChildAssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!selectedChildId || !childInstituteId) { setItems([]); return; }
    setLoading(true);
    try {
      const data = await getChildAssignments(selectedChildId, childInstituteId);
      setItems(data);
    } catch (err) {
      if (__DEV__) console.error('[parent/assignments] load', err);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, childInstituteId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const counts = useMemo(() => {
    const c = { pending: 0, late: 0, submitted: 0, graded: 0 };
    for (const a of items) c[a.submission_status]++;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((a) => a.submission_status === filter);
  }, [items, filter]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="واجبات طفلي"
        subtitle={selectedChild ? selectedChild.name : 'اختر طفلاً'}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(20,184,166,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        <ChildSwitcher />

        {/* Summary strip */}
        {items.length > 0 && (
          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: tokens.semantic.warning }]}>{counts.pending}</Text>
              <Text style={styles.summaryLabel}>لم يُسلَّم</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: tokens.semantic.danger }]}>{counts.late}</Text>
              <Text style={styles.summaryLabel}>متأخر</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: tokens.semantic.info }]}>{counts.submitted}</Text>
              <Text style={styles.summaryLabel}>مُسلَّم</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: tokens.semantic.success }]}>{counts.graded}</Text>
              <Text style={styles.summaryLabel}>مُصحَّح</Text>
            </View>
          </View>
        )}

        {/* Filter chips */}
        {items.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <TouchableOpacity key={f.key}
                  onPress={() => { haptics.selection(); setFilter(f.key); }}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.85}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!selectedChildId ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyHint}>اختر طفلاً</Text>
          </View>
        ) : loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={5} cardHeight={88} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>
              {items.length === 0 ? 'لا توجد واجبات' : 'لا توجد واجبات بهذا التصنيف'}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            {filtered.map((a, idx) => {
              const st = STATUS_META[a.submission_status];
              return (
                <FadeSlideIn key={a.id} delay={Math.min(idx * 25, 300)} translateFrom={6}>
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
                        <Ionicons name={st.icon} size={12} color={st.fg} />
                        <Text style={[styles.statusText, { color: st.fg }]}>{st.label}</Text>
                      </View>
                      {a.subject && (
                        <View style={styles.subjectPill}>
                          <Text style={styles.subjectText}>{a.subject}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.titleText} numberOfLines={2}>{a.title}</Text>
                    {a.description ? (
                      <Text style={styles.descText} numberOfLines={2}>{a.description}</Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      {a.due_date ? (
                        <Text style={styles.metaText}>
                          <Ionicons name="calendar-outline" size={11} color={tokens.text[3]} />
                          {' '}{formatDate(a.due_date)}
                        </Text>
                      ) : null}
                      {a.score != null && a.max_score ? (
                        <Text style={[styles.metaText, { fontWeight: '900', color: tokens.semantic.success }]}>
                          {a.score} / {a.max_score}
                        </Text>
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
    return new Date(ymd).toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return ymd; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  summary: {
    flexDirection: 'row-reverse',
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2],
    paddingVertical: 12,
    ...tokens.shadow.xs,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '900' },
  summaryLabel: { fontSize: 10, color: tokens.text[3], marginTop: 4 },
  divider: { width: 1, marginVertical: 8, backgroundColor: tokens.border[2] },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row-reverse' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2] },
  chipActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2], padding: 14, gap: 8,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700' },
  subjectPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tokens.brand[100] },
  subjectText: { fontSize: 10, fontWeight: '700', color: tokens.brand[500] },
  titleText: { fontSize: 14, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  descText: { fontSize: 12, color: tokens.text[2], textAlign: 'right', lineHeight: 17 },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  metaText: { fontSize: 11, color: tokens.text[3], fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
