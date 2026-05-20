// SettingsSectionHeader — visual hierarchy primitive for the institute settings
// screen. Renders an accent bar + bold heading. Used to group settings cards
// by theme (المنشأة، الإدارة، التطبيق، …) so the screen scans top-down with a
// clear rhythm instead of feeling like one long card pile.
//
// Pure presentational — no state, no callbacks. Tokens-only styling so any
// later palette tweak propagates without touching this file.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional caption shown under the title (e.g. "5 خيار"). */
  subtitle?: string;
}

export default function SettingsSectionHeader({ title, icon, subtitle }: Props) {
  return (
    <View style={s.row}>
      <View style={s.accentBar} />
      {icon ? (
        <View style={s.iconBubble}>
          <Ionicons name={icon} size={14} color={tokens.color.brand600} />
        </View>
      ) : null}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  accentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: tokens.color.brand500,
  },
  iconBubble: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text3,
    marginTop: 2,
    textAlign: 'right',
  },
});
