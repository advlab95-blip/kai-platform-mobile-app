import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonLoader from './SkeletonLoader';

export function CardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <SkeletonLoader width={44} height={44} borderRadius={14} />
        <View style={styles.cardTextCol}>
          <SkeletonLoader width="70%" height={14} />
          <SkeletonLoader width="40%" height={10} />
        </View>
      </View>
    </View>
  );
}

export function StatsSkeleton() {
  return (
    <View style={styles.statsRow}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.statCard}>
          <SkeletonLoader width={40} height={24} borderRadius={6} />
          <SkeletonLoader width={50} height={10} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: 8, paddingHorizontal: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

export function HomeSkeleton() {
  return (
    <View style={{ paddingTop: 8 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <SkeletonLoader width="60%" height={22} borderRadius={6} />
        <SkeletonLoader width="40%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
      </View>
      <StatsSkeleton />
      <View style={{ height: 8 }} />
      <ListSkeleton count={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  cardTextCol: { flex: 1, gap: 6, alignItems: 'flex-end' },
  statsRow: { flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
});
