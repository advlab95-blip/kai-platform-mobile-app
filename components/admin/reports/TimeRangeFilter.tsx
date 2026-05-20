// TimeRangeFilter — horizontal chip selector for time windows.
// Pure controlled component: parent owns the active value.

import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { tokens } from '../../../constants/designTokens';

export type RangeKey = 'thisMonth' | 'last3Months' | 'thisYear' | 'all';

interface Option {
  key: RangeKey;
  label: string;
}

const OPTIONS: Option[] = [
  { key: 'thisMonth',   label: 'هذا الشهر' },
  { key: 'last3Months', label: 'آخر 3 أشهر' },
  { key: 'thisYear',    label: 'هذه السنة' },
  { key: 'all',         label: 'الكل' },
];

interface Props {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}

function TimeRangeFilter({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={{ flexGrow: 0 }}
    >
      {OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Resolves a RangeKey to ISO bounds for Supabase filtering. */
export function resolveRange(key: RangeKey): { sinceISO: string | null; untilISO: string | null } {
  const now = new Date();
  if (key === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { sinceISO: start.toISOString(), untilISO: null };
  }
  if (key === 'last3Months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { sinceISO: start.toISOString(), untilISO: null };
  }
  if (key === 'thisYear') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { sinceISO: start.toISOString(), untilISO: null };
  }
  return { sinceISO: null, untilISO: null };
}

export default memo(TimeRangeFilter);

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row-reverse',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  chipActive: {
    backgroundColor: tokens.color.brand500,
    borderColor: tokens.color.brand500,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.text2,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});
