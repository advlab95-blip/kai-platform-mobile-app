// SettingSection — groups related SettingRow atoms under a single header + card.
//
// Visual contract:
//   - Section header: RTL accent bar (4x28, color = accent), 13px black title,
//     optional 10.5px muted subtitle. Color-codable so destructive/danger
//     sections can shift to red.
//   - Card body: white surface, 22-radius, 1px Colors.border, soft shadow.
//     Children are auto-separated by a hairline divider (rendered between
//     adjacent children, never after the last one).
//
// Children may be SettingRow nodes or arbitrary JSX (escape hatch for the few
// settings — tickets list, change-name input, danger banner — that don't fit
// the atomic row shape).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';

export type SettingSectionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  accent?: string;
  /** Render the card with red border (used by Danger Zone). */
  danger?: boolean;
  /** Hide the whole section (used by search-filtered groups when empty). */
  hidden?: boolean;
  children: React.ReactNode;
};

export default function SettingSection({
  icon,
  title,
  subtitle,
  accent,
  danger = false,
  hidden = false,
  children,
}: SettingSectionProps) {
  if (hidden) return null;

  const color = danger ? Colors.error : (accent || Colors.primary);

  // Insert hairline dividers BETWEEN visible children only.
  const visibleChildren = React.Children.toArray(children).filter((c) => c !== null && c !== false);
  const withDividers = visibleChildren.map((child, idx) => (
    <React.Fragment key={idx}>
      {idx > 0 ? <View style={styles.divider} /> : null}
      {child}
    </React.Fragment>
  ));

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.accentBar, { backgroundColor: color }]} />
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Ionicons name={icon} size={14} color={color} />
            <Text style={[styles.headerTitle, { color }]}>{title}</Text>
          </View>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      {/* Card body */}
      {visibleChildren.length > 0 ? (
        <View style={[styles.card, danger && styles.cardDanger]}>{withDividers}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  accentBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  headerText: { flex: 1 },
  headerTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 10.5,
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: tokens.radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDanger: {
    borderColor: '#FCA5A5',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
});
