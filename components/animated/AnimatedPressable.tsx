import React from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { haptics } from '../../utils/haptics';
import { sounds } from '../../utils/sounds';
import { useInteractions } from '../../contexts/InteractionsContext';

const AP = Animated.createAnimatedComponent(Pressable);

type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection' | 'none';
type SoundKind = 'click' | 'success' | 'error' | 'whoosh' | 'none';

type Props = {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: HapticKind;
  sound?: SoundKind;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
};

// Drop-in replacement for TouchableOpacity — adds a 60 FPS press-scale, haptic,
// and optional sound. Respects Reduce Motion and user settings.
export default function AnimatedPressable({
  onPress, children, style, disabled, haptic = 'light', sound = 'none',
  accessibilityLabel, accessibilityRole = 'button',
}: Props) {
  const scale = useSharedValue(1);
  const { settings, reduceMotion } = useInteractions();

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const canAnimate = settings.animationsEnabled && !reduceMotion;

  return (
    <AP
      onPressIn={() => { if (canAnimate) scale.value = withSpring(0.96, { damping: 15, stiffness: 200 }); }}
      onPressOut={() => { if (canAnimate) scale.value = withSpring(1, { damping: 15, stiffness: 200 }); }}
      onPress={() => {
        if (disabled) return;
        if (haptic !== 'none') haptics[haptic]();
        if (sound !== 'none') sounds[sound]();
        onPress();
      }}
      disabled={disabled}
      style={[style, animStyle]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled }}
    >
      {children}
    </AP>
  );
}
