// ParentSettings — wraps ThemeSettings / LanguageSettings / InteractionSettings
// / NotificationPreferences shared components and adds a profile card + danger logout.
// Per brief §7.9: NEVER use confirmAlert; use ConfirmSheet.
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import useAuthStore from '../../stores/authStore';
import useParentStore from '../../stores/parentStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import ThemeSettings from '../../components/shared/ThemeSettings';
import LanguageSettings from '../../components/shared/LanguageSettings';
import InteractionSettings from '../../components/shared/InteractionSettings';
import NotificationPreferences from '../../components/shared/NotificationPreferences';
import PrivacyTermsGroup from '../../components/shared/PrivacyTermsGroup';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import { performLogout } from '../../utils/logout';
import { haptics } from '../../utils/haptics';
import { tokens } from '../../constants/designTokens';

export default function ParentSettings() {
  const { t } = useTranslation();
  const { userId, userName } = useAuthStore();
  const { children } = useParentStore();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);

  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('parent.settingsTitle', { defaultValue: 'الإعدادات' })}
        gradient={tokens.gradient.parent}
        glowAccent="rgba(167,139,250,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile card */}
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.name} numberOfLines={1}>{userName || ''}</Text>
            <Text style={styles.sub}>
              {t('parent.parentRoleSub', {
                count: children.length,
                defaultValue: `ولي أمر · ${children.length} طلاب مرتبطون`,
              })}
            </Text>
          </View>
        </View>

        {/* Group 1 — Appearance & language */}
        <ThemeSettings />
        <LanguageSettings />

        {/* Group 2 — Interaction */}
        <InteractionSettings />

        {/* Group 3 — Notifications */}
        <NotificationPreferences userId={userId} />

        {/* Privacy & Terms (App Store / Google Play required) */}
        <PrivacyTermsGroup flush />

        {/* Logout */}
        <Pressable
          onPress={openLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t('parent.logoutBtn', { defaultValue: 'تسجيل الخروج' })}
        >
          <Ionicons name="log-out-outline" size={20} color={tokens.color.danger} />
          <Text style={styles.logoutText}>
            {t('parent.logoutBtn', { defaultValue: 'تسجيل الخروج' })}
          </Text>
        </Pressable>
      </ScrollView>

      <ConfirmSheet
        visible={logoutVisible}
        onClose={closeLogout}
        title={t('parent.logoutTitle', { defaultValue: 'تسجيل الخروج' })}
        message={t('parent.logoutConfirm', { defaultValue: 'هل تريد الخروج؟' })}
        confirmLabel={t('parent.logoutBtn', { defaultValue: 'تسجيل الخروج' })}
        destructive
        onConfirm={performLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 16 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.color.p600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  sub: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    marginTop: 2,
    textAlign: 'right',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.color.dangerBg,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  logoutText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.danger,
  },
});
