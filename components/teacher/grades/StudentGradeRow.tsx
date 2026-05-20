// StudentGradeRow — single editable row in the stage-2 grade matrix.
// Pure controlled input; parent owns the score map, focus state, and progress drawer.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

type Props = {
  student: any;
  index: number;
  value: string;
  maxScore: number;
  borderColor: string;
  onChange: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onOpenProgress: () => void;
};

export default function StudentGradeRow({
  student, index, value, maxScore, borderColor,
  onChange, onFocus, onBlur, onOpenProgress,
}: Props) {
  const { t } = useTranslation();
  const displayName = student.full_name || student.name || t('roles.student');

  return (
    <View style={s.studentRow}>
      <TextInput
        style={[s.scoreInput, { borderColor }]}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="—"
        placeholderTextColor={tokens.color.text4}
        keyboardType="decimal-pad"
        maxLength={5}
        textAlign="center"
      />
      <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
        <Text style={s.studentName}>{displayName}</Text>
        <Text style={s.studentSub}>من {maxScore}</Text>
      </View>
      <TouchableOpacity
        onPress={onOpenProgress}
        style={{ padding: 6 }}
        accessibilityRole="button"
        accessibilityLabel={`عرض تقدم ${displayName}`}
      >
        <Ionicons name="stats-chart" size={18} color={tokens.color.brand500} />
      </TouchableOpacity>
      <View style={s.rowNum}>
        <Text style={s.rowNumText}>{index + 1}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  studentRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: tokens.color.border2, gap: 10,
  },
  scoreInput: {
    width: 64, height: 48, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface2, borderWidth: 2,
    fontSize: 18, fontWeight: tokens.font.weight.heavy, color: tokens.color.text,
  },
  studentName: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right' },
  studentSub: { fontSize: tokens.font.size.xs, color: tokens.color.text3 },
  rowNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  rowNumText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.heavy, color: tokens.color.text3 },
});
