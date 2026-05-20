import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { performLogout } from '../../utils/logout';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useTeacherStore from '../../stores/teacherStore';
import { supabase } from '../../services/supabase';
import useNotificationStore from '../../stores/notificationStore';
import { api } from '../../services/api';
import { useProfilePic } from '../../hooks/useProfilePic';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import useFeatureFlagsStore from '../../stores/featureFlagsStore';
import NotificationPanel from '../../components/shared/NotificationPanel';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { tokens } from '../../constants/designTokens';
import AnnouncementCard from '../../components/teacher/cards/AnnouncementCard';

// Phase 2 — extracted home sections
import TeacherHero from '../../components/teacher/home/TeacherHero';
import TeacherStatsRow from '../../components/teacher/home/TeacherStatsRow';
import GoLiveCard from '../../components/teacher/home/GoLiveCard';
import TeacherShortcutsGrid from '../../components/teacher/home/TeacherShortcutsGrid';
import TodayScheduleCard from '../../components/teacher/home/TodayScheduleCard';
import WeeklyActivityCard from '../../components/teacher/home/WeeklyActivityCard';
import TargetsPicker from '../../components/teacher/home/TargetsPicker';
import LegacyClassSubjectSelectors from '../../components/teacher/home/LegacyClassSubjectSelectors';
import QuickActionsBlock from '../../components/teacher/home/QuickActionsBlock';
import NotificationSheet from '../../components/teacher/home/sheets/NotificationSheet';
import HallSheet from '../../components/teacher/home/sheets/HallSheet';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import TodayLessonsSheet, { type TodayLesson } from '../../components/teacher/home/sheets/TodayLessonsSheet';

// Notification category types - labels resolved at render time via t()
const NOTIF_CATEGORY_KEYS = [
  { key: 'exam', labelKey: 'teacherHome.catExam', icon: 'document-text' as const },
  { key: 'homework', labelKey: 'teacherHome.catHomework', icon: 'book' as const },
  { key: 'video', labelKey: 'teacherHome.catVideo', icon: 'videocam' as const },
  { key: 'general', labelKey: 'teacherHome.catGeneral', icon: 'megaphone' as const },
] as const;

export default function TeacherHome() {
  const router = useRouter();
  const { t } = useTranslation();
  const NOTIF_CATEGORIES = NOTIF_CATEGORY_KEYS.map(c => ({ ...c, label: t(c.labelKey) }));
  const NOTIF_CATEGORY_PREFIX: Record<string, string> = {
    exam: `[${t('teacherHome.catExam')}]`,
    homework: `[${t('teacherHome.catHomework')}]`,
    video: `[${t('teacherHome.catVideo')}]`,
    general: `[${t('teacherHome.catGeneral')}]`,
  };
  const { userName, userId, logout } = useAuthStore();
  const { avatarUrl, pickAndUploadAvatar } = useProfilePic(userId);
  const { announcements, loadAnnouncements, timetable, userInstituteId, dismissedAnnouncementIds, dismissAnnouncement, loadDismissedAnnouncements } = useDataStore();
  const { students, classes, selectedClass, selectedClassId, setSelectedClass, subjects, selectedSubject, setSelectedSubject, loadTeacherData, targets, selectedTargets, toggleSelectedTarget, clearSelectedTargets, selectAllTargets } = useTeacherStore();
  const { notifications, unreadCount, loadNotifications } = useNotificationStore();
  const isLiveEnabled = useFeatureFlag('live_streaming');
  const isAiTeacherEnabled = useFeatureFlag('ai_teacher_assistant');

  const [refreshing, setRefreshing] = useState(false);
  const [notifPanelVisible, setNotifPanelVisible] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [weeklyStats, setWeeklyStats] = useState<{ aiLessons: number; assignments: number; gradesEntered: number; voiceMessages: number; videos: number } | null>(null);

  // Weekly activity rollup — refreshed alongside the home's other data. Silent fail
  // so the widget just stays hidden if the query errors.
  useEffect(() => {
    if (!userId || !userInstituteId) return;
    api.getTeacherWeeklyActivity(userId, userInstituteId)
      .then(setWeeklyStats)
      .catch(() => setWeeklyStats(null));
  }, [userId, userInstituteId]);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [hallModalVisible, setHallModalVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [todayLessonsDetailed, setTodayLessonsDetailed] = useState<TodayLesson[]>([]);
  const [todayLessonsSheetVisible, setTodayLessonsSheetVisible] = useState(false);

  // Notification form state (Issue 3)
  const [notifCategory, setNotifCategory] = useState('general');
  const [notifClassId, setNotifClassId] = useState('all');
  const [notifText, setNotifText] = useState('');

  // Hall/Cafeteria order state (Issue 2)
  const [cafeteriaItems, setCafeteriaItems] = useState<any[]>([]);
  const [cafeteriaLoading, setCafeteriaLoading] = useState(false);
  const [orderCart, setOrderCart] = useState<Record<string, number>>({});
  const [orderLocation, setOrderLocation] = useState('');

  const todayIndex = new Date().getDay();
  // Teacher-scoped: only this teacher's lessons today (the institute-wide
  // timetable in dataStore was previously leaking other teachers' counts).
  const todayLessons = timetable.filter(
    (t: any) => t.day_of_week === todayIndex && t.teacher_id === userId,
  );

  // Load today's lessons + per-section attendance % for THIS teacher only.
  // Replaces the misleading institute-wide attendancePercentage that fed the
  // dashboard before. Reused in onRefresh + realtime handlers below.
  const loadTeacherTodayStats = useCallback(async () => {
    if (!userId || !userInstituteId) return;
    try {
      const stats = await api.getTeacherTodayStats(userId, userInstituteId);
      setTodayLessonsDetailed(stats.todayLessons);
      setAttendanceRate(stats.attendanceRate);
    } catch { /* keep last value */ }
  }, [userId, userInstituteId]);

  useEffect(() => {
    if (userId) {
      loadAnnouncements('teacher');
      loadTeacherData(userId, userInstituteId || '');
      loadNotifications(userId, 'teacher');
    }
    loadTeacherTodayStats();
  }, [userId, userInstituteId, loadTeacherTodayStats]);

  // Refresh feature flags whenever the home regains focus — covers the case
  // where a platform admin disables `live_streaming` (or any other gate) while
  // the teacher is mid-session, without requiring an app restart.
  useFocusEffect(
    useCallback(() => {
      useFeatureFlagsStore.getState().refresh();
    }, []),
  );

  // Realtime: lessons + attendance changes for this institute trigger a refresh
  // of the teacher's today stats. Server-side filter by institute_id keeps the
  // fanout per-tenant; the API method itself filters by teacher_id.
  useEffect(() => {
    if (!userId || !userInstituteId) return;
    const ch = supabase
      .channel(`teacher-today-${userId}-${userInstituteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timetables', filter: `institute_id=eq.${userInstituteId}` }, () => loadTeacherTodayStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `institute_id=eq.${userInstituteId}` }, () => loadTeacherTodayStats())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, userInstituteId, loadTeacherTodayStats]);

  // Live student count: re-fetch the teacher's students whenever a row in
  // student_classes or enrollments changes for this institute. The query runs
  // server-side (institute_id filter) so we don't fan out across tenants.
  useEffect(() => {
    if (!userId || !userInstituteId) return;
    const refresh = () => {
      useTeacherStore.getState().loadStudents(userId).catch(() => {});
    };
    const ch = supabase
      .channel(`teacher-students-${userId}-${userInstituteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_classes', filter: `institute_id=eq.${userInstituteId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments', filter: `institute_id=eq.${userInstituteId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await Promise.all([
        loadAnnouncements('teacher'),
        userId ? loadTeacherData(userId, userInstituteId || '') : Promise.resolve(),
        userId ? loadDismissedAnnouncements(userId) : Promise.resolve(),
        loadTeacherTodayStats(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [userId, userInstituteId]);

  const handleLogout = () => {
    setLogoutVisible(true);
  };

  // When selected class changes, only refresh class-scoped data (exams/galleries/students) instead of
  // reloading EVERYTHING (which was causing UI jank + overlapping requests on every chip tap)
  useEffect(() => {
    if (!userId || !selectedClassId) return;
    const store = useTeacherStore.getState();
    // loadGalleries reads selectedClassId from store internally — already scoped
    store.loadExams(userId).catch(() => {});
    store.loadGalleries(userId).catch(() => {});
    store.loadStudents(userId).catch(() => {});
  }, [selectedClassId, userId]);

  // Auto-select class if teacher has only one
  useEffect(() => {
    if (classes.length === 1 && notifClassId === 'all') {
      setNotifClassId(classes[0].id);
    }
    // Auto-select first class for data filtering if none selected
    if (classes.length === 1 && !selectedClass) {
      setSelectedClass(classes[0]);
    }
  }, [classes]);

  // When the notification sheet opens, refresh the teacher's classes list so
  // the recipient chips reflect the latest assignments (covers the case where
  // an admin assigned a new class while the teacher had the home screen mounted).
  useEffect(() => {
    if (notifModalVisible && userId && userInstituteId) {
      useTeacherStore.getState().loadClasses(userInstituteId, userId).catch(() => {});
    }
  }, [notifModalVisible, userId, userInstituteId]);

  // ── Issue 3: Send notification with category + class selector ──
  const handleSendNotification = async () => {
    if (!notifText.trim()) {
      Alert.alert(t('common.error'), t('teacherHome.enterNotifText'));
      return;
    }
    if (!userInstituteId) {
      Alert.alert(t('common.error'), 'تعذّر تحديد المعهد — أعد الدخول');
      return;
    }
    setSending(true);
    try {
      const prefix = NOTIF_CATEGORY_PREFIX[notifCategory] || '';
      // Target resolution priority:
      // 1. Multi-target (selectedTargets from home picker) — deliver only to those classes/sections
      // 2. Legacy single picker (notifClassId)
      // 3. "all" fallback → broadcast to all teacher's students via announcement
      const targetClassIds = selectedTargets.map(t => t.classId).filter(Boolean) as string[];
      const targetSectionIds = selectedTargets.map(t => t.sectionId).filter(Boolean) as string[];
      const useMultiTarget = targetClassIds.length > 0 || targetSectionIds.length > 0;

      let scopeLabel = '';
      if (useMultiTarget) {
        scopeLabel = ` — ${selectedTargets.length === targets.length ? t('teacher.allStudents') : `${selectedTargets.length} شعبة`}`;
      } else if (notifClassId !== 'all') {
        scopeLabel = ` — ${classes.find((c: any) => c.id === notifClassId)?.name || ''}`;
      }
      const title = `${prefix} ${t('teacherHome.notifFromTeacher')}${scopeLabel}`;
      const content = notifText.trim();

      if (useMultiTarget && userId) {
        await api.notifyStudentsInClasses({
          classIds: targetClassIds.length ? targetClassIds : undefined,
          sectionIds: targetSectionIds.length ? targetSectionIds : undefined,
          title,
          message: content,
          type: notifCategory,
          senderId: userId,
          senderRole: 'teacher',
          instituteId: userInstituteId,
        });
      } else if (notifClassId !== 'all' && userId) {
        await api.notifyStudentsInClasses({
          classIds: [notifClassId],
          title,
          message: content,
          type: notifCategory,
          senderId: userId,
          senderRole: 'teacher',
          instituteId: userInstituteId,
        });
      } else {
        // "all" → broadcast announcement to every student in the teacher's assigned
        // classes/sections. Recipient resolution is delegated to the
        // `resolve_broadcast_recipients` RPC, which honours the institute type
        // (schools match (class_id, section_id) tuples; institutes match by
        // class_id only). This fixes a cross-section leak where school teachers
        // were reaching every section of the same class.
        if (!userId) {
          throw new Error('missing user');
        }
        await api.createAnnouncement(title, content, 'student', userInstituteId);
        const result = await api.broadcastToTeacherStudents({
          teacherId: userId,
          title,
          message: content,
          type: notifCategory,
          senderRole: 'teacher',
          instituteId: userInstituteId,
        });
        if (result.sent === 0) {
          Alert.alert(t('common.error'), 'لا يوجد طلاب مرتبطون بك');
          setSending(false);
          return;
        }
      }

      Alert.alert(t('common.success'), t('teacherHome.notifSent'));
      setNotifText('');
      setNotifCategory('general');
      setNotifClassId(classes.length === 1 ? classes[0].id : 'all');
      setNotifModalVisible(false);
    } catch {
      Alert.alert(t('common.error'), t('teacherHome.notifFailed'));
    } finally {
      setSending(false);
    }
  };

  // Teacher's recent cafeteria orders — shown in the hall modal so they can see
  // status (new/preparing/ready/delivered) after placing an order.
  const [myOrders, setMyOrders] = useState<any[]>([]);

  // ── Issue 2: Load cafeteria items when hall modal opens ──
  const openHallModal = async () => {
    setHallModalVisible(true);
    setOrderCart({});
    setOrderLocation('');
    setCafeteriaLoading(true);
    try {
      const [items, orders] = await Promise.all([
        api.getCafeteriaItems(userInstituteId || ''),
        userId && userInstituteId ? api.getMyCafeteriaOrders(userId, userInstituteId, 5) : Promise.resolve([]),
      ]);
      setCafeteriaItems(items || []);
      setMyOrders(orders || []);
    } catch {
      setCafeteriaItems([]);
      setMyOrders([]);
    } finally {
      setCafeteriaLoading(false);
    }
  };

  const refreshMyOrders = async () => {
    if (!userId || !userInstituteId) return;
    try {
      const orders = await api.getMyCafeteriaOrders(userId, userInstituteId, 5);
      setMyOrders(orders || []);
    } catch {}
  };

  const updateCartQuantity = (itemId: string, delta: number) => {
    setOrderCart((prev) => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const getCartTotal = () => {
    return Object.entries(orderCart).reduce((sum, [itemId, qty]) => {
      const item = cafeteriaItems.find((i: any) => i.id === itemId);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  };

  const getCartItemCount = () => {
    return Object.values(orderCart).reduce((sum, qty) => sum + qty, 0);
  };

  const handleHallRequest = async () => {
    if (getCartItemCount() === 0) {
      Alert.alert(t('common.error'), t('teacherHome.selectProduct'));
      return;
    }
    if (!orderLocation.trim()) {
      Alert.alert(t('common.error'), t('teacherHome.enterLocation'));
      return;
    }
    if (!userInstituteId) {
      Alert.alert(t('common.error'), 'تعذّر تحديد المعهد — أعد الدخول');
      return;
    }
    setSending(true);
    try {
      const items = Object.entries(orderCart)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => {
          const item = cafeteriaItems.find((i: any) => i.id === itemId);
          return {
            item_id: itemId,
            item_name: item?.name || '',
            quantity: qty,
            price: item?.price || 0,
          };
        });

      await api.createCafeteriaOrder({
        institute_id: userInstituteId,
        ordered_by: userId || '',
        ordered_by_role: 'teacher',
        items,
        location: orderLocation.trim(),
        total_price: getCartTotal(),
      });

      // Notify cafeteria staff — teacher→staff path requires instituteId + senderId
      // so the gate in sendPushToRole accepts the call (teacher scope).
      const itemsSummary = items.map((i) => `${i.item_name} x${i.quantity}`).join(', ');
      try {
        await api.sendPushToRole(
          t('teacherHome.newOrderFromTeacher'),
          `${itemsSummary} — ${t('teacherHome.hall')}: ${orderLocation.trim()}`,
          'cafeteria',
          undefined,
          userInstituteId,
          userId || undefined,
          'teacher'
        );
      } catch (pushErr: any) {
        console.error('cafeteria notify failed:', pushErr);
        Alert.alert(t('common.error'), t('teacherHome.notifFailed'));
      }

      Alert.alert(t('common.success'), t('teacherHome.orderSent'));
      setOrderCart({});
      setOrderLocation('');
      // Don't close — refresh the status list so teacher sees their order appear in the tracker.
      await refreshMyOrders();
    } catch {
      Alert.alert(t('common.error'), t('teacherHome.orderFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleDismissAnnouncement = async (announcementId: string) => {
    if (!userId) return;
    try {
      await dismissAnnouncement(userId, announcementId);
    } catch {
      Alert.alert(t('common.error'), t('common.tryAgain'));
    }
  };

  const renderAnnouncementItem = ({ item }: { item: any }) => (
    <AnnouncementCard
      title={item.title}
      body={item.content}
      date={new Date(item.created_at).toLocaleDateString('ar-IQ')}
      tone="brand"
      onDismiss={() => handleDismissAnnouncement(item.id)}
    />
  );

  const visibleAnnouncements = useMemo(
    () => announcements.filter(a => !dismissedAnnouncementIds.includes(a.id)),
    [announcements, dismissedAnnouncementIds],
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FadeSlideIn style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <TeacherHero
          userName={userName}
          avatarUrl={avatarUrl}
          unreadCount={unreadCount}
          selectedClassName={selectedClass?.name}
          onLogout={handleLogout}
          onOpenNotifications={() => setNotifPanelVisible(true)}
          onPickAvatar={pickAndUploadAvatar}
        />

        <View style={styles.content}>
          {/* Stats Cards */}
          <TeacherStatsRow
            todayLessonsCount={todayLessonsDetailed.length || todayLessons.length}
            attendanceRate={attendanceRate}
            studentsCount={students.length}
            onTodayLessonsPress={() => {
              haptics.light();
              setTodayLessonsSheetVisible(true);
            }}
            onStudentsPress={() => {
              haptics.light();
              router.push('/(teacher)/students' as any);
            }}
          />

          {/* Go Live CTA — hidden entirely when the institute's live_streaming flag is off */}
          {isLiveEnabled && (
            <GoLiveCard onPress={() => router.push('/(teacher)/live' as any)} />
          )}

          {/* Shortcuts grid — preview-style 4 cards, existing routes only */}
          <TeacherShortcutsGrid
            isAiTeacherEnabled={isAiTeacherEnabled}
            onUploadPress={() => router.push('/(teacher)/assignments' as any)}
            onAiPress={() => router.push('/(teacher)/ai-lessons' as any)}
            onExamPress={() => router.push('/(teacher)/exams' as any)}
          />

          {/* Today's schedule — timeline style (جدول اليوم) */}
          <TodayScheduleCard todayLessons={todayLessons} classes={classes} />

          {/* Weekly activity card — motivates the teacher + shows visible impact of their work */}
          <WeeklyActivityCard weeklyStats={weeklyStats} />

          {/* Multi-target picker — one place to pick sections; applies to uploads + content filters globally */}
          <TargetsPicker
            targets={targets}
            selectedTargets={selectedTargets}
            onSelectAll={selectAllTargets}
            onClear={clearSelectedTargets}
            onToggle={toggleSelectedTarget}
          />

          {/* Legacy class selector + Subject selector */}
          <LegacyClassSubjectSelectors
            targetsLength={targets.length}
            classes={classes}
            selectedClass={selectedClass}
            onSelectClass={setSelectedClass}
            subjects={subjects}
            selectedSubject={selectedSubject}
            onSelectSubject={setSelectedSubject}
          />

          {/* Quick Actions + My Students + Class Chat buttons */}
          <QuickActionsBlock
            onSendNotificationPress={() => setNotifModalVisible(true)}
            onHallPress={openHallModal}
            onStudentsPress={() => router.push('/(teacher)/students')}
            onChatListPress={() => router.push('/(teacher)/class-chat')}
          />

          {/* Announcements */}
          <Text style={styles.sectionTitle}>{t('teacherHome.adminAnnouncements')}</Text>
          {visibleAnnouncements.length === 0 ? (
            <Text style={styles.emptyText}>{t('teacherHome.noAnnouncements')}</Text>
          ) : (
            <FlashList
              data={visibleAnnouncements.slice(0, 10)}
              keyExtractor={(item) => item.id}
              renderItem={renderAnnouncementItem}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10 }}
            />
          )}

          <View style={{ height: 30 }} />
        </View>
      </ScrollView>
      </FadeSlideIn>

      {/* ══════════════════════════════════════════════════════════════
          Issue 3: Notification Modal — Category chips + class selector
         ══════════════════════════════════════════════════════════════ */}
      <NotificationSheet
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        categories={NOTIF_CATEGORIES}
        classes={classes}
        notifCategory={notifCategory}
        notifClassId={notifClassId}
        notifText={notifText}
        sending={sending}
        onChangeCategory={setNotifCategory}
        onChangeClassId={setNotifClassId}
        onChangeText={setNotifText}
        onSend={handleSendNotification}
      />

      {/* ══════════════════════════════════════════════════════════════
          Issue 2: Hall Request Modal — Product order from cafeteria
         ══════════════════════════════════════════════════════════════ */}
      <HallSheet
        visible={hallModalVisible}
        onClose={() => setHallModalVisible(false)}
        myOrders={myOrders}
        cafeteriaItems={cafeteriaItems}
        cafeteriaLoading={cafeteriaLoading}
        orderCart={orderCart}
        orderLocation={orderLocation}
        sending={sending}
        cartItemCount={getCartItemCount()}
        cartTotal={getCartTotal()}
        onRefreshMyOrders={refreshMyOrders}
        onUpdateCartQuantity={updateCartQuantity}
        onChangeLocation={setOrderLocation}
        onSubmit={handleHallRequest}
      />

      <NotificationPanel
        visible={notifPanelVisible}
        onClose={() => setNotifPanelVisible(false)}
        userId={userId}
        title={t('common.notifications')}
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

      <TodayLessonsSheet
        visible={todayLessonsSheetVisible}
        onClose={() => setTodayLessonsSheetVisible(false)}
        lessons={todayLessonsDetailed}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  emptyText: {
    fontSize: 13,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
