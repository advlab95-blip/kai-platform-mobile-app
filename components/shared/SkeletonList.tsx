// SkeletonList — convenience wrapper that renders N SkeletonCard rows with consistent gap.
// Drop into any list screen's loading branch instead of a bare ActivityIndicator.

import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { tokens } from '../../constants/designTokens';
import SkeletonCard from './SkeletonCard';

export interface SkeletonListProps {
  count?: number;
  cardHeight?: number;
  gap?: number;
}

function SkeletonList({
  count = 5,
  cardHeight = 80,
  gap = tokens.spacing[3],
}: SkeletonListProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, idx) => (
        <View
          key={`skeleton-${idx}`}
          style={{ marginBottom: idx === count - 1 ? 0 : gap }}
        >
          <SkeletonCard height={cardHeight} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});

export default memo(SkeletonList);
