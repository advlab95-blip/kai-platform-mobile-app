// One row in the parent attendance records list (brief §7.3).
// Shows date + subject meta + colored status badge + optional "تبرير" CTA on unjustified absences.
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type Status = 'present' | 'late' | 'absent' | 'justified' | string;

interface Props {
  record: {
    id: string;
    date?: string;
    status: Status;
    timetables?: { subject?: string } | null;
  };
  onJustify?: (record: any) => void;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; key: string; defaultLabel: string }> = {
  present:   { bg: tokens.color.successBg, fg: tokens.color.success,  key: 'parent.present',   defaultLabel: 'حاضر' },
  late:      { bg: tokens.color.warningBg, fg: tokens.color.warning,  key: 'parent.late',      defaultLabel: 'متأخر' },
  absent:    { bg: tokens.color.dangerBg,  fg: tokens.color.danger,   key: 'parent.absent',    defaultLabel: 'غائب' },
  justified: { bg: tokens.color.infoBg,    fg: tokens.color.info,     key: 'parent.justified', defaultLabel: 'مبرر' },
};

function AttendanceRecordRow({ record, onJustify }: Props) {
  const { t } = useTranslation();
  const info = STATUS_COLORS[record.status] || {
    bg: tokens.color.surface2,
    fg: tokens.color.text,
    key: '',
    defaultLabel: String(record.status),
  };

  const handleJustify = useCallback(() => {
    haptics.selection();
    onJustify?.(record);
  }, [record, onJustify]);

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.subject} numberOfLines={1}>
          {record.timetables?.subject || t('common.subject', { defaultValue: 'الحصة' })}
        </Text>
        <Text style={styles.date}>
          {record.date ? new Date(record.date).toLocaleDateString('ar-IQ') : ''}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: info.bg }]}>
        <Text style={[styles.badgeText, { color: info.fg }]}>
          {info.key ? t(info.key, { defaultValue: info.defaultLabel }) : info.defaultLabel}
        </Text>
      </View>
      {record.status === 'absent' && onJustify ? (
        <TouchableOpacity style={styles.justifyBtn} onPress={handleJustify} accessibilityRole="button">
          <Text style={styles.justifyText}>
            {t('parent.requestJustification', { defaultValue: 'تبرير' })}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  info: { flex: 1, alignItems: 'flex-end' },
  subject: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  date: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
    marginLeft: 10,
  },
  badgeText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.heavy,
  },
  justifyBtn: {
    backgroundColor: tokens.color.p50,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: tokens.color.p100,
  },
  justifyText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.p700,
  },
});

export default memo(AttendanceRecordRow);
