import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Colors } from '../../constants/colors';

export interface LinePoint {
  label: string;
  value: number;
}

interface Props {
  data: LinePoint[];
  height?: number;
  color?: string;
  yMax?: number;
}

const WIDTH = 280;
const PADDING = { top: 16, right: 12, bottom: 28, left: 12 };

// Pure-SVG line chart. No extra dep (~100 LoC vs 30KB+ chart libraries).
// Handles empty data, single-point edge case, and auto-scale.
export default function SimpleLineChart({ data, height = 160, color = Colors.primary, yMax }: Props) {
  const { polyline, coords } = useMemo(() => {
    if (data.length === 0) return { polyline: '', coords: [] };
    const chartW = WIDTH - PADDING.left - PADDING.right;
    const chartH = height - PADDING.top - PADDING.bottom;
    const rawMax = yMax != null ? yMax : Math.max(...data.map((d) => d.value));
    const max = rawMax > 0 ? rawMax : 1;
    const step = data.length > 1 ? chartW / (data.length - 1) : 0;
    const pts = data.map((d, i) => ({
      x: PADDING.left + i * step,
      y: PADDING.top + chartH - (d.value / max) * chartH,
      value: d.value,
      label: d.label,
    }));
    return {
      polyline: pts.map((p) => `${p.x},${p.y}`).join(' '),
      coords: pts,
    };
  }, [data, height, yMax]);

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>لا توجد بيانات</Text>
      </View>
    );
  }

  return (
    <Svg width={WIDTH} height={height}>
      <Line
        x1={PADDING.left}
        x2={WIDTH - PADDING.right}
        y1={height - PADDING.bottom}
        y2={height - PADDING.bottom}
        stroke={Colors.border}
        strokeWidth={1}
      />
      <Polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} />
      {coords.map((c, i) => (
        <Circle key={`pt-${c.label}-${i}`} cx={c.x} cy={c.y} r={3.5} fill={color} />
      ))}
      {coords.map((c, i) => (
        <SvgText
          key={`lbl-${c.label}-${i}`}
          x={c.x}
          y={height - 10}
          fontSize={10}
          fill={Colors.textMuted}
          textAnchor="middle"
        >
          {c.label}
        </SvgText>
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 12 },
});
