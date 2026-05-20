// AssignmentList — groups assignments by subject (with teacher fallback) and renders rows.
// Empty/loading states handled by parent; this component only renders when data is ready.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import AssignmentRow from './AssignmentRow';

type TeacherSubjectMap = Record<string, { subject_id: string; subject_name: string }>;

type Props = {
  assignments: any[];
  teacherSubjectMap: TeacherSubjectMap;
  onRowPress: (a: any) => void;
};

export default function AssignmentList({ assignments, teacherSubjectMap, onRowPress }: Props) {
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; items: any[] }>();
    for (const a of assignments) {
      const teacherSubj = a.teacher_id ? teacherSubjectMap[a.teacher_id] : null;
      const key = a.subject_id || teacherSubj?.subject_id || '__other__';
      if (!m.has(key)) {
        m.set(key, {
          key,
          label: a.subjects?.name || a.subject_name || teacherSubj?.subject_name || (key === '__other__' ? t('common.other', { defaultValue: 'أخرى' }) : t('common.subject', { defaultValue: 'مادة' })),
          items: [],
        });
      }
      m.get(key)!.items.push(a);
    }
    return Array.from(m.values());
  }, [assignments, teacherSubjectMap, t]);

  if (assignments.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="document-text-outline" size={48} color={tokens.color.text4} />
        <Text style={styles.emptyText}>{t('student.noAssignments')}</Text>
      </View>
    );
  }

  return (
    <>
      {groups.map(group => (
        <View key={group.key} style={{ marginBottom: 12 }}>
          <View style={styles.groupHeader}>
            <Ionicons name="bookmark" size={14} color={tokens.color.teal600} />
            <Text style={styles.groupLabel}>
              {group.label} ({group.items.length})
            </Text>
          </View>
          {group.items.map((a: any) => (
            <AssignmentRow
              key={a.id}
              assignment={a}
              groupLabel={group.label}
              onPress={() => onRowPress(a)}
            />
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text3,
    marginTop: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 6,
  },
  groupLabel: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.teal700,
    textAlign: 'right',
    flex: 1,
    writingDirection: 'rtl',
  },
});
