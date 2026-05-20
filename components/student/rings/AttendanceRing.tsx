import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { tokens } from '../../../constants/designTokens';

export interface AttendanceRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function AttendanceRing({ percentage, size = 160, strokeWidth = 14, label }: AttendanceRingProps) {
  const safePct = Math.max(0, Math.min(100, percentage || 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useRef(new Animated.Value(circumference)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: circumference - (safePct / 100) * circumference,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [safePct, circumference, progress]);

  const tier =
    safePct >= 85 ? tokens.color.success : safePct >= 75 ? tokens.color.warning : tokens.color.danger;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tokens.color.surface2}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tier}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progress as unknown as number}
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.percentage, { color: tier }]}>{Math.round(safePct)}%</Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentage: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    marginTop: 4,
  },
});

export default memo(AttendanceRing);
