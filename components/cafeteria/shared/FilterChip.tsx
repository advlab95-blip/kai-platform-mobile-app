// Horizontal-scroll filter chip used on the cafeteria orders screen.
// Active state uses orange `o600` background + white text + a white-tinted
// count badge. Counts come from the parent (filtered against full orders list).
import React, { memo } from 'react';
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

interface Props {
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}

function FilterChip({ label, active, count, onPress }: Props) {
  const handlePress = () => {
    haptics.selection();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      {typeof count === 'number' && count >= 0 && (
        <View style={[styles.countBadge, active && styles.countBadgeActive]}>
          <Text style={[styles.countText, active && styles.countTextActive]}>
            {count}
          </Text>
        </View>
      )}
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
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface2,
  },
  chipActive: { backgroundColor: tokens.color.o600 },
  label: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text3,
  },
  labelActive: { color: '#fff' },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface3,
    minWidth: 18,
    alignItems: 'center',
  },
  countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  countText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text2,
  },
  countTextActive: { color: '#fff' },
});

export default memo(FilterChip);
