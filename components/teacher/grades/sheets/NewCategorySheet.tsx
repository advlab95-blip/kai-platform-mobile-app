// NewCategorySheet — bottom sheet for creating a new grade category (name/type/max).
// Pure controlled view; parent owns all field state and the create handler.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../../constants/designTokens';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import PrimaryButton from '../../buttons/PrimaryButton';

type GradeType = { key: string; labelKey: string; icon: string; color: string; label: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  name: string;
  onNameChange: (text: string) => void;
  type: string;
  onTypeChange: (key: string) => void;
  maxScore: string;
  onMaxScoreChange: (text: string) => void;
  gradeTypes: GradeType[];
  creating: boolean;
  onCreate: () => void;
};

export default function NewCategorySheet({
  visible, onClose, name, onNameChange, type, onTypeChange,
  maxScore, onMaxScoreChange, gradeTypes, creating, onCreate,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheetBody}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={tokens.color.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: tokens.font.size['2xl'], fontWeight: tokens.font.weight.heavy, color: tokens.color.text }}>
              فئة تقييم جديدة
            </Text>
          </View>

          <Text style={s.fieldLabel}>اسم الفئة</Text>
          <TextInput
            style={s.input}
            placeholder="مثال: امتحان شهر نوفمبر"
            placeholderTextColor={tokens.color.text3}
            value={name}
            onChangeText={onNameChange}
            textAlign="right"
          />

          <Text style={s.fieldLabel}>نوع التقييم</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
            {gradeTypes.map(gt => (
              <TouchableOpacity
                key={gt.key}
                style={[s.typeChip, type === gt.key && { backgroundColor: gt.color, borderColor: gt.color }]}
                onPress={() => onTypeChange(gt.key)}
              >
                <Ionicons name={gt.icon as any} size={14} color={type === gt.key ? '#fff' : gt.color} />
                <Text style={[s.typeChipText, type === gt.key && { color: '#fff' }]}>
                  {gt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={s.fieldLabel}>الدرجة القصوى</Text>
          <TextInput
            style={s.input}
            placeholder="100"
            placeholderTextColor={tokens.color.text3}
            value={maxScore}
            onChangeText={onMaxScoreChange}
            keyboardType="numeric"
            textAlign="right"
          />

          <PrimaryButton
            label="إنشاء"
            onPress={onCreate}
            loading={creating}
            disabled={creating || !name.trim()}
            icon="add-circle"
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

const s = StyleSheet.create({
  sheetBody: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  fieldLabel: { fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right', marginBottom: 6 },
  input: {
    backgroundColor: tokens.color.surface2, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.color.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.text, marginBottom: 12,
  },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface, marginRight: 8,
    borderWidth: 1, borderColor: tokens.color.border,
  },
  typeChipText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.text },
});
