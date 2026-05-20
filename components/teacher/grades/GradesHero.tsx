// GradesHero — stage-1 hero card + assignment summary chip + "categories" section header.
// Pure presentational; receives target list and category count from parent.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

type Props = {
  targets: any[];
  categoryCount: number;
};

export default function GradesHero({ targets, categoryCount }: Props) {
  return (
    <>
      {/* Hero card */}
      <View style={s.hero}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={s.heroTitle}>سجّل الدرجات بسهولة</Text>
          <Text style={s.heroSubtitle}>
            اختر فئة التقييم، ثم الصف والمادة، وأدخل درجات الطلاب بنقرة واحدة
          </Text>
        </View>
      </View>

      {/* Assignment summary — helps teacher understand scope */}
      {targets.length > 0 && (
        <View style={s.assignmentSummary}>
          <Ionicons name="book" size={14} color={tokens.color.brand500} />
          <Text style={s.assignmentText}>
            {targets.length} تعيين — {Array.from(new Set(targets.map(t => t.subjectName))).slice(0, 4).join('، ')}
          </Text>
        </View>
      )}

      {/* Section title */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>فئات التقييم</Text>
        <View style={s.countBadge}>
          <Text style={s.countBadgeText}>{categoryCount}</Text>
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 16, padding: 16, backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl, borderWidth: 1, borderColor: tokens.color.border2,
    ...tokens.shadow.xs,
  },
  heroTitle: { fontSize: tokens.font.size['2xl'], fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right' },
  heroSubtitle: { fontSize: tokens.font.size.sm, color: tokens.color.text3, textAlign: 'right', lineHeight: 18 },

  assignmentSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: tokens.color.brand100, borderRadius: tokens.radius.pill,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: tokens.color.brand100,
  },
  assignmentText: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.brand600 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, marginBottom: 10,
  },
  sectionTitle: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right' },
  countBadge: {
    backgroundColor: tokens.color.brand500,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countBadgeText: { color: '#fff', fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.heavy },
});
