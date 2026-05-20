import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../shared/SwipeableSheet';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import { useSpringPress } from '../../../hooks/useSpringPress';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Bottom-sheet replacement for Alert.alert(...) confirmations.
 * Used across teacher screens. Reuses SwipeableSheet primitive.
 */
function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  const cancelPress = useSpringPress(0.97);
  const confirmPress = useSpringPress(0.97);

  const resolvedCancel = cancelLabel ?? 'إلغاء';
  const iconName = destructive ? 'alert-circle' : 'help-circle';
  const iconTint = destructive ? tokens.color.danger : tokens.color.info;
  const iconBg = destructive ? tokens.color.dangerBg : tokens.color.infoBg;
  const confirmGradient = destructive
    ? tokens.gradient.danger
    : tokens.gradient.brand;
  const confirmShadow = destructive ? tokens.shadow.danger : tokens.shadow.brand;

  const handleConfirm = useCallback(() => {
    if (destructive) {
      haptics.warning();
    } else {
      haptics.selection();
    }
    // Close FIRST so the SwipeableSheet/Modal unmounts before any navigation
    // dispatched by onConfirm fires — otherwise router.replace can be cancelled
    // by the still-mounted modal host (logout was getting stuck for this reason).
    onClose();
    // Defer to after the close animation so onConfirm's nav lands on a clean stack.
    setTimeout(() => { try { onConfirm(); } catch {} }, 220);
  }, [destructive, onConfirm, onClose]);

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.6}>
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={42} color={iconTint} />
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {message ? (
          <Text style={styles.message} numberOfLines={4}>
            {message}
          </Text>
        ) : null}

        <View style={styles.row}>
          {/* Cancel */}
          <Animated.View
            style={[
              styles.btnWrap,
              { transform: [{ scale: cancelPress.scale }] },
            ]}
          >
            <Pressable
              onPressIn={cancelPress.onPressIn}
              onPressOut={cancelPress.onPressOut}
              onPress={onClose}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel={resolvedCancel}
            >
              <Text style={styles.cancelText}>{resolvedCancel}</Text>
            </Pressable>
          </Animated.View>

          {/* Confirm */}
          <Animated.View
            style={[
              styles.btnWrap,
              confirmShadow,
              { transform: [{ scale: confirmPress.scale }] },
            ]}
          >
            <Pressable
              onPressIn={confirmPress.onPressIn}
              onPressOut={confirmPress.onPressOut}
              onPress={handleConfirm}
              style={styles.confirmPressable}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <LinearGradient
                colors={confirmGradient as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.confirmGradient}
              >
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[4],
    paddingBottom: tokens.spacing[4],
    alignItems: 'center',
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[4],
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  message: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text2,
    textAlign: 'center',
    marginTop: tokens.spacing[2],
    lineHeight: 20,
    writingDirection: 'rtl',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    marginTop: tokens.spacing[5],
    gap: 10,
  },
  btnWrap: {
    flex: 1,
    borderRadius: tokens.radius.lg,
  },
  cancelBtn: {
    height: 48,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text2,
  },
  confirmPressable: {
    height: 48,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  confirmGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.lg,
  },
  confirmText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: '#FFFFFF',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});

export default memo(ConfirmSheet);
