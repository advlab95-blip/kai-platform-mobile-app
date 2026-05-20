import React, { memo, useCallback } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

type IconButtonVariant = 'surface' | 'glass' | 'danger';

export interface IconButtonProps {
  icon: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  badge?: number;
  accessibilityLabel?: string;
}

const SIZE = 38;
const ICON_SIZE = 20;

function IconButton({
  icon,
  onPress,
  variant = 'surface',
  badge,
  accessibilityLabel,
}: IconButtonProps) {
  const { scale, onPressIn, onPressOut } = useSpringPress();

  const handlePress = useCallback(() => {
    haptics.selection();
    onPress();
  }, [onPress]);

  const { backgroundColor, iconColor } = resolveVariant(variant);

  const showBadge = typeof badge === 'number' && badge > 0;
  const badgeLabel = showBadge ? (badge! > 99 ? '99+' : String(badge)) : '';

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.container, { backgroundColor }]}
        hitSlop={6}
      >
        <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={ICON_SIZE} color={iconColor} />
        {showBadge && (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText} numberOfLines={1}>
              {badgeLabel}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function resolveVariant(variant: IconButtonVariant): { backgroundColor: string; iconColor: string } {
  switch (variant) {
    case 'glass':
      return { backgroundColor: 'rgba(255,255,255,0.15)', iconColor: '#fff' };
    case 'danger':
      return { backgroundColor: tokens.color.dangerBg, iconColor: tokens.color.danger };
    case 'surface':
    default:
      return { backgroundColor: tokens.color.surface2, iconColor: tokens.color.text2 };
  }
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    insetInlineStart: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
    lineHeight: tokens.font.size.xs + 2,
  },
});

export default memo(IconButton);
