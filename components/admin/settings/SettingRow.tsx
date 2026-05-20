// SettingRow — atomic row used inside every SettingSection card.
//
// Three variants (controlled by props, single component for consistency):
//   • nav     → icon · title/subtitle · chevron (default; tap action)
//   • toggle  → icon · title/subtitle · Switch (no chevron)
//   • value   → icon · title/subtitle · static value text + optional chevron
//
// Visual hierarchy:
//   - Icon bubble (36x36, accent bg tint, accent icon) on the RTL trailing side.
//   - Title is bold (14px), subtitle is muted (11px), both right-aligned.
//   - Destructive rows recolor title + icon + bubble to error red.
//
// Hairline separator is drawn by the parent SettingSection; this component does
// not own its own bottom border so the last row in a section is flush.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';

type Variant = 'nav' | 'toggle' | 'value';

export type SettingRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Override accent (icon + bubble bg tint). Defaults to Colors.primary. */
  accent?: string;
  /** Destructive style — red title/icon/bubble. */
  destructive?: boolean;
  /** Loading spinner replaces the trailing element. */
  loading?: boolean;
  /** Disable interaction. */
  disabled?: boolean;
  /** Variant — controls trailing element. */
  variant?: Variant;
  /** Value to display (variant=value only). */
  value?: string;
  /** Toggle state (variant=toggle only). */
  toggleValue?: boolean;
  /** Toggle change handler (variant=toggle only). */
  onToggle?: (next: boolean) => void;
  /** Tap handler — for nav and value variants. */
  onPress?: () => void;
  /** Hide the chevron (nav/value variants). */
  hideChevron?: boolean;
  /** Extra keywords for search match (not displayed). */
  searchKeywords?: string;
};

function tintFromAccent(accent: string, destructive: boolean): string {
  if (destructive) return '#FEF2F2';
  // For common known accents map to soft tints, else fall back to brand50.
  switch (accent) {
    case Colors.primary:   return '#EEF2FF';
    case Colors.success:   return '#ECFDF5';
    case Colors.warning:   return '#FEF3C7';
    case Colors.error:     return '#FEF2F2';
    case Colors.info:      return '#DBEAFE';
    case Colors.parent:    return '#EDE9FE';
    case Colors.cafeteria: return '#FFEDD5';
    case Colors.medical:   return '#FEE2E2';
    default:               return tokens.color.brand50;
  }
}

export default function SettingRow({
  icon,
  title,
  subtitle,
  accent,
  destructive = false,
  loading = false,
  disabled = false,
  variant = 'nav',
  value,
  toggleValue,
  onToggle,
  onPress,
  hideChevron = false,
}: SettingRowProps) {
  const resolvedAccent = destructive ? Colors.error : (accent || Colors.primary);
  const bubbleBg = tintFromAccent(resolvedAccent, destructive);
  const titleColor = destructive ? Colors.error : Colors.text;

  // Trailing slot content — varies by variant + loading state.
  const trailing: React.ReactNode = (() => {
    if (loading) {
      return <ActivityIndicator size="small" color={resolvedAccent} />;
    }
    if (variant === 'toggle') {
      return (
        <Switch
          value={!!toggleValue}
          onValueChange={onToggle}
          disabled={disabled}
          trackColor={{ false: '#E2E8F0', true: destructive ? '#FCA5A5' : '#A5B4FC' }}
          thumbColor={toggleValue ? resolvedAccent : '#fff'}
        />
      );
    }
    if (variant === 'value') {
      return (
        <View style={styles.valueWrap}>
          {value !== undefined ? <Text style={styles.valueText} numberOfLines={1}>{value}</Text> : null}
          {!hideChevron ? <Ionicons name="chevron-back" size={16} color={Colors.textMuted} /> : null}
        </View>
      );
    }
    // nav
    return hideChevron ? null : <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />;
  })();

  // Inner body is identical across variants — only the wrapper element changes.
  const body = (
    <>
      {/* Trailing slot (RTL: visually on the left) */}
      <View style={styles.trailing}>{trailing}</View>

      {/* Title block — grows */}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Icon bubble — RTL: visually on the right */}
      <View style={[styles.iconBubble, { backgroundColor: bubbleBg }]}>
        <Ionicons name={icon} size={18} color={resolvedAccent} />
      </View>
    </>
  );

  // Toggle rows are non-tappable (the Switch handles its own interaction).
  if (variant === 'toggle') {
    return <View style={[styles.row, disabled && styles.rowDisabled]}>{body}</View>;
  }

  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    minHeight: 56,
  },
  rowDisabled: { opacity: 0.5 },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 2,
    fontWeight: '600',
    lineHeight: 16,
  },
  trailing: {
    minWidth: 24,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  valueWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
  },
  valueText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'left',
  },
});
