// ParentHome — orchestration only.
// Reads from useAuthStore, useParentStore, useDataStore, useNotificationStore.
// Loads: children, selected child, attendance summary, payments, medical record, grade average,
//        announcements, notifications. Writes: PDF export (assembles manual grades fresh before call).
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import useAuthStore from '../../stores/authStore';
import useParentStore from '../../stores/parentStore';
import useDataStore from '../../stores/dataStore';
import useNotificationStore from '../../stores/notificationStore';
import { useProfilePic } from '../../hooks/useProfilePic';
import { useTranslation } from 'react-i18next';

import FadeSlideIn from '../../components/animated/FadeSlideIn';
import NotificationPanel from '../../components/shared/NotificationPanel';
import HomeHero from '../../components/parent/home/HomeHero';
import ChildSelector from '../../components/parent/home/ChildSelector';
import CompactAttendanceCard from '../../components/parent/home/CompactAttendanceCard';
import GradeAverageCard from '../../components/parent/home/GradeAverageCard';
import FeesCard from '../../components/parent/home/FeesCard';
import MedicalTapCard from '../../components/parent/home/MedicalTapCard';
import Shortcuts from '../../components/parent/home/Shortcuts';
import HomeAnnouncements from '../../components/parent/home/HomeAnnouncements';
import CompareChildrenPanel from '../../components/parent/home/CompareChildrenPanel';
import EmptyState from '../../components/shared/EmptyState';

import { tokens } from '../../constants/designTokens';
import { api } from '../../services/api';
import { exportParentChildReportPDF } from '../../services/pdfExport';
import { haptics } from '../../utils/haptics';

export default function ParentHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userName, userId } = useAuthStore();
  const { avatarUrl, pickAndUploadAvatar } = useProfilePic(userId);
  const { unreadCount, loadNotifications } = useNotificationStore();
  const {
    announcements,
    loadAnnouncements,
    dismissedAnnouncementIds,
    loadDismissedAnnouncements,
    dismissAnnouncement,
  } = useDataStore();
  const {
    children, selectedChildId, childAttendance, childPayments, childMedical,
    childGradeAverage, childGradesCount, loadChildren, selectChild,
  } = useParentStore();

  const [refreshing, setRefreshing] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  /**
   * Builds the full child report PDF — attendance + grades + medical in one file.
   * Pulls grades fresh (store doesn't cache all categories) so the report reflects
   * the latest published state. Skipped gracefully if the parent has no selected child.
   */
  const handleExportReport = async () => {
    const child = children.find((c) => c.id === selectedChildId);
    if (!child) {
      Alert.alert(t('common.error'), t('parent.noLinkedStudents', { defaultValue: 'لا يوجد طالب مرتبط' }));
      return;
    }
    setExportingReport(true);
    try {
      // Grades across all categories — API already filters is_published=true server-side.
      const childInstituteId = child.instituteId || null;
      const rawGrades = childInstituteId
        ? await api.getStudentManualGrades(child.id, childInstituteId, userId || undefined)
        : [];
      const grades = (rawGrades as any[]).map((g: any) => ({
        subject: g.subject || 'غير محدد',
        categoryName: g.grade_categories?.name || 'فئة',
        score: Number(g.score) || 0,
        maxScore: Number(g.max_score) || 100,
        date: g.entered_at ? new Date(g.entered_at).toLocaleDateString('ar-IQ') : undefined,
      }));

      const c: any = child;
      await exportParentChildReportPDF({
        childName: c.name || c.full_name || 'طالب',
        instituteName: c.instituteName || undefined,
        className: c.className || undefined,
        parentName: userName || undefined,
        attendance: childAttendance.total > 0 ? childAttendance : undefined,
        medical: childMedical,
        grades: grades.length > 0 ? grades : undefined,
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل تصدير التقرير');
    } finally {
      setExportingReport(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadChildren(userId);
      loadAnnouncements('parent');
      loadDismissedAnnouncements(userId);
    }
    // Realtime notification subscription is handled globally in app/_layout.tsx
    // (PushNotificationHandler) — no need to duplicate it here.
  }, [userId]);

  const visibleAnnouncements = (announcements as any[]).filter(
    (a) => !dismissedAnnouncementIds.includes(a.id),
  );

  const handleDismissAnnouncement = useCallback((id: string) => {
    if (userId) dismissAnnouncement(userId, id);
  }, [userId, dismissAnnouncement]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userId) {
        await Promise.all([loadChildren(userId), loadAnnouncements('parent')]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  const handleSelectChild = useCallback(
    (id: string) => { selectChild(id, userId || undefined); },
    [selectChild, userId],
  );

  const handleBellPress = useCallback(() => {
    setShowNotifPanel(true);
    if (userId) loadNotifications(userId, 'parent');
  }, [userId, loadNotifications]);

  const goToGrades = useCallback(() => router.push('/(parent)/grades' as any), [router]);
  const goToMedical = useCallback(() => router.push('/(parent)/medical' as any), [router]);

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const totalPaid = childPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FadeSlideIn style={styles.flex}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tokens.color.p600}
            />
          }
        >
          <HomeHero
            userName={userName}
            avatarUrl={avatarUrl}
            onAvatarPress={pickAndUploadAvatar}
            unreadCount={unreadCount}
            onBellPress={handleBellPress}
            onExportPress={handleExportReport}
            exporting={exportingReport}
            exportDisabled={!selectedChildId}
          />

          <View style={styles.content}>
            <ChildSelector
              children={children.map((c) => ({ id: c.id, name: c.name }))}
              selectedChildId={selectedChildId}
              onSelect={handleSelectChild}
            />

            {children.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title={t('parent.noChildrenLinkedTitle', { defaultValue: 'لا يوجد أبناء مرتبطون' })}
                message={t('parent.noChildrenLinkedHint', { defaultValue: 'تواصل مع إدارة المعهد لربط حسابك بأبنائك' })}
              />
            ) : null}

            {selectedChild ? (
              <>
                <CompactAttendanceCard
                  childName={selectedChild.name}
                  attendance={childAttendance}
                />

                {childGradesCount > 0 ? (
                  <GradeAverageCard
                    average={childGradeAverage}
                    count={childGradesCount}
                    onPress={goToGrades}
                  />
                ) : null}

                <FeesCard totalPaid={totalPaid} paymentCount={childPayments.length} />

                <MedicalTapCard
                  bloodType={childMedical?.blood_type}
                  chronic={childMedical?.chronic_conditions}
                  onPress={goToMedical}
                />
              </>
            ) : null}

            {/* Side-by-side comparison — only renders for parents with 2+ children. */}
            <CompareChildrenPanel children={children as any} />

            <Shortcuts />
            <HomeAnnouncements
              announcements={visibleAnnouncements}
              onDismiss={handleDismissAnnouncement}
            />
            <View style={styles.bottomSpacer} />
          </View>
        </ScrollView>
      </FadeSlideIn>

      <NotificationPanel
        visible={showNotifPanel}
        onClose={() => setShowNotifPanel(false)}
        userId={userId}
        title={t('parent.notifications', { defaultValue: 'الإشعارات' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing[4], paddingTop: tokens.spacing[4] },
  bottomSpacer: { height: 30 },
});
