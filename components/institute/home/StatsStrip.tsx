// StatsStrip — horizontal 4-card stat strip (Students / Teachers / Classes / Attendance%).
// Pure presentational; parent owns numbers, classes count, navigation handlers.

import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { tokens } from '../../../constants/theme';
import HorizontalStatCard from '../HorizontalStatCard';

type Props = {
  totalStudents: number;
  totalTeachers: number;
  classesCount: number;
  attendancePercentage: number;
  onStudentsPress: () => void;
  onTeachersPress: () => void;
  onClassesPress: () => void;
  onAttendancePress: () => void;
};

export default function StatsStrip({
  totalStudents,
  totalTeachers,
  classesCount,
  attendancePercentage,
  onStudentsPress,
  onTeachersPress,
  onClassesPress,
  onAttendancePress,
}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.statsScroll}
    >
      <HorizontalStatCard
        value={totalStudents}
        label="الطلاب"
        icon="school"
        iconBg={tokens.brand[100]}
        iconColor={tokens.brand[500]}
        delay={0}
        onPress={onStudentsPress}
      />
      <HorizontalStatCard
        value={totalTeachers}
        label="الأساتذة"
        icon="people"
        iconBg={tokens.semantic.infoBg}
        iconColor={tokens.semantic.info}
        delay={70}
        onPress={onTeachersPress}
      />
      <HorizontalStatCard
        value={classesCount}
        label="الصفوف"
        icon="grid"
        iconBg={tokens.semantic.successBg}
        iconColor={tokens.semantic.success}
        delay={140}
        onPress={onClassesPress}
      />
      <HorizontalStatCard
        value={attendancePercentage}
        suffix="%"
        label="الحضور"
        icon="checkmark-circle"
        iconBg={tokens.semantic.purpleBg}
        iconColor={tokens.semantic.purple}
        delay={210}
        onPress={onAttendancePress}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  statsScroll: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
});
