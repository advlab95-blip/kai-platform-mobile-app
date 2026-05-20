// GradeEntryHeader — stage-2 top header showing category name + max-score, with back button.
// Pure presentational; parent supplies labels and the back handler.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

type Props = {
  categoryName: string;
  maxScore: number;
  onBack: () => void;
};

export default function GradeEntryHeader({ categoryName, maxScore, onBack }: Props) {
  const { t } = useTranslation();
  return (
    <View style={s.entryHeader}>
      <TouchableOpacity
        onPress={onBack}
        style={s.backBtn}
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="arrow-forward" size={20} color={tokens.color.text} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={s.entryTitle}>{categoryName}</Text>
        <Text style={s.entrySub}>
          {t('teacherGrades.maxScore')}: {maxScore}
        </Text>
      </View>
      <View style={{ width: 36 }} />
    </View>
  );
}

const s = StyleSheet.create({
  entryHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: tokens.color.surface, borderBottomWidth: 1, borderBottomColor: tokens.color.border2,
  },
  entryTitle: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text },
  entrySub: { fontSize: tokens.font.size.sm, color: tokens.color.text3, marginTop: 2 },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
});
