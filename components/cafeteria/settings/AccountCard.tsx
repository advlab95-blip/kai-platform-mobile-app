// Account card on cafeteria settings.
// Two rows:
//   - account info (name + institute), non-tappable visual element
//   - logout (danger-tinted) → opens ConfirmSheet → performLogout
import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import ConfirmSheet from '../../teacher/sheets/ConfirmSheet';
import { performLogout } from '../../../utils/logout';
import { haptics } from '../../../utils/haptics';

interface Props {
  userName?: string | null;
  instituteName?: string | null;
}

function AccountCard({ userName, instituteName }: Props) {
  const { t } = useTranslation();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);
  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  const accountSubtitle =
    userName && instituteName
      ? t('cafeteria.accountInfoDesc', {
          name: userName,
          institute: instituteName,
          defaultValue: `${userName} · ${instituteName}`,
        })
      : userName || instituteName || '';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {t('cafeteria.accountSection', { defaultValue: 'الحساب' })}
        </Text>
        <Ionicons name="cafe" size={20} color={tokens.color.o600} />
      </View>

      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: tokens.color.o50 }]}>
          <Ionicons name="information-circle" size={18} color={tokens.color.o600} />
        </View>
        <View style={styles.info}>
          <Text style={styles.label}>
            {t('cafeteria.accountInfo', { defaultValue: 'معلومات الحساب' })}
          </Text>
          {accountSubtitle ? (
            <Text style={styles.desc} numberOfLines={1}>
              {accountSubtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.divider} />

      <Pressable
        onPress={openLogout}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t('common.logout')}
      >
        <View style={[styles.iconWrap, { backgroundColor: tokens.color.dangerBg }]}>
          <Ionicons name="log-out-outline" size={18} color={tokens.color.danger} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.label, { color: tokens.color.danger }]}>
            {t('common.logout')}
          </Text>
          <Text style={styles.desc}>
            {t('cafeteria.logoutDesc', { defaultValue: 'سجّل خروج من الحساب' })}
          </Text>
        </View>
      </Pressable>

      <ConfirmSheet
        visible={logoutVisible}
        onClose={closeLogout}
        title={t('common.logout')}
        message={t('auth.confirmLogout')}
        confirmLabel={t('common.logout')}
        destructive
        onConfirm={performLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, alignItems: 'flex-end', marginRight: 12 },
  label: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
  },
  desc: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border2,
    marginVertical: 10,
  },
});

export default memo(AccountCard);
