import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

type GradientKey = keyof typeof tokens.gradient;
type GradientTuple = readonly [string, string, ...string[]];

export interface StatCardProps {
  label: string;
  value: number | string;
  gradient: GradientKey | GradientTuple;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel?: string;
  onPress?: () => void;
}

function resolveGradient(g: StatCardProps['gradient']): GradientTuple {
  if (typeof g === 'string') {
    return tokens.gradient[g] as unknown as GradientTuple;
  }
  return g;
}

function StatCardInner({
  label,
  value,
  gradient,
  icon,
  accessibilityLabel,
  onPress,
}: StatCardProps) {
  const isNumeric =
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));

  const target = isNumeric ? Number(value) : 0;

  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState<number>(0);

  useEffect(() => {
    if (!isNumeric) return;
    anim.setValue(0);
    const id = anim.addListener(({ value: v }) => {
      setDisplay(Math.round(v));
    });
    Animated.timing(anim, {
      toValue: target,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => {
      anim.removeListener(id);
    };
    // Run only on first mount; intentionally do not react to value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colors = useMemo(() => resolveGradient(gradient), [gradient]);

  const a11yLabel =
    accessibilityLabel ?? `${label}: ${typeof value === 'number' ? value : value}`;

  const content = (
    <LinearGradient
      colors={colors as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.shine} pointerEvents="none" />
      <Text style={styles.value} allowFontScaling={false}>
        {isNumeric ? display : (value as string)}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {icon ? (
        <View style={styles.iconWrap} pointerEvents="none">
          <Ionicons name={icon} size={26} color="#FFFFFF" />
        </View>
      ) : null}
    </LinearGradient>
  );

  if (onPress) {
    const a11y: AccessibilityProps = {
      accessibilityRole: 'button',
      accessibilityLabel: a11yLabel,
    };
    return (
      <Pressable onPress={onPress} style={styles.pressable} {...a11y}>
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={a11yLabel}
      style={styles.pressable}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    ...tokens.shadow.md,
  },
  card: {
    minHeight: 88,
    borderRadius: tokens.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 12,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  shine: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.12)',
    top: -30,
    start: -30,
  },
  value: {
    color: '#FFFFFF',
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    zIndex: 1,
  },
  label: {
    color: '#FFFFFF',
    opacity: 0.85,
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.semi,
    zIndex: 1,
  },
  iconWrap: {
    position: 'absolute',
    bottom: 8,
    start: 8,
    width: 26,
    height: 26,
    opacity: 0.2,
  },
});

const StatCard = memo(StatCardInner);
StatCard.displayName = 'StatCard';

export default StatCard;
