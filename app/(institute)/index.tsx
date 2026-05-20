import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { tokens } from '../../constants/theme';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useNotificationStore from '../../stores/notificationStore';
import GlobalSearchButton from '../../components/shared/GlobalSearchButton';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useProfilePic } from '../../hooks/useProfilePic';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import InstituteLogo from '../../components/shared/InstituteLogo';
import { confirmAlert } from '../../utils/alerts';
import { performLogout } from '../../utils/logout';
import { useTranslation } from 'react-i18next';
import NotificationPanel from '../../components/shared/NotificationPanel';
import BroadcastHub from '../../components/shared/BroadcastHub';
import { haptics } from '../../utils/haptics';

import InstituteHero from '../../components/institute/InstituteHero';
import SectionLabel from '../../components/institute/SectionLabel';
import { type AnnTone } from '../../components/institute/AnnouncementCard';

// Phase 2 — extracted home sections
import QuickActionsGrid from '../../components/institute/home/QuickActionsGrid';
import QRLivePanel from '../../components/institute/home/QRLivePanel';
import AnnouncementsList from '../../components/institute/home/AnnouncementsList';
import InstituteLoadingGate from '../../components/institute/home/InstituteLoadingGate';
// Phase 3 — at-a-glance status sections (subscription / alerts / KPIs)
import SubscriptionBanner from '../../components/institute/home/SubscriptionBanner';
import AlertsPanel from '../../components/institute/home/AlertsPanel';
import DashboardKPIs from '../../components/institute/home/DashboardKPIs';
import { useInstituteDashboardStats } from '../../hooks/useInstituteDashboardStats';
import OnboardingWizard from '../../components/institute/onboarding/OnboardingWizard';
import useOnboardingGate from '../../hooks/useOnboardingGate';
import ClassesSheet from '../../components/institute/home/sheets/ClassesSheet';
import SubjectsManagerSheet from '../../components/institute/home/sheets/SubjectsManagerSheet';
import AcademicYearSheet from '../../components/institute/home/sheets/AcademicYearSheet';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';

export default function InstituteHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userName, userId } = useAuthStore();
  useProfilePic(userId);
  const { announcements, loadAnnouncements, userInstituteId, currentAcademicYear, loadCurrentAcademicYear, isFetching, detectInstitute, dismissedAnnouncementIds, loadDismissedAnnouncements, institutes } = useDataStore();
  const { unreadCount, loadNotifications } = useNotificationStore();

  const isQREnabled = useFeatureFlag('attendance_qr');

  const [refreshing, setRefreshing] = useState(false);

  // QR Attendance (v2 — enhanced with server-side sessions)
  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [qrRemainingSec, setQrRemainingSec] = useState(0);
  const qrRefreshTimerRef = React.useRef<any>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const qrPulse = useState(new Animated.Value(1))[0];

  // Unified broadcast hub (announcement / notification / chat)
  const [showBroadcastHub, setShowBroadcastHub] = useState(false);

  // Notifications panel
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Subjects manager sheet — count drives the home-card subtitle, recomputed
  // when the sheet closes so add/delete changes show without a manual refresh.
  const [showSubjectsSheet, setShowSubjectsSheet] = useState(false);
  const [subjectsCount, setSubjectsCount] = useState<number | null>(null);

  // Classes modal
  const [showClassesModal, setShowClassesModal] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [addingClass, setAddingClass] = useState(false);
  const [selectedStage, setSelectedStage] = useState('primary');
  const [sectionLang, setSectionLang] = useState<'ar' | 'en'>('ar');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  // Feature 6: Delete announcement
  const [deletingAnnId, setDeletingAnnId] = useState<string | null>(null);

  // Feature 7: Daily attendance log
  const [attendanceLog, setAttendanceLog] = useState<any[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  // Academic Year
  const [showYearModal, setShowYearModal] = useState(false);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [newYearName, setNewYearName] = useState('');
  const [newYearStart, setNewYearStart] = useState('');
  const [newYearEnd, setNewYearEnd] = useState('');
  const [creatingYear, setCreatingYear] = useState(false);

  // Phase 3A — single shared dashboard fetch. One RPC call powers both the KPI
  // grid (DashboardKPIs) and the QuickActionsGrid's totalUsers subtitle, so the
  // admin pays for one round-trip on cold start instead of two.
  const { stats: dashboard, refresh: refreshDashboard } = useInstituteDashboardStats(userInstituteId);
  const totalStudents = dashboard?.total_students ?? 0;
  const totalTeachers = dashboard?.total_teachers ?? 0;

  // First-run onboarding wizard for fresh institutes. The gate hook runs two
  // cheap head:count queries + an AsyncStorage flag check, then yields true
  // only when the institute has no classes and no real members. Already-set-up
  // institutes never see this.
  const onboarding = useOnboardingGate();

  const loadAttendanceLog = useCallback(async () => {
    if (!userInstituteId) return;
    setLoadingAttendance(true);
    try {
      const log = await api.getTodayAttendanceLog(userInstituteId);
      setAttendanceLog(log);
      setScannedCount(log.length);
    } catch (err) { console.error(err); } finally {
      setLoadingAttendance(false);
    }
  }, [userInstituteId]);

  useEffect(() => {
    loadAnnouncements('institute');
    if (userId) {
      loadNotifications(userId, 'institute');
      // Pull this user's announcement dismissals so the trash-icon hide
      // is honoured on the institute admin's home (per-user dismissal,
      // same model as student / parent).
      loadDismissedAnnouncements(userId);
    }
    if (userInstituteId) {
      api.getClassesByInstitute(userInstituteId).then(setClasses).catch(() => {});
      // Load subject count so the "المواد الدراسية" quick action card shows
      // a meaningful subtitle (e.g. "12 مادة مسجّلة") before the admin opens it.
      supabase
        .from('subjects')
        .select('id', { count: 'exact', head: true })
        .eq('institute_id', userInstituteId)
        .then(({ count }) => setSubjectsCount(count ?? 0));
    }
  }, [userInstituteId, userId, loadDismissedAnnouncements]);

  useEffect(() => {
    if (qrOpen) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(qrPulse, { toValue: 1.05, duration: 800, useNativeDriver: true }),
          Animated.timing(qrPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      loadAttendanceLog();
      return () => pulse.stop();
    }
  }, [qrOpen]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await Promise.all([
        loadAnnouncements('institute'),
        refreshDashboard(),
        qrOpen ? loadAttendanceLog() : Promise.resolve(),
      ]);
    } finally { setRefreshing(false); }
  }, [userInstituteId, qrOpen, refreshDashboard]);

  // Regenerate the QR session every 60s so the token rotates — prevents screenshot/share replay
  const refreshQR = async () => {
    try {
      const session = await api.generateQRSession(userInstituteId || '', userId || '', 2);
      setQrToken(session.qr_token);
      setQrRemainingSec(2 * 60);
    } catch {}
  };

  const startQRSession = async () => {
    try {
      const session = await api.generateQRSession(userInstituteId || '', userId || '', 2);
      setQrToken(session.qr_token);
      setQrRemainingSec(2 * 60);
      setScannedCount(0);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل فتح جلسة الحضور');
      return;
    }
    if (qrRefreshTimerRef.current) clearInterval(qrRefreshTimerRef.current);
    qrRefreshTimerRef.current = setInterval(() => {
      setQrRemainingSec(prev => {
        if (prev <= 1) {
          refreshQR();
          return 2 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    setQrOpen(true);
  };

  const toggleQR = async () => {
    if (!qrOpen) {
      confirmAlert(
        'بدء جلسة حضور QR',
        'سيتم فتح جلسة حضور مباشرة — كل طالب يفحص الـ QR راح يُسجَّل حاضر. تأكّد أنك جاهز قبل البدء.',
        startQRSession,
      );
    } else {
      confirmAlert(
        'إنهاء جلسة الحضور',
        'سيتم إيقاف الجلسة فوراً — الطلاب اللي ما فحصوا بعد ما راح يتسجّلون. متأكد؟',
        async () => {
          if (qrRefreshTimerRef.current) { clearInterval(qrRefreshTimerRef.current); qrRefreshTimerRef.current = null; }
          try {
            if (userInstituteId) await api.endQRSession(userInstituteId);
          } catch (err: any) {
            console.warn('[QR] endQRSession failed:', err?.message);
          }
          setQrOpen(false);
          setQrToken('');
          setScannedCount(0);
        },
      );
    }
  };

  // Cleanup QR timer on unmount
  React.useEffect(() => {
    return () => { if (qrRefreshTimerRef.current) clearInterval(qrRefreshTimerRef.current); };
  }, []);

  // On mount / when institute resolves, restore any QR session that is still
  // active on the server. Without this, if the admin backgrounds the app or
  // navigates away, the UI closes but the server session stays alive — students
  // could still scan into an "invisible" session and the admin couldn't end it.
  React.useEffect(() => {
    if (!userInstituteId || !isQREnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await api.getCurrentQRSession(userInstituteId);
        if (cancelled || !session?.qr_token) return;
        const remainingMs = new Date(session.expires_at).getTime() - Date.now();
        if (remainingMs <= 0) return;
        setQrToken(session.qr_token);
        setQrRemainingSec(Math.floor(remainingMs / 1000));
        setQrOpen(true);
        if (qrRefreshTimerRef.current) clearInterval(qrRefreshTimerRef.current);
        qrRefreshTimerRef.current = setInterval(() => {
          setQrRemainingSec(prev => {
            if (prev <= 1) { refreshQR(); return 2 * 60; }
            return prev - 1;
          });
        }, 1000);
      } catch { /* no active session — nothing to restore */ }
    })();
    return () => { cancelled = true; };
  }, [userInstituteId, isQREnabled]);

  const [logoutVisible, setLogoutVisible] = useState(false);

  const handleLogout = () => {
    haptics.warning();
    setLogoutVisible(true);
  };

  // Feature 6: Delete-or-dismiss announcement.
  //   • If the current user CREATED this announcement → global delete (gone
  //     for every recipient too).
  //   • Otherwise → per-user dismissal (hides for me only; others still see).
  // Determination uses the row's `created_by` column. Legacy rows without
  // created_by are dismissed-only by everyone (safer fallback).
  const handleDeleteAnnouncement = async (announcementId: string, _title: string) => {
    if (deletingAnnId) return;
    setDeletingAnnId(announcementId);
    try {
      const row = announcements.find((a: any) => a.id === announcementId) as any;
      const isCreator = !!row?.created_by && row.created_by === userId;
      if (isCreator) {
        await api.deleteAnnouncement(announcementId, userInstituteId || undefined);
        loadAnnouncements('institute');
      } else if (userId) {
        // Per-user dismissal — same path as student / parent.
        await useDataStore.getState().dismissAnnouncement(userId, announcementId);
      }
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل حذف التبليغ');
    } finally {
      setDeletingAnnId(null);
    }
  };

  // ── Academic Year Handlers ──
  const loadAcademicYears = async () => {
    if (!userInstituteId) return;
    const data = await api.getAcademicYears(userInstituteId);
    setAcademicYears(data);
  };

  const handleCreateYear = async () => {
    if (!newYearName.trim() || !newYearStart.trim() || !newYearEnd.trim()) {
      Alert.alert('خطأ', 'يرجى ملء جميع الحقول');
      return;
    }
    setCreatingYear(true);
    try {
      await api.createAcademicYear(userInstituteId || '', newYearName.trim(), newYearStart.trim(), newYearEnd.trim(), true);
      setNewYearName(''); setNewYearStart(''); setNewYearEnd('');
      await loadAcademicYears();
      if (userInstituteId) await loadCurrentAcademicYear(userInstituteId);
      Alert.alert('تم', 'تم إنشاء السنة الدراسية');
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل الإنشاء');
    } finally {
      setCreatingYear(false);
    }
  };

  const handleSetCurrentYear = async (yearId: string) => {
    await api.setCurrentAcademicYear(yearId, userInstituteId || '');
    await loadAcademicYears();
    if (userInstituteId) await loadCurrentAcademicYear(userInstituteId);
  };

  // ── Classes handlers ──
  const handleToggleClassSelection = (fullName: string) => {
    setSelectedClasses(prev =>
      prev.includes(fullName) ? prev.filter(n => n !== fullName) : [...prev, fullName]
    );
  };

  const handleSaveSelectedClasses = async () => {
    if (selectedClasses.length === 0) { Alert.alert('تنبيه', 'اختر صفوف أولاً'); return; }
    setAddingClass(true);
    let added = 0;
    try {
      for (const name of selectedClasses) {
        if (!classes.some(c => c.name === name)) {
          const cls = await api.createClass(name, userInstituteId || '');
          setClasses(prev => [cls, ...prev]);
          added++;
        }
      }
      setSelectedClasses([]);
      Alert.alert('تم', `تم إضافة ${added} صف بنجاح`);
    } catch (err: any) { Alert.alert('خطأ', err.message); } finally {
      setAddingClass(false);
    }
  };

  const handleDeleteClass = (id: string, name: string) => {
    confirmAlert('حذف الصف', `هل تريد حذف "${name}"؟`, async () => {
      try {
        await api.deleteClass(id);
        setClasses(prev => prev.filter(c => c.id !== id));
        Alert.alert('تم', 'تم حذف الصف بنجاح');
      } catch (err: any) {
        if (__DEV__) console.error(err);
        Alert.alert('خطأ', err?.message || 'فشل حذف الصف');
      }
    }, true);
  };

  const handleAddCustomClass = async () => {
    if (!newClassName.trim() || !userInstituteId) return;
    setAddingClass(true);
    try {
      const added = await api.createClass(newClassName.trim(), userInstituteId);
      setClasses(prev => [added, ...prev]);
      setNewClassName('');
    } catch (err: any) { Alert.alert('خطأ', err.message); } finally { setAddingClass(false); }
  };

  // Map announcement target_role → AnnouncementCard tone + chip label
  const mapAnnouncement = (role: string): { tone: AnnTone; chip: string } => {
    const map: Record<string, { tone: AnnTone; chip: string }> = {
      all:     { tone: 'brand',   chip: 'الجميع' },
      teacher: { tone: 'warning', chip: 'الأساتذة' },
      student: { tone: 'success', chip: 'الطلاب' },
      parent:  { tone: 'brand',   chip: 'أولياء الأمور' },
    };
    return map[role] || { tone: 'brand', chip: role };
  };

  // Retry detect if not found yet
  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) {
      detectInstitute(userId);
    }
  }, [userInstituteId, userId, isFetching]);

  if (!userInstituteId) {
    // After performLogout(), userId is wiped synchronously while the awaited
    // cleanup (3+ seconds) sets userInstituteId to null. Without this guard,
    // the user sees "جاري تحميل بيانات المؤسسة" stuck on screen until
    // AuthGuard's router.replace('/') finally takes effect.
    if (!userId) return null;
    return <InstituteLoadingGate userId={userId} onDetect={detectInstitute} onLogout={performLogout} />;
  }

  // Hero actions: logout + notifications (with badge) + global search.
  // Note: GlobalSearchButton renders its own icon. To keep the hero layout uniform,
  // we route search via the hero's built-in action and launch global search on press.
  const heroActions = [
    {
      icon: 'log-out-outline' as const,
      onPress: handleLogout,
      accessibilityLabel: t('common.logout'),
    },
    {
      icon: 'notifications-outline' as const,
      onPress: () => setShowNotifPanel(true),
      badge: unreadCount,
      accessibilityLabel: t('common.notifications'),
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />}
      >
        <InstituteHero
          greeting={t('institute.adminDashboard')}
          name={userName || t('institute.defaultName')}
          platformLabel="منصة كاي"
          logoImage={<InstituteLogo size={44} editable={true} />}
          actions={heroActions}
        />

        {/* Global search sits just below the hero so it's reachable without cluttering the hero bar */}
        <View style={styles.searchRow}>
          <GlobalSearchButton style={styles.searchPill} color={tokens.text[2]} size={18} />
        </View>

        <View style={styles.content}>
          <SectionLabel title="لوحة التحكم" icon="stats-chart" />

          {/* Phase 3A — unified dashboard cluster.
              Order is intentional: blocking issues (expiring subscription) →
              actionable warnings (alerts) → at-a-glance metrics (KPIs). Each
              renders NULL when there's nothing to show so a healthy institute
              sees a clean home. DashboardKPIs gets stats from the shared hook
              (one RPC for the whole screen) and supports drill-down on tap. */}
          {userInstituteId && (
            <>
              <SubscriptionBanner instituteId={userInstituteId} />
              <AlertsPanel instituteId={userInstituteId} />
              <DashboardKPIs
                instituteId={userInstituteId}
                stats={dashboard}
                onKpiPress={{
                  students: () => router.push('/(institute)/users?role=student' as any),
                  teachers: () => router.push('/(institute)/users?role=teacher' as any),
                  classes: () => setShowClassesModal(true),
                  attendance: () => router.push('/(institute)/attendance' as any),
                  absent: () => router.push('/(institute)/attendance' as any),
                  exams: () => router.push('/(institute)/exam-schedule' as any),
                  leaves: () => router.push('/(institute)/leave-requests' as any),
                  revenue: () => router.push('/(institute)/finance' as any),
                }}
              />
            </>
          )}

          <View style={{ height: 6 }} />
          <SectionLabel title="إجراءات سريعة" icon="flash" />

          <QuickActionsGrid
            isQREnabled={isQREnabled}
            qrOpen={qrOpen}
            scannedCount={scannedCount}
            totalUsers={totalStudents + totalTeachers}
            subjectsCount={subjectsCount ?? undefined}
            currentYearName={currentAcademicYear?.name}
            onBroadcastPress={() => setShowBroadcastHub(true)}
            onQRTogglePress={toggleQR}
            onClassesPress={() => setShowClassesModal(true)}
            onUsersPress={() => router.push('/(institute)/users' as any)}
            onYearPress={() => { loadAcademicYears(); setShowYearModal(true); }}
            onSubjectsPress={() => { haptics.medium(); setShowSubjectsSheet(true); }}
          />

          {/* Live QR session panel — appears only when a session is running */}
          {qrOpen && (
            <QRLivePanel
              qrToken={qrToken}
              qrRemainingSec={qrRemainingSec}
              qrPulse={qrPulse}
              scannedCount={scannedCount}
              attendanceLog={attendanceLog}
              loadingAttendance={loadingAttendance}
              onRefreshLog={loadAttendanceLog}
            />
          )}

          <View style={{ height: 10 }} />
          <SectionLabel
            title="آخر الإعلانات"
            icon="newspaper"
            moreLabel="الكل"
            onMorePress={() => router.push('/(institute)/ads' as any)}
          />

          <AnnouncementsList
            announcements={announcements.filter((a: any) => !dismissedAnnouncementIds.includes(a.id))}
            deletingAnnId={deletingAnnId}
            mapAnnouncement={mapAnnouncement}
            onLongPressAnnouncement={handleDeleteAnnouncement}
          />

          <View style={{ height: 30 }} />
        </View>
      </ScrollView>

      <NotificationPanel
        visible={showNotifPanel}
        onClose={() => setShowNotifPanel(false)}
        userId={userId}
        title={t('common.notifications')}
      />

      <BroadcastHub
        visible={showBroadcastHub}
        onClose={() => setShowBroadcastHub(false)}
      />

      <SubjectsManagerSheet
        visible={showSubjectsSheet}
        onClose={() => {
          setShowSubjectsSheet(false);
          // refresh count so the home-card subtitle stays in sync after edits
          if (userInstituteId) {
            supabase
              .from('subjects')
              .select('id', { count: 'exact', head: true })
              .eq('institute_id', userInstituteId)
              .then(({ count }) => setSubjectsCount(count ?? 0));
          }
        }}
        instituteId={userInstituteId || ''}
        instituteType={(institutes.find((i: any) => i.id === userInstituteId) as any)?.type === 'school' ? 'school' : 'institute'}
      />

      <ClassesSheet
        visible={showClassesModal}
        onClose={() => setShowClassesModal(false)}
        classes={classes}
        selectedStage={selectedStage}
        sectionLang={sectionLang}
        selectedClasses={selectedClasses}
        newClassName={newClassName}
        addingClass={addingClass}
        onSelectStage={setSelectedStage}
        onSetSectionLang={setSectionLang}
        onToggleSelection={handleToggleClassSelection}
        onSaveSelected={handleSaveSelectedClasses}
        onDeleteClass={handleDeleteClass}
        onChangeNewClassName={setNewClassName}
        onAddCustomClass={handleAddCustomClass}
      />

      <AcademicYearSheet
        visible={showYearModal}
        onClose={() => setShowYearModal(false)}
        academicYears={academicYears}
        newYearName={newYearName}
        newYearStart={newYearStart}
        newYearEnd={newYearEnd}
        creatingYear={creatingYear}
        onChangeName={setNewYearName}
        onChangeStart={setNewYearStart}
        onChangeEnd={setNewYearEnd}
        onSetCurrent={handleSetCurrentYear}
        onCreate={handleCreateYear}
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

      {/* First-run setup wizard — only rendered when the gate says this is a
          fresh institute that hasn't been onboarded on this device yet. Closing
          the wizard persists the dismissal flag so it won't show again. */}
      {onboarding.shouldShow && !onboarding.loading && (
        <OnboardingWizard
          visible={onboarding.shouldShow}
          onClose={onboarding.dismiss}
          instituteId={userInstituteId || undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.surface.bg,
  },
  searchRow: {
    paddingHorizontal: 16,
    marginTop: -14,
    marginBottom: 4,
    alignItems: 'flex-end',
  },
  searchPill: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[2],
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.shadow.xs,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
});
