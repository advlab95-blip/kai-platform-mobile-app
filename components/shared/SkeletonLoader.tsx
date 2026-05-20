import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius, backgroundColor: '#E2E8F0', opacity }, style]}
    />
  );
}

export function CardSkeleton() {
  return (
    <View style={s.card}>
      <SkeletonBox width={48} height={48} borderRadius={12} />
      <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
        <SkeletonBox width="70%" height={14} />
        <SkeletonBox width="40%" height={10} />
      </View>
    </View>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

export function StatsSkeleton() {
  return (
    <View style={{ flexDirection: 'row', padding: 16, gap: 12 }}>
      {[1, 2, 3].map(i => (
        <View key={i} style={[s.card, { flex: 1, alignItems: 'center', gap: 8 }]}>
          <SkeletonBox width={40} height={40} borderRadius={20} />
          <SkeletonBox width="60%" height={12} />
        </View>
      ))}
    </View>
  );
}

export default SkeletonBox;

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
