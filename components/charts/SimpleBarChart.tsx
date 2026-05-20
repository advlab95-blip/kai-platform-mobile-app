import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

export interface BarSegment {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  data: BarSegment[];
  height?: number;
  formatValue?: (v: number) => string;
}

// Lightweight bar chart using RN Views (no SVG needed for vertical bars).
// Good fit for: fees (collected vs remaining), comparisons between a handful
// of categories. For time-series / lots of bars, use SimpleLineChart.
export default function SimpleBarChart({
  data,
  height = 160,
  formatValue = (v) => String(v),
}: Props) {
  const max = useMemo(
    () => Math.max(1, ...data.map((d) => d.value)),
    [data],
  );

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>لا توجد بيانات</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.barsRow, { height }]}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <View key={`bar-${d.label}-${i}`} style={styles.barCol}>
              <Text style={styles.value}>{formatValue(d.value)}</Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { height: `${pct}%`, backgroundColor: d.color || Colors.primary },
                  ]}
                />
              </View>
              <Text style={styles.label} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 8,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  track: {
    width: '80%',
    flex: 1,
    backgroundColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginVertical: 6,
  },
  fill: {
    width: '100%',
    borderRadius: 8,
  },
  value: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
  },
  label: {
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  empty: { justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 12 },
});
