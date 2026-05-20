// One attendance breakdown chip (present/late/absent/excused).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../../constants/colors';

interface Props {
  label: string;
  value: number;
  color: string;
}

export default function AttendanceDot({ label, value, color }: Props) {
  return (
    <View style={styles.attendanceItem}>
      <View style={[styles.attendanceDot, { backgroundColor: color }]} />
      <Text style={styles.attendanceLabel}>{label}</Text>
      <Text style={[styles.attendanceValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  attendanceItem: { alignItems: 'center', gap: 4 },
  attendanceDot: { width: 8, height: 8, borderRadius: 4 },
  attendanceLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  attendanceValue: { fontSize: 13, fontWeight: '900' },
});
