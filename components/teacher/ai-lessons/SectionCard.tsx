import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

export default function SectionCard({
  icon, title, color, children,
}: { icon: any; title: string; color: string; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { borderRightColor: color }]}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={[styles.sectionCardTitle, { color }]}>{title}</Text>
      </View>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}
