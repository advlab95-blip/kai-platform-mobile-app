// TeacherStatsRow — 3 stat cards (today's lessons, attendance %, students count).

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import StatCard from '../cards/StatCard';

type Props = {
  todayLessonsCount: number;
  attendanceRate: number;
  studentsCount: number;
  onTodayLessonsPress?: () => void;
  onStudentsPress?: () => void;
  onAttendancePress?: () => void;
};

export default function TeacherStatsRow({
  todayLessonsCount,
  attendanceRate,
  studentsCount,
  onTodayLessonsPress,
  onStudentsPress,
  onAttendancePress,
}: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.statsRow}>
      <StatCard
        label={t('teacherHome.todayLessons')}
        value={todayLessonsCount}
        gradient="brand"
        icon="time"
        onPress={onTodayLessonsPress}
      />
      <StatCard
        label={t('teacherHome.attendanceRate')}
        value={`${attendanceRate}%`}
        gradient="success"
        icon="checkmark-circle"
        onPress={onAttendancePress}
      />
      <StatCard
        label={t('common.students')}
        value={studentsCount}
        gradient="info"
        icon="people"
        onPress={onStudentsPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
});
