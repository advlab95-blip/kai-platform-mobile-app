// ScheduleSlotList — animated list of slots for the selected day, with empty state.
// Pure presentational: parent supplies slots array and per-row handlers.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import FadeSlideIn from '../../animated/FadeSlideIn';
import ScheduleSlotRow from './ScheduleSlotRow';

type Props = {
  slots: any[];
  emptyLabel: string;
  unspecifiedLabel: string;
  onSlotPress: (slot: any) => void;
  onSlotDelete: (slotId: string) => void;
};

export default function ScheduleSlotList({
  slots,
  emptyLabel,
  unspecifiedLabel,
  onSlotPress,
  onSlotDelete,
}: Props) {
  if (slots.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="calendar-outline" size={48} color={Colors.border} />
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {slots.map((item, i) => (
        <FadeSlideIn key={item.id} delay={Math.min(i * 40, 400)} translateFrom={10}>
          <ScheduleSlotRow
            slot={item}
            unspecifiedLabel={unspecifiedLabel}
            onPress={() => onSlotPress(item)}
            onDelete={() => onSlotDelete(item.id)}
          />
        </FadeSlideIn>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '600',
  },
});
