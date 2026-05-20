// Horizontal child chip selector shown on the parent home (brief §7.1).
// Distinct from <ChildSwitcher> which is the inline selector reused on every
// child-scoped screen. Source of truth for selectedChildId is useParentStore.
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

interface ChildItem {
  id: string;
  name: string;
}

interface Props {
  children: ChildItem[];
  selectedChildId: string | null;
  onSelect: (childId: string) => void;
}

function ChildSelector({ children, selectedChildId, onSelect }: Props) {
  const { t } = useTranslation();

  const handlePress = useCallback(
    (id: string) => {
      haptics.selection();
      onSelect(id);
    },
    [onSelect],
  );

  if (children.length === 0) {
    return (
      <Text style={styles.emptyText}>
        {t('parent.noLinkedStudents', { defaultValue: 'لا يوجد طالب مرتبط' })}
      </Text>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {children.map((child) => {
        const active = selectedChildId === child.id;
        return (
          <TouchableOpacity
            key={child.id}
            style={[styles.card, active && styles.cardActive]}
            onPress={() => handlePress(child.id)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <View style={[styles.avatar, active && styles.avatarActive]}>
              <Ionicons
                name="school"
                size={18}
                color={active ? '#fff' : tokens.color.text3}
              />
            </View>
            <Text
              style={[styles.name, active && styles.nameActive]}
              numberOfLines={1}
            >
              {child.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingBottom: tokens.spacing[4] },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
    minWidth: 96,
  },
  cardActive: {
    borderColor: tokens.color.p600,
    backgroundColor: tokens.color.p50,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarActive: { backgroundColor: tokens.color.p600 },
  name: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
    textAlign: 'center',
    maxWidth: 100,
  },
  nameActive: {
    color: tokens.color.p700,
    fontWeight: tokens.font.weight.heavy,
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: tokens.spacing[5],
  },
});

export default memo(ChildSelector);
