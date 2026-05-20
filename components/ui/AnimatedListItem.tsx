/**
 * List item with stagger fade-in animation
 * Wraps any content with a smooth entrance animation
 */
import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { useInteractions } from '../../contexts/InteractionsContext';

interface Props {
  index: number;
  children: React.ReactNode;
  style?: ViewStyle;
  delay?: number; // base delay per item
}

export default function AnimatedListItem({ index, children, style, delay = 50 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(15)).current;
  const { settings, reduceMotion } = useInteractions();

  useEffect(() => {
    if (!settings.animationsEnabled || reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    const itemDelay = index * delay;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay: itemDelay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, delay: itemDelay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
