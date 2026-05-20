import React, { useEffect } from 'react';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useInteractions } from '../../contexts/InteractionsContext';

type Props = {
  size?: number;
  color?: string;
};

// Green check that pops in — use after save/submit to confirm success visually.
// Pairs well with haptics.success() fired at the same moment.
export default function SuccessCheck({ size = 80, color = '#10B981' }: Props) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const { settings, reduceMotion } = useInteractions();

  useEffect(() => {
    if (!settings.animationsEnabled || reduceMotion) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSequence(
      withSpring(1.25, { damping: 8, stiffness: 180 }),
      withSpring(1, { damping: 12, stiffness: 200 }),
    );
  }, [settings.animationsEnabled, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, anim]}>
      <Ionicons name="checkmark-circle" size={size} color={color} />
    </Animated.View>
  );
}
