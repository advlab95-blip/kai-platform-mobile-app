import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import InteractionSettings from '../../components/shared/InteractionSettings';
import NotificationPreferences from '../../components/shared/NotificationPreferences';
import IconButton from '../../components/teacher/buttons/IconButton';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import PrivacyTermsGroup from '../../components/shared/PrivacyTermsGroup';
import { useProfilePic } from '../../hooks/useProfilePic';
import { performLogout } from '../../utils/logout';
import { haptics } from '../../utils/haptics';

export default function TeacherSettings() {
  const { userId, userName } = useAuthStore();
  const { t } = useTranslation();
  const { avatarUrl, uploading, pickAndUploadAvatar } = useProfilePic(userId);
  const [logoutVisible, setLogoutVisible] = useState(false);

  const tcnId = userId ? `TCH-${userId.slice(0, 6).toUpperCase()}` : '';

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);

  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title={t('settings.title')} fallbackRoute="/(teacher)/services" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ───── Profile card ───── */}
        <LinearGradient
          colors={tokens.gradient.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.profileCard}
        >
          <View style={s.profileRow}>
            <View style={s.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatar} />
              ) : (
                <View style={s.avatarFallback}>
                  <Ionicons name="person-circle" size={64} color="rgba(255,255,255,0.85)" />
                </View>
              )}
              {uploading && (
                <View style={s.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
            <View style={s.profileInfo}>
              <Text style={s.profileName} numberOfLines={1}>
                {userName || t('common.user', { defaultValue: 'مستخدم' })}
              </Text>
              {!!tcnId && (
                <Text style={s.profileId} numberOfLines={1}>{tcnId}</Text>
              )}
            </View>
            <View style={s.profileActions}>
              <IconButton
                icon="camera"
                variant="glass"
                onPress={pickAndUploadAvatar}
                accessibilityLabel={t('common.editPhoto', { defaultValue: 'تغيير الصورة' })}
              />
            </View>
          </View>
        </LinearGradient>

        {/* ───── Group 1 — Preferences (notifications) ───── */}
        <View style={s.group}>
          <View style={s.groupTitleRow}>
            <Text style={s.groupTitle}>
              {t('settings.notificationsGroup', { defaultValue: 'الإشعارات' })}
            </Text>
          </View>
          <View style={s.groupBody}>
            <NotificationPreferences userId={userId} />
          </View>
        </View>

        {/* ───── Group 2 — Interaction ───── */}
        <View style={s.group}>
          <View style={s.groupTitleRow}>
            <Text style={s.groupTitle}>
              {t('settings.interactions', { defaultValue: 'التفاعلات' })}
            </Text>
          </View>
          <View style={s.groupBody}>
            <InteractionSettings />
          </View>
        </View>

        {/* ───── Privacy & Terms (App Store / Google Play required) ───── */}
        <PrivacyTermsGroup />

        {/* ───── Group 3 — Account ───── */}
        <View style={s.group}>
          <View style={s.groupTitleRow}>
            <Text style={s.groupTitle}>
              {t('settings.accountGroup', { defaultValue: 'الحساب' })}
            </Text>
          </View>
          <Pressable
            onPress={openLogout}
            style={({ pressed }) => [s.dangerRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.logout')}
          >
            <View style={s.dangerIconWrap}>
              <Ionicons name="log-out" size={20} color={tokens.color.danger} />
            </View>
            <Text style={s.dangerLabel}>
              {t('auth.logout', { defaultValue: t('common.logout') })}
            </Text>
            <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
          </Pressable>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={logoutVisible}
        onClose={closeLogout}
        title={t('common.logout', { defaultValue: 'تسجيل الخروج' })}
        message={t('auth.confirmLogout', { defaultValue: 'هل تريد الخروج؟' })}
        confirmLabel={t('auth.logout', { defaultValue: t('common.logout') })}
        destructive
        onConfirm={performLogout}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },

  // Profile card (gradient hero)
  profileCard: {
    margin: 16,
    padding: 18,
    borderRadius: tokens.radius.xl,
    ...tokens.shadow.brand,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { flex: 1, alignItems: 'flex-end' },
  profileName: {
    color: '#fff',
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
    textAlign: 'right',
  },
  profileId: {
    color: '#fff',
    opacity: 0.7,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.medium,
    textAlign: 'right',
    marginTop: 4,
  },
  profileActions: { marginStart: 4 },

  // Groups
  group: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
  },
  groupTitleRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
  },
  groupTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlign: 'right',
  },
  groupBody: { padding: 12 },

  // Danger row
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dangerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerLabel: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.danger,
    textAlign: 'right',
  },
});
