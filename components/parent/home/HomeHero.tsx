// Violet gradient hero for parent home (brief §7.1).
// Header layout (RTL): leftGroup (logout / export-pdf / bell / search) ↔ rightGroup (greeting + name + institute logo + avatar).
// Logout uses ConfirmSheet, never confirmAlert (project rule).
import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import InstituteLogo from '../../shared/InstituteLogo';
import GlobalSearchButton from '../../shared/GlobalSearchButton';
import ConfirmSheet from '../../teacher/sheets/ConfirmSheet';
import { performLogout } from '../../../utils/logout';
import { haptics } from '../../../utils/haptics';
import { timeGreeting } from '../../../utils/greeting';

interface Props {
  userName?: string | null;
  avatarUrl?: string | null;
  onAvatarPress: () => void;
  unreadCount: number;
  onBellPress: () => void;
  onExportPress: () => void;
  exporting: boolean;
  exportDisabled: boolean;
}

function HomeHero({
  userName,
  avatarUrl,
  onAvatarPress,
  unreadCount,
  onBellPress,
  onExportPress,
  exporting,
  exportDisabled,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);
  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  return (
    <>
      <LinearGradient
        colors={tokens.gradient.parent}
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
            <TouchableOpacity
              onPress={onExportPress}
              style={styles.headerBtn}
              disabled={exporting || exportDisabled}
              accessibilityRole="button"
              accessibilityLabel={t('parent.exportReportLabel', { defaultValue: 'تصدير تقرير الطالب' })}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
              ) : (
                <Ionicons name="document-text-outline" size={20} color="rgba(255,255,255,0.8)" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={onBellPress}
              accessibilityRole="button"
              accessibilityLabel={t('parent.notifications', { defaultValue: 'الإشعارات' })}
            >
              <View style={styles.bellContainer}>
                <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.8)" />
                {unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
            <GlobalSearchButton style={styles.headerBtn} color="rgba(255,255,255,0.8)" size={20} />
          </View>

          <View style={styles.headerRight}>
            <View style={styles.nameWrap}>
              <Text style={styles.greeting} numberOfLines={1}>{timeGreeting()}</Text>
              <Text
                style={styles.userName}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                allowFontScaling={false}
              >
                {userName || t('parent.defaultName', { defaultValue: 'ولي أمر' })}
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
                <Ionicons name="person" size={22} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.platformLabel}>
          {t('parent.parentPortal', { defaultValue: 'بوابة ولي الأمر' })}
        </Text>
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
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellContainer: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: tokens.color.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: tokens.font.weight.heavy },
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
