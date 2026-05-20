// CategoryList — stage-1 list of grade categories (or empty CTA when none exist).
// Pure presentational; parent owns the category objects and the "create new" handler.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import ListRow from '../cards/ListRow';

type GradeType = { key: string; label: string };

type Props = {
  categories: any[];
  gradeTypes: GradeType[];
  onPickCategory: (cat: any) => void;
  onAddCategory: () => void;
};

// For each category, render compact meta string used in the row.
const categoryMeta = (cat: any): string => {
  const filled: number | undefined = cat.filled_count;
  const total: number | undefined = cat.total_students;
  if (typeof filled === 'number' && typeof total === 'number') {
    return `${filled}/${total}`;
  }
  return `${cat.max_score ? `من ${cat.max_score}` : ''}`;
};

export default function CategoryList({ categories, gradeTypes, onPickCategory, onAddCategory }: Props) {
  if (categories.length === 0) {
    return (
      <View style={s.mainEmpty}>
        <View style={s.emptyIconBig}>
          <Ionicons name="ribbon" size={40} color={tokens.color.purple} />
        </View>
        <Text style={s.emptyTitle}>لا توجد فئات بعد</Text>
        <Text style={s.emptySubtitle}>
          ابدأ بإضافة فئة مثل "امتحان شهر نوفمبر" أو "النصف الأول"
        </Text>
        <TouchableOpacity style={s.emptyCta} onPress={onAddCategory} activeOpacity={0.8}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={s.emptyCtaText}>إضافة فئة جديدة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {categories.map(cat => {
        const typeInfo = gradeTypes.find(gt => gt.key === cat.type) || gradeTypes[0];
        return (
          <View key={cat.id} style={{ position: 'relative' }}>
            <ListRow
              icon="trophy"
              iconGradient="success"
              title={cat.name}
              subtitle={typeInfo?.label}
              meta={categoryMeta(cat)}
              badge={{ label: `من ${cat.max_score}`, tone: 'info' }}
              onPress={() => onPickCategory(cat)}
            />
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  mainEmpty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32, gap: 10 },
  emptyIconBig: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: tokens.color.purpleBg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: tokens.font.size['2xl'], fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'center' },
  emptySubtitle: { fontSize: tokens.font.size.base, color: tokens.color.text3, textAlign: 'center', lineHeight: 20 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: tokens.color.brand500, borderRadius: tokens.radius.md,
    paddingHorizontal: 18, paddingVertical: 10, marginTop: 8,
  },
  emptyCtaText: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.heavy, color: '#fff' },
});
