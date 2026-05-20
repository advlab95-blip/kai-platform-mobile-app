import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { useInteractions } from '../../contexts/InteractionsContext';

type Props = {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  translateFrom?: number;
  style?: StyleProp<ViewStyle>;
};

// Subtle fade + slide entrance. Used to wrap whole screens or hero sections
// so the first paint feels intentional instead of a hard cut.
export default function FadeSlideIn({
  children, delay = 0, duration = 400, translateFrom = 20, style,
}: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(translateFrom);
  const { settings, reduceMotion } = useInteractions();

  useEffect(() => {
    if (!settings.animationsEnabled || reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }));
  }, [settings.animationsEnabled, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
