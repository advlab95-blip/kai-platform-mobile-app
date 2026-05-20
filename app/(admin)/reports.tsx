// Admin Financial Reports — per-institute revenue/outstanding/payments.
//
// Two views in one screen:
//   1. Overview — list of every institute with summary cards (revenue, outstanding,
//      payment count, health status).
//   2. Drilldown — tap an institute card → detailed report with chart + grades
//      breakdown + outstanding students + payment history.
//
// Multi-tenant isolation: the platform admin sees ALL institutes here. Every
// query in services/api.ts still passes `institute_id` so a misconfigured RLS
// policy can't leak rows from one tenant to another's drilldown view. The
// drilldown call (api.getInstituteFinancialDetail) runs assertCallerCanAdminInstitute
// server-side, which is the authoritative check.
//
// Filters: time-range chips drive the overview totals AND the drilldown's
// recent-payment slice. Outstanding balances are a snapshot and ignore the
// range.
//
// Note: caps at 500 institutes on the overview and 100 outstanding rows per
// drilldown — beyond that, export-to-PDF (existing service) is the right path.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import EmptyState from '../../components/shared/EmptyState';
import InstituteSummaryCard, { type InstituteSummary } from '../../components/admin/reports/InstituteSummaryCard';
import InstituteDetailView, {
  type FeeByGrade, type OutstandingRow, type PaymentRow,
} from '../../components/admin/reports/InstituteDetailView';
import TimeRangeFilter, { resolveRange, type RangeKey } from '../../components/admin/reports/TimeRangeFilter';
import type { MonthlyPoint } from '../../components/admin/reports/RevenueBarChart';
import { tokens } from '../../constants/designTokens';
import { api } from '../../services/api';
import { haptics } from '../../utils/haptics';

interface DetailState {
  loading: boolean;
  data: {
    monthlyRevenue: MonthlyPoint[];
    feesByGrade: FeeByGrade[];
    outstanding: OutstandingRow[];
    recentPayments: PaymentRow[];
  } | null;
}

export default function AdminReports() {
  const [range, setRange] = useState<RangeKey>('thisMonth');
  const [summaries, setSummaries] = useState<InstituteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ loading: false, data: null });

  const loadOverview = useCallback(async (rng: RangeKey) => {
    setLoading(true);
    try {
      const { sinceISO, untilISO } = resolveRange(rng);
      const rows = await api.getAdminFinancialOverview({ sinceISO, untilISO });
      // Trim down to the shape the card needs — keeps re-render cost low.
      const mapped: InstituteSummary[] = rows.map((r) => ({
        instituteId: r.instituteId,
        instituteName: r.instituteName,
        instituteType: r.instituteType,
        revenueThisMonth: r.revenueThisMonth,
        revenueThisYear: r.revenueThisYear,
        paymentCountThisMonth: r.paymentCountThisMonth,
        outstandingTotal: r.outstandingTotal,
        collectionRate: r.collectionRate,
        status: r.status,
      }));
      setSummaries(mapped);
    } catch (err: any) {
      if (__DEV__) console.error('[reports] loadOverview', err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل التقارير');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (instituteId: string, rng: RangeKey) => {
    setDetail({ loading: true, data: null });
    try {
      const { sinceISO, untilISO } = resolveRange(rng);
      const data = await api.getInstituteFinancialDetail(instituteId, { sinceISO, untilISO });
      setDetail({ loading: false, data });
    } catch (err: any) {
      if (__DEV__) console.error('[reports] loadDetail', err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل التفاصيل');
      setDetail({ loading: false, data: null });
    }
  }, []);

  // Initial overview load.
  useEffect(() => { loadOverview(range); }, [loadOverview, range]);

  // Re-fetch detail when the user changes the time range while drilled in.
  useEffect(() => {
    if (selectedId) loadDetail(selectedId, range);
  }, [selectedId, range, loadDetail]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (selectedId) await loadDetail(selectedId, range);
      else await loadOverview(range);
    } finally {
      setRefreshing(false);
    }
  }, [selectedId, range, loadDetail, loadOverview]);

  const handleOpenInstitute = useCallback((id: string) => {
    haptics.selection();
    setSelectedId(id);
  }, []);

  const handleBackToOverview = useCallback(() => {
    haptics.light();
    setSelectedId(null);
    setDetail({ loading: false, data: null });
  }, []);

  const selectedSummary = useMemo(
    () => summaries.find((s) => s.instituteId === selectedId) || null,
    [summaries, selectedId],
  );

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, s) => ({
        revenue: acc.revenue + s.revenueThisMonth,
        outstanding: acc.outstanding + s.outstandingTotal,
        critical: acc.critical + (s.status === 'critical' ? 1 : 0),
      }),
      { revenue: 0, outstanding: 0, critical: 0 },
    );
  }, [summaries]);

  function fmtMoney(n: number): string {
    if (!Number.isFinite(n) || n === 0) return '0';
    return new Intl.NumberFormat('ar-IQ').format(Math.round(n));
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="التقارير المالية"
        subtitle={selectedSummary ? selectedSummary.instituteName : 'كل المؤسسات'}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        onBack={selectedSummary ? handleBackToOverview : undefined}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.filterWrap}>
          <TimeRangeFilter value={range} onChange={setRange} />
        </View>

        {selectedSummary ? (
          /* DRILLDOWN VIEW */
          detail.loading ? (
            <ActivityIndicator size="large" color={tokens.color.brand500} style={{ marginTop: 40 }} />
          ) : detail.data ? (
            <InstituteDetailView
              header={{
                instituteName: selectedSummary.instituteName,
                instituteType: selectedSummary.instituteType,
                revenueThisMonth: selectedSummary.revenueThisMonth,
                revenueThisYear: selectedSummary.revenueThisYear,
                outstandingTotal: selectedSummary.outstandingTotal,
                collectionRate: selectedSummary.collectionRate,
              }}
              monthlyRevenue={detail.data.monthlyRevenue}
              feesByGrade={detail.data.feesByGrade}
              outstanding={detail.data.outstanding}
              recentPayments={detail.data.recentPayments}
            />
          ) : (
            <EmptyState
              icon="alert-circle-outline"
              title="فشل تحميل التقرير"
              message="حاول السحب للأسفل للتحديث"
            />
          )
        ) : (
          /* OVERVIEW VIEW */
          <>
            <View style={styles.kpiRow}>
              <View style={[styles.kpiCard, { backgroundColor: tokens.color.successBg }]}>
                <Ionicons name="trending-up" size={18} color={tokens.color.success} />
                <Text style={[styles.kpiValue, { color: tokens.color.success }]}>
                  {fmtMoney(totals.revenue)}
                </Text>
                <Text style={styles.kpiLabel}>إيرادات الفترة</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: tokens.color.dangerBg }]}>
                <Ionicons name="alert-circle" size={18} color={tokens.color.danger} />
                <Text style={[styles.kpiValue, { color: tokens.color.danger }]}>
                  {fmtMoney(totals.outstanding)}
                </Text>
                <Text style={styles.kpiLabel}>إجمالي المتبقّي</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: tokens.color.warningBg }]}>
                <Ionicons name="warning" size={18} color={tokens.color.warning} />
                <Text style={[styles.kpiValue, { color: tokens.color.warning }]}>
                  {totals.critical}
                </Text>
                <Text style={styles.kpiLabel}>مؤسسات حرجة</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={tokens.color.brand500} style={{ marginTop: 40 }} />
            ) : summaries.length === 0 ? (
              <EmptyState
                icon="bar-chart-outline"
                title="لا توجد مؤسسات"
                message="أنشئ مؤسسة لبدء عرض التقارير المالية"
              />
            ) : (
              <View style={styles.listSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionCount}>{summaries.length} مؤسسة</Text>
                  <Text style={styles.sectionTitle}>التقارير حسب المؤسسة</Text>
                </View>
                {summaries.map((s) => (
                  <InstituteSummaryCard
                    key={s.instituteId}
                    summary={s}
                    onPress={handleOpenInstitute}
                  />
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
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  filterWrap: {
    paddingVertical: 12,
  },
  kpiRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    padding: 12,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    gap: 4,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  kpiLabel: {
    fontSize: 10,
    color: tokens.color.text2,
    fontWeight: '600',
  },
  listSection: {
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.text,
  },
  sectionCount: {
    fontSize: 11,
    color: tokens.color.text3,
    fontWeight: '600',
  },
});
