// Horizontal scroll of educational stage tabs (المرحلة الابتدائية, etc.).
// Pure presentational — parent owns the active stage state.

import React from 'react';
import { ScrollView, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../../constants/colors';
import { haptics } from '../../../utils/haptics';
import type { StageRow, GradeRow } from './_helpers';

interface Props {
  stages: StageRow[];
  grades: GradeRow[];
  activeStageId: string | null;
  onSelectStage: (id: string) => void;
}

export default function StageTabs({ stages, grades, activeStageId, onSelectStage }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stageTabsScroll}
    >
      {[...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0)).map((stage) => {
        const active = stage.id === activeStageId;
        const countInStage = grades.filter((g) => g.stage_id === stage.id).length;
        return (
          <TouchableOpacity
            key={stage.id}
            activeOpacity={0.85}
            onPress={() => { haptics.selection(); onSelectStage(stage.id); }}
            style={[styles.stageTab, active && styles.stageTabActive]}
          >
            <Text style={[styles.stageTabText, active && styles.stageTabTextActive]}>
              {stage.name}
            </Text>
            <View style={[styles.stageTabPill, active && styles.stageTabPillActive]}>
              <Text style={[styles.stageTabPillText, active && { color: '#065F46' }]}>
                {countInStage}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stageTabsScroll: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  stageTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    minWidth: 132,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginRight: 8,
  },
  stageTabActive: {
    backgroundColor: '#065F46',
    borderColor: '#065F46',
  },
  stageTabText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  stageTabTextActive: { color: '#fff' },
  stageTabPill: {
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 22,
    alignItems: 'center',
  },
  stageTabPillActive: { backgroundColor: 'rgba(255,255,255,0.9)' },
  stageTabPillText: { fontSize: 11, fontWeight: '900', color: Colors.textMuted },
});
