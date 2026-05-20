// TargetPicker — stage-2 search box + horizontal class/section/subject chips.
// Pure controlled view: parent owns searchQuery + targetKey state.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import FilterChip from '../chips/FilterChip';

type Props = {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  targets: any[];
  targetKey: string;
  onTargetSelect: (key: string) => void;
};

export default function TargetPicker({
  searchQuery, onSearchChange, targets, targetKey, onTargetSelect,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      {/* Search bar */}
      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color={tokens.color.text3} />
        <TextInput
          style={s.searchInput}
          placeholder={t('teacherGrades.searchStudent', { defaultValue: 'ابحث عن طالب' })}
          placeholderTextColor={tokens.color.text3}
          value={searchQuery}
          onChangeText={onSearchChange}
          textAlign="right"
        />
      </View>

      {/* Class/target filter chips */}
      <View style={s.pickerWrap}>
        <Text style={s.pickerLabel}>اختر الصف/الشعبة والمادة</Text>
        {targets.length === 0 ? (
          <View style={s.warnBox}>
            <Ionicons name="warning" size={14} color={tokens.color.warning} />
            <Text style={s.warnText}>
              لا توجد مواد مُخصّصة لك — راجع الإدارة لإضافة تعييناتك
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
            {targets.map((tg) => {
              const k = `${tg.classId || ''}|${tg.sectionId || ''}|${tg.subjectId}`;
              const active = targetKey === k;
              return (
                <FilterChip
                  key={k}
                  label={`${tg.displayName || '—'} · ${tg.subjectName}`}
                  active={active}
                  onPress={() => onTargetSelect(k)}
                />
              );
            })}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: tokens.color.surface,
    marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border2,
  },
  searchInput: {
    flex: 1, fontSize: tokens.font.size.lg, color: tokens.color.text,
    padding: 0, margin: 0,
  },
  pickerWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  pickerLabel: {
    fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.heavy, color: tokens.color.text,
    textAlign: 'right', marginBottom: 8,
  },
  warnBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: tokens.color.warningBg, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: tokens.color.warning,
  },
  warnText: { fontSize: tokens.font.size.sm, color: tokens.color.warning, flex: 1, textAlign: 'right' },
});
