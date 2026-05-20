/**
 * TouchableOpacity with haptic feedback
 * Drop-in replacement — same props as TouchableOpacity
 */
import React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { hapticLight } from '../../utils/performance';

interface HapticButtonProps extends TouchableOpacityProps {
  hapticType?: 'light' | 'none';
}

export default function HapticButton({ onPress, hapticType = 'light', ...props }: HapticButtonProps) {
  const handlePress = (e: any) => {
    if (hapticType !== 'none') hapticLight();
    onPress?.(e);
  };

  return <TouchableOpacity activeOpacity={0.7} {...props} onPress={handlePress} />;
}
