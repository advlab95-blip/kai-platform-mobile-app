import React, { memo, useCallback } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

export interface FABProps {
  icon: string;
  onPress: () => void;
  gradient?: keyof typeof tokens.gradient;
  positionStart?: number;
  positionBottom?: number;
  accessibilityLabel?: string;
}

const SIZE = 56;

function FAB({
  icon,
  onPress,
  gradient = 'brand',
  positionStart = 20,
  positionBottom = 90,
  accessibilityLabel,
}: FABProps) {
  const { scale, onPressIn, onPressOut } = useSpringPress();

  const handlePress = useCallback(() => {
    haptics.medium();
    onPress();
  }, [onPress]);

  const colors = tokens.gradient[gradient] as readonly [string, string, ...string[]];
  const shadow = gradient === 'danger' ? tokens.shadow.danger : tokens.shadow.brand;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        shadow,
        {
          insetInlineStart: positionStart,
          bottom: positionBottom,
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.pressable}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={24} color="#fff" />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  pressable: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(FAB);
