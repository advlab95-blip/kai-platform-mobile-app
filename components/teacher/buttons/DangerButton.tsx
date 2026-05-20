import React, { memo, useCallback } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

export interface DangerButtonProps {
  label: string;
  onPress: () => void;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

const HEIGHT = 48;

function DangerButton({
  label,
  onPress,
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
}: DangerButtonProps) {
  const { scale, onPressIn, onPressOut } = useSpringPress();
  const isLocked = disabled || loading;

  const handlePress = useCallback(() => {
    if (isLocked) return;
    haptics.warning();
    onPress();
  }, [isLocked, onPress]);

  return (
    <Animated.View
      style={[
        fullWidth && styles.fullWidth,
        tokens.shadow.danger,
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
          colors={tokens.gradient.danger}
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

export default memo(DangerButton);
