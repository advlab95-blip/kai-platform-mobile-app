// EmptyState — centered icon + title + optional message + optional CTA.
// Use when a list/feed is genuinely empty (not loading, not erroring).
// RTL-first: writingDirection 'rtl' on every Text. Action uses tokens.gradient.brand.

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../constants/designTokens';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const showAction = Boolean(onAction && actionLabel);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={56} color={tokens.color.text2} />
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>

      {message ? (
        <Text style={styles.message} numberOfLines={4}>
          {message}
        </Text>
      ) : null}

      {showAction ? (
        <Pressable
          onPress={onAction}
          style={styles.actionPressable}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <LinearGradient
            colors={tokens.gradient.brand as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionGradient}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing[6],
    paddingVertical: tokens.spacing[8] + tokens.spacing[4], // ~48
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[4],
  },
  title: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  message: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.regular,
    color: tokens.color.text2,
    textAlign: 'center',
    marginTop: tokens.spacing[2],
    lineHeight: 22,
    writingDirection: 'rtl',
  },
  actionPressable: {
    marginTop: tokens.spacing[5],
    height: 48,
    minWidth: 180,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    ...tokens.shadow.brand,
  },
  actionGradient: {
    flex: 1,
    paddingHorizontal: tokens.spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.lg,
  },
  actionText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: '#FFFFFF',
    writingDirection: 'rtl',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});

export default memo(EmptyState);
