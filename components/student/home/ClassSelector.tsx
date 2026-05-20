// ClassSelector — horizontal teal chips. Renders only when student has >1 class.
// Pure presentational. Parent owns selectedClassId in store.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type ClassItem = { id: string; name?: string | null; student_count?: number | null };

type Props = {
  classes: ClassItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function ClassSelector({ classes, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  if (classes.length <= 1) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.sectionTitle}>{t('student.selectClass')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {classes.map((cls) => {
            const active = selectedId === cls.id;
            return (
              <TouchableOpacity
                key={cls.id}
                onPress={() => { haptics.selection(); onSelect(cls.id); }}
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
                  {cls.name || t('student.class')}
                </Text>
                {cls.student_count ? (
                  <Text
                    style={[
                      styles.chipSubtext,
                      { color: active ? 'rgba(255,255,255,0.75)' : tokens.color.text3 },
                    ]}
                  >
                    {t('student.studentCount', { count: cls.student_count })}
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
