// RevenueBarChart — last-12-months revenue chart, pure View-based (no SVG).
// Each bar is a vertical column whose height is a percentage of the max bar.
// Includes a tooltip-on-press that surfaces the exact month + amount.

import React, { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { tokens } from '../../../constants/designTokens';

export interface MonthlyPoint {
  ym: string;        // "2026-04"
  label: string;     // "04"
  total: number;     // amount in IQD
}

interface Props {
  data: MonthlyPoint[];
  /** Chart height in px (bars area only — labels add ~22 px). */
  height?: number;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}ك`;
  return new Intl.NumberFormat('ar-IQ').format(Math.round(n));
}

function RevenueBarChart({ data, height = 140 }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const max = useMemo(() => {
    if (!data.length) return 0;
    return Math.max(...data.map((d) => d.total));
  }, [data]);

  if (!data.length) return null;

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>
          {activeIdx != null ? data[activeIdx].ym : 'إجمالي 12 شهر'}
        </Text>
        <Text style={styles.summaryValue}>
          {activeIdx != null
            ? fmtMoney(data[activeIdx].total)
            : fmtMoney(data.reduce((s, d) => s + d.total, 0))}
        </Text>
      </View>

      <View style={[styles.barsRow, { height }]}>
        {data.map((d, i) => {
          const pct = max > 0 ? (d.total / max) * 100 : 0;
          // Min 2 px so empty months still render a visible baseline.
          const barHeight = Math.max(2, (pct / 100) * height);
          const isActive = activeIdx === i;
          return (
            <Pressable
              key={d.ym}
              onPress={() => setActiveIdx(isActive ? null : i)}
              style={styles.barCell}
              accessibilityRole="button"
              accessibilityLabel={`${d.ym}: ${d.total}`}
            >
              <View
                style={[
                  styles.bar,
                  { height: barHeight, backgroundColor: isActive ? tokens.color.brand500 : tokens.color.brand100 },
                  isActive && styles.barActive,
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.labelsRow}>
        {data.map((d, i) => (
          <Text
            key={d.ym}
            style={[
              styles.label,
              activeIdx === i && { color: tokens.color.brand500, fontWeight: '900' },
            ]}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default memo(RevenueBarChart);

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  summaryRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 12,
    color: tokens.color.text3,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 16,
    color: tokens.color.brand500,
    fontWeight: '900',
  },
  barsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: 4,
  },
  barCell: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: '100%',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 2,
  },
  barActive: {
    ...tokens.shadow.brand,
  },
  labelsRow: {
    flexDirection: 'row-reverse',
    gap: 4,
    marginTop: 6,
  },
  label: {
    flex: 1,
    fontSize: 9,
    color: tokens.color.text3,
    textAlign: 'center',
    fontWeight: '600',
  },
});
