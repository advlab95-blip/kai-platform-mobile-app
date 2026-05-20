import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { styles } from './styles';

export function LessonsSkeleton() {
  return (
    // Skeleton cards match the real card shape so the UI doesn't jump on load.
    <View style={{ gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonThumb} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.skeletonLine, { width: '70%' }]} />
            <View style={[styles.skeletonLine, { width: '40%', height: 10 }]} />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <View style={[styles.skeletonChip, { width: 50 }]} />
              <View style={[styles.skeletonChip, { width: 60 }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function LessonsEmpty({ totalCount }: { totalCount: number }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Ionicons
          name={totalCount === 0 ? 'sparkles' : 'search'}
          size={36}
          color={totalCount === 0 ? '#7C3AED' : Colors.textMuted}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {totalCount === 0
          ? 'ابدأ رحلتك مع AI'
          : 'لا توجد نتائج'}
      </Text>
      <Text style={styles.emptyText}>
        {totalCount === 0
          ? 'اكتب موضوع أو الصق محتوى بالأعلى، وسيولّد AI درساً كاملاً بالصور والكويز'
          : 'جرّب تغيير الفلتر أو نص البحث'}
      </Text>
    </View>
  );
}
