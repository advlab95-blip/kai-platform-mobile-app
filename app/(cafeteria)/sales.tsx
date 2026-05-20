// CafeteriaSales — today's revenue + top items + status breakdown.
// Read-only; relies on cafeteria_orders + cafeteria_items via getTodaySalesSummary.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
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
  getTodaySalesSummary, type SalesSummary,
} from '../../services/cafeteriaSalesService';

function fmtIQ(n: number): string {
  return Math.round(n).toLocaleString('ar-IQ');
}

const STATUS_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  new:        { label: 'جديد',     bg: tokens.semantic.warningBg, fg: tokens.semantic.warning },
  pending:    { label: 'جديد',     bg: tokens.semantic.warningBg, fg: tokens.semantic.warning },
  preparing:  { label: 'تحضير',    bg: tokens.semantic.infoBg,    fg: tokens.semantic.info },
  ready:      { label: 'جاهز',     bg: tokens.semantic.purpleBg,  fg: tokens.semantic.purple },
  delivered:  { label: 'مُسلَّم',  bg: tokens.semantic.successBg, fg: tokens.semantic.success },
  cancelled:  { label: 'ملغي',     bg: tokens.surface.surface2,   fg: tokens.text[3] },
};

export default function CafeteriaSales() {
  const { userInstituteId } = useDataStore();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const { summary } = await getTodaySalesSummary(userInstituteId);
      setSummary(summary);
    } catch (err) {
      if (__DEV__) console.error('[cafeteria/sales] load', err);
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

  const todayStr = new Date().toLocaleDateString('ar-IQ', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="مبيعات اليوم"
        subtitle={todayStr}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(245,158,11,0.30)"
        fallbackRoute="/(cafeteria)"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading || !summary ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={4} cardHeight={88} />
          </View>
        ) : (
          <>
            {/* Headline revenue card */}
            <FadeSlideIn delay={0} translateFrom={10}>
              <View style={styles.heroCard}>
                <View style={styles.heroIconWrap}>
                  <Ionicons name="cash" size={28} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroLabel}>إيرادات اليوم</Text>
                  <Text style={styles.heroValue}>{fmtIQ(summary.totalRevenue)}</Text>
                  <Text style={styles.heroUnit}>د.ع — {summary.totalOrders} طلب</Text>
                </View>
              </View>
            </FadeSlideIn>

            {/* Status breakdown */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <SectionLabel title="حسب الحالة" icon="pie-chart-outline" />
            </View>
            <View style={styles.statusGrid}>
              {Object.entries(summary.byStatus).map(([status, count]) => {
                const st = STATUS_LABELS[status] || STATUS_LABELS.new;
                return (
                  <View key={status} style={[styles.statusCard, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusCount, { color: st.fg }]}>{count}</Text>
                    <Text style={[styles.statusLabel, { color: st.fg }]}>{st.label}</Text>
                  </View>
                );
              })}
            </View>

            {/* Top items */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <SectionLabel title="الأكثر طلباً" icon="trophy-outline" />
            </View>
            {summary.topItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyHint}>لا توجد طلبات اليوم بعد</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, gap: 8 }}>
                {summary.topItems.map((it, idx) => (
                  <FadeSlideIn key={it.item_id} delay={idx * 30} translateFrom={8}>
                    <View style={styles.itemRow}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName} numberOfLines={1}>{it.item_name}</Text>
                        <Text style={styles.itemMeta}>
                          {it.count} طلب • {fmtIQ(it.revenue)} د.ع
                        </Text>
                      </View>
                    </View>
                  </FadeSlideIn>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  heroCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.brand[500],
    ...tokens.shadow.md,
  },
  heroIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', textAlign: 'right' },
  heroValue: { fontSize: 30, fontWeight: '900', color: '#fff', textAlign: 'right', marginTop: 2 },
  heroUnit: { fontSize: 12, color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 2 },
  statusGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  statusCard: {
    flexBasis: '31%', flexGrow: 1, alignItems: 'center',
    paddingVertical: 14, borderRadius: tokens.radius.md,
  },
  statusCount: { fontSize: 22, fontWeight: '900' },
  statusLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  itemRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.border[2],
    padding: 12,
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontWeight: '900', color: tokens.brand[500] },
  itemName: { fontSize: 13, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  itemMeta: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 2 },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 30, gap: 8 },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
