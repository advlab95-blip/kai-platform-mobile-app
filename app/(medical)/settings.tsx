import React, { useState, useCallback } from 'react';
import { Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import ThemeSettings from '../../components/shared/ThemeSettings';
import LanguageSettings from '../../components/shared/LanguageSettings';
import InteractionSettings from '../../components/shared/InteractionSettings';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import LockedScreen from '../../components/medical/shared/LockedScreen';
import PrivacyTermsGroup from '../../components/shared/PrivacyTermsGroup';
import { performLogout } from '../../utils/logout';
import { haptics } from '../../utils/haptics';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';

export default function MedicalSettings() {
  const { t } = useTranslation();
  const isEnabled = useFeatureFlag('medical_records');
  const [logoutVisible, setLogoutVisible] = useState(false);

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);

  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  if (!isEnabled) return <LockedScreen />;

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('medical.settingsTitle')}
        gradient={tokens.gradient.medical}
        glowAccent="rgba(239,68,68,0.30)"
        showBack={false}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <ThemeSettings />
        <LanguageSettings />
        <InteractionSettings />
        <PrivacyTermsGroup flush />
        <Pressable
          onPress={openLogout}
          style={({ pressed }) => [s.logoutBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.logout')}
        >
          <Ionicons name="log-out-outline" size={20} color={tokens.color.m600} />
          <Text style={s.logoutText}>{t('common.logout')}</Text>
        </Pressable>
      </ScrollView>

      <ConfirmSheet
        visible={logoutVisible}
        onClose={closeLogout}
        title={t('common.logout')}
        message={t('auth.confirmLogout')}
        confirmLabel={t('common.logout')}
        destructive
        onConfirm={performLogout}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  scrollContent: { padding: tokens.spacing[4], paddingBottom: 40 },
  title: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[4],
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.color.m100,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    marginTop: tokens.spacing[2],
  },
  logoutText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.m600,
  },
});
