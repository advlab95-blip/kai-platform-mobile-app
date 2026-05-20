// One metric tile inside the student-detail metrics row.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
}

export default function MetricTile({ icon, label, value, tint }: Props) {
  return (
    <View style={styles.metricTile}>
      <View style={[styles.metricIconBox, { backgroundColor: tint + '18' }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={[styles.metricValue, { color: tint }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricTile: {
    flex: 1, backgroundColor: Colors.surface,
    padding: 10, borderRadius: 10,
    alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  metricIconBox: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  metricValue: { fontSize: 16, fontWeight: '900' },
  metricLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
});
