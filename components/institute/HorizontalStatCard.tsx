import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';
import FadeSlideIn from '../animated/FadeSlideIn';

export type TrendDir = 'up' | 'down' | 'flat';

interface Props {
  value: string | number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  trendPct?: string;
  trendDir?: TrendDir;
  onPress?: () => void;
  delay?: number;
  suffix?: string;
}

export default function HorizontalStatCard({
  value, label, icon, iconBg, iconColor,
  trendPct, trendDir = 'up', onPress, delay = 0, suffix,
}: Props) {
  const Container: any = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? {
    activeOpacity: 0.85,
    onPress: () => { haptics.light(); onPress(); },
  } : {};

  const trendIcon = trendDir === 'up' ? 'trending-up' : trendDir === 'down' ? 'trending-down' : 'remove';
  const trendColor = trendDir === 'up' ? tokens.semantic.success : trendDir === 'down' ? tokens.semantic.danger : tokens.text[3];
  const trendBg = trendDir === 'up' ? tokens.semantic.successBg : trendDir === 'down' ? tokens.semantic.dangerBg : tokens.surface.surface2;

  return (
    <FadeSlideIn delay={delay} translateFrom={12}>
      <Container style={styles.card} {...containerProps}>
        {trendPct && (
          <View style={[styles.trend, { backgroundColor: trendBg }]}>
            <Ionicons name={trendIcon as any} size={10} color={trendColor} />
            <Text style={[styles.trendText, { color: trendColor }]}>{trendPct}</Text>
          </View>
        )}
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}{suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        </Text>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </Container>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 118,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    position: 'relative',
    overflow: 'hidden',
    ...tokens.shadow.xs,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  value: {
    fontWeight: '800',
    fontSize: 22,
    letterSpacing: -0.5,
    lineHeight: 24,
    textAlign: 'right',
    color: tokens.text[1],
  },
  suffix: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.text[2],
  },
  label: {
    fontSize: 11,
    color: tokens.text[3],
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'right',
  },
  trend: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
