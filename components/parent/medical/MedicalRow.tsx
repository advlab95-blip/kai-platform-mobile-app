// Generic labeled row in the parent medical record card (brief §7.8).
// Colored icon chip + label + value. Empty values render as "—" dimmed.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  label: string;
  value: any;
  icon: any;
  color: string;
  multiline?: boolean;
}

function MedicalRow({ label, value, icon, color, multiline }: Props) {
  const display = value && String(value).trim() ? value : '—';
  const empty = display === '—';
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={styles.label}>{label}</Text>
        <Text
          style={[styles.value, empty && { color: tokens.color.text3, fontWeight: '400' }]}
          numberOfLines={multiline ? 4 : 1}
        >
          {display}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: tokens.font.size.sm, color: tokens.color.text3, textAlign: 'right' },
  value: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginTop: 2,
  },
});

export default memo(MedicalRow);
