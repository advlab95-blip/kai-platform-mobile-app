// "All students" section on the medical home.
// Pure presentation: parent owns the data + selection callback.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { StudentRowItem, StudentRowData } from '../cards/StudentRecordRow';

interface Props {
  students: StudentRowData[];
  onSelect: (student: StudentRowData) => void;
}

function StudentsList({ students, onSelect }: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={styles.sectionTitle}>
        {t('medical.allStudents', { count: students.length })}
      </Text>
      {students.length === 0 ? (
        <Text style={styles.emptyText}>{t('medical.noRegisteredStudents')}</Text>
      ) : (
        students.map((student) => (
          <StudentRowItem
            key={student.id}
            student={student}
            onPress={() => onSelect(student)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[3],
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: tokens.spacing[5],
  },
});

export default memo(StudentsList);
