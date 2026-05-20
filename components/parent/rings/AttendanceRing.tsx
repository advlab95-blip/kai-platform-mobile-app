// Circular progress ring used on parent home (compact 110) and attendance screen (big 160).
// Color tier follows brief §7.3: green >= 85, amber >= 75, red < 75.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

function AttendanceRing({ percentage, size = 110, strokeWidth, showLabel = false }: Props) {
  const { t } = useTranslation();
  const sw = strokeWidth ?? (size >= 140 ? 12 : 8);
  const radius = (size - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePct = Math.max(0, Math.min(100, percentage));
  const strokeDashoffset = circumference - (safePct / 100) * circumference;
  const color =
    safePct >= 85 ? tokens.color.success :
    safePct >= 75 ? tokens.color.warning :
    tokens.color.danger;
  const pctFontSize = size >= 140 ? 36 : 22;
  const labelFontSize = size >= 140 ? 11 : 10;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tokens.color.surface3}
          strokeWidth={sw}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={sw}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.pct, { color, fontSize: pctFontSize }]}>{safePct}%</Text>
        {showLabel ? (
          <Text style={[styles.label, { fontSize: labelFontSize }]} numberOfLines={1}>
            {t('parent.attendancePercentage', { defaultValue: 'نسبة الحضور' })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pct: { fontWeight: tokens.font.weight.black },
  label: { color: tokens.color.text3, fontWeight: tokens.font.weight.semi },
});

export default memo(AttendanceRing);
