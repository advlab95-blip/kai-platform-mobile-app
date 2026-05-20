import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { tokens } from '../../../../constants/designTokens';
import { ALL_DAYS } from '../_helpers';
import type { SkippedSlot } from '../_smartGenerate';

type Props = {
  visible: boolean;
  skipped: SkippedSlot[];
  onClose: () => void;
};

const dayLabel = (key: number): string =>
  ALL_DAYS.find((d) => d.key === key)?.label || '—';

const reasonLabel = (reason: SkippedSlot['reason']): string => {
  // Map each generator skip reason to a clear Arabic explanation the admin can act on.
  switch (reason) {
    case 'no_free_teacher':
      return 'لا يوجد أستاذ متاح في هذا الوقت';
    case 'no_assignment':
      return 'لا يوجد أستاذ معيّن لهذا الصف';
    case 'no_subjects':
      return 'لا توجد مواد معرّفة للأستاذ';
    case 'partial_coverage':
      return 'تغطية جزئية فقط — أضف أساتذة';
    default:
      return 'لم يتم التوليد';
  }
};

export default function SkippedSlotsSheet({ visible, skipped, onClose }: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.78}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="warning-outline" size={26} color={tokens.color.warning} />
        </View>
        <Text style={styles.title}>الحصص المتخطاة</Text>
        <Text style={styles.subtitle}>
          {skipped.length} حصة لم يتم توليدها
        </Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {skipped.map((s, idx) => (
          <View key={`${s.classId}-${s.day}-${s.period}-${idx}`} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.className} numberOfLines={1}>
                {s.className}
              </Text>
              <Text style={styles.dayPeriod}>
                {dayLabel(s.day)} · حصة {s.period} ({s.startTime})
              </Text>
            </View>
            <Text style={styles.reason}>{reasonLabel(s.reason)}</Text>
          </View>
        ))}
      </ScrollView>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[3],
    paddingBottom: tokens.spacing[3],
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[2],
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    writingDirection: 'rtl',
  },
  subtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    marginTop: 2,
    writingDirection: 'rtl',
  },
  list: {
    paddingHorizontal: tokens.spacing[5],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[3],
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginBottom: tokens.spacing[2],
    gap: 12,
  },
  rowMain: {
    flex: 1,
  },
  className: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    writingDirection: 'rtl',
  },
  dayPeriod: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    marginTop: 2,
    writingDirection: 'rtl',
  },
  reason: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.warning,
    fontWeight: tokens.font.weight.semi,
    writingDirection: 'rtl',
  },
});
