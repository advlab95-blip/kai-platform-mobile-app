// AboutAppCard — last block in the settings screen. Surfaces app name +
// version pulled from `app.json` via `expo-constants` so it stays in sync
// with every release without manual edits.
//
// Visual: matches the bordered group used by other settings cards. The
// version pill on the left side is purposely subtle (text2) — admins don't
// need to glance at it constantly, they just need it for support tickets.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { tokens } from '../../../constants/designTokens';

export default function AboutAppCard() {
  // expo-constants's expoConfig is the canonical source after SDK 49+.
  const version =
    (Constants.expoConfig as any)?.version ||
    (Constants.manifest as any)?.version ||
    '—';
  const appName =
    (Constants.expoConfig as any)?.name ||
    (Constants.manifest as any)?.name ||
    'منصة كاي';

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={[s.iconWrap, { backgroundColor: tokens.color.brand100 }]}>
          <Ionicons name="information-circle" size={18} color={tokens.color.brand600} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.label}>اسم التطبيق</Text>
          <Text style={s.value}>{appName}</Text>
        </View>
      </View>

      <View style={s.divider} />

      <View style={s.row}>
        <View style={[s.iconWrap, { backgroundColor: tokens.color.surface2 }]}>
          <Ionicons name="cube-outline" size={18} color={tokens.color.text2} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.label}>الإصدار</Text>
          <Text style={s.value}>{version}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text3,
    fontWeight: tokens.font.weight.semi,
    textAlign: 'right',
  },
  value: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text,
    fontWeight: tokens.font.weight.bold,
    marginTop: 2,
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border2,
    marginHorizontal: 16,
  },
});
