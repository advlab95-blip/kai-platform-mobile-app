// Small pill-shaped button used for per-user actions (reset code, transfer, etc.).
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export default function ActionPill({ icon, label, onPress, danger }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.actionPill, danger && { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
    >
      <Ionicons name={icon} size={13} color={danger ? '#DC2626' : Colors.primary} />
      <Text style={[styles.actionPillText, danger && { color: '#DC2626' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  actionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: Colors.primary + '12',
    borderRadius: 10, borderWidth: 1, borderColor: Colors.primary + '33',
  },
  actionPillText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
});
