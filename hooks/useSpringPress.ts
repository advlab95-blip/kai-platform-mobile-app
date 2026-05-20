import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Shared press-in/out spring for tappable cards.
 * Usage:
 *   const { scale, onPressIn, onPressOut } = useSpringPress();
 *   <Animated.View style={{ transform: [{ scale }] }}>
 */
export function useSpringPress(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  }, [scale, to]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }, [scale]);

  return { scale, onPressIn, onPressOut };
}
