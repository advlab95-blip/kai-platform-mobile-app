// StudentHome — orchestration only.
// Reads from useAuthStore, useStudentStore, useDataStore, useNotificationStore.
// Loads: announcements (student), student data (tasks/exams/videos/aiLessons/classes/subjects),
//        notifications (lazy on bell), home subjects (with ids), ads (dismissed-filtered),
//        teachers, voice unread count.
// Writes: attendance via QR scan (institutes only), task submissions with file attachments,
//         parent alerts on attendance success, profile picture upload.
// Visual layout, selectors, shortcuts, attendance CTA, quick-access, tasks list and
// announcements feed are extracted into components/student/home/*.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useStudentStore from '../../stores/studentStore';
import useNotificationStore from '../../stores/notificationStore';
import { api } from '../../services/api';
import { useProfilePic } from '../../hooks/useProfilePic';
import { bunnyStorage } from '../../services/bunny';
import { compressImage } from '../../utils/imageCompress';
import { performLogout } from '../../utils/logout';
import { haptics } from '../../utils/haptics';
import type { AdminAd } from '../../types';

import AdBanner, { loadDismissedAdIds } from '../../components/shared/AdBanner';
import NotificationPanel from '../../components/shared/NotificationPanel';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import FadeSlideIn from '../../components/animated/FadeSlideIn';

import HomeHero from '../../components/student/home/HomeHero';
import ClassSelector from '../../components/student/home/ClassSelector';
import SubjectsGrid from '../../components/student/home/SubjectsGrid';
import Shortcuts from '../../components/student/home/Shortcuts';
import AttendanceCTA from '../../components/student/home/AttendanceCTA';
import QuickAccess from '../../components/student/home/QuickAccess';
import PendingTasks from '../../components/student/home/PendingTasks';
import HomeAnnouncements from '../../components/student/home/HomeAnnouncements';
import TaskSubmitSheet from '../../components/student/home/sheets/TaskSubmitSheet';
import QRScannerModal from '../../components/student/home/sheets/QRScannerModal';

export default function StudentHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userName, userId } = useAuthStore();
  const { avatarUrl, pickAndUploadAvatar } = useProfilePic(userId);
  const {
    announcements,
    loadAnnouncements,
    userInstituteId,
    dismissedAnnouncementIds,
    dismissAnnouncement,
    loadDismissedAnnouncements,
  } = useDataStore();
  const { unreadCount, loadNotifications } = useNotificationStore();
  const {
    tasks,
    studentClasses,
    selectedClassId,
    setSelectedClass: setStoreSelectedClass,
    loadStudentData,
    unreadVoiceCount,
    aiLessons,
    exams,
  } = useStudentStore();

  const [refreshing, setRefreshing] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [logoutSheetVisible, setLogoutSheetVisible] = useState(false);
  const [ads, setAds] = useState<AdminAd[]>([]);

  // Home subjects (with real IDs for navigation) — separate from legacy studentSubjects store field
  const [homeSubjects, setHomeSubjects] = useState<Array<{ id: string; name: string }>>([]);

  // Task submission sheet state
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskNotes, setTaskNotes] = useState('');
  const [taskFile, setTaskFile] = useState<{ uri: string; name: string } | null>(null);
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  // Homework "last seen" timestamp — badge counts tasks created AFTER this time
  // PRESERVE: homework_last_seen_${userId} AsyncStorage write/read.
  const [homeworkLastSeen, setHomeworkLastSeen] = useState<number>(0);

  const pendingTasks = tasks.filter((t: any) => t.status !== 'completed');
  const unseenTasks = pendingTasks.filter((t: any) => {
    if (!t.created_at) return true;
    return new Date(t.created_at).getTime() > homeworkLastSeen;
  });

  const selectedClassName = selectedClassId && studentClasses.length > 0
    ? studentClasses.find((c: any) => c.id === selectedClassId)?.name || ''
    : undefined;

  useEffect(() => {
    if (!userId) return;
    api.getStudentSubjects(userId).then(setHomeSubjects).catch(() => setHomeSubjects([]));
  }, [userId]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`homework_last_seen_${userId}`);
        setHomeworkLastSeen(raw ? parseInt(raw, 10) || 0 : 0);
      } catch { /* silent */ }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadAnnouncements('student');
    loadDismissedAnnouncements(userId);
    loadStudentData(userId, userInstituteId || '');
    useStudentStore.getState().loadStudentSubjects(userId);
  }, [userId, userInstituteId]);

  useEffect(() => {
    if (!userInstituteId) return;
    let alive = true;
    (async () => {
      const [list, dismissed] = await Promise.all([
        api.getActiveAds(userInstituteId),
        loadDismissedAdIds(),
      ]);
      if (!alive) return;
      setAds(list.filter((a) => !dismissed.includes(a.id)));
    })();
    return () => { alive = false; };
  }, [userInstituteId]);

  useEffect(() => {
    if (userId && selectedClassId) {
      loadStudentData(userId, userInstituteId || '');
    }
  }, [selectedClassId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await Promise.all([
        loadAnnouncements('student'),
        userId ? loadStudentData(userId, userInstituteId || '') : Promise.resolve(),
        userId ? api.getStudentSubjects(userId).then(setHomeSubjects).catch(() => {}) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [userId, userInstituteId]);

  const openQRScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(t('common.error'), t('student.allowCamera'));
        return;
      }
    }
    setScanned(false);
    setQrModalVisible(true);
  };

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); return; }
    if (scanned || scanLoading) return;
    setScanned(true);
    setScanLoading(true);

    let token: string;
    try {
      const parsed = JSON.parse(data);
      token = parsed.token || data;
    } catch {
      token = data;
    }

    try {
      const deviceInfo = `${Platform.OS}/${Platform.Version}`;
      await api.scanQRAttendance(token, userId, userName || '', userInstituteId || '', deviceInfo);
      setQrModalVisible(false);
      Alert.alert(t('common.success'), t('student.attendanceRecorded'));
      // Notify parent (best effort) — resolve the actual parent first, never send to the student.
      try {
        if (userInstituteId) {
          const parentId = await api.getParentByStudent(userId, userInstituteId);
          if (parentId) {
            await api.sendParentAlert(parentId, userName || 'الطالب', `${userName} سجّل حضوره الآن`, userId, userInstituteId);
          }
        }
      } catch { /* silent — parent alert isn't critical to attendance success */ }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('student.attendanceFailed'));
      setScanned(false);
    } finally {
      setScanLoading(false);
    }
  };

  const handlePickTaskFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        setTaskFile({ uri: asset.uri, name: asset.name });
      }
    } catch {
      Alert.alert(t('common.error'), t('student.fileFailed'));
    }
  };

  const handleSubmitTask = async () => {
    if (!userId || !selectedTask) return;
    if (!taskNotes.trim() && !taskFile) {
      Alert.alert(t('common.warning'), t('student.writeAnswerOrAttach'));
      return;
    }
    setTaskSubmitting(true);
    try {
      let fileUrl: string | undefined;
      if (taskFile) {
        // Task submissions accept any file type (PDF, doc, image…). Compress
        // ONLY image extensions — never touch PDFs / docs / videos. Videos are
        // intentionally out of scope here; they belong on Bunny Stream, not Storage.
        const ext = (taskFile.name.split('.').pop() || '').toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'].includes(ext);
        const uploadUri = isImage ? await compressImage(taskFile.uri) : taskFile.uri;
        fileUrl = await bunnyStorage.uploadFile(uploadUri, `tasks/${userId}/${Date.now()}_${taskFile.name}`);
      }
      await api.submitTask(selectedTask.id, userId, taskNotes.trim() || t('student.submitted'), fileUrl, userInstituteId || undefined);
      setTaskModalVisible(false);
      Alert.alert(t('common.success'), t('student.taskSubmitted'));
      loadStudentData(userId, userInstituteId || '');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('student.taskFailed'));
    } finally {
      setTaskSubmitting(false);
    }
  };

  const onAssignmentsPress = useCallback(async () => {
    try {
      const now = Date.now();
      await AsyncStorage.setItem(`homework_last_seen_${userId}`, String(now));
      setHomeworkLastSeen(now);
    } catch { /* silent */ }
    router.push('/(student)/assignments');
  }, [userId]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FadeSlideIn style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tokens.color.teal600}
            />
          }
        >
          <HomeHero
            userName={userName}
            avatarUrl={avatarUrl}
            unreadCount={unreadCount}
            selectedClassName={selectedClassName}
            onLogoutPress={() => { haptics.light(); setLogoutSheetVisible(true); }}
            onBellPress={() => {
              if (userId) loadNotifications(userId, 'student');
              setShowNotifPanel(true);
            }}
            onAvatarPress={pickAndUploadAvatar}
          />

          <View style={styles.content}>
            <ClassSelector
              classes={studentClasses}
              selectedId={selectedClassId}
              onSelect={setStoreSelectedClass}
            />

            <SubjectsGrid
              subjects={homeSubjects}
              onSubjectPress={(sub) =>
                router.push({ pathname: '/(student)/subject-detail', params: { id: sub.id, name: sub.name } } as any)
              }
            />

            <Shortcuts
              examCount={exams.filter((e: any) => e.status === 'active' || e.status === 'scheduled').length}
              aiLessonCount={aiLessons.length}
              unreadMessagesCount={unreadVoiceCount}
              unseenAssignmentsCount={unseenTasks.length}
              onExamPress={() => router.push('/(student)/exams' as any)}
              onAiPress={() => router.push('/(student)/ai' as any)}
              onMessagesPress={() => router.push('/(student)/messages' as any)}
              onAssignmentsPress={onAssignmentsPress}
            />

            <AttendanceCTA
              onScanPress={openQRScanner}
              onFingerprintPress={() => router.push('/(student)/stats' as any)}
            />

            <QuickAccess
              unseenAssignmentsCount={unseenTasks.length}
              onSchedulePress={() => router.push('/(student)/schedule')}
              onAssignmentsPress={onAssignmentsPress}
            />

            <PendingTasks
              tasks={pendingTasks}
              onSubmitPress={(task) => {
                if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); return; }
                setSelectedTask(task);
                setTaskNotes('');
                setTaskFile(null);
                setTaskModalVisible(true);
              }}
            />

            {ads.length > 0 && ads.map((ad) => (
              <AdBanner
                key={ad.id}
                ad={ad}
                onDismiss={(id) => setAds((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}

            <HomeAnnouncements
              announcements={(announcements as any[]).filter(
                (a: any) => !dismissedAnnouncementIds.includes(a.id),
              )}
              onDismiss={(id) => {
                if (userId) dismissAnnouncement(userId, id).catch(() => {});
              }}
            />

            <View style={{ height: 30 }} />
          </View>
        </ScrollView>
      </FadeSlideIn>

      <NotificationPanel
        visible={showNotifPanel}
        onClose={() => setShowNotifPanel(false)}
        userId={userId}
        title={t('student.notifications')}
      />

      <TaskSubmitSheet
        visible={taskModalVisible}
        taskTitle={selectedTask?.title}
        notes={taskNotes}
        fileName={taskFile?.name}
        submitting={taskSubmitting}
        onClose={() => setTaskModalVisible(false)}
        onChangeNotes={setTaskNotes}
        onPickFile={handlePickTaskFile}
        onClearFile={() => setTaskFile(null)}
        onSubmit={handleSubmitTask}
      />

      <ConfirmSheet
        visible={logoutSheetVisible}
        title={t('common.logout')}
        message={t('auth.confirmLogout')}
        confirmLabel={t('common.logout')}
        cancelLabel={t('common.cancel', { defaultValue: 'إلغاء' })}
        destructive
        onConfirm={performLogout}
        onClose={() => setLogoutSheetVisible(false)}
      />

      <QRScannerModal
        visible={qrModalVisible}
        scanned={scanned}
        scanLoading={scanLoading}
        onClose={() => setQrModalVisible(false)}
        onScan={handleBarcodeScan}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
});
