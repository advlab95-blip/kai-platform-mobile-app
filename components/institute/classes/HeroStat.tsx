// Pure presentational stat tile inside the section hero gradient.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}

export default function HeroStat({ icon, label, value }: Props) {
  return (
    <View style={styles.heroStat}>
      <Ionicons name={icon} size={16} color="rgba(255,255,255,0.85)" />
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: '#fff' },
  heroStatLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
});
