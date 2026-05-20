// GradeMatrix — stage-2 student list (FlashList) with empty / loading / "no target" states.
// Pure controlled view; parent supplies entries map, focus state, and per-row callbacks.

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import StudentGradeRow from './StudentGradeRow';

type Props = {
  loading: boolean;
  hasTarget: boolean;
  students: any[];
  searchQuery: string;
  gradeEntries: Record<string, string>;
  focusedStudentId: string | null;
  maxScore: number;
  scoreBorderColor: (val: string, focused: boolean) => string;
  onChangeEntry: (studentId: string, value: string) => void;
  onFocusStudent: (studentId: string | null) => void;
  onOpenProgress: (student: { id: string; name: string }) => void;
};

export default function GradeMatrix({
  loading, hasTarget, students, searchQuery, gradeEntries, focusedStudentId,
  maxScore, scoreBorderColor, onChangeEntry, onFocusStudent, onOpenProgress,
}: Props) {
  const { t } = useTranslation();

  if (loading) {
    return <ActivityIndicator size="large" color={tokens.color.brand500} style={{ marginTop: 40 }} />;
  }
  if (!hasTarget) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="people-outline" size={48} color={tokens.color.text4} />
        <Text style={s.emptyText}>اختر الصف والمادة لعرض الطلاب</Text>
      </View>
    );
  }
  if (students.length === 0) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="school-outline" size={48} color={tokens.color.text4} />
        <Text style={s.emptyText}>{searchQuery ? 'لا توجد نتائج للبحث' : 'لا يوجد طلاب في هذه الشعبة'}</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={students}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
      renderItem={({ item, index }) => {
        const val = gradeEntries[item.id] || '';
        const isFocused = focusedStudentId === item.id;
        const borderCol = scoreBorderColor(val, isFocused);
        return (
          <StudentGradeRow
            student={item}
            index={index}
            value={val}
            maxScore={maxScore}
            borderColor={borderCol}
            onChange={(v) => onChangeEntry(item.id, v)}
            onFocus={() => onFocusStudent(item.id)}
            onBlur={() => onFocusStudent(null)}
            onOpenProgress={() => onOpenProgress({
              id: item.id,
              name: item.full_name || item.name || t('roles.student'),
            })}
          />
        );
      }}
      ListEmptyComponent={<Text style={s.emptyText}>{t('teacherGrades.noStudentsInClass')}</Text>}
    />
  );
}

const s = StyleSheet.create({
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: tokens.font.size.md, color: tokens.color.text3, textAlign: 'center' },
});
