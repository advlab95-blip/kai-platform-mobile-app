import React, { memo, useCallback } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  icon?: string;
  gradient?: keyof typeof tokens.gradient;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

const HEIGHT = 48;

function PrimaryButton({
  label,
  onPress,
  icon,
  gradient = 'brand',
  disabled = false,
  loading = false,
  fullWidth = false,
}: PrimaryButtonProps) {
  const { scale, onPressIn, onPressOut } = useSpringPress();
  const isLocked = disabled || loading;

  const handlePress = useCallback(() => {
    if (isLocked) return;
    haptics.selection();
    onPress();
  }, [isLocked, onPress]);

  const colors = tokens.gradient[gradient] as readonly [string, string, ...string[]];

  return (
    <Animated.View
      style={[
        fullWidth && styles.fullWidth,
        { transform: [{ scale }], opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isLocked, busy: loading }}
        onPress={handlePress}
        onPressIn={isLocked ? undefined : onPressIn}
        onPressOut={isLocked ? undefined : onPressOut}
        disabled={isLocked}
        style={styles.pressable}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.content}>
              {icon && (
                <Ionicons
                  name={icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={18}
                  color="#fff"
                  style={styles.icon}
                />
              )}
              <Text style={styles.label} numberOfLines={1}>
                {label}
              </Text>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  pressable: {
    height: HEIGHT,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { marginEnd: 8 },
  label: {
    color: '#fff',
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
  },
});

export default memo(PrimaryButton);
