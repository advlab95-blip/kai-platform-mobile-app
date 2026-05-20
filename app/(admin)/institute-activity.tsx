// institute-activity.tsx — Platform admin per-institute activity dashboard.
// Reads `get_institute_activity` RPC and renders health score + activity chips.
// All interactivity (sort, filter, expand) is local state — no nav side effects.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import {
  getInstituteActivity,
  type InstituteActivity,
} from '../../services/platformAdminService';

// ── humanize helper (Arabic relative time) ────────────────────────
// Inline per spec — keeps the screen self-contained and avoids a util
// dependency the rest of the app doesn't share yet.
function humanizeAr(iso: string | null | undefined): string {
  if (!iso) return 'لا يوجد';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'لا يوجد';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'الآن';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `منذ ${min.toLocaleString('ar-IQ')} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr.toLocaleString('ar-IQ')} ساعة`;
  const day = Math.floor(hr / 24);
  return `منذ ${day.toLocaleString('ar-IQ')} يوم`;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Infinity;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

type HealthTier = 'healthy' | 'mid' | 'weak' | 'idle';

function tierForRow(row: InstituteActivity): HealthTier {
  if (daysSince(row.last_activity) > 30) return 'idle';
  if (row.health_score >= 70) return 'healthy';
  if (row.health_score >= 40) return 'mid';
  return 'weak';
}

function tierColors(tier: HealthTier): { fg: string; bg: string; label: string } {
  switch (tier) {
    case 'healthy': return { fg: tokens.color.success, bg: tokens.color.successBg, label: 'صحيّة' };
    case 'mid':     return { fg: tokens.color.warning, bg: tokens.color.warningBg, label: 'متوسطة' };
    case 'weak':    return { fg: tokens.color.danger,  bg: tokens.color.dangerBg,  label: 'ضعيفة' };
    case 'idle':    return { fg: Colors.textMuted,     bg: tokens.color.surface2,  label: 'خاملة' };
  }
}

type SortKey = 'top' | 'bottom' | 'recent' | 'oldest';
type TypeFilter = 'all' | 'school' | 'institute';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'top',    label: 'الأعلى نشاطاً' },
  { key: 'bottom', label: 'الأقل نشاطاً' },
  { key: 'recent', label: 'الأحدث' },
  { key: 'oldest', label: 'الأقدم' },
];

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all',       label: 'الكل' },
  { key: 'school',    label: 'مدرسة' },
  { key: 'institute', label: 'معهد' },
];

function typeLabel(t: string): string {
  if (t === 'school') return 'مدرسة';
  if (t === 'institute') return 'معهد';
  return t;
}

export default function AdminInstituteActivity() {
  const [rows, setRows] = useState<InstituteActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('top');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const data = await getInstituteActivity();
      setRows(data || []);
    } catch (err: any) {
      setError(err?.message || 'تعذّر جلب نشاط المؤسسات');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }, [load]);

  // Summary counts — derived once per `rows` change.
  const summary = useMemo(() => {
    const s = { healthy: 0, mid: 0, weak: 0, idle: 0 };
    for (const r of rows) s[tierForRow(r)] += 1;
    return s;
  }, [rows]);

  // Filtered + sorted list.
  const visibleRows = useMemo(() => {
    const filtered =
      typeFilter === 'all'
        ? rows
        : rows.filter((r) => r.institute_type === typeFilter);
    const sorted = [...filtered];
    switch (sort) {
      case 'top':
        sorted.sort((a, b) => b.health_score - a.health_score);
        break;
      case 'bottom':
        sorted.sort((a, b) => a.health_score - b.health_score);
        break;
      case 'recent':
        sorted.sort(
          (a, b) =>
            new Date(b.last_activity || 0).getTime() -
            new Date(a.last_activity || 0).getTime(),
        );
        break;
      case 'oldest':
        sorted.sort(
          (a, b) =>
            new Date(a.last_activity || 0).getTime() -
            new Date(b.last_activity || 0).getTime(),
        );
        break;
    }
    return sorted;
  }, [rows, sort, typeFilter]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderSummaryChips = () => {
    const items: { tier: HealthTier; count: number }[] = [
      { tier: 'healthy', count: summary.healthy },
      { tier: 'mid',     count: summary.mid },
      { tier: 'weak',    count: summary.weak },
      { tier: 'idle',    count: summary.idle },
    ];
    return (
      <View style={styles.summaryRow}>
        {items.map(({ tier, count }) => {
          const c = tierColors(tier);
          return (
            <View key={tier} style={[styles.summaryChip, { backgroundColor: c.bg }]}>
              <Text style={[styles.summaryChipCount, { color: c.fg }]}>
                {count.toLocaleString('ar-IQ')}
              </Text>
              <Text style={[styles.summaryChipLabel, { color: c.fg }]}>{c.label}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderSortAndFilter = () => (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.filterLabel}>ترتيب</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {SORT_OPTIONS.map((opt) => {
          const active = sort === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setSort(opt.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={[styles.filterLabel, { marginTop: 10 }]}>نوع المؤسسة</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {TYPE_OPTIONS.map((opt) => {
          const active = typeFilter === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setTypeFilter(opt.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderHealthBar = (score: number, tier: HealthTier) => {
    const c = tierColors(tier);
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    return (
      <View style={styles.healthBarWrap}>
        <View style={styles.healthBarHeader}>
          <Text style={[styles.healthScoreText, { color: c.fg }]}>
            {clamped.toLocaleString('ar-IQ')}
            <Text style={styles.healthScoreSlash}>{' / ١٠٠'}</Text>
          </Text>
          <Text style={styles.healthBarLabel}>نسبة الصحة</Text>
        </View>
        <View style={styles.healthBarTrack}>
          <View
            style={[
              styles.healthBarFill,
              { width: `${clamped}%`, backgroundColor: c.fg },
            ]}
          />
        </View>
      </View>
    );
  };

  const renderCard = (row: InstituteActivity) => {
    const tier = tierForRow(row);
    const c = tierColors(tier);
    const isOpen = !!expanded[row.institute_id];
    return (
      <TouchableOpacity
        key={row.institute_id}
        style={styles.instCard}
        onPress={() => toggleExpand(row.institute_id)}
        activeOpacity={0.9}
      >
        {/* Header row */}
        <View style={styles.instHeader}>
          <View style={[styles.typeBadge, { backgroundColor: tokens.color.brand100 }]}>
            <Text style={[styles.typeBadgeText, { color: tokens.color.brand500 }]}>
              {typeLabel(row.institute_type)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.instName} numberOfLines={2}>
              {row.institute_name}
            </Text>
            <View style={[styles.tierTag, { backgroundColor: c.bg }]}>
              <Text style={[styles.tierTagText, { color: c.fg }]}>{c.label}</Text>
            </View>
          </View>
        </View>

        {/* Health bar */}
        {renderHealthBar(row.health_score, tier)}

        {/* Metric chips */}
        <View style={styles.metricRow}>
          <View style={styles.metricChip}>
            <Ionicons name="people" size={11} color={tokens.color.info} />
            <Text style={styles.metricText}>
              المستخدمون: {row.total_users.toLocaleString('ar-IQ')}
            </Text>
          </View>
          <View style={styles.metricChip}>
            <Ionicons name="notifications" size={11} color={tokens.color.pink} />
            <Text style={styles.metricText}>
              إشعارات/٣٠ يوم: {row.notifications_30d.toLocaleString('ar-IQ')}
            </Text>
          </View>
          <View style={styles.metricChip}>
            <Ionicons name="time" size={11} color={tokens.color.teal} />
            <Text style={styles.metricText}>
              آخر نشاط: {humanizeAr(row.last_activity)}
            </Text>
          </View>
        </View>

        {/* Expanded detail */}
        {isOpen ? (
          <View style={styles.expandWrap}>
            <View style={styles.expandRow}>
              <Text style={styles.expandValue}>
                {row.active_today.toLocaleString('ar-IQ')}
              </Text>
              <Text style={styles.expandLabel}>نشطون اليوم</Text>
            </View>
            <View style={styles.expandRow}>
              <Text style={styles.expandValue}>
                {row.active_7d.toLocaleString('ar-IQ')}
              </Text>
              <Text style={styles.expandLabel}>نشطون (٧ أيام)</Text>
            </View>
            <View style={styles.expandRow}>
              <Text style={styles.expandValue}>
                {row.active_30d.toLocaleString('ar-IQ')}
              </Text>
              <Text style={styles.expandLabel}>نشطون (٣٠ يوم)</Text>
            </View>
            <View style={styles.expandRow}>
              <Text style={styles.expandValue}>
                {row.messages_30d.toLocaleString('ar-IQ')}
              </Text>
              <Text style={styles.expandLabel}>رسائل (٣٠ يوم)</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.expandHint}>
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.textMuted}
          />
          <Text style={styles.expandHintText}>
            {isOpen ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="نشاط المؤسسات"
        subtitle="نسبة الصحة والاستخدام"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Error banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <TouchableOpacity
              onPress={() => load(true)}
              style={styles.errorRetryBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.errorRetryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
            <View style={styles.errorBannerRight}>
              <Ionicons name="alert-circle" size={18} color={tokens.color.danger} />
              <Text style={styles.errorBannerText} numberOfLines={2}>
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Loading */}
        {loading && rows.length === 0 ? (
          <ActivityIndicator
            color={tokens.color.brand500}
            size="large"
            style={{ marginTop: 48, alignSelf: 'center' }}
          />
        ) : (
          <>
            {renderSummaryChips()}
            {renderSortAndFilter()}

            {/* List or empty */}
            {visibleRows.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="business" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>لا توجد مؤسسات لعرضها</Text>
                <Text style={styles.emptySub}>
                  جرّب تغيير عامل التصفية أو السحب للتحديث
                </Text>
              </View>
            ) : (
              visibleRows.map(renderCard)
            )}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  // ── Error ─────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.color.dangerBg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 8,
  },
  errorBannerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.danger,
    textAlign: 'right',
  },
  errorRetryBtn: {
    backgroundColor: tokens.color.danger,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  errorRetryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  // ── Summary chips ─────────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  summaryChip: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  summaryChipCount: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  summaryChipLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  // ── Filters ───────────────────────────────────────────────────
  filterLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    paddingHorizontal: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: tokens.color.brand500,
    borderColor: tokens.color.brand500,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  // ── Card ──────────────────────────────────────────────────────
  instCard: {
    backgroundColor: '#fff',
    borderRadius: tokens.radius.xl,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...tokens.shadow.xs,
  },
  instHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  instName: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 4,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tierTag: {
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tierTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  // ── Health bar ────────────────────────────────────────────────
  healthBarWrap: {
    marginBottom: 12,
  },
  healthBarHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  healthBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  healthScoreText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  healthScoreSlash: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  healthBarTrack: {
    height: 8,
    backgroundColor: tokens.color.surface2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  healthBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  // ── Metric chips ──────────────────────────────────────────────
  metricRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  metricChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: tokens.color.surface2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },
  metricText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  // ── Expand ────────────────────────────────────────────────────
  expandWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 6,
  },
  expandRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  expandLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  expandValue: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.text,
  },
  expandHint: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 10,
  },
  expandHintText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  // ── Empty ─────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
