// Tab toggle inside the section detail view (Students / Teachers).
import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

interface Props {
  active: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  onPress: () => void;
}

export default function TabButton({ active, label, icon, count, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.tabBtn, active && styles.tabBtnActive]}>
      <Ionicons name={icon} size={14} color={active ? '#fff' : Colors.textMuted} />
      <Text style={[styles.tabBtnText, active && { color: '#fff' }]}>{label}</Text>
      <View style={[styles.tabCountPill, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
        <Text style={[styles.tabCountText, active && { color: '#fff' }]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText: { fontSize: 12, fontWeight: '800', color: Colors.textMuted },
  tabCountPill: {
    backgroundColor: Colors.background,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
  },
  tabCountText: { fontSize: 10, fontWeight: '800', color: Colors.textMuted },
});
