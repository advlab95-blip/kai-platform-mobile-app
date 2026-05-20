// Red gradient hero shown at the top of the medical home.
// Logout button uses ConfirmSheet (never confirmAlert).
import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import InstituteLogo from '../../shared/InstituteLogo';
import GlobalSearchButton from '../../shared/GlobalSearchButton';
import ConfirmSheet from '../../teacher/sheets/ConfirmSheet';
import { performLogout } from '../../../utils/logout';
import { haptics } from '../../../utils/haptics';

interface Props {
  userName?: string | null;
  avatarUrl?: string | null;
  onAvatarPress: () => void;
}

function HomeHero({ userName, avatarUrl, onAvatarPress }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);
  const closeLogout = useCallback(() => setLogoutVisible(false), []);
  const openSettings = useCallback(() => {
    haptics.selection();
    router.push('/(medical)/settings');
  }, [router]);

  return (
    <>
      <LinearGradient
        colors={tokens.gradient.medical}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + tokens.spacing[4] }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={openLogout} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('common.logout')}>
              <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <GlobalSearchButton style={styles.headerBtn} color="rgba(255,255,255,0.8)" size={20} />
            <TouchableOpacity onPress={openSettings} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('common.settings')}>
              <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.nameWrap}>
              <Text style={styles.greeting} numberOfLines={1}>{t('medical.greeting')}</Text>
              <Text
                style={styles.userName}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                allowFontScaling={false}
              >
                {userName || t('medical.defaultName')}
              </Text>
            </View>
            <InstituteLogo size={36} />
            <TouchableOpacity style={styles.avatar} onPress={onAvatarPress} activeOpacity={0.7} accessibilityRole="button">
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              ) : (
                <Ionicons name="medkit" size={22} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.platformLabel}>{t('medical.clinicLabel')}</Text>
      </LinearGradient>

      <ConfirmSheet
        visible={logoutVisible}
        onClose={closeLogout}
        title={t('common.logout')}
        message={t('auth.confirmLogout')}
        confirmLabel={t('common.logout')}
        destructive
        onConfirm={performLogout}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: tokens.spacing[6],
    paddingHorizontal: tokens.spacing[5],
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  nameWrap: { flexShrink: 1, maxWidth: 180 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  greeting: { fontSize: tokens.font.size.base, color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  userName: {
    fontSize: tokens.font.size.xl + 1,
    fontWeight: tokens.font.weight.heavy,
    color: '#fff',
    textAlign: 'right',
  },
  platformLabel: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: tokens.spacing[3],
  },
});

export default memo(HomeHero);
