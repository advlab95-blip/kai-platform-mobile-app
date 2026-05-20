// HomeHero — student home hero (teal gradient).
// Pure presentational: greeting, avatar (with upload trigger), bell with unread badge,
// global search, logout, institute logo, portal label.
// Parent owns all state (notif panel, logout sheet, profile pic upload). This component
// emits press handlers and reads display data via props.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import { timeGreeting } from '../../../utils/greeting';
import GlobalSearchButton from '../../shared/GlobalSearchButton';
import InstituteLogo from '../../shared/InstituteLogo';

type Props = {
  userName?: string | null;
  avatarUrl?: string | null;
  unreadCount: number;
  selectedClassName?: string;
  onLogoutPress: () => void;
  onBellPress: () => void;
  onAvatarPress: () => void;
};

export default function HomeHero({
  userName,
  avatarUrl,
  unreadCount,
  selectedClassName,
  onLogoutPress,
  onBellPress,
  onAvatarPress,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={tokens.gradient.student as unknown as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 18 }]}
    >
      <View style={styles.heroGlowTopLeft} pointerEvents="none" />
      <View style={styles.heroGlowBottomRight} pointerEvents="none" />
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onLogoutPress} style={styles.headerBtn} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.88)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, unreadCount > 0 && styles.headerBtnActive]}
            onPress={() => { haptics.light(); onBellPress(); }}
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
          <GlobalSearchButton style={styles.headerBtn} color="rgba(255,255,255,0.88)" size={20} />
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
              {userName || t('student.defaultName')}
            </Text>
          </View>
          <InstituteLogo size={36} />
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => { haptics.selection(); onAvatarPress(); }}
            activeOpacity={0.7}
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
              />
            ) : (
              <Ionicons name="person" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.platformLabel}>
        {selectedClassName
          ? t('student.studentPortalClass', { className: selectedClassName })
          : t('student.studentPortal')}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: tokens.radius['2xl'],
    borderBottomRightRadius: tokens.radius['2xl'],
    overflow: 'hidden',
    position: 'relative',
  },
  heroGlowTopLeft: {
    position: 'absolute',
    top: -60,
    start: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroGlowBottomRight: {
    position: 'absolute',
    bottom: -80,
    end: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(20,184,166,0.25)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameWrap: { flexShrink: 1, maxWidth: 180 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnActive: {
    backgroundColor: 'rgba(253,224,71,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.35)',
  },
  bellContainer: { position: 'relative' },
  badgeModern: {
    position: 'absolute',
    top: -6,
    end: -8,
    backgroundColor: tokens.color.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: tokens.color.teal700,
  },
  badgeModernText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    fontSize: tokens.font.size.base,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
  },
  userName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'right',
  },
  platformLabel: {
    fontSize: tokens.font.size.xs,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 3,
  },
});
