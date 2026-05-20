// Day-tab chip in the parent schedule screen (brief §7.6).
// Active chip → violet gradient + white text. Inactive → soft surface.
import React, { memo } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../../constants/designTokens';

interface Props {
  label: string;
  count: number;
  active: boolean;
  isToday?: boolean;
  onPress: () => void;
}

function DayChip({ label, count, active, isToday, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <LinearGradient
        colors={active ? tokens.gradient.parentSoft : ['#F1F5F9', '#F8FAFC']}
        style={styles.chip}
      >
        <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
        <Text style={[styles.count, active && styles.countActive]}>{count}</Text>
        {isToday ? (
          <View style={[styles.todayDot, active && styles.todayDotActive]} />
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 60,
    position: 'relative',
  },
  label: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
  },
  labelActive: { color: '#fff' },
  count: { fontSize: tokens.font.size.xs, color: tokens.color.text3, marginTop: 2 },
  countActive: { color: 'rgba(255,255,255,0.75)' },
  todayDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.p600,
  },
  todayDotActive: { backgroundColor: '#fff' },
});

export default memo(DayChip);
