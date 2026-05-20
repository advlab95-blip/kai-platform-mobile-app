// InstituteDetailView — the drill-down body rendered when an institute card is
// tapped on the Admin Reports overview. Composed of:
//   1. Header summary (name + type + key totals)
//   2. Revenue bar chart (last 12 months)
//   3. Fees-by-grade breakdown (which grade is paying / not paying)
//   4. Outstanding student list (top 100 sorted by amount desc)
//   5. Recent payment history (last 50)
//
// The parent owns data loading; this component is presentational.

import React, { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import RevenueBarChart, { type MonthlyPoint } from './RevenueBarChart';

export interface FeeByGrade {
  classId: string | null;
  className: string;
  studentCount: number;
  expected: number;
  collected: number;
  outstanding: number;
}

export interface OutstandingRow {
  studentId: string;
  studentName: string;
  className: string;
  remaining: number;
  expected: number;
  paid: number;
  status: string;
}

export interface PaymentRow {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  title: string;
  paidAt: string;
  method: string | null;
}

export interface InstituteHeader {
  instituteName: string;
  instituteType: 'institute' | 'school' | null;
  revenueThisMonth: number;
  revenueThisYear: number;
  outstandingTotal: number;
  collectionRate: number;
}

interface Props {
  header: InstituteHeader;
  monthlyRevenue: MonthlyPoint[];
  feesByGrade: FeeByGrade[];
  outstanding: OutstandingRow[];
  recentPayments: PaymentRow[];
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  return new Intl.NumberFormat('ar-IQ').format(Math.round(n));
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  // Output YYYY-MM-DD; safe for empty/invalid strings.
  return String(iso).slice(0, 10);
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  paid:    { label: 'مكتمل',   color: tokens.color.success },
  partial: { label: 'جزئي',     color: tokens.color.warning },
  overdue: { label: 'متأخر',    color: tokens.color.danger },
  pending: { label: 'مستحق',    color: tokens.color.info },
};

type Tab = 'overview' | 'outstanding' | 'history';

const TABS: Array<{ key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'overview',    label: 'النظرة العامة', icon: 'pie-chart' },
  { key: 'outstanding', label: 'متأخّرات',       icon: 'alert-circle' },
  { key: 'history',     label: 'السجل',          icon: 'time' },
];

function InstituteDetailView({ header, monthlyRevenue, feesByGrade, outstanding, recentPayments }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  // Cap the outstanding list at 100 rows for the screen — surfacing the worst
  // offenders is the goal; full export would be a future PDF feature.
  const outstandingCapped = useMemo(() => outstanding.slice(0, 100), [outstanding]);

  // Lists are short (capped at 100/50), rendered inside the parent ScrollView.
  // A nested FlashList wouldn't measure correctly here, so we map directly to
  // Views. Cost is acceptable: at 100 rows the cards mount once on tab switch.
  const OutstandingItem = ({ item }: { item: OutstandingRow }) => {
    const meta = STATUS_LABEL[item.status] || STATUS_LABEL.pending;
    return (
      <View style={styles.outRow}>
        <View style={styles.outAmount}>
          <Text style={[styles.outAmountValue, { color: tokens.color.danger }]}>
            {fmtMoney(item.remaining)}
          </Text>
          <Text style={styles.outAmountLabel}>د.ع متبقي</Text>
        </View>
        <View style={styles.outBody}>
          <Text style={styles.outName} numberOfLines={1}>{item.studentName}</Text>
          <View style={styles.outMetaRow}>
            <Text style={styles.outMeta}>{item.className}</Text>
            <Text style={[styles.outStatus, { color: meta.color }]}>· {meta.label}</Text>
          </View>
          <Text style={styles.outDetails}>
            مدفوع {fmtMoney(item.paid)} من {fmtMoney(item.expected)}
          </Text>
        </View>
      </View>
    );
  };

  const PaymentItem = ({ item }: { item: PaymentRow }) => (
    <View style={styles.payRow}>
      <View style={styles.payAmount}>
        <Text style={[styles.payAmountValue, { color: tokens.color.success }]}>
          {fmtMoney(item.amount)}
        </Text>
        <Text style={styles.payAmountLabel}>د.ع</Text>
      </View>
      <View style={styles.payBody}>
        <Text style={styles.payName} numberOfLines={1}>{item.studentName}</Text>
        <View style={styles.payMetaRow}>
          <Text style={styles.payMeta}>{fmtDate(item.paidAt)}</Text>
          {item.title ? <Text style={styles.payMeta}>· {item.title}</Text> : null}
          {item.method ? <Text style={styles.payMeta}>· {item.method}</Text> : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerNameRow}>
          <Text style={styles.headerName} numberOfLines={1}>{header.instituteName}</Text>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>
              {header.instituteType === 'school' ? 'مدرسة' : 'معهد'}
            </Text>
          </View>
        </View>
        <View style={styles.headerStatsRow}>
          <View style={styles.headerStat}>
            <Text style={[styles.headerStatVal, { color: tokens.color.success }]}>
              {fmtMoney(header.revenueThisMonth)}
            </Text>
            <Text style={styles.headerStatLabel}>هذا الشهر</Text>
          </View>
          <View style={styles.headerStat}>
            <Text style={[styles.headerStatVal, { color: tokens.color.info }]}>
              {fmtMoney(header.revenueThisYear)}
            </Text>
            <Text style={styles.headerStatLabel}>هذه السنة</Text>
          </View>
          <View style={styles.headerStat}>
            <Text style={[styles.headerStatVal, { color: header.outstandingTotal > 0 ? tokens.color.danger : tokens.color.text3 }]}>
              {fmtMoney(header.outstandingTotal)}
            </Text>
            <Text style={styles.headerStatLabel}>متبقّي</Text>
          </View>
          <View style={styles.headerStat}>
            <Text style={[styles.headerStatVal, { color: tokens.color.brand500 }]}>
              {header.collectionRate}%
            </Text>
            <Text style={styles.headerStatLabel}>التحصيل</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(TABS).map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
          >
            <Ionicons
              name={t.icon}
              size={14}
              color={tab === t.key ? tokens.color.brand500 : tokens.color.text3}
            />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {tab === 'overview' ? (
        <View>
          <RevenueBarChart data={monthlyRevenue} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>الرسوم حسب الصف</Text>
          </View>
          {feesByGrade.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="school-outline" size={32} color={tokens.color.text3} />
              <Text style={styles.emptyText}>لا توجد خطط رسوم لهذه المؤسسة</Text>
            </View>
          ) : (
            feesByGrade.map((g) => {
              const collectionPct = g.expected > 0 ? Math.round((g.collected / g.expected) * 100) : 0;
              return (
                <View key={g.classId || g.className} style={styles.gradeRow}>
                  <View style={styles.gradeHeader}>
                    <Text style={[styles.gradePct, { color: collectionPct >= 80 ? tokens.color.success : collectionPct >= 50 ? tokens.color.warning : tokens.color.danger }]}>
                      {collectionPct}%
                    </Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.gradeName} numberOfLines={1}>{g.className}</Text>
                      <Text style={styles.gradeMeta}>{g.studentCount} طالب</Text>
                    </View>
                  </View>
                  <View style={styles.gradeBarBg}>
                    <View
                      style={[
                        styles.gradeBarFill,
                        {
                          width: `${Math.min(100, collectionPct)}%`,
                          backgroundColor: collectionPct >= 80 ? tokens.color.success : collectionPct >= 50 ? tokens.color.warning : tokens.color.danger,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.gradeAmountsRow}>
                    <Text style={styles.gradeAmount}>المتوقع: {fmtMoney(g.expected)}</Text>
                    <Text style={styles.gradeAmount}>المحصّل: {fmtMoney(g.collected)}</Text>
                    <Text style={[styles.gradeAmount, { color: tokens.color.danger }]}>
                      المتبقي: {fmtMoney(g.outstanding)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : tab === 'outstanding' ? (
        <View style={styles.listWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {outstanding.length} طالب · أعلى {outstandingCapped.length}
            </Text>
          </View>
          {outstandingCapped.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-circle-outline" size={32} color={tokens.color.success} />
              <Text style={styles.emptyText}>لا توجد متأخرات</Text>
            </View>
          ) : (
            outstandingCapped.map((item) => (
              <OutstandingItem key={item.studentId} item={item} />
            ))
          )}
        </View>
      ) : (
        <View style={styles.listWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              آخر {recentPayments.length} عملية دفع
            </Text>
          </View>
          {recentPayments.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={32} color={tokens.color.text3} />
              <Text style={styles.emptyText}>لا توجد مدفوعات في النطاق المحدد</Text>
            </View>
          ) : (
            recentPayments.map((item) => (
              <PaymentItem key={item.id} item={item} />
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default memo(InstituteDetailView);

const styles = StyleSheet.create({
  container: {
    paddingBottom: 30,
  },

  // Header
  header: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  headerNameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  headerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    color: tokens.color.text,
    textAlign: 'right',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.brand100,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.color.brand600,
  },
  headerStatsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  headerStat: {
    flex: 1,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  headerStatVal: {
    fontSize: 14,
    fontWeight: '900',
  },
  headerStatLabel: {
    fontSize: 9,
    color: tokens.color.text3,
    fontWeight: '600',
    marginTop: 2,
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  tabBtnActive: {
    backgroundColor: tokens.color.brand100,
    borderColor: tokens.color.brand500,
  },
  tabText: {
    fontSize: 12,
    color: tokens.color.text3,
    fontWeight: '700',
  },
  tabTextActive: {
    color: tokens.color.brand500,
    fontWeight: '900',
  },

  // Section
  sectionHeader: {
    paddingHorizontal: 20,
    marginTop: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
  },

  // Grade rows
  gradeRow: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  gradeHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  gradePct: {
    fontSize: 18,
    fontWeight: '900',
    minWidth: 56,
    textAlign: 'center',
  },
  gradeName: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
  },
  gradeMeta: {
    fontSize: 11,
    color: tokens.color.text3,
    fontWeight: '600',
    marginTop: 2,
  },
  gradeBarBg: {
    height: 6,
    backgroundColor: tokens.color.surface2,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  gradeBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  gradeAmountsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 8,
  },
  gradeAmount: {
    fontSize: 10,
    color: tokens.color.text2,
    fontWeight: '600',
  },

  // Outstanding / payments lists
  listWrap: {
    minHeight: 200,
  },
  outRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 10,
  },
  outAmount: {
    alignItems: 'center',
    minWidth: 72,
  },
  outAmountValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  outAmountLabel: {
    fontSize: 9,
    color: tokens.color.text3,
    marginTop: 2,
  },
  outBody: {
    flex: 1,
    alignItems: 'flex-end',
  },
  outName: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.color.text,
    textAlign: 'right',
  },
  outMetaRow: {
    flexDirection: 'row-reverse',
    gap: 4,
    marginTop: 2,
  },
  outMeta: {
    fontSize: 11,
    color: tokens.color.text3,
    fontWeight: '600',
  },
  outStatus: {
    fontSize: 11,
    fontWeight: '700',
  },
  outDetails: {
    fontSize: 10,
    color: tokens.color.text2,
    marginTop: 2,
  },

  payRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 10,
  },
  payAmount: {
    alignItems: 'center',
    minWidth: 72,
  },
  payAmountValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  payAmountLabel: {
    fontSize: 9,
    color: tokens.color.text3,
    marginTop: 2,
  },
  payBody: {
    flex: 1,
    alignItems: 'flex-end',
  },
  payName: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.color.text,
    textAlign: 'right',
  },
  payMetaRow: {
    flexDirection: 'row-reverse',
    gap: 4,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  payMeta: {
    fontSize: 11,
    color: tokens.color.text3,
    fontWeight: '600',
  },

  // Empty states
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    color: tokens.color.text3,
    fontWeight: '600',
  },
});
