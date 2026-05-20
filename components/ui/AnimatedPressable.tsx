/**
 * Animated button with scale-down press effect + haptic feedback
 * Drop-in replacement for TouchableOpacity
 */
import React, { useRef } from 'react';
import { Animated, TouchableWithoutFeedback, ViewStyle } from 'react-native';
import { useInteractions } from '../../contexts/InteractionsContext';
import { hapticLight } from '../../utils/performance';

interface Props {
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: ViewStyle | ViewStyle[];
  disabled?: boolean;
  children: React.ReactNode;
  scaleValue?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
}

export default function AnimatedPressable({
  onPress, onLongPress, delayLongPress, style, disabled, children,
  scaleValue = 0.96, accessibilityLabel, accessibilityRole = 'button',
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const { settings, reduceMotion } = useInteractions();

  const animateIn = () => {
    if (!settings.animationsEnabled || reduceMotion) return;
    Animated.spring(scale, { toValue: scaleValue, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const animateOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const handlePress = () => {
    if (disabled) return;
    if (settings.hapticsEnabled) hapticLight();
    onPress?.();
  };

  return (
    <TouchableWithoutFeedback
      onPressIn={animateIn}
      onPressOut={animateOut}
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
    >
      <Animated.View style={[style, { transform: [{ scale }], opacity: disabled ? 0.5 : 1 }]}>
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}
