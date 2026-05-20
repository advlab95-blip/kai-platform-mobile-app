// QuickAccess — single full-width schedule card.
// Homework was removed because the shortcuts row above already exposes assignments
// with its own unread badge — keeping both was a duplicate entry point.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type Props = {
  unseenAssignmentsCount?: number; // unused — kept for back-compat at call sites
  onSchedulePress: () => void;
  onAssignmentsPress?: () => void; // unused
};

export default function QuickAccess({ onSchedulePress }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.quickRow}>
      <TouchableOpacity
        style={styles.quickCardFull}
        activeOpacity={0.85}
        onPress={() => { haptics.selection(); onSchedulePress(); }}
      >
        <LinearGradient
          colors={tokens.gradient.teal as unknown as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.quickCardGradientWide}
        >
          <Ionicons name="calendar" size={26} color="#fff" />
          <Text style={styles.quickCardText}>{t('student.smartSchedule')}</Text>
          <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.85)" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  quickRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickCard: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    ...tokens.shadow.sm,
  },
  quickCardFull: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    ...tokens.shadow.sm,
  },
  quickCardGradient: {
    borderRadius: tokens.radius.lg,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    minHeight: 90,
    justifyContent: 'center',
  },
  quickCardGradientWide: {
    borderRadius: tokens.radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickCardText: {
    fontSize: tokens.font.size.lg,
    fontWeight: '800',
    color: '#fff',
  },
  taskBadge: {
    position: 'absolute',
    top: -4,
    end: -8,
    backgroundColor: tokens.color.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  taskBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
