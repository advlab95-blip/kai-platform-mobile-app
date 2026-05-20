import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import InteractionSettings from '../../components/shared/InteractionSettings';
import NotificationPreferences from '../../components/shared/NotificationPreferences';
import IconButton from '../../components/teacher/buttons/IconButton';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import { useProfilePic } from '../../hooks/useProfilePic';
import { performLogout } from '../../utils/logout';
import { haptics } from '../../utils/haptics';

export default function StudentSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userId, userName } = useAuthStore();
  const { avatarUrl, uploading, pickAndUploadAvatar } = useProfilePic(userId);
  const [logoutVisible, setLogoutVisible] = useState(false);

  const stuId = userId ? `STU-${userId.slice(0, 6).toUpperCase()}` : '';

  const openLogout = useCallback(() => {
    haptics.warning();
    setLogoutVisible(true);
  }, []);

  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  const goPrivacy = useCallback(() => {
    haptics.light();
    Linking.openURL('https://kai-legal.vercel.app/privacy').catch(() => {});
  }, []);

  const goTerms = useCallback(() => {
    haptics.light();
    Linking.openURL('https://kai-legal.vercel.app/terms').catch(() => {});
  }, []);

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('student.settingsTitle') || 'الإعدادات'}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
        fallbackRoute="/(student)/services"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ───── Profile card (teal hero) ───── */}
        <LinearGradient
          colors={tokens.gradient.student}
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
                {userName || t('student.defaultName', { defaultValue: 'الطالب' })}
              </Text>
              {!!stuId && (
                <Text style={s.profileId} numberOfLines={1}>{stuId}</Text>
              )}
            </View>
            <View style={s.profileActions}>
              <IconButton
                icon="camera"
                variant="glass"
                onPress={pickAndUploadAvatar}
                accessibilityLabel={t('student.editPhoto', { defaultValue: 'تغيير الصورة' })}
              />
            </View>
          </View>
        </LinearGradient>

        {/* ───── Group 1 — Notifications ───── */}
        <View style={s.group}>
          <View style={s.groupTitleRow}>
            <Text style={s.groupTitle}>
              {t('student.settingsGroupNotifications', { defaultValue: 'الإشعارات' })}
            </Text>
          </View>
          <View style={s.groupBody}>
            <NotificationPreferences userId={userId} variant="student" />
          </View>
        </View>

        {/* ───── Group 2 — Interaction ───── */}
        <View style={s.group}>
          <View style={s.groupTitleRow}>
            <Text style={s.groupTitle}>
              {t('student.settingsGroupInteraction', { defaultValue: 'التفاعلات' })}
            </Text>
          </View>
          <View style={s.groupBody}>
            <InteractionSettings />
          </View>
        </View>

        {/* ───── Group 3 — Privacy ───── */}
        <View style={s.group}>
          <View style={s.groupTitleRow}>
            <Text style={s.groupTitle}>
              {t('student.settingsGroupPrivacy', { defaultValue: 'الخصوصية' })}
            </Text>
          </View>

          <Pressable
            onPress={goPrivacy}
            style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('student.privacyPolicy', { defaultValue: 'سياسة الخصوصية' })}
          >
            <View style={[s.rowIconWrap, { backgroundColor: tokens.color.infoBg }]}>
              <Ionicons name="shield-checkmark" size={18} color={tokens.color.info} />
            </View>
            <Text style={s.rowLabel} numberOfLines={1}>
              {t('student.privacyPolicy', { defaultValue: 'سياسة الخصوصية' })}
            </Text>
            <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
          </Pressable>

          <View style={s.divider} />

          <Pressable
            onPress={goTerms}
            style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('student.termsOfService', { defaultValue: 'شروط الاستخدام' })}
          >
            <View style={[s.rowIconWrap, { backgroundColor: tokens.color.brand100 }]}>
              <Ionicons name="document-text" size={18} color={tokens.color.brand500} />
            </View>
            <Text style={s.rowLabel} numberOfLines={1}>
              {t('student.termsOfService', { defaultValue: 'شروط الاستخدام' })}
            </Text>
            <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
          </Pressable>
        </View>

        {/* ───── Group 4 — Account / Logout ───── */}
        <View style={s.group}>
          <View style={s.groupTitleRow}>
            <Text style={s.groupTitle}>
              {t('student.settingsGroupAccount', { defaultValue: 'الحساب' })}
            </Text>
          </View>
          <Pressable
            onPress={openLogout}
            style={({ pressed }) => [s.dangerRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('student.logoutBtn', { defaultValue: 'تسجيل الخروج' })}
          >
            <View style={s.dangerIconWrap}>
              <Ionicons name="log-out" size={20} color={tokens.color.danger} />
            </View>
            <Text style={s.dangerLabel}>
              {t('student.logoutBtn', { defaultValue: 'تسجيل الخروج' })}
            </Text>
            <Ionicons name="chevron-back" size={18} color={tokens.color.danger} />
          </Pressable>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={logoutVisible}
        onClose={closeLogout}
        title={t('student.logoutTitle', { defaultValue: 'تسجيل الخروج' })}
        message={t('student.logoutConfirm', { defaultValue: 'هل تريد الخروج؟' })}
        confirmLabel={t('student.logoutBtn', { defaultValue: 'تسجيل الخروج' })}
        destructive
        onConfirm={performLogout}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },

  // Profile card (teal gradient hero)
  profileCard: {
    margin: 16,
    padding: 18,
    borderRadius: tokens.radius.xl,
    ...tokens.shadow.teal,
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
    opacity: 0.75,
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

  // Privacy rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowPressed: { backgroundColor: tokens.color.surface2 },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border2,
    marginStart: 62,
  },

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
