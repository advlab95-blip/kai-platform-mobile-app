import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useNotificationStore from '../../stores/notificationStore';
import GlobalSearchButton from '../../components/shared/GlobalSearchButton';
import useAdminStore from '../../stores/adminStore';
import { api } from '../../services/api';
import { useProfilePic } from '../../hooks/useProfilePic';
import { useTranslation } from 'react-i18next';
import { confirmAlert } from '../../utils/alerts';
import { performLogout } from '../../utils/logout';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import PlatformComparisonPanel from '../../components/shared/PlatformComparisonPanel';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import AnimatedPressable from '../../components/animated/AnimatedPressable';
import NotificationPanel from '../../components/shared/NotificationPanel';
import { ListSkeleton } from '../../components/animated/PageSkeleton';
import { haptics } from '../../utils/haptics';
import * as ImagePicker from 'expo-image-picker';
import { bunnyStorage } from '../../services/bunny';
import { compressImage } from '../../utils/imageCompress';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import CreateInstitutionWizard from '../../components/shared/CreateInstitutionWizard';
import OnlineUsersSheet from '../../components/admin/OnlineUsersSheet';
import usePresenceStore from '../../stores/presenceStore';

export default function AdminHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userName, userId, role, logout } = useAuthStore();
  const { avatarUrl, pickAndUploadAvatar } = useProfilePic(userId);
  const { institutes, announcements, loadAnnouncements, loadInstitutes } = useDataStore();
  const { notifications, unreadCount, loadNotifications } = useNotificationStore();
  const { platformStats, onlineCount, loadPlatformStats, loadOnlineCount, subscribeToPlatformStats } = useAdminStore();

  const [refreshing, setRefreshing] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [announcementTarget, setAnnouncementTarget] = useState('all');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [sending, setSending] = useState(false);
  // Enhanced options: optionally scope to a specific institute, attach a cover
  // image, and set how long the home-screen banner should run. When any of
  // these are set we ALSO create an admin_ads row so the image/duration show
  // up on the student home (AdBanner consumes that table).
  const [annInstituteId, setAnnInstituteId] = useState<string | null>(null); // null = all institutes
  const [annImageUri, setAnnImageUri] = useState<string | null>(null);
  const [annImageUploading, setAnnImageUploading] = useState(false);
  const [annDurationHours, setAnnDurationHours] = useState<number | null>(24); // null = unlimited
  // When true, the announcement also surfaces as a centered popup on the next
  // app open for every targeted user. Default ON — the "Quick Announcement"
  // affordance exists primarily to grab attention.
  const [annIsPopup, setAnnIsPopup] = useState<boolean>(true);
  const [recentAudit, setRecentAudit] = useState<any[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  // Stats cards now act as quick navigators / sheet openers (per user request: 4 panels).
  // Cards route to institutions/users (originals) since the manage merger was reverted.
  const [showOnlineSheet, setShowOnlineSheet] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

  const loadRecentAudit = useCallback(async () => {
    try {
      const data = await api.getAdminAuditLog({ limit: 5 });
      setRecentAudit(data || []);
    } catch { setRecentAudit([]); }
  }, []);

  useEffect(() => {
    loadPlatformStats();
    loadOnlineCount();
    loadAnnouncements('admin');
    loadInstitutes();
    loadRecentAudit();
    // Platform-wide stats now update live as users/institutes/enrollments change.
    // Depend on `role` — subscribeToPlatformStats hard-gates on role==='admin' and
    // would no-op if this effect ran before initialize() resolved the role.
    const unsubscribeStats = subscribeToPlatformStats();
    return unsubscribeStats;
  }, [role]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await Promise.all([loadPlatformStats(), loadOnlineCount(), loadAnnouncements('admin'), loadRecentAudit()]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handlePickAnnImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), 'يلزم إذن الوصول للصور');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [16, 9],
      });
      if (!result.canceled && result.assets?.length > 0) {
        setAnnImageUri(result.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || 'تعذر اختيار الصورة');
    }
  };

  const handleSendAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcementContent.trim()) {
      Alert.alert(t('common.error'), t('common.fillAllFields'));
      return;
    }
    const instituteLabel = annInstituteId
      ? (institutes.find((i: any) => i.id === annInstituteId)?.name || 'المؤسسة المختارة')
      : 'جميع المؤسسات';
    const confirmMsg = `سيتم إرسال الإشعار لـ ${instituteLabel}. هل أنت متأكد؟`;
    confirmAlert('تأكيد', confirmMsg, async () => {
      setSending(true);
      try {
        // Optional image upload first — if this fails we still try to send the
        // text announcement so the user isn't blocked by Bunny hiccups.
        let uploadedImageUrl: string | null = null;
        if (annImageUri) {
          try {
            setAnnImageUploading(true);
            // Compress before upload — announcement banners don't need the full
            // 5–10 MB iPhone photo, ~1200px / q=0.7 is plenty for a 16:9 banner.
            const compressed = await compressImage(annImageUri, { maxWidth: 1600, quality: 0.7 });
            uploadedImageUrl = await bunnyStorage.uploadImage(compressed, 'announcements');
          } catch (e: any) {
            console.error('announcement image upload failed', e);
          } finally {
            setAnnImageUploading(false);
          }
        }

        // Step 1 (critical): DB insert — if this fails, the announcement isn't saved
        // is_popup + expires_at are forwarded so the user-side popup component
        // (QuickAnnouncementPopup) can pick this row up on the next app open.
        // expires_at: reuse the same duration the admin picked for the banner ad
        // so a "7 days" announcement also stops popping after a week.
        const popupExpiresAt = annDurationHours
          ? new Date(Date.now() + annDurationHours * 3600 * 1000).toISOString()
          : null;
        await api.createAnnouncement(
          announcementTitle.trim(),
          announcementContent.trim(),
          announcementTarget,
          annInstituteId || null,
          {
            platformWide: !annInstituteId,
            isPopup: annIsPopup,
            expiresAt: popupExpiresAt,
          },
        );
        // Step 2 (best-effort): push notification — don't fail the whole flow on push failure
        //   (was causing the admin to re-send and create duplicates)
        let pushWarn = '';
        if (userId) {
          try {
            await api.sendPushNotification(
              announcementTitle.trim(),
              announcementContent.trim(),
              announcementTarget,
              userId,
              annInstituteId || undefined,
            );
          } catch (e: any) {
            pushWarn = e?.message || '';
          }
        }

        // Step 3 (optional): create an admin_ad so the announcement surfaces as a
        // home-screen banner with image + duration. Only when the admin attached
        // an image or narrowed to a specific institute or picked a finite window.
        if (userId && (uploadedImageUrl || annInstituteId || annDurationHours !== null)) {
          try {
            const expiresAt = annDurationHours
              ? new Date(Date.now() + annDurationHours * 3600 * 1000).toISOString()
              : null;
            await api.createAd(
              {
                title: announcementTitle.trim(),
                body: announcementContent.trim(),
                image_url: uploadedImageUrl,
                target_institutes: annInstituteId ? [annInstituteId] : [],
                is_active: true,
                starts_at: new Date().toISOString(),
                expires_at: expiresAt,
              },
              // Platform admin passes null owner; RLS trigger allows it.
              annInstituteId,
              userId,
            );
          } catch (e) {
            console.error('createAd failed for quick announcement', e);
          }
        }

        setAnnouncementTitle('');
        setAnnouncementContent('');
        setAnnImageUri(null);
        setAnnInstituteId(null);
        setAnnDurationHours(24);
        setAnnIsPopup(true);
        if (pushWarn) {
          Alert.alert(t('common.success'), `${t('admin.announcementSent')}\n\n⚠️ ${t('admin.pushWarning', { defaultValue: 'الإشعار المباشر لم يُرسل لكل المستخدمين' })}: ${pushWarn.slice(0, 120)}`);
        } else {
          Alert.alert(t('common.success'), t('admin.announcementSent'));
        }
        setShowAnnouncementModal(false);
        loadAnnouncements('admin');
      } catch (err: any) {
        Alert.alert(t('common.error'), err.message || t('admin.announcementFailed'));
      } finally {
        setSending(false);
      }
    });
  };

  const handleLogout = () => {
    setLogoutVisible(true);
  };

  const TARGETS = [
    { key: 'all', label: t('common.everyone') },
    { key: 'teacher', label: t('common.teachers') },
    { key: 'student', label: t('common.students') },
  ];

  const targetBadge = (role: string) => {
    const map: Record<string, string> = { all: t('common.everyone'), teacher: t('common.teachers'), student: t('common.students'), parent: t('common.parents') };
    return map[role] || role;
  };

  const renderAnnouncementItem = ({ item }: { item: any }) => (
    <View style={styles.announcementCard}>
      <View style={styles.announcementAccent} />
      <View style={styles.announcementBody}>
        <View style={styles.announcementHeader}>
          <View style={styles.targetBadge}>
            <Text style={styles.targetBadgeText}>{targetBadge(item.target_role)}</Text>
          </View>
          <Text style={styles.announcementDate}>
            {new Date(item.created_at).toLocaleDateString('ar-IQ')}
          </Text>
        </View>
        <Text style={styles.announcementTitle}>{item.title}</Text>
        <Text style={styles.announcementContent} numberOfLines={2}>
          {item.content}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FadeSlideIn style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <LinearGradient
          colors={['#020024', '#2F2FBA', '#00D4FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 18 }]}
        >
          {/* Decorative glow circles for depth */}
          <View pointerEvents="none" style={styles.heroGlowTopLeft} />
          <View pointerEvents="none" style={styles.heroGlowBottomRight} />
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={handleLogout} style={styles.headerBtn}>
                <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={() => { if (userId) loadNotifications(userId, 'admin'); setShowNotifPanel(true); }}>
                <View style={styles.bellContainer}>
                  <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.8)" />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <GlobalSearchButton style={styles.headerBtn} color="rgba(255,255,255,0.8)" size={20} />
            </View>
            <View style={styles.headerRight}>
              <View style={styles.nameWrap}>
                <Text style={styles.greeting} numberOfLines={1}>{t('admin.welcomeBack')}</Text>
                <Text
                  style={styles.userName}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  allowFontScaling={false}
                >
                  {userName || t('admin.defaultName')}
                </Text>
              </View>
              <TouchableOpacity style={styles.avatar} onPress={pickAndUploadAvatar} activeOpacity={0.7}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                ) : (
                  <Ionicons name="person" size={22} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.platformLabel}>KAI PLATFORM</Text>
          {onlineCount > 0 && (
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>{onlineCount} {t('admin.onlineNow')}</Text>
            </View>
          )}
        </LinearGradient>

        <View style={styles.content}>
          {/* Stats Cards Row — 4 pressable cards. Each opens its corresponding screen/sheet. */}
          <View style={styles.statsRow}>
            <FadeSlideIn delay={0} style={styles.statCardWrap}>
              <AnimatedPressable
                style={[styles.statCard, { backgroundColor: '#EEF2FF' }]}
                onPress={() => router.push('/(admin)/institutions' as any)}
                haptic="light"
                accessibilityLabel={t('admin.institutes')}
              >
                <View style={[styles.statIconWrap, { backgroundColor: '#4F46E520' }]}>
                  <Ionicons name="business" size={20} color="#4F46E5" />
                </View>
                <Text style={styles.statValue}>{institutes.length || platformStats.institutes}</Text>
                <Text style={styles.statLabel}>{t('admin.institutes')}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
            <FadeSlideIn delay={80} style={styles.statCardWrap}>
              <AnimatedPressable
                style={[styles.statCard, { backgroundColor: '#ECFDF5' }]}
                onPress={() => router.push('/(admin)/users' as any)}
                haptic="light"
                accessibilityLabel={t('admin.users')}
              >
                <View style={[styles.statIconWrap, { backgroundColor: '#10B98120' }]}>
                  <Ionicons name="people" size={20} color="#10B981" />
                </View>
                <Text style={styles.statValue}>{platformStats.totalUsers}</Text>
                <Text style={styles.statLabel}>{t('admin.users')}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
            <FadeSlideIn delay={160} style={styles.statCardWrap}>
              <AnimatedPressable
                style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}
                onPress={() => setShowOnlineSheet(true)}
                haptic="light"
                accessibilityLabel={t('admin.onlineNow', { defaultValue: 'متصل الآن' })}
              >
                <View style={[styles.statIconWrap, { backgroundColor: '#F59E0B20' }]}>
                  <Ionicons name="radio" size={20} color="#F59E0B" />
                </View>
                <Text style={styles.statValue}>{onlineCount}</Text>
                <Text style={styles.statLabel}>{t('admin.onlineNow', { defaultValue: 'متصل الآن' })}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
            <FadeSlideIn delay={240} style={styles.statCardWrap}>
              <AnimatedPressable
                style={[styles.statCard, { backgroundColor: '#FCE7F3' }]}
                onPress={() => setShowCreateWizard(true)}
                haptic="medium"
                accessibilityLabel="إنشاء مؤسسة جديدة"
              >
                <View style={[styles.statIconWrap, { backgroundColor: '#EC489920' }]}>
                  <Ionicons name="add-circle" size={22} color="#EC4899" />
                </View>
                <Text style={[styles.statValue, { fontSize: 14 }]}>إنشاء</Text>
                <Text style={styles.statLabel}>مؤسسة جديدة</Text>
              </AnimatedPressable>
            </FadeSlideIn>
          </View>

          {/* Shortcuts grid — 6 cards, 3 columns with staggered entrance */}
          <Text style={styles.sectionTitle}>{t('admin.shortcuts', { defaultValue: 'الاختصارات' })}</Text>
          <View style={styles.shortcutGrid}>
            {/* Row 1 — إدارة ومراقبة يومية */}
            <FadeSlideIn delay={200} style={styles.shortcutCardWrap}>
              <AnimatedPressable style={styles.shortcutCard} onPress={() => router.push('/(admin)/institutions' as any)} haptic="light" accessibilityLabel={t('admin.shortcutInstitutes', { defaultValue: 'المؤسسات' })}>
                <View style={[styles.shortcutIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="business" size={22} color="#4F46E5" />
                </View>
                <Text style={styles.shortcutLabel}>{t('admin.shortcutInstitutes', { defaultValue: 'المؤسسات' })}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
            <FadeSlideIn delay={260} style={styles.shortcutCardWrap}>
              <AnimatedPressable style={styles.shortcutCard} onPress={() => router.push('/(admin)/reports' as any)} haptic="light" accessibilityLabel={t('admin.shortcutReports', { defaultValue: 'التقارير' })}>
                <View style={[styles.shortcutIcon, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="stats-chart" size={22} color="#DC2626" />
                </View>
                <Text style={styles.shortcutLabel}>{t('admin.shortcutReports', { defaultValue: 'التقارير' })}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
            <FadeSlideIn delay={320} style={styles.shortcutCardWrap}>
              <AnimatedPressable style={styles.shortcutCard} onPress={() => router.push('/(admin)/fees' as any)} haptic="light" accessibilityLabel={t('admin.shortcutFees', { defaultValue: 'الفواتير' })}>
                <View style={[styles.shortcutIcon, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="cash" size={22} color="#10B981" />
                </View>
                <Text style={styles.shortcutLabel}>{t('admin.shortcutFees', { defaultValue: 'الفواتير' })}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
            {/* Row 2 — تحكم + AI + تواصل */}
            <FadeSlideIn delay={380} style={styles.shortcutCardWrap}>
              <AnimatedPressable style={styles.shortcutCard} onPress={() => router.push('/(admin)/features' as any)} haptic="light" accessibilityLabel={t('admin.shortcutFeatures', { defaultValue: 'الميزات' })}>
                <View style={[styles.shortcutIcon, { backgroundColor: '#FCE7F3' }]}>
                  <Ionicons name="toggle" size={22} color="#EC4899" />
                </View>
                <Text style={styles.shortcutLabel}>{t('admin.shortcutFeatures', { defaultValue: 'الميزات' })}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
            <FadeSlideIn delay={440} style={styles.shortcutCardWrap}>
              <AnimatedPressable style={styles.shortcutCard} onPress={() => router.push('/(admin)/ai-reports' as any)} haptic="light" accessibilityLabel={t('admin.shortcutAiReports', { defaultValue: 'تقارير AI' })}>
                <View style={[styles.shortcutIcon, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="sparkles" size={22} color="#7C3AED" />
                </View>
                <Text style={styles.shortcutLabel}>{t('admin.shortcutAiReports', { defaultValue: 'تقارير AI' })}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
            <FadeSlideIn delay={500} style={styles.shortcutCardWrap}>
              <AnimatedPressable style={styles.shortcutCard} onPress={() => setShowAnnouncementModal(true)} haptic="light" accessibilityLabel={t('admin.shortcutAnnounce', { defaultValue: 'إعلان سريع' })}>
                <View style={[styles.shortcutIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="megaphone" size={22} color="#F59E0B" />
                </View>
                <Text style={styles.shortcutLabel}>{t('admin.shortcutAnnounce', { defaultValue: 'إعلان سريع' })}</Text>
              </AnimatedPressable>
            </FadeSlideIn>
          </View>

          {/* Platform comparison chart (Phase 3.5) — top 8 institutes by student count */}
          <PlatformComparisonPanel refreshNonce={refreshing ? Date.now() : 0} />

          {/* Recent audit activity — quick link to the full log, with last 5 entries inline */}
          {recentAudit.length > 0 && (
            <TouchableOpacity
              style={{
                backgroundColor: '#fff', borderRadius: 18, padding: 14,
                borderWidth: 1, borderColor: Colors.border, marginTop: 14,
              }}
              onPress={() => router.push('/(admin)/audit' as any)}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="shield-checkmark" size={18} color="#7C3AED" />
                <Text style={{ fontSize: 14, fontWeight: '900', color: Colors.text, flex: 1, textAlign: 'right' }}>
                  آخر العمليات
                </Text>
                <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              </View>
              {recentAudit.slice(0, 3).map((item: any) => {
                const ACTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
                  delete_user: { label: 'حذف مستخدم', color: '#DC2626', icon: 'trash-outline' },
                  delete_branch: { label: 'حذف فرع', color: '#DC2626', icon: 'git-branch-outline' },
                  delete_institute: { label: 'حذف مؤسسة', color: '#DC2626', icon: 'business-outline' },
                  create_user: { label: 'إنشاء مستخدم', color: '#059669', icon: 'person-add-outline' },
                  create_institute: { label: 'إنشاء مؤسسة', color: '#059669', icon: 'add-circle-outline' },
                  transfer_user: { label: 'نقل مستخدم', color: '#1E40AF', icon: 'swap-horizontal-outline' },
                  update_feature_flag: { label: 'تعديل ميزة', color: '#6D28D9', icon: 'flash-outline' },
                };
                const a = ACTION_LABELS[item.action] || { label: item.action, color: Colors.textMuted, icon: 'ellipsis-horizontal' };
                const when = new Date(item.created_at);
                const dt = when.toLocaleDateString('ar-IQ');
                const tm = when.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                return (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingVertical: 6,
                      borderTopWidth: 1, borderTopColor: '#F1F5F9',
                    }}
                  >
                    <Ionicons name={a.icon} size={14} color={a.color} />
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700' }}>
                      {tm} · {dt}
                    </Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: a.color }}>{a.label}</Text>
                      {item.target_name && (
                        <Text style={{ fontSize: 10, color: Colors.textMuted }} numberOfLines={1}>
                          {item.target_name}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </TouchableOpacity>
          )}

          <View style={{ height: 90 }} />
        </View>
      </ScrollView>
      </FadeSlideIn>
      </KeyboardAvoidingView>

      {/* FAB — Quick Announcement trigger */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.88}
        onPress={() => { haptics.light(); setShowAnnouncementModal(true); }}
      >
        <LinearGradient
          colors={['#020024', '#2F2FBA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="megaphone" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      <NotificationPanel
        visible={showNotifPanel}
        onClose={() => setShowNotifPanel(false)}
        userId={userId}
        title={t('common.notifications')}
      />

      {/* Online users sheet — opens from "متصل الآن" stat card */}
      <OnlineUsersSheet
        visible={showOnlineSheet}
        onClose={() => setShowOnlineSheet(false)}
        onlineUsers={onlineUsers}
      />

      {/* Create institution wizard — opens from the 4th stat card.
       *  CreateInstitutionWizard already wraps itself in SwipeableSheet,
       *  so pull-down-to-close works out of the box. */}
      <CreateInstitutionWizard
        visible={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        callerUserId={userId || ''}
        onCreated={async () => {
          await Promise.all([loadInstitutes(), loadPlatformStats()]);
        }}
      />

      <ConfirmSheet
        visible={logoutVisible}
        onClose={() => setLogoutVisible(false)}
        title={t('common.logout', { defaultValue: 'تسجيل الخروج' })}
        message={t('auth.confirmLogout', { defaultValue: 'هل تريد الخروج؟' })}
        confirmLabel={t('common.logout', { defaultValue: 'تسجيل الخروج' })}
        destructive
        onConfirm={performLogout}
      />

      {/* Quick Announcement — migrated from raw <Modal> to SwipeableSheet so the
          sheet closes on swipe-down like every other bottom sheet (user UX). */}
      <SwipeableSheet
        visible={showAnnouncementModal}
        onClose={() => setShowAnnouncementModal(false)}
        maxHeight={0.88}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ paddingHorizontal: 20 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAnnouncementModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{t('admin.quickAnnouncement')}</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Target role */}
                <Text style={styles.fieldLabel}>المستلم</Text>
                <View style={styles.segmentRow}>
                  {TARGETS.map((tg) => (
                    <TouchableOpacity
                      key={tg.key}
                      onPress={() => setAnnouncementTarget(tg.key)}
                      style={[styles.segmentBtn, announcementTarget === tg.key && styles.segmentBtnActive]}
                    >
                      <Text style={[styles.segmentText, announcementTarget === tg.key && styles.segmentTextActive]}>
                        {tg.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Institute picker */}
                <Text style={styles.fieldLabel}>المؤسسة</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  <TouchableOpacity
                    onPress={() => setAnnInstituteId(null)}
                    style={[styles.chipBtn, annInstituteId === null && styles.chipBtnActive]}
                  >
                    <Text style={[styles.chipText, annInstituteId === null && styles.chipTextActive]}>
                      جميع المؤسسات
                    </Text>
                  </TouchableOpacity>
                  {institutes.map((inst: any) => (
                    <TouchableOpacity
                      key={inst.id}
                      onPress={() => setAnnInstituteId(inst.id)}
                      style={[styles.chipBtn, annInstituteId === inst.id && styles.chipBtnActive]}
                    >
                      <Text style={[styles.chipText, annInstituteId === inst.id && styles.chipTextActive]}>
                        {inst.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TextInput
                  style={styles.input}
                  placeholder={t('admin.announcementTitle')}
                  placeholderTextColor={Colors.textMuted}
                  value={announcementTitle}
                  onChangeText={setAnnouncementTitle}
                  textAlign="right"
                />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={t('admin.announcementContent')}
                  placeholderTextColor={Colors.textMuted}
                  value={announcementContent}
                  onChangeText={setAnnouncementContent}
                  multiline
                  numberOfLines={3}
                  textAlign="right"
                  textAlignVertical="top"
                />

                {annImageUri ? (
                  <View style={styles.imagePreviewWrap}>
                    <Image
                      source={{ uri: annImageUri }}
                      style={{ width: '100%', height: 140, borderRadius: 12 }}
                      contentFit="cover"
                    />
                    <TouchableOpacity
                      style={styles.imageRemoveBtn}
                      onPress={() => setAnnImageUri(null)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.attachBtn} onPress={handlePickAnnImage} activeOpacity={0.8}>
                    {annImageUploading ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons name="image-outline" size={18} color={Colors.primary} />
                    )}
                    <Text style={styles.attachBtnText}>إرفاق صورة (اختياري)</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.fieldLabel}>مدة العرض على الشاشة الرئيسية</Text>
                <View style={styles.segmentRow}>
                  {[
                    { key: 24, label: '٢٤ ساعة' },
                    { key: 72, label: '٣ أيام' },
                    { key: 168, label: 'أسبوع' },
                    { key: null as number | null, label: 'دائم' },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={String(opt.key)}
                      onPress={() => setAnnDurationHours(opt.key)}
                      style={[styles.segmentBtn, annDurationHours === opt.key && styles.segmentBtnActive]}
                    >
                      <Text style={[styles.segmentText, annDurationHours === opt.key && styles.segmentTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Popup toggle — when ON the announcement appears as a centered
                    modal on the next app open for every targeted user. Each user
                    sees it once; dismissal is persisted in the DB. */}
                <TouchableOpacity
                  onPress={() => setAnnIsPopup(v => !v)}
                  activeOpacity={0.8}
                  style={styles.popupToggleRow}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: annIsPopup }}
                  accessibilityLabel="عرض كنافذة منبثقة"
                >
                  <View style={[styles.popupToggleBox, annIsPopup && styles.popupToggleBoxActive]}>
                    {annIsPopup && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.popupToggleTitle}>عرض كنافذة منبثقة</Text>
                    <Text style={styles.popupToggleHint}>
                      يظهر للمستلم كنافذة في منتصف الشاشة عند فتح التطبيق
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                  onPress={async () => {
                    await handleSendAnnouncement();
                  }}
                  disabled={sending || annImageUploading}
                  activeOpacity={0.8}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={styles.sendBtnText}>{t('common.send')}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
    backgroundColor: 'rgba(0,212,255,0.18)',
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
  nameWrap: { flexShrink: 1, maxWidth: 200 },
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
  bellContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: Colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
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
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    marginTop: 10,
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  onlineText: {
    fontSize: 11,
    color: '#BBF7D0',
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCardWrap: { width: '48%' },
  statCard: {
    borderRadius: 18,
    padding: 14,
    minHeight: 100,
    alignItems: 'flex-start',
    gap: 6,
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
    textAlign: 'right',
  },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  shortcutCardWrap: { width: '30%', flexGrow: 1 },
  shortcutCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  shortcutIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textAlign: 'right',
    marginBottom: 6,
    marginTop: 2,
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  chipTextActive: {
    color: Colors.primary,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  attachBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  imagePreviewWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  segmentTextActive: {
    color: Colors.primary,
  },
  popupToggleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
    marginTop: -4,
  },
  popupToggleBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  popupToggleBoxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  popupToggleTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  popupToggleHint: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 70,
    paddingTop: 10,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  announcementCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  announcementAccent: {
    width: 5,
    backgroundColor: Colors.primary,
  },
  announcementBody: {
    flex: 1,
    padding: 14,
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  targetBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  targetBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primary,
  },
  announcementDate: {
    fontSize: 9,
    color: Colors.textMuted,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 3,
  },
  announcementContent: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    shadowColor: '#2F2FBA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  fabGradient: {
    flex: 1,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    flex: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
