// One grade row in the list view: grade info on the right, section badges on
// the left.
//
// Visual hierarchy:
//   • Icon bubble (brand-tinted) — anchors the row visually at the start.
//   • Grade name (bold, large) → grade meta (muted small) → section badges.
//   • Section badges keep the success/teal color (they're the actionable atoms).
//
// All props and behaviours unchanged from the previous revision — only the
// styling layer was reworked to use design tokens.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import type { GradeRow as TGradeRow, SectionRow } from './_helpers';

interface Props {
  grade: TGradeRow;
  sections: SectionRow[];
  sectionCounts: Record<string, number>;
  onOpenSection: (sec: SectionRow, gradeName: string) => void;
  onLongPressSection: (sec: SectionRow, gradeName: string) => void;
  onAddSection: (gradeId: string) => void;
}

export default function GradeRow({
  grade, sections, sectionCounts, onOpenSection, onLongPressSection, onAddSection,
}: Props) {
  const totalStudents = sections.reduce((acc, s) => acc + (sectionCounts[s.id] || 0), 0);
  return (
    <View style={styles.gradeRow}>
      {/* Section badges — tap to drill in */}
      <View style={styles.sectionBadgesWrap}>
        {sections.length === 0 ? (
          <View style={styles.sectionBadgeEmpty}>
            <Text style={styles.sectionBadgeEmptyText}>بدون شعب</Text>
          </View>
        ) : (
          sections.map((sec) => (
            <TouchableOpacity
              key={sec.id}
              activeOpacity={0.7}
              onPress={() => { haptics.light(); onOpenSection(sec, grade.name); }}
              onLongPress={() => { haptics.medium(); onLongPressSection(sec, grade.name); }}
              delayLongPress={400}
              style={styles.sectionBadge}
            >
              <Text style={styles.sectionBadgeText}>{sec.name}</Text>
              {sectionCounts[sec.id] ? (
                <View style={styles.sectionBadgeCount}>
                  <Text style={styles.sectionBadgeCountText}>{sectionCounts[sec.id]}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))
        )}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => { haptics.light(); onAddSection(grade.id); }}
          style={styles.sectionBadgeAdd}
        >
          <Ionicons name="add" size={16} color={tokens.color.brand600} />
        </TouchableOpacity>
      </View>

      {/* Grade info (right side in RTL) */}
      <View style={styles.gradeInfo}>
        <Text style={styles.gradeName} numberOfLines={1}>{grade.name}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="grid" size={11} color={tokens.color.text2} />
            <Text style={styles.metaPillText}>{sections.length} شعبة</Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="people" size={11} color={tokens.color.text2} />
            <Text style={styles.metaPillText}>{totalStudents.toLocaleString('ar')}</Text>
          </View>
        </View>
      </View>

      {/* Grade icon bubble — visual anchor on the left in RTL flex (which lands
          at the visual right because parent uses default flexDirection: row). */}
      <View style={styles.gradeBubble}>
        <Ionicons name="school" size={20} color={tokens.color.brand600} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  gradeBubble: {
    width: 42,
    height: 42,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeInfo: { flex: 1, alignItems: 'flex-end', gap: 4 },
  gradeName: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface2,
  },
  metaPillText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
  },

  sectionBadgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: '50%',
    justifyContent: 'flex-start',
  },
  sectionBadge: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    backgroundColor: tokens.color.successBg,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.color.success,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  sectionBadgeText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.teal800,
  },
  sectionBadgeCount: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 5,
    borderRadius: 6,
    minWidth: 18,
    alignItems: 'center',
  },
  sectionBadgeCountText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.teal800,
  },
  sectionBadgeEmpty: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: tokens.color.bg,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeEmptyText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text3,
  },
  sectionBadgeAdd: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    backgroundColor: tokens.color.brand50,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.color.brand100,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
