// Renders when a parent screen is gated by a feature flag that's off
// (currently used by parent medical when 'medical_records' is disabled).
// Uses ConfirmSheet for the logout confirm — never confirmAlert.
import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import ConfirmSheet from '../../teacher/sheets/ConfirmSheet';
import BackHeader from '../../shared/BackHeader';
import { performLogout } from '../../../utils/logout';
import { haptics } from '../../../utils/haptics';

interface Props {
  title: string;
  message?: string;
  fallbackRoute?: string;
}

function LockedScreen({ title, message, fallbackRoute = '/(parent)/services' }: Props) {
  const { t } = useTranslation();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);
  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  return (
    <SafeAreaView style={styles.container}>
      <BackHeader title={title} fallbackRoute={fallbackRoute} />
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={56} color={tokens.color.text4} />
        </View>
        <Text style={styles.title}>
          {message ?? t('parent.medicalNotEnabled', { defaultValue: 'الميزة غير مفعّلة لهذه المؤسسة' })}
        </Text>
        <Text style={styles.subtitle}>
          {t('medical.lockedSubtitle', { defaultValue: 'راجع إدارة المنصة لتفعيلها.' })}
        </Text>

        <Pressable
          onPress={openLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.logout')}
        >
          <Ionicons name="log-out-outline" size={18} color={tokens.color.danger} />
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
    backgroundColor: tokens.color.dangerBg,
  },
  logoutText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.danger,
  },
});

export default memo(LockedScreen);
