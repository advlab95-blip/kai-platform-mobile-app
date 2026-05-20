// SkeletonCard — animated shimmer placeholder used in lists/cards while data loads.
// Shape-only primitive; does not render text or icons. Compose with SkeletonList for grids.
// Uses tokens.color.surface3 as the base shade and Animated opacity loop 0.3 ↔ 0.7.

import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';
import { tokens } from '../../constants/designTokens';

export interface SkeletonCardProps {
  height?: number;
  width?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonCard({
  height = 80,
  width = '100%',
  borderRadius = tokens.radius.lg,
  style,
}: SkeletonCardProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      // The width prop accepts string ('100%') or number — RN typings allow both at runtime.
      style={[
        {
          height,
          width: width as ViewStyle['width'],
          borderRadius,
          backgroundColor: tokens.color.surface3,
          opacity,
        },
        style,
      ]}
    />
  );
}

export default memo(SkeletonCard);
