/**
 * PrivacyTermsGroup — shared card with Privacy Policy + Terms of Service links.
 *
 * Required in every role settings screen for App Store / Google Play compliance:
 * both stores reject apps that don't surface a privacy policy URL inside the
 * app. The student screen had its own copy of this; this component is the
 * single source of truth so all roles stay consistent.
 *
 * Visual contract: matches the section/card layout used by the per-role
 * settings screens (group header + bordered surface + chevron rows). Wrap-free
 * — render it directly inside the screen's ScrollView.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';

const PRIVACY_URL = 'https://kai-legal.vercel.app/privacy';
const TERMS_URL = 'https://kai-legal.vercel.app/terms';

interface Props {
  /** Optional override for the section heading; defaults to "الخصوصية". */
  title?: string;
  /**
   * Some screens already pad their ScrollView (e.g. cafeteria/admin) — pass
   * `flush` to drop the default `marginHorizontal: 16` so we don't double-pad.
   */
  flush?: boolean;
  /** Escape hatch for one-off layout tweaks. */
  style?: StyleProp<ViewStyle>;
}

export default function PrivacyTermsGroup({ title, flush, style }: Props) {
  const { t } = useTranslation();

  const goPrivacy = useCallback(() => {
    haptics.light();
    Linking.openURL(PRIVACY_URL).catch(() => {});
  }, []);

  const goTerms = useCallback(() => {
    haptics.light();
    Linking.openURL(TERMS_URL).catch(() => {});
  }, []);

  const heading =
    title ?? t('settings.privacyGroup', { defaultValue: 'الخصوصية' });
  const privacyLabel = t('settings.privacyPolicy', {
    defaultValue: 'سياسة الخصوصية',
  });
  const termsLabel = t('settings.termsOfService', {
    defaultValue: 'شروط الاستخدام',
  });

  return (
    <View style={[s.group, flush && s.groupFlush, style]}>
      <View style={s.groupTitleRow}>
        <Text style={s.groupTitle}>{heading}</Text>
      </View>

      <Pressable
        onPress={goPrivacy}
        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={privacyLabel}
      >
        <View style={[s.iconWrap, { backgroundColor: tokens.color.infoBg }]}>
          <Ionicons name="shield-checkmark" size={18} color={tokens.color.info} />
        </View>
        <Text style={s.label} numberOfLines={1}>
          {privacyLabel}
        </Text>
        <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
      </Pressable>

      <View style={s.divider} />

      <Pressable
        onPress={goTerms}
        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={termsLabel}
      >
        <View style={[s.iconWrap, { backgroundColor: tokens.color.brand100 }]}>
          <Ionicons name="document-text" size={18} color={tokens.color.brand500} />
        </View>
        <Text style={s.label} numberOfLines={1}>
          {termsLabel}
        </Text>
        <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  group: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
  },
  groupFlush: { marginHorizontal: 0 },
  groupTitleRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
  },
  groupTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlign: 'right',
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
    flex: 1,
    fontSize: tokens.font.size.lg,
    color: tokens.color.text,
    fontWeight: tokens.font.weight.semi,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border2,
    marginHorizontal: 16,
  },
});
