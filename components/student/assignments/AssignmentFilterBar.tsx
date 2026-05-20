// AssignmentFilterBar — horizontal scroll of FilterChips (all/pending/submitted/late).
// Pure controlled component; parent owns the active filter state.

import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import FilterChip from '../../teacher/chips/FilterChip';

export type AssignmentFilterKey = 'all' | 'pending' | 'submitted' | 'late';

type Props = {
  filter: AssignmentFilterKey;
  counts: { all: number; pending: number; submitted: number; late: number };
  onChange: (k: AssignmentFilterKey) => void;
};

export default function AssignmentFilterBar({ filter, counts, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      <FilterChip
        label={t('common.all', { defaultValue: 'الكل' })}
        active={filter === 'all'}
        count={counts.all}
        accent="student"
        onPress={() => onChange('all')}
      />
      <FilterChip
        label={t('student.pending', { defaultValue: 'معلّقة' })}
        active={filter === 'pending'}
        accent="student"
        onPress={() => onChange('pending')}
      />
      <FilterChip
        label={t('student.submittedLabel', { defaultValue: 'مُسلّمة' })}
        active={filter === 'submitted'}
        accent="student"
        onPress={() => onChange('submitted')}
      />
      <FilterChip
        label={t('student.lateLabel', { defaultValue: 'متأخرة' })}
        active={filter === 'late'}
        accent="student"
        onPress={() => onChange('late')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
});
