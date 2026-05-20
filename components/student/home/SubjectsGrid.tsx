// SubjectsGrid — 2-column subject cards. Tap → subject-detail page.
// Pure presentational. Parent owns navigation.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type SubjectItem = { id: string; name: string };

type Props = {
  subjects: SubjectItem[];
  onSubjectPress: (subject: SubjectItem) => void;
};

export default function SubjectsGrid({ subjects, onSubjectPress }: Props) {
  const { t } = useTranslation();
  if (subjects.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.sectionTitle}>
        {t('student.subjects', { defaultValue: 'موادي' })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {subjects.map((sub) => (
          <TouchableOpacity
            key={sub.id}
            onPress={() => { haptics.selection(); onSubjectPress(sub); }}
            style={styles.subjectCard}
            activeOpacity={0.85}
          >
            <View style={styles.subjectIconChip}>
              <Ionicons name="book" size={20} color={tokens.color.purple} />
            </View>
            <Text style={styles.subjectName} numberOfLines={2}>{sub.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  subjectCard: {
    width: '48%',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...tokens.shadow.xs,
  },
  subjectIconChip: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.purpleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectName: {
    fontSize: tokens.font.size.md,
    fontWeight: '800',
    color: tokens.color.text,
    flex: 1,
    textAlign: 'right',
  },
});
