import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  value: number; // 0–100
  label?: string;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  formatValue?: (v: number) => string;
}

// Animated ring. The fill animates on mount and whenever `value` changes.
// Uses Reanimated's useAnimatedProps so the animation runs on the UI thread
// (no bridge traffic per frame).
export default function ProgressRing({
  value,
  label,
  size = 120,
  stroke = 10,
  color = Colors.primary,
  trackColor = Colors.border,
  formatValue = (v) => `${Math.round(v)}%`,
}: Props) {
  const clamped = Math.max(0, Math.min(100, isFinite(value) ? value : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(clamped / 100, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [clamped, progress]);

  useEffect(() => () => cancelAnimation(progress), [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ? `${label}: ${formatValue(clamped)}` : formatValue(clamped)}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Fill (rotated so it starts at 12 o'clock) */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.centerText} pointerEvents="none">
        <Text style={[styles.value, { color }]}>{formatValue(clamped)}</Text>
        {!!label && <Text style={styles.label}>{label}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
