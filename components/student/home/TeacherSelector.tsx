// TeacherSelector — horizontal teal chips. Renders only when student has >1 teacher.
// Pure presentational.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type TeacherItem = { id: string; name: string; subject?: string };

type Props = {
  teachers: TeacherItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function TeacherSelector({ teachers, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  if (teachers.length <= 1) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.sectionTitle}>{t('student.selectTeacher')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {teachers.map((teacher) => {
            const active = selectedId === teacher.id;
            return (
              <TouchableOpacity
                key={teacher.id}
                onPress={() => { haptics.selection(); onSelect(teacher.id); }}
                activeOpacity={0.85}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? tokens.color.teal600 : tokens.color.surface,
                    borderColor: active ? tokens.color.teal600 : tokens.color.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : tokens.color.text }]}>
                  {teacher.name}
                </Text>
                {teacher.subject ? (
                  <Text
                    style={[
                      styles.chipSubtext,
                      { color: active ? 'rgba(255,255,255,0.75)' : tokens.color.text3 },
                    ]}
                  >
                    {teacher.subject}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
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
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 100,
  },
  chipText: {
    fontSize: tokens.font.size.md,
    fontWeight: '800',
    textAlign: 'center',
  },
  chipSubtext: {
    fontSize: tokens.font.size.xs,
    marginTop: 2,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
