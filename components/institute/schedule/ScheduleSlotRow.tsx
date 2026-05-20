// ScheduleSlotRow — single timetable slot card (time chip + subject + teacher meta + delete).
// Pure presentational: parent owns press / delete handlers and provides display data.
//
// Visual hierarchy (top → bottom, right → left for RTL):
//   ┌────────────────────────────────────────────────────────┐
//   │ [time     ]  │ Subject (large bold)            [trash] │
//   │ [chip rail]  │ Teacher · Class · Room (small muted)   │
//   └────────────────────────────────────────────────────────┘
// The left "time chip" doubles as a vertical color rail — gives the row a
// distinctive horizontal scan rhythm so the admin can read the day quickly.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';
import { formatTime } from './_helpers';

type Props = {
  slot: any;
  unspecifiedLabel: string;
  onPress: () => void;
  onDelete: () => void;
};

export default function ScheduleSlotRow({ slot, unspecifiedLabel, onPress, onDelete }: Props) {
  // Build meta line — teacher · class · room, skipping any blanks so we don't
  // ship lonely dot separators.
  const teacherName = slot.users?.full_name || unspecifiedLabel;
  const className = slot.classes?.name || slot.class_name || null;
  const room = slot.room || null;
  const metaParts = [teacherName];
  if (className) metaParts.push(className);
  if (room) metaParts.push(room);
  const meta = metaParts.join('  •  ');

  return (
    <TouchableOpacity style={styles.slotCard} activeOpacity={0.85} onPress={onPress}>
      {/* Time rail — monospaced-feel chip column. Acts as a left accent. */}
      <View style={styles.slotTimeBox}>
        <Text style={styles.slotTimeText}>{formatTime(slot.start_time)}</Text>
        <View style={styles.slotTimeBar} />
        <Text style={styles.slotTimeText}>{formatTime(slot.end_time)}</Text>
      </View>

      <View style={styles.slotInfo}>
        <Text style={styles.slotSubject} numberOfLines={1}>{slot.subject}</Text>
        <Text style={styles.slotMeta} numberOfLines={1}>{meta}</Text>
      </View>

      <TouchableOpacity
        style={styles.slotDeleteBtn}
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  slotCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 12,
    ...tokens.shadow.xs,
  },
  slotTimeBox: {
    backgroundColor: tokens.color.brand100,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  slotTimeText: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.color.brand600,
    letterSpacing: 0.3,
  },
  slotTimeBar: {
    width: 14,
    height: 1.5,
    backgroundColor: tokens.color.brand500,
    opacity: 0.45,
    marginVertical: 3,
    borderRadius: 1,
  },
  slotInfo: {
    flex: 1,
  },
  slotSubject: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    letterSpacing: 0.1,
  },
  slotMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 3,
  },
  slotDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface2,
  },
});
