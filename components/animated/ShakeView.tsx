import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withTiming,
} from 'react-native-reanimated';
import { useInteractions } from '../../contexts/InteractionsContext';

export type ShakeRef = { shake: () => void };

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Imperative shake — wrap any field or card, keep a ref, call `.shake()` on
// validation error to draw the eye to the exact offending input.
const ShakeView = forwardRef<ShakeRef, Props>(({ children, style }, ref) => {
  const x = useSharedValue(0);
  const { settings, reduceMotion } = useInteractions();

  useImperativeHandle(ref, () => ({
    shake: () => {
      if (!settings.animationsEnabled || reduceMotion) return;
      x.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    },
  }));

  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
});

ShakeView.displayName = 'ShakeView';
export default ShakeView;
