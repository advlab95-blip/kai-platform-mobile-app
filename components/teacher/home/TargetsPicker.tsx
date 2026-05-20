// TargetsPicker — multi-target picker (sections × subjects). One place to pick
// targets that drives uploads + content filters globally. Renders nothing if
// the teacher has no resolved targets yet.

import React from 'react';
import { Text, TouchableOpacity, View, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';
import type { ContentTarget } from '../../../stores/teacherStore';

type Props = {
  targets: ContentTarget[];
  selectedTargets: ContentTarget[];
  onSelectAll: () => void;
  onClear: () => void;
  onToggle: (target: ContentTarget) => void;
};

export default function TargetsPicker({ targets, selectedTargets, onSelectAll, onClear, onToggle }: Props) {
  const { t } = useTranslation();
  if (targets.length === 0) return null;
  const keyOf = (tg: ContentTarget) => `${tg.classId || ''}|${tg.sectionId || ''}|${tg.subjectId}`;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={onSelectAll} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: tokens.color.brand50 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: tokens.color.brand500 }}>{t('common.selectAll', { defaultValue: 'اختر الكل' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClear} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F1F5F9' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: Colors.textMuted }}>{t('common.cancel', { defaultValue: 'إلغاء' })}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionTitle}>{t('teacherHome.myTargets', { defaultValue: 'أهدافي' })} ({selectedTargets.length}/{targets.length})</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 12, marginTop: 6 }} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 6 }}>
        {targets.map((tg, i) => {
          const active = selectedTargets.some(s => keyOf(s) === keyOf(tg));
          return (
            <TouchableOpacity
              key={`${tg.classId || tg.sectionId}_${tg.subjectId}_${i}`}
              onPress={() => onToggle(tg)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
                backgroundColor: active ? tokens.color.brand500 : '#fff',
                borderWidth: 1.5, borderColor: active ? tokens.color.brand500 : Colors.border,
              }}
            >
              <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={active ? '#fff' : Colors.textMuted} />
              <View>
                <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#fff' : Colors.text }}>{tg.displayName}</Text>
                <Text style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.8)' : Colors.textMuted }}>{tg.subjectName}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
});
