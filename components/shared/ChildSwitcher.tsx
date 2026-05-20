import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import useParentStore from '../../stores/parentStore';
import { useTranslation } from 'react-i18next';

/**
 * Inline child selector for parent screens (attendance/finance/schedule/academic/chat).
 * Previously parents had to navigate back to Home just to switch child — this makes the
 * switch available on every child-scoped screen.
 */
export default function ChildSwitcher() {
  const { t } = useTranslation();
  const { children, selectedChildId, selectChild } = useParentStore();

  // Hide entirely when there's only one child (nothing to switch between)
  if (!children || children.length <= 1) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('parent.selectChildLabel', { defaultValue: 'اختر الطفل' })}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
        {children.map((c: any) => {
          const active = c.id === selectedChildId;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => selectChild(c.id)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-circle" size={18} color={active ? '#fff' : Colors.primary} />
              <Text style={[styles.chipText, active && { color: '#fff' }]} numberOfLines={1}>{c.full_name || c.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textAlign: 'right', marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '800', color: Colors.text, maxWidth: 120 },
});
