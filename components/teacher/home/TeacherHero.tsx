// TeacherHero — gradient header with avatar, notifications, search, greeting.
// Parent owns: userName, avatarUrl, unreadCount, selectedClass label, all press handlers.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { timeGreeting } from '../../../utils/greeting';
import GlobalSearchButton from '../../shared/GlobalSearchButton';
import InstituteLogo from '../../shared/InstituteLogo';
import { haptics } from '../../../utils/haptics';

type Props = {
  userName?: string | null;
  avatarUrl?: string | null;
  unreadCount: number;
  selectedClassName?: string | null;
  onLogout: () => void;
  onOpenNotifications: () => void;
  onPickAvatar: () => void;
};

export default function TeacherHero({
  userName,
  avatarUrl,
  unreadCount,
  selectedClassName,
  onLogout,
  onOpenNotifications,
  onPickAvatar,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[...tokens.gradient.brand] as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 18 }]}
    >
      <View pointerEvents="none" style={styles.heroGlowTopLeft} />
      <View pointerEvents="none" style={styles.heroGlowBottomRight} />
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onLogout} style={styles.headerBtn}>
            <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, unreadCount > 0 && styles.headerBtnActive]}
            onPress={() => { haptics.light(); onOpenNotifications(); }}
            activeOpacity={0.7}
          >
            <View style={styles.bellContainer}>
              <Ionicons
                name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
                size={20}
                color={unreadCount > 0 ? '#FDE68A' : 'rgba(255,255,255,0.9)'}
              />
              {unreadCount > 0 && (
                <View style={styles.badgeModern}>
                  <Text style={styles.badgeModernText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
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
              {userName || t('teacher.defaultName')}
            </Text>
          </View>
          <InstituteLogo size={36} />
          <TouchableOpacity style={styles.avatar} onPress={onPickAvatar} activeOpacity={0.7}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
            ) : (
              <Ionicons name="person" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.platformLabel}>
        {selectedClassName ? `${t('teacherHome.teacherPortal')} — ${selectedClassName}` : t('teacherHome.teacherPortal')}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGlowTopLeft: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroGlowBottomRight: {
    position: 'absolute',
    bottom: -80,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(59,130,246,0.25)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameWrap: { flexShrink: 1, maxWidth: 180 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnActive: {
    backgroundColor: 'rgba(253,224,71,0.18)',
    borderColor: 'rgba(253,224,71,0.45)',
  },
  bellContainer: {
    position: 'relative',
  },
  badgeModern: {
    position: 'absolute',
    top: -7,
    right: -9,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeModernText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  userName: {
    fontSize: 19,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'right',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  platformLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: 4,
  },
});
