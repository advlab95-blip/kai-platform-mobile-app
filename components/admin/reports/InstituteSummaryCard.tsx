// InstituteSummaryCard — one row per institute on the Admin Reports overview.
// Shows monthly + yearly revenue, outstanding balance, and a health badge.
// Tapping the card opens the per-institute drilldown.

import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

export type Status = 'healthy' | 'warning' | 'critical';

export interface InstituteSummary {
  instituteId: string;
  instituteName: string;
  instituteType: 'institute' | 'school' | null;
  revenueThisMonth: number;
  revenueThisYear: number;
  paymentCountThisMonth: number;
  outstandingTotal: number;
  collectionRate: number;
  status: Status;
}

interface Props {
  summary: InstituteSummary;
  onPress: (instituteId: string) => void;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  return new Intl.NumberFormat('ar-IQ').format(Math.round(n));
}

const STATUS_META: Record<Status, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  healthy:  { bg: tokens.color.successBg, fg: tokens.color.success, icon: 'checkmark-circle', label: 'سليم' },
  warning:  { bg: tokens.color.warningBg, fg: tokens.color.warning, icon: 'warning',           label: 'تحذير' },
  critical: { bg: tokens.color.dangerBg,  fg: tokens.color.danger,  icon: 'alert-circle',      label: 'حرج' },
};

function InstituteSummaryCard({ summary, onPress }: Props) {
  const status = STATUS_META[summary.status];
  const typeLabel = summary.instituteType === 'school' ? 'مدرسة' : 'معهد';

  return (
    <Pressable
      onPress={() => onPress(summary.instituteId)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`تقرير ${summary.instituteName}`}
    >
      <View style={styles.headerRow}>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon} size={12} color={status.fg} />
          <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.name} numberOfLines={1}>{summary.instituteName}</Text>
          <Text style={styles.type}>{typeLabel}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: tokens.color.success }]}>
            {fmtMoney(summary.revenueThisMonth)}
          </Text>
          <Text style={styles.statLabel}>هذا الشهر</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: tokens.color.info }]}>
            {fmtMoney(summary.revenueThisYear)}
          </Text>
          <Text style={styles.statLabel}>هذه السنة</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: summary.outstandingTotal > 0 ? tokens.color.danger : tokens.color.text3 }]}>
            {fmtMoney(summary.outstandingTotal)}
          </Text>
          <Text style={styles.statLabel}>متبقّي</Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        <Ionicons name="chevron-back" size={16} color={tokens.color.text3} />
        <View style={styles.footerMeta}>
          <Text style={styles.footerText}>
            {summary.paymentCountThisMonth} عملية هذا الشهر
          </Text>
          <Text style={styles.footerText}>
            نسبة التحصيل: {summary.collectionRate}%
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default memo(InstituteSummaryCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
  },
  type: {
    fontSize: 11,
    color: tokens.color.text3,
    fontWeight: '600',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 10,
    color: tokens.color.text3,
    fontWeight: '600',
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border2,
  },
  footerMeta: {
    flexDirection: 'row-reverse',
    gap: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: tokens.color.text2,
    fontWeight: '600',
  },
});
