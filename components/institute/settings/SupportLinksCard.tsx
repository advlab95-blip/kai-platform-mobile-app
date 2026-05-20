// SupportLinksCard — quick channels for the institute admin to reach platform
// support. Two rows: WhatsApp (deep-link via `wa.me/<phone>`) and email
// (mailto). Both open via `Linking` so failure is silent (caller catches
// nothing — the row is best-effort). Numbers/addresses are env-driven via a
// small constants block so we can rotate channels without code edits.
//
// Why a card and not a free-floating list: keeps the settings screen scan
// rhythm consistent — every group is a bordered card, never bare rows on the
// background.

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

// Update these constants once when channels change.
const SUPPORT_WHATSAPP = '9647810000000'; // كاي support — placeholder, replace before publish
const SUPPORT_EMAIL = 'support@kai-platform.app';

export default function SupportLinksCard() {
  const openWhatsApp = useCallback(async () => {
    haptics.light();
    const url = `https://wa.me/${SUPPORT_WHATSAPP}`;
    Linking.openURL(url).catch(() => {});
  }, []);

  const openEmail = useCallback(async () => {
    haptics.light();
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('استفسار من إدارة المنشأة')}`;
    Linking.openURL(url).catch(() => {});
  }, []);

  return (
    <View style={s.card}>
      <Pressable onPress={openWhatsApp} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
        <View style={[s.iconWrap, { backgroundColor: tokens.color.successBg }]}>
          <Ionicons name="logo-whatsapp" size={18} color={tokens.color.success} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.label}>تواصل عبر واتساب</Text>
          <Text style={s.sub}>للدعم الفني السريع — رد خلال ساعات العمل</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
      </Pressable>

      <View style={s.divider} />

      <Pressable onPress={openEmail} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
        <View style={[s.iconWrap, { backgroundColor: tokens.color.infoBg }]}>
          <Ionicons name="mail" size={18} color={tokens.color.info} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.label}>راسلنا عبر البريد</Text>
          <Text style={s.sub}>للاستفسارات الرسمية والشكاوى</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
      </Pressable>
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
  rowPressed: { opacity: 0.6 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text,
    fontWeight: tokens.font.weight.semi,
    textAlign: 'right',
  },
  sub: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text3,
    fontWeight: tokens.font.weight.medium,
    marginTop: 2,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border2,
    marginHorizontal: 16,
  },
});
