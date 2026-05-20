import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../../../constants/colors';
import FilterChip from '../chips/FilterChip';
import { targetKey } from './_helpers';
import type { ContentTarget } from '../../../stores/teacherStore';

export interface TargetsBarProps {
  targets: ContentTarget[];
  selectedTargets: ContentTarget[];
  onToggle: (t: ContentTarget) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

/**
 * Horizontal bar with multi-target FilterChip row + اختر الكل / إلغاء الكل actions.
 * Pure presentational — receives target arrays + callbacks.
 */
export default function TargetsBar({
  targets,
  selectedTargets,
  onToggle,
  onSelectAll,
  onClearAll,
}: TargetsBarProps) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: '#FAFBFC',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            onPress={onSelectAll}
            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EEF2FF' }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: Colors.primary }}>اختر الكل</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClearAll}
            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#F1F5F9' }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: Colors.textMuted }}>إلغاء الكل</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.textSecondary }}>
          الأهداف النشطة: {selectedTargets.length} / {targets.length}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 4 }}
      >
        {targets.map((tg, i) => {
          const active = selectedTargets.some((s) => targetKey(s) === targetKey(tg));
          return (
            <FilterChip
              key={`${tg.classId || tg.sectionId}_${tg.subjectId}_${i}`}
              label={`${tg.subjectName} — ${tg.displayName}`}
              active={active}
              onPress={() => onToggle(tg)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
