// Compact attendance summary on parent home (brief §7.1):
// 110×110 ring + child name/class + present/absent line.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import AttendanceRing from '../rings/AttendanceRing';

interface Props {
  childName: string;
  classLabel?: string;
  attendance: { percentage: number; present: number; absent: number; total: number };
}

function CompactAttendanceCard({ childName, classLabel, attendance }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {t('parent.attendancePercentage', { defaultValue: 'نسبة الحضور' })}
      </Text>
      <View style={styles.row}>
        <AttendanceRing percentage={attendance.percentage} size={110} />
        <View style={styles.info}>
          <Text style={styles.childName} numberOfLines={1}>{childName}</Text>
          {classLabel ? <Text style={styles.classLabel} numberOfLines={1}>{classLabel}</Text> : null}
          <Text style={styles.detail}>
            {t('parent.attendancePresent', { defaultValue: 'حاضرة' })}: {attendance.present}
            {' · '}
            {t('parent.attendanceAbsent', { defaultValue: 'غياب' })}: {attendance.absent}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  cardTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  info: { alignItems: 'flex-end', gap: 4, flexShrink: 1 },
  childName: {
    fontSize: tokens.font.size.lg + 1,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  classLabel: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
  },
  detail: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
  },
});

export default memo(CompactAttendanceCard);
