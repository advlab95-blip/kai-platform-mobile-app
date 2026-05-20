import React, { useEffect } from 'react';
import { StyleProp, ViewStyle, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
} from 'react-native-reanimated';
import { useInteractions } from '../../contexts/InteractionsContext';

type Props = {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  color?: string;
};

// Pulsing rectangle used as a loading placeholder. Compose multiple together
// in PageSkeleton to mimic the final layout before data arrives.
export default function SkeletonLoader({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
  color = '#E2E8F0',
}: Props) {
  const opacity = useSharedValue(0.3);
  const { settings, reduceMotion } = useInteractions();

  useEffect(() => {
    if (!settings.animationsEnabled || reduceMotion) {
      opacity.value = 0.5;
      return;
    }
    opacity.value = withRepeat(withTiming(0.7, { duration: 800 }), -1, true);
  }, [settings.animationsEnabled, reduceMotion]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: color },
        anim,
        style,
      ]}
    />
  );
}
