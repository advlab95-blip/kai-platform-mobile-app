import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

export type Trend = 'up' | 'down' | 'flat';

interface Props {
  label: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  trend?: Trend;
  trendText?: string; // e.g., "+12% من الأسبوع الماضي"
  style?: ViewStyle;
  onPress?: () => void;
}

const TREND_ICON: Record<Trend, keyof typeof Ionicons.glyphMap> = {
  up: 'trending-up',
  down: 'trending-down',
  flat: 'remove',
};

const TREND_COLOR: Record<Trend, string> = {
  up: Colors.success,
  down: Colors.error,
  flat: Colors.textMuted,
};

export default function StatCard({
  label,
  value,
  icon,
  color = Colors.primary,
  trend,
  trendText,
  style,
  onPress,
}: Props) {
  const inner = (
    <>
      {!!icon && (
        <View style={[styles.iconWrap, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
      )}
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      {!!trend && (
        <View style={styles.trendRow}>
          <Ionicons name={TREND_ICON[trend]} size={12} color={TREND_COLOR[trend]} />
          {!!trendText && (
            <Text style={[styles.trendText, { color: TREND_COLOR[trend] }]} numberOfLines={1}>
              {trendText}
            </Text>
          )}
        </View>
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={[styles.card, style]} activeOpacity={0.85} onPress={onPress}>
        {inner}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.card, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 110,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'right',
    fontWeight: '600',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
