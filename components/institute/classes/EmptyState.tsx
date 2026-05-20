// Generic empty-state placeholder used by the Classes screen.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

export default function EmptyState({ icon, label }: Props) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={Colors.textMuted} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 8, marginTop: 40 },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20 },
});
