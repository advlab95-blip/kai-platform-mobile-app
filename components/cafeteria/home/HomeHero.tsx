// Orange gradient hero shown at the top of the cafeteria home.
// Logout button uses ConfirmSheet (never confirmAlert) — unified across roles.
import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import InstituteLogo from '../../shared/InstituteLogo';
import ConfirmSheet from '../../teacher/sheets/ConfirmSheet';
import { performLogout } from '../../../utils/logout';
import { haptics } from '../../../utils/haptics';

interface Props {
  userName?: string | null;
  avatarUrl?: string | null;
  onAvatarPress: () => void;
  /** Bell tap — parent opens NotificationPanel + lazy-loads notifications. */
  onBellPress?: () => void;
  /** Unread badge count — hidden when 0. */
  unreadCount?: number;
}

function HomeHero({ userName, avatarUrl, onAvatarPress, onBellPress, unreadCount = 0 }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);
  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  const handleBell = useCallback(() => {
    if (!onBellPress) return;
    haptics.selection();
    onBellPress();
  }, [onBellPress]);

  return (
    <>
      <LinearGradient
        colors={tokens.gradient.cafeteria}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + tokens.spacing[4] }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={openLogout}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.logout')}
            >
              <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            {onBellPress ? (
              <TouchableOpacity
                onPress={handleBell}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.notifications', { defaultValue: 'الإشعارات' })}
              >
                <View style={styles.bellWrap}>
                  <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.8)" />
                  {unreadCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {unreadCount > 9 ? '9+' : String(unreadCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.headerRight}>
            <View style={styles.nameWrap}>
              <Text style={styles.greeting} numberOfLines={1}>{t('cafeteria.greeting')}</Text>
              <Text
                style={styles.userName}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                allowFontScaling={false}
              >
                {userName || t('cafeteria.defaultName')}
              </Text>
            </View>
            <InstituteLogo size={36} />
            <TouchableOpacity
              style={styles.avatar}
              onPress={onAvatarPress}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              ) : (
                <Ionicons name="cafe" size={22} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.platformLabel}>{t('cafeteria.cafeteriaLabel')}</Text>
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
  bellWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
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
  greeting: {
    fontSize: tokens.font.size.base,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
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
