import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import FadeSlideIn from './FadeSlideIn';

type Props = {
  children: React.ReactNode;
  index: number;
  baseDelay?: number;
  step?: number;
  style?: StyleProp<ViewStyle>;
};

// Thin wrapper over FadeSlideIn that converts list index → staggered delay.
// Use in a `.map` to get the "cards cascade in" effect without hand-computing delays.
export default function StaggerItem({ children, index, baseDelay = 0, step = 60, style }: Props) {
  return (
    <FadeSlideIn delay={baseDelay + index * step} style={style}>
      {children}
    </FadeSlideIn>
  );
}
