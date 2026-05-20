// Reused on every cafeteria screen when useFeatureFlag('cafeteria') is off.
// Renders the lock state + a logout button. Logout uses ConfirmSheet
// (never confirmAlert) per the unified pattern across roles.
import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import ConfirmSheet from '../../teacher/sheets/ConfirmSheet';
import { performLogout } from '../../../utils/logout';
import { haptics } from '../../../utils/haptics';
import useAuthStore from '../../../stores/authStore';

function LockedScreen() {
  const { t } = useTranslation();
  const [logoutVisible, setLogoutVisible] = useState(false);
  // Race fix: performLogout() resets feature flags synchronously, which flips
  // useFeatureFlag('cafeteria') to false and would otherwise mount a fresh
  // LockedScreen + ConfirmSheet on top of the closing one. Bail out as soon as
  // userId is null so AuthGuard's redirect to '/' takes over cleanly.
  const userId = useAuthStore((s) => s.userId);

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);

  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={56} color={tokens.color.text4} />
        </View>
        <Text style={styles.title}>
          {t('cafeteria.lockedTitle', {
            defaultValue: 'ميزة الكافتيريا غير مفعّلة لهذه المؤسسة',
          })}
        </Text>
        <Text style={styles.subtitle}>
          {t('cafeteria.lockedSubtitle', {
            defaultValue: 'راجع إدارة المنصة لتفعيلها.',
          })}
        </Text>

        <Pressable
          onPress={openLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.logout')}
        >
          <Ionicons name="log-out-outline" size={18} color={tokens.color.o600} />
          <Text style={styles.logoutText}>{t('common.logout')}</Text>
        </Pressable>
      </View>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing[8],
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[5],
    ...tokens.shadow.sm,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text2,
    textAlign: 'center',
    marginTop: tokens.spacing[2],
  },
  subtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: tokens.spacing[2],
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: tokens.spacing[6],
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.o100,
  },
  logoutText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.o600,
  },
});

export default memo(LockedScreen);
