// Category filter chip on parent grades screen (brief §7.10).
// Active chip: violet bg + white text. Inactive: surface bg + dark text.
import React, { memo } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { tokens } from '../../../constants/designTokens';

interface Props {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}

function CategoryFilterChip({ label, count, active, onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      <View style={[styles.badge, active && styles.badgeActive]}>
        <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  chipActive: {
    backgroundColor: tokens.color.p600,
    borderColor: tokens.color.p600,
  },
  label: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
  },
  labelActive: { color: '#fff' },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  badgeText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
  },
  badgeTextActive: { color: '#fff' },
});

export default memo(CategoryFilterChip);
