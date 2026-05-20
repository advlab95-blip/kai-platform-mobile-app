import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useTeacherStore from '../../stores/teacherStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { bunnyService, bunnyStorage } from '../../services/bunny';
import { compressGalleryImage, compressCover } from '../../utils/imageCompression';
import { compressImage } from '../../utils/imageCompress';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { haptics } from '../../utils/haptics';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';

// Extracted presentational pieces (UI only — no Supabase, no state mutation)
import {
  SUB_TAB_KEYS,
  QUESTION_TYPE_KEYS,
  STATUS_COLOR_BASE,
  type SubTab,
  type QuestionType,
} from '../../components/teacher/content/_helpers';
import { styles } from '../../components/teacher/content/styles';
import NoTargetsBanner from '../../components/teacher/content/NoTargetsBanner';
import TargetsBar from '../../components/teacher/content/TargetsBar';
import SubTabsBar from '../../components/teacher/content/SubTabsBar';
import ContentLockedView from '../../components/teacher/content/ContentLockedView';
import VideoCard from '../../components/teacher/content/VideoCard';
import ExamCard from '../../components/teacher/content/ExamCard';
import GalleryCard from '../../components/teacher/content/GalleryCard';
import MaterialCard from '../../components/teacher/content/MaterialCard';
import HomeworkCard from '../../components/teacher/content/HomeworkCard';
import PdfCard from '../../components/teacher/content/PdfCard';
import AddHeaderButton from '../../components/teacher/content/AddHeaderButton';

import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import VideoUploadSheet from '../../components/teacher/content/sheets/VideoUploadSheet';
import VideoEditSheet from '../../components/teacher/content/sheets/VideoEditSheet';
import VideoPlayerModal from '../../components/teacher/content/sheets/VideoPlayerModal';
import ExamCreateSheet from '../../components/teacher/content/sheets/ExamCreateSheet';
import ExamScheduleSheet from '../../components/teacher/content/sheets/ExamScheduleSheet';
import GalleryCreateSheet from '../../components/teacher/content/sheets/GalleryCreateSheet';
import GalleryAlbumModal from '../../components/teacher/content/sheets/GalleryAlbumModal';
import MaterialCreateSheet from '../../components/teacher/content/sheets/MaterialCreateSheet';
import HomeworkCreateSheet from '../../components/teacher/content/sheets/HomeworkCreateSheet';
import HomeworkViewerSheet from '../../components/teacher/content/sheets/HomeworkViewerSheet';
import PdfUploadSheet from '../../components/teacher/content/sheets/PdfUploadSheet';
import PdfViewerModal from '../../components/teacher/content/sheets/PdfViewerModal';
import ViewersSheet from '../../components/teacher/content/sheets/ViewersSheet';
import ReportModal from '../../components/teacher/content/sheets/ReportModal';

export default function TeacherContent() {
  const { t } = useTranslation();
  const isContentEnabled = useFeatureFlag('content_management');
  const isLiveEnabled = useFeatureFlag('live_streaming');
  const SUB_TABS = SUB_TAB_KEYS
    // Hide optional tabs when their feature flag is disabled for this institute
    .filter(tab => tab.key !== 'live' || isLiveEnabled)
    .map(tab => {
      const translated = t(tab.labelKey);
      const label = (translated && translated !== tab.labelKey) ? translated : ((tab as any).fallbackLabel || tab.labelKey);
      return { ...tab, label };
    });
  const QUESTION_TYPES = QUESTION_TYPE_KEYS.map(qt => ({ ...qt, label: t(qt.labelKey) }));
  const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = Object.fromEntries(
    Object.entries(STATUS_COLOR_BASE).map(([k, v]) => [k, { bg: v.bg, text: v.text, label: t(v.labelKey) }])
  );
  const router = useRouter();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const {
    videos, exams, galleries, materials, classes,
    selectedClassId, selectedClass,
    targets, selectedTarget, selectedTargets,
    setSelectedTarget, toggleSelectedTarget, clearSelectedTargets, selectAllTargets,
    loadVideos, loadExams, loadGalleries, loadMaterials,
  } = useTeacherStore();

  // Effective target for new uploads — single-target mode (first of selectedTargets)
  // For multi-target uploads, callers loop through selectedTargets directly.
  const primaryTarget = selectedTargets[0] || selectedTarget || null;
  const effectiveClassId = primaryTarget?.classId || selectedClassId || null;
  const effectiveSubjectId = primaryTarget?.subjectId || null;

  const [activeTab, setActiveTab] = useState<SubTab>('videos');
  const [refreshing, setRefreshing] = useState(false);

  // Video upload modal
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  // Multi-select class IDs for upload modals — teacher can tap multiple chips to fan out
  const [videoClassIds, setVideoClassIds] = useState<string[]>([]);
  const toggleVideoClassId = (id: string) => setVideoClassIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number; uri: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Exam creation
  const [examModalVisible, setExamModalVisible] = useState(false);
  const [examStep, setExamStep] = useState(1);
  const [examTitle, setExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('30');
  const [examClassIds, setExamClassIds] = useState<string[]>([]);
  const toggleExamClassId = (id: string) => setExamClassIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const [examQuestions, setExamQuestions] = useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentQuestionType, setCurrentQuestionType] = useState<QuestionType>('mcq');
  const [currentPoints, setCurrentPoints] = useState('5');
  const [currentOptions, setCurrentOptions] = useState(['', '', '', '']);
  const [currentCorrectIndex, setCurrentCorrectIndex] = useState(0);
  const [currentCorrectAnswer, setCurrentCorrectAnswer] = useState('');
  const [currentModelAnswer, setCurrentModelAnswer] = useState('');
  const [currentRubric, setCurrentRubric] = useState('');

  // Gallery modal
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [galleryTitle, setGalleryTitle] = useState('');
  const [galleryCoverUri, setGalleryCoverUri] = useState<string | null>(null);
  const [galleryViewId, setGalleryViewId] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);

  // Material modal
  const [materialModalVisible, setMaterialModalVisible] = useState(false);
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialPrice, setMaterialPrice] = useState('');
  const [materialCoverUri, setMaterialCoverUri] = useState<string | null>(null);

  // Video player modal
  const [videoPlayerVisible, setVideoPlayerVisible] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<any>(null);

  // Exam schedule modal
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleExamId, setScheduleExamId] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleNotify, setScheduleNotify] = useState(true);

  // Grading state
  const [gradingExamId, setGradingExamId] = useState<string | null>(null);

  // Report state
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportExam, setReportExam] = useState<any>(null);
  const [reportSubmissions, setReportSubmissions] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  // Centralized confirm-sheet state — replaces Alert.alert(...) destructive prompts.
  // Action callback is preserved 1:1 from the original confirmAlert call sites.
  const [confirmState, setConfirmState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>({ visible: false, title: '', confirmLabel: '', onConfirm: () => {} });
  const closeConfirm = useCallback(() => {
    setConfirmState((s) => ({ ...s, visible: false }));
  }, []);
  const askConfirm = useCallback((opts: { title: string; message?: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void }) => {
    setConfirmState({ visible: true, ...opts });
  }, []);

  // Video edit modal
  const [editVideoModalVisible, setEditVideoModalVisible] = useState(false);
  const [editVideoId, setEditVideoId] = useState('');
  const [editVideoTitle, setEditVideoTitle] = useState('');

  // Homework state
  const [homeworkModalVisible, setHomeworkModalVisible] = useState(false);
  const [homeworkTitle, setHomeworkTitle] = useState('');
  const [homeworkDescription, setHomeworkDescription] = useState('');
  const [homeworkClassIds, setHomeworkClassIds] = useState<string[]>([]);
  const toggleHomeworkClassId = (id: string) => setHomeworkClassIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const [homeworkDueDate, setHomeworkDueDate] = useState('');
  const [homeworkFile, setHomeworkFile] = useState<{ uri: string; name: string } | null>(null);
  const [homeworkSaving, setHomeworkSaving] = useState(false);
  const [teacherTasks, setTeacherTasks] = useState<any[]>([]);

  // PDF state
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfClassIds, setPdfClassIds] = useState<string[]>([]);
  const togglePdfClassId = (id: string) => setPdfClassIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const [pdfFile, setPdfFile] = useState<{ uri: string; name: string } | null>(null);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<any[]>([]);
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [viewingPdfUrl, setViewingPdfUrl] = useState('');
  // Homework detail viewer (teacher preview of own task)
  const [viewingTask, setViewingTask] = useState<any>(null);
  // Content viewers modal — shows which students saw an item
  const [viewersFor, setViewersFor] = useState<{ type: string; id: string; title: string } | null>(null);
  const [viewersList, setViewersList] = useState<any[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const openViewers = async (type: 'video' | 'material' | 'pdf' | 'gallery', item: any) => {
    setViewersFor({ type, id: item.id, title: item.title || '' });
    setLoadingViewers(true);
    setViewersList([]);
    try {
      const data = type === 'video'
        ? await api.getVideoViewers(item.id)
        : await api.getContentViewers(type, item.id);
      setViewersList((data as any[]) || []);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل تحميل القائمة');
    } finally { setLoadingViewers(false); }
  };

  // Teacher sees ALL their homework/PDF uploads regardless of home-picker selection.
  // Class filtering only applies to the student side; filtering the teacher list caused flicker.
  const loadTeacherTasks = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.getTasksByTeacher(userId, undefined);
      setTeacherTasks(data || []);
    } catch (err) { console.error(err); }
  }, [userId]);

  const loadPdfFiles = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.getPdfMaterials(userId, undefined, userInstituteId || undefined);
      setPdfFiles(data || []);
    } catch (err) { console.error(err); }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadVideos(userId);
      loadExams(userId);
      loadGalleries(userId);
      loadMaterials(userInstituteId || undefined);
      loadTeacherTasks();
      loadPdfFiles();
    }
  }, [userId, userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userId) {
        await Promise.all([
          loadVideos(userId),
          loadExams(userId),
          loadGalleries(userId),
          loadMaterials(userInstituteId || undefined),
          loadTeacherTasks(),
          loadPdfFiles(),
        ]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [userId, userInstituteId]);

  const handlePickFile = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.7,
        videoMaxDuration: 600,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const sizeMB = (asset.fileSize || 0) / (1024 * 1024);
        if (sizeMB > 500) {
          Alert.alert('حجم كبير', `الفيديو ${sizeMB.toFixed(0)}MB — الحد الأقصى 500MB. قسّمه أو اضغطه.`);
          return;
        }
        if ((asset.duration || 0) > 600_000) {
          Alert.alert('مدة طويلة', 'الحد الأقصى 10 دقائق للفيديو الواحد.');
          return;
        }
        setPickedFile({
          name: asset.fileName || 'video.mp4',
          size: asset.fileSize || 0,
          uri: asset.uri,
        });
      }
    } catch {
      Alert.alert(t('common.error'), t('teacherContent.videoSelectFailed'));
    }
  };

  const handleUploadVideo = async () => {
    if (!videoTitle.trim()) {
      Alert.alert(t('common.error'), t('teacherContent.enterVideoTitle'));
      return;
    }
    if (!userId) {
      Alert.alert(t('common.error'), t('teacherContent.pleaseLogin'));
      return;
    }
    if (!pickedFile?.uri) {
      Alert.alert(t('common.error'), t('teacherContent.selectVideoFile'));
      return;
    }
    setSaving(true);
    try {
      let bunnyVideoId: string | undefined;

      // Upload to Bunny CDN if configured. Create + upload are now a single
      // edge-function call (server-side) so the Stream API key never ships to
      // the client. See services/bunny.ts.
      if (bunnyService.isConfigured()) {
        setUploadProgress(t('teacherContent.uploadingVideo'));
        const { videoId } = await bunnyService.uploadVideo(videoTitle.trim(), pickedFile.uri);
        bunnyVideoId = videoId;
        setUploadProgress(null);
      }

      // Save to Supabase with bunny_video_id — strictly target the classes selected from home picker.
      // If multiple targets selected, create a video for each (so each section gets its own row).
      // Priority: selected targets from home → multi-select chips inside modal → single chosen
      const uploadTargets = selectedTargets.length > 0
        ? selectedTargets
        : videoClassIds.length > 0
          ? videoClassIds.map(cid => ({ classId: cid, sectionId: null, subjectId: effectiveSubjectId || '', subjectName: '', displayName: '' }))
          : [];

      if (uploadTargets.length === 0) {
        setSaving(false);
        setUploadProgress(null);
        Alert.alert(t('common.error'), 'اختر الصف/الشعبة من الصفحة الرئيسية قبل الرفع — ما يمكن الرفع بدون تحديد هدف.');
        return;
      }
      // Create one video per target. Track which inserts succeed so we can
      // roll back the Bunny asset if ALL inserts fail (orphan prevention). If
      // SOME succeed, leave the Bunny asset in place — deleting it would break
      // the DB rows that already point to it.
      const createdVideoIds: string[] = [];
      const failedTargets: string[] = [];
      for (const tgt of uploadTargets) {
        try {
          const row: any = await api.createVideo(userId, videoTitle.trim(), tgt.classId || undefined, bunnyVideoId, tgt.subjectId || undefined, tgt.sectionId || undefined);
          if (row?.id) createdVideoIds.push(row.id);
          else createdVideoIds.push('ok');
        } catch (err: any) {
          console.error('createVideo failed for target:', tgt.displayName || tgt.classId, err?.message);
          failedTargets.push(tgt.displayName || tgt.classId || '?');
        }
      }
      if (createdVideoIds.length === 0) {
        // Zero DB rows — orphan the Bunny asset: delete it and report failure.
        if (bunnyVideoId && bunnyService.isConfigured()) {
          try { await bunnyService.deleteVideo(bunnyVideoId); } catch (delErr) { console.error('bunny rollback failed:', delErr); }
        }
        setSaving(false);
        setUploadProgress(null);
        Alert.alert(t('common.error'), 'فشل رفع الفيديو');
        return;
      }
      if (failedTargets.length > 0) {
        // Partial success — keep Bunny asset (some DB rows reference it).
        Alert.alert(
          t('common.warning', { defaultValue: 'تنبيه' }),
          `تم الرفع جزئياً — بعض الأقسام فشلت: ${failedTargets.join('، ')}`
        );
      }

      // Notify all students across all targeted classes (single deduped call)
      const notifyClassIds = uploadTargets.map(t => t.classId).filter(Boolean) as string[];
      const notifySectionIds = uploadTargets.map(t => t.sectionId).filter(Boolean) as string[];
      if ((notifyClassIds.length > 0 || notifySectionIds.length > 0) && userId) {
        try {
          await api.notifyStudentsInClasses({
            classIds: notifyClassIds.length ? notifyClassIds : undefined,
            sectionIds: notifySectionIds.length ? notifySectionIds : undefined,
            title: t('teacherContent.newLecture', { defaultValue: 'محاضرة جديدة' }),
            message: videoTitle.trim(),
            type: 'video',
            senderId: userId,
            senderRole: 'teacher',
            instituteId: userInstituteId || undefined,
          });
        } catch (err) { console.error('notify failed:', err); }
      }
      Alert.alert(t('common.success'), t('teacherContent.videoUploaded'));
      setVideoTitle('');
      setVideoClassIds([]);
      setPickedFile(null);
      setUploadProgress(null);
      setVideoModalVisible(false);
      if (userId) loadVideos(userId);
    } catch (err: any) {
      setUploadProgress(null);
      Alert.alert(t('common.error'), err.message || t('teacherContent.videoUploadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVideo = async (video: any) => {
    askConfirm({
      title: t('teacherContent.deleteVideo'),
      message: t('teacherContent.deleteVideoConfirm', { title: video.title || t('teacherContent.noTitle') }),
      confirmLabel: t('common.delete', { defaultValue: 'حذف' }),
      destructive: true,
      onConfirm: async () => {
        try {
          // Delete from Bunny CDN if it has a real bunny_video_id
          if (video.bunny_video_id && !video.bunny_video_id.startsWith('local_') && bunnyService.isConfigured()) {
            try {
              await bunnyService.deleteVideo(video.bunny_video_id);
            } catch (bunnyErr: any) {
              if (__DEV__) console.log('Bunny delete warning:', bunnyErr.message);
            }
          }
          await api.deleteVideo(video.id);
          Alert.alert(t('common.success'), t('teacherContent.videoDeleted'));
          if (userId) loadVideos(userId);
        } catch (err: any) {
          Alert.alert(t('common.error'), err.message || t('teacherContent.videoDeleteFailed'));
        }
      },
    });
  };

  const handleEditVideo = async () => {
    if (!editVideoTitle.trim()) {
      Alert.alert(t('common.error'), t('teacherContent.enterTitle'));
      return;
    }
    setSaving(true);
    try {
      await api.updateVideo(editVideoId, { title: editVideoTitle.trim() });
      Alert.alert(t('common.success'), t('teacherContent.videoTitleUpdated'));
      setEditVideoModalVisible(false);
      if (userId) loadVideos(userId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.editFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleExam = async () => {
    if (!scheduleDate.trim() || !scheduleTime.trim()) {
      Alert.alert(t('common.error'), t('teacherContent.enterDateTime'));
      return;
    }
    // Validate date format YYYY-MM-DD and time HH:MM
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate.trim())) {
      Alert.alert(t('common.error'), t('teacherContent.invalidDateFormat'));
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(scheduleTime.trim())) {
      Alert.alert(t('common.error'), t('teacherContent.invalidTimeFormat'));
      return;
    }
    setSaving(true);
    try {
      const scheduledAt = `${scheduleDate.trim()}T${scheduleTime.trim()}:00`;
      await api.scheduleExam(scheduleExamId, scheduledAt);
      if (scheduleNotify) {
        // Only notify students in the teacher's assigned classes (institute-scoped).
        // sendPushToRole('student') is admin-gated; use notifyStudentsInClasses instead.
        try {
          if (userId) {
            const { data: tAssigns } = await supabase
              .from('teacher_assignments').select('class_id').eq('teacher_id', userId);
            const teacherClassIds = Array.from(new Set(((tAssigns || []) as any[])
              .map((r: any) => r.class_id).filter(Boolean))) as string[];
            if (teacherClassIds.length > 0) {
              await api.notifyStudentsInClasses({
                classIds: teacherClassIds,
                title: t('teacherContent.scheduledExam'),
                message: `${t('teacherContent.examScheduled')} ${scheduleDate} ${scheduleTime}`,
                type: 'exam',
                senderId: userId,
                senderRole: 'teacher',
                instituteId: userInstituteId || undefined,
              });
            }
          }
        } catch (notifErr) { console.error('schedule notify failed:', notifErr); }
      }
      Alert.alert(t('common.success'), t('teacherContent.examScheduled'));
      setScheduleModalVisible(false);
      setScheduleDate('');
      setScheduleTime('');
      if (userId) loadExams(userId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.scheduleFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleGradeExam = async (examId: string) => {
    setGradingExamId(examId);
    try {
      const result = await api.gradeExam(examId);
      Alert.alert(t('common.success'), `تم تصحيح ${result.graded} إجابة بنجاح`);
      if (userId) loadExams(userId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.gradingFailed'));
    }
    setGradingExamId(null);
  };

  const handleShowReport = async (exam: any) => {
    setReportExam(exam);
    setReportLoading(true);
    setReportModalVisible(true);
    try {
      const { data } = await supabase
        .from('exam_submissions')
        .select('*, users:student_id(full_name)')
        .eq('exam_id', exam.id)
        .eq('status', 'graded');
      setReportSubmissions(data || []);
    } catch (err: any) {
      setReportSubmissions([]);
      Alert.alert(t('common.warning'), t('teacherContent.reportLoadFailed') + ' — ' + (err.message || t('common.error')));
    } finally {
      setReportLoading(false);
    }
  };

  const handleShareReport = async () => {
    if (!reportExam) return;
    const totalPoints = reportExam.total_points || 0;
    let report = `تقرير امتحان: ${reportExam.title}\n`;
    report += `التاريخ: ${new Date().toLocaleDateString('ar-IQ')}\n`;
    report += `إجمالي الدرجات: ${totalPoints}\n\n`;
    report += `الطالب | الدرجة | النسبة\n`;
    report += `${'─'.repeat(40)}\n`;

    for (const sub of reportSubmissions) {
      const pct = totalPoints > 0 ? Math.round((sub.score / totalPoints) * 100) : 0;
      report += `${sub.users?.full_name || t('roles.student')} | ${sub.score}/${totalPoints} | ${pct}%\n`;
    }

    try {
      const fileUri = (FileSystem.documentDirectory ?? '') + `report_${reportExam.id}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, report);
      await Sharing.shareAsync(fileUri, { mimeType: 'text/plain' });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.shareReportFailed'));
    }
  };

  const handleCreateGallery = async () => {
    if (!galleryTitle.trim()) {
      Alert.alert(t('common.error'), t('teacherContent.enterAlbumName'));
      return;
    }
    if (!userId) { Alert.alert(t('common.error'), t('teacherContent.pleaseLogin')); return; }
    setSaving(true);
    try {
      // Multi-target: one gallery row per target — require at least one selected target.
      const galleryTargets = selectedTargets.length > 0 ? selectedTargets : [];
      if (galleryTargets.length === 0) {
        setSaving(false);
        Alert.alert(t('common.error'), 'اختر الصف/الشعبة من الصفحة الرئيسية قبل إنشاء الألبوم — ما يمكن إنشاء ألبوم بدون تحديد هدف.');
        return;
      }
      // Optional cover image: upload once, then attach the same URL to each
      // per-target gallery row so a single picked image fans out to all classes.
      let coverImageUrl: string | null = null;
      if (galleryCoverUri && bunnyStorage.isConfigured()) {
        try {
          const compressed = await compressGalleryImage(galleryCoverUri);
          coverImageUrl = await bunnyStorage.uploadImage(compressed, `galleries/covers`);
        } catch (err) {
          console.error('cover upload failed (continuing without cover):', err);
        }
      }
      for (const tgt of galleryTargets) {
        const created = await api.createGallery(galleryTitle.trim(), userId, tgt.classId || undefined, tgt.subjectId || undefined, tgt.sectionId || undefined);
        if (coverImageUrl && (created as any)?.id) {
          try { await api.addGalleryImage((created as any).id, coverImageUrl); } catch (e) { console.error('attach cover failed:', e); }
        }
      }
      const notifyClassIds = galleryTargets.map(t => t.classId).filter(Boolean) as string[];
      const notifySectionIds = galleryTargets.map(t => t.sectionId).filter(Boolean) as string[];
      if ((notifyClassIds.length || notifySectionIds.length) && userId) {
        try {
          await api.notifyStudentsInClasses({
            classIds: notifyClassIds.length ? notifyClassIds : undefined,
            sectionIds: notifySectionIds.length ? notifySectionIds : undefined,
            title: t('teacherContent.newAlbum', { defaultValue: 'معرض صور جديد' }),
            message: galleryTitle.trim(),
            type: 'gallery',
            senderId: userId,
            senderRole: 'teacher',
            instituteId: userInstituteId || undefined,
          });
        } catch (err) { console.error('notify failed:', err); }
      }
      Alert.alert(t('common.success'), t('teacherContent.albumCreated'));
      setGalleryTitle('');
      setGalleryCoverUri(null);
      setGalleryModalVisible(false);
      if (userId) loadGalleries(userId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.albumCreateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = () => {
    if (!currentQuestion.trim()) {
      Alert.alert(t('common.error'), t('teacherContent.enterQuestionText'));
      return;
    }
    const q: any = {
      id: Date.now().toString(),
      content: currentQuestion, // canonical field — student exam viewer + PDF exporter + auto_grade_exam RPC all read .content
      type: currentQuestionType,
      points: currentPoints.trim() === '' ? 5 : (parseInt(currentPoints) >= 0 ? parseInt(currentPoints) : 5),
    };
    if (currentQuestionType === 'mcq') {
      if (currentOptions.some((o) => !o.trim())) {
        Alert.alert(t('common.error'), t('teacherContent.fillAllOptions'));
        return;
      }
      q.options = [...currentOptions];
      q.correctIndex = currentCorrectIndex;
    }
    if (currentQuestionType === 'tf') {
      q.correctAnswer = currentCorrectIndex === 0;
    }
    if (currentQuestionType === 'short') {
      if (!currentCorrectAnswer.trim()) {
        Alert.alert(t('common.error'), t('teacherContent.enterModelAnswer'));
        return;
      }
      q.correctAnswer = currentCorrectAnswer.trim();
    }
    if (currentQuestionType === 'fill') {
      if (!currentCorrectAnswer.trim()) {
        Alert.alert(t('common.error'), t('teacherContent.enterMissingWord'));
        return;
      }
      q.correctAnswer = currentCorrectAnswer.trim();
    }
    if (currentQuestionType === 'essay') {
      q.rubric = currentRubric.trim() || '';
      q.modelAnswer = currentModelAnswer.trim() || '';
    }
    setExamQuestions([...examQuestions, q]);
    setCurrentQuestion('');
    setCurrentOptions(['', '', '', '']);
    setCurrentCorrectIndex(0);
    setCurrentCorrectAnswer('');
    setCurrentModelAnswer('');
    setCurrentRubric('');
    setCurrentPoints('5');
  };

  const handleCreateExam = async () => {
    if (!examTitle.trim() || examQuestions.length === 0) {
      Alert.alert(t('common.error'), t('teacherContent.enterTitleAndQuestion'));
      return;
    }
    if (!userId) { Alert.alert(t('common.error'), t('teacherContent.pleaseLogin')); return; }
    setSaving(true);
    try {
      const totalPoints = examQuestions.reduce((sum: number, q: any) => sum + (q.points || 0), 0);
      const duration = parseInt(examDuration);
      // Multi-target: one exam per target — require at least one selected target.
      const examTargets = selectedTargets.length > 0
        ? selectedTargets
        : examClassIds.length > 0
          ? examClassIds.map(cid => ({ classId: cid, sectionId: null, subjectId: effectiveSubjectId || '', subjectName: '', displayName: '' }))
          : [];
      if (examTargets.length === 0) {
        setSaving(false);
        Alert.alert(t('common.error'), 'اختر الصف/الشعبة من الصفحة الرئيسية قبل إنشاء الامتحان — ما يمكن إنشاء امتحان بدون تحديد هدف.');
        return;
      }
      for (const tgt of examTargets) {
        await api.createExam(
          examTitle, userId, tgt.classId || '', userInstituteId || '',
          examQuestions, totalPoints, isNaN(duration) ? 30 : duration,
          'draft', tgt.sectionId || null, tgt.subjectId || null,
        );
      }
      Alert.alert(t('common.success'), t('teacherContent.examCreated'));
      setExamModalVisible(false);
      resetExamForm();
      if (userId) loadExams(userId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.examCreateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const resetExamForm = () => {
    setExamStep(1);
    setExamTitle('');
    setExamDuration('30');
    setExamClassIds([]);
    setExamQuestions([]);
    setCurrentQuestion('');
    setCurrentQuestionType('mcq');
    setCurrentPoints('5');
    setCurrentOptions(['', '', '', '']);
    setCurrentCorrectIndex(0);
    setCurrentCorrectAnswer('');
    setCurrentModelAnswer('');
    setCurrentRubric('');
  };

  // ── Gallery: open album and load images ──
  const openGalleryAlbum = async (gallery: any) => {
    setGalleryViewId(gallery.id);
    setGalleryImages([]); // Reset first
    // Fetch fresh from Supabase
    try {
      const { data } = await (supabase).from('galleries').select('images').eq('id', gallery.id).single();
      setGalleryImages(data?.images || []);
    } catch {
      setGalleryImages(gallery.images || []);
    }
  };

  const handleDeleteGalleryImage = async (imageUrl: string) => {
    if (!galleryViewId) return;
    askConfirm({
      title: t('teacherContent.deleteImage'),
      message: t('teacherContent.deleteImageConfirm'),
      confirmLabel: t('common.delete', { defaultValue: 'حذف' }),
      destructive: true,
      onConfirm: async () => {
        try {
          // Remove from gallery images array in Supabase
          const newImages = galleryImages.filter(img => img !== imageUrl);
          await supabase.from('galleries').update({
            images: newImages,
            image_count: newImages.length,
          }).eq('id', galleryViewId);
          setGalleryImages(newImages);
          // Try delete from Bunny Storage
          try {
            const path = imageUrl.replace(`https://${process.env.EXPO_PUBLIC_BUNNY_STORAGE_CDN}/`, '');
            if (path) await bunnyStorage.deleteFile(path);
          } catch (err) { console.error(err); }
          if (userId) loadGalleries(userId);
        } catch (err: any) {
          Alert.alert(t('common.error'), err.message || t('teacherContent.imageDeleteFailed'));
        }
      },
    });
  };

  const handleUploadGalleryImage = async () => {
    if (!galleryViewId) return;
    if (!bunnyStorage.isConfigured()) {
      Alert.alert(t('common.error'), t('teacherContent.storageNotConfigured'));
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setGalleryUploading(true);
      const total = result.assets.length;
      let uploaded = 0;

      for (const asset of result.assets) {
        uploaded++;
        setUploadProgress(`جاري رفع ${uploaded} من ${total}...`);
        const compressed = await compressGalleryImage(asset.uri);
        const imageUrl = await bunnyStorage.uploadImage(compressed, `galleries/${galleryViewId}`);
        await api.addGalleryImage(galleryViewId, imageUrl);
        setGalleryImages((prev) => [...prev, imageUrl]);
      }

      setUploadProgress(null);
      Alert.alert(t('common.success'), `تم رفع ${total} صورة بنجاح`);
      if (userId) loadGalleries(userId);
    } catch (err: any) {
      setUploadProgress(null);
      Alert.alert(t('common.error'), err.message || t('teacherContent.imagesUploadFailed'));
    } finally {
      setGalleryUploading(false);
    }
  };

  // ── Gallery: pick optional cover image (before create) ──
  const handlePickGalleryCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]) {
        setGalleryCoverUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert(t('common.error'), t('teacherContent.imageSelectFailed'));
    }
  };

  // ── Material: pick cover image ──
  const handlePickMaterialCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]) {
        setMaterialCoverUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert(t('common.error'), t('teacherContent.imageSelectFailed'));
    }
  };

  const handleCreateMaterial = async () => {
    if (!materialTitle.trim()) {
      Alert.alert(t('common.error'), t('teacherContent.enterBookletTitle'));
      return;
    }
    setSaving(true);
    try {
      let coverUrl: string | undefined;
      if (materialCoverUri && bunnyStorage.isConfigured()) {
        const compressed = await compressCover(materialCoverUri);
        coverUrl = await bunnyStorage.uploadImage(compressed, 'materials/covers');
      }
      const price = Math.max(0, parseFloat(materialPrice) || 0);
      if (!userId) { setSaving(false); Alert.alert(t('common.error'), t('teacherContent.pleaseLogin')); return; }
      // Multi-target material upload — require at least one selected target.
      const matTargets = selectedTargets.length > 0 ? selectedTargets : [];
      if (matTargets.length === 0) {
        setSaving(false);
        Alert.alert(t('common.error'), 'اختر الصف/الشعبة من الصفحة الرئيسية قبل رفع الملزمة — ما يمكن الرفع بدون تحديد هدف.');
        return;
      }
      for (const tgt of matTargets) {
        await api.createMaterial(materialTitle, price, userId, userInstituteId || '', coverUrl, tgt.subjectId || undefined, tgt.classId || undefined, tgt.sectionId || undefined);
      }
      const matClassIds = matTargets.map(t => t.classId).filter(Boolean) as string[];
      const matSectionIds = matTargets.map(t => t.sectionId).filter(Boolean) as string[];
      if ((matClassIds.length || matSectionIds.length) && userId) {
        try {
          await api.notifyStudentsInClasses({
            classIds: matClassIds.length ? matClassIds : undefined,
            sectionIds: matSectionIds.length ? matSectionIds : undefined,
            title: t('teacherContent.newBooklet', { defaultValue: 'ملزمة جديدة' }),
            message: materialTitle,
            type: 'material',
            senderId: userId,
            senderRole: 'teacher',
            instituteId: userInstituteId || undefined,
          });
        } catch (err) { console.error('notify failed:', err); }
      }
      Alert.alert(t('common.success'), t('teacherContent.bookletAdded'));
      setMaterialModalVisible(false);
      setMaterialTitle('');
      setMaterialPrice('');
      setMaterialCoverUri(null);
      loadMaterials(userInstituteId || undefined);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.bookletAddFailed'));
    } finally {
      setSaving(false);
    }
  };

  const getVideoUri = (item: any): string | null => {
    if (item.url) return item.url;
    if (item.bunny_video_id && !item.bunny_video_id.startsWith('local_')) {
      // Use embed URL (works even with CDN token auth)
      return bunnyService.getEmbedUrl(item.bunny_video_id);
    }
    return null;
  };

  const handlePlayVideo = (item: any) => {
    if (item.bunny_video_id && !item.bunny_video_id.startsWith('local_')) {
      setPlayingVideo(item);
      setVideoPlayerVisible(true);
    } else {
      Alert.alert(item.title || t('teacherContent.videos'), t('teacherContent.videoProcessing'));
    }
  };

  // ── Video card actions ──
  const handleToggleVideoVisibility = async (item: any) => {
    try {
      await api.toggleContentVisibility('videos', item.id, !item.is_hidden);
      Alert.alert(t('common.success'), item.is_hidden ? t('teacherContent.videoShown') : t('teacherContent.videoHidden'));
      if (userId) loadVideos(userId);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  const handleOpenVideoEdit = (item: any) => {
    setEditVideoId(item.id);
    setEditVideoTitle(item.title || '');
    setEditVideoModalVisible(true);
  };

  // ── Exam card actions ──
  const handleDeleteExam = (exam: any) => {
    askConfirm({
      title: 'حذف الامتحان',
      message: `هل تريد حذف "${exam.title}"؟ سيتم حذف كل جلسات الطلاب وإجاباتهم.`,
      confirmLabel: t('common.delete', { defaultValue: 'حذف' }),
      destructive: true,
      onConfirm: async () => {
        try {
          await api.deleteExam(exam.id);
          if (userId) loadExams(userId);
          Alert.alert(t('common.success'), 'تم حذف الامتحان');
        } catch (err: any) {
          Alert.alert(t('common.error'), err?.message || 'فشل الحذف');
        }
      },
    });
  };

  const handleOpenExam = (item: any) => {
    router.push({ pathname: '/(teacher)/exams', params: { openExamId: item.id } } as any);
  };

  const handleOpenScheduleExam = (item: any) => {
    setScheduleExamId(item.id);
    setScheduleDate('');
    setScheduleTime('');
    setScheduleNotify(true);
    setScheduleModalVisible(true);
  };

  const handleToggleExamVisibility = async (item: any) => {
    try {
      await api.toggleContentVisibility('exams', item.id, !item.is_hidden);
      if (userId) loadExams(userId);
    } catch (e: any) { Alert.alert(t('common.error'), e?.message || ''); }
  };

  // ── Gallery card actions ──
  const handleToggleGalleryVisibility = async (item: any) => {
    try {
      await api.toggleContentVisibility('galleries', item.id, !item.is_hidden);
      if (userId) loadGalleries(userId);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  // ── Material card actions ──
  const handleMaterialDeletePrompt = (item: any) => {
    askConfirm({
      title: t('teacherContent.deleteVideo'),
      message: `هل تريد حذف "${item.title}"؟`,
      confirmLabel: t('common.delete', { defaultValue: 'حذف' }),
      destructive: true,
      onConfirm: async () => {
        try {
          await api.archiveContent('materials', item.id, userId || '');
          Alert.alert(t('common.success'), t('common.permanentDelete'));
          loadMaterials(userInstituteId || undefined);
        } catch (err: any) { Alert.alert(t('common.error'), err.message || t('admin.deleteFailed')); }
      },
    });
  };

  const handleToggleMaterialVisibility = async (item: any) => {
    try {
      await api.toggleContentVisibility('materials', item.id, !item.is_hidden);
      Alert.alert(t('common.success'), item.is_hidden ? t('teacherContent.videoShown') : t('teacherContent.videoHidden'));
      loadMaterials(userInstituteId || undefined);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  // ── Homework card actions ──
  const handleToggleHomeworkVisibility = async (item: any) => {
    try {
      // Homework uses 'tasks' table (not 'assignments')
      await api.toggleContentVisibility('tasks', item.id, !item.is_hidden);
      loadTeacherTasks();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  const handleHomeworkDeletePrompt = (item: any) => {
    askConfirm({
      title: t('teacherContent.deleteHomework', { defaultValue: 'حذف الواجب' }),
      message: t('teacherContent.deleteHomeworkConfirm', { defaultValue: 'هل تريد حذف هذا الواجب؟' }),
      confirmLabel: t('common.delete', { defaultValue: 'حذف' }),
      destructive: true,
      onConfirm: async () => {
        try {
          await api.deleteTask(item.id);
          loadTeacherTasks();
        } catch (err: any) {
          Alert.alert(t('common.error'), err.message || t('admin.deleteFailed'));
        }
      },
    });
  };

  // ── PDF card actions ──
  const handleOpenPdf = (item: any) => {
    if (item.cover_url) {
      setViewingPdfUrl(item.cover_url);
      setPdfViewerVisible(true);
    }
  };

  const handleTogglePdfVisibility = async (item: any) => {
    try {
      await api.toggleContentVisibility('materials', item.id, !item.is_hidden);
      Alert.alert(t('common.success'), item.is_hidden ? t('teacherContent.videoShown') : t('teacherContent.videoHidden'));
      loadPdfFiles();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  const handlePdfDeletePrompt = (item: any) => {
    askConfirm({
      title: t('teacherContent.deleteVideo'),
      message: `هل تريد حذف "${item.title}"؟`,
      confirmLabel: t('common.delete', { defaultValue: 'حذف' }),
      destructive: true,
      onConfirm: async () => {
        try {
          await api.archiveContent('materials', item.id, userId || '');
          Alert.alert(t('common.success'), t('common.permanentDelete'));
          loadPdfFiles();
        } catch (err: any) { Alert.alert(t('common.error'), err.message || t('admin.deleteFailed')); }
      },
    });
  };

  // ── Homework: pick file for new task ──
  const handlePickHomeworkFile = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!result.canceled && result.assets?.[0]) {
        setHomeworkFile({ uri: result.assets[0].uri, name: result.assets[0].fileName || 'attachment.jpg' });
      }
    } catch {
      Alert.alert(t('common.error'), t('teacherContent.imageSelectFailed'));
    }
  };

  const handleSaveHomework = async () => {
    if (!homeworkTitle.trim()) { Alert.alert(t('common.error'), t('teacherContent.enterTitle')); return; }
    // Require a class from either home picker (selectedTargets) or the modal picker
    if (homeworkClassIds.length === 0 && selectedTargets.length === 0) {
      Alert.alert(t('common.error'), 'اختر صف واحد أو أكثر من الصفحة الرئيسية أو من داخل النموذج قبل إنشاء الواجب.');
      return;
    }
    if (!userId) return;
    setHomeworkSaving(true);
    try {
      let attachmentUrl: string | undefined;
      if (homeworkFile) {
        // Picker only emits images here; resize+recompress to ~500KB before upload.
        const uploadUri = await compressImage(homeworkFile.uri);
        attachmentUrl = await bunnyStorage.uploadFile(
          uploadUri,
          `tasks/${userId}/${Date.now()}_${homeworkFile.name}`
        );
      }
      // Multi-target homework — one task per target (class_id scope)
      const hwTargets = selectedTargets.length > 0
        ? selectedTargets
        : homeworkClassIds.length > 0
          ? homeworkClassIds.map(cid => ({ classId: cid, sectionId: null, subjectId: '', subjectName: '', displayName: '' }))
          : [];
      for (const tgt of hwTargets) {
        // Tasks.class_id is a real FK into classes(id). Section_id is NOT a
        // class id — falling back to it caused
        // "violates foreign key constraint tasks_class_id_fkey". Skip targets
        // missing a real class so the rest still publish.
        if (!tgt.classId) continue;
        await api.createTask(
          homeworkTitle.trim(), homeworkDescription.trim(), userId,
          tgt.classId, homeworkDueDate.trim() || undefined, attachmentUrl,
          tgt.sectionId || undefined,
        );
      }
      const hwClassIds = hwTargets.map(t => t.classId).filter(Boolean) as string[];
      const hwSectionIds = hwTargets.map(t => t.sectionId).filter(Boolean) as string[];
      const effectiveHwClassIds = hwClassIds.length ? hwClassIds : (homeworkClassIds.length > 0 ? homeworkClassIds : []);
      if ((effectiveHwClassIds.length || hwSectionIds.length) && userId) {
        try {
          await api.notifyStudentsInClasses({
            classIds: effectiveHwClassIds.length ? effectiveHwClassIds : undefined,
            sectionIds: hwSectionIds.length ? hwSectionIds : undefined,
            title: t('teacherContent.newHomework', { defaultValue: 'واجب جديد' }),
            message: homeworkTitle.trim(),
            type: 'homework',
            senderId: userId,
            senderRole: 'teacher',
            instituteId: userInstituteId || undefined,
          });
        } catch (err) { console.error('notify failed:', err); }
      }
      setHomeworkModalVisible(false);
      Alert.alert(t('common.success'), t('teacherContent.bookletAdded'));
      loadTeacherTasks();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.bookletAddFailed'));
    } finally {
      setHomeworkSaving(false);
    }
  };

  // ── PDF: pick file ──
  const handlePickPdfFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
      if (!result.canceled && result.assets?.[0]) {
        setPdfFile({ uri: result.assets[0].uri, name: result.assets[0].name || 'document.pdf' });
      }
    } catch {
      Alert.alert(t('common.error'), t('teacherContent.imageSelectFailed'));
    }
  };

  const handleUploadPdf = async () => {
    if (!pdfTitle.trim()) { Alert.alert(t('common.error'), t('teacherContent.enterTitle')); return; }
    if (!pdfFile) { Alert.alert(t('common.error'), t('teacherContent.selectPdf')); return; }
    if (!userId) return;
    setPdfSaving(true);
    try {
      const pdfUrl = await bunnyStorage.uploadFile(
        pdfFile.uri,
        `pdfs/${userId}/${Date.now()}_${pdfFile.name}`
      );
      // Multi-target PDF upload — one PDF per target. Require at least one target.
      const pdfTargets = selectedTargets.length > 0
        ? selectedTargets
        : pdfClassIds.length > 0
          ? pdfClassIds.map(cid => ({ classId: cid, sectionId: null, subjectId: effectiveSubjectId || '', subjectName: '', displayName: '' }))
          : [];
      if (pdfTargets.length === 0) {
        setPdfSaving(false);
        Alert.alert(t('common.error'), 'اختر الصف/الشعبة من الصفحة الرئيسية قبل رفع ملف PDF — ما يمكن الرفع بدون تحديد هدف.');
        return;
      }
      for (const tgt of pdfTargets) {
        await api.createPdfMaterial(pdfTitle.trim(), pdfUrl, userId, userInstituteId || '', tgt.classId || undefined, tgt.subjectId || undefined);
      }
      const notifyPdfClassIds = pdfTargets.map(t => t.classId).filter(Boolean) as string[];
      const notifyPdfSectionIds = pdfTargets.map(t => t.sectionId).filter(Boolean) as string[];
      if ((notifyPdfClassIds.length || notifyPdfSectionIds.length) && userId) {
        try {
          await api.notifyStudentsInClasses({
            classIds: notifyPdfClassIds.length ? notifyPdfClassIds : undefined,
            sectionIds: notifyPdfSectionIds.length ? notifyPdfSectionIds : undefined,
            title: t('teacherContent.newPdf', { defaultValue: 'ملف PDF جديد' }),
            message: pdfTitle.trim(),
            type: 'pdf',
            senderId: userId,
            senderRole: 'teacher',
            instituteId: userInstituteId || undefined,
          });
        } catch (err) { console.error('notify failed:', err); }
      }
      setPdfModalVisible(false);
      Alert.alert(t('common.success'), t('teacherContent.videoUploaded'));
      loadPdfFiles();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherContent.videoUploadFailed'));
    } finally {
      setPdfSaving(false);
    }
  };

  if (!isContentEnabled) {
    return <ContentLockedView />;
  }

  const albumTitle = galleries.find((g: any) => g.id === galleryViewId)?.title || '';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title="المحتوى" showBack={false} />
      {/* No-target warning banner — shown when teacher hasn't selected any class/section */}
      {targets.length > 0 && selectedTargets.length === 0 && <NoTargetsBanner />}

      {/* Multi-target picker — content + uploads scope to ALL selected targets */}
      {targets.length > 0 && (
        <TargetsBar
          targets={targets}
          selectedTargets={selectedTargets}
          onToggle={toggleSelectedTarget}
          onSelectAll={selectAllTargets}
          onClearAll={clearSelectedTargets}
        />
      )}

      {/* Sub-tabs */}
      <SubTabsBar
        tabs={SUB_TABS}
        activeTab={activeTab}
        onSelect={(tab) => {
          // Tabs that navigate to dedicated screens (voice / live)
          if ((tab as any).navTarget) {
            try { router.push((tab as any).navTarget); } catch (e) { console.error('nav failed:', e); }
            return;
          }
          setActiveTab(tab.key);
        }}
      />

      {/* Videos Tab */}
      {activeTab === 'videos' && (
        <FlashList
          data={videos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VideoCard
              item={item}
              onPlay={handlePlayVideo}
              onShowViewers={(it) => openViewers('video', it)}
              onToggleVisibility={handleToggleVideoVisibility}
              onEdit={handleOpenVideoEdit}
              onDelete={handleDeleteVideo}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <AddHeaderButton icon="cloud-upload" label="إضافة فيديو" onPress={() => setVideoModalVisible(true)} />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>لا توجد فيديوهات بعد</Text>}
        />
      )}

      {/* Exams Tab */}
      {activeTab === 'exams' && (
        <FlashList
          data={exams}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ExamCard
              item={item}
              statusColors={STATUS_COLORS}
              onOpen={handleOpenExam}
              onSchedule={handleOpenScheduleExam}
              onShowReport={handleShowReport}
              onToggleVisibility={handleToggleExamVisibility}
              onDelete={handleDeleteExam}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <AddHeaderButton icon="add-circle" label="إنشاء امتحان" onPress={() => { resetExamForm(); setExamModalVisible(true); }} />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>لا توجد امتحانات بعد</Text>}
        />
      )}

      {/* Gallery Tab */}
      {activeTab === 'gallery' && (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          <AddHeaderButton icon="add-circle" label="إنشاء ألبوم" onPress={() => setGalleryModalVisible(true)} />
          {galleries.length === 0 ? (
            <Text style={styles.emptyText}>لا توجد ألبومات بعد</Text>
          ) : (
            <View style={styles.galleryGrid}>
              {galleries.map((g: any) => (
                <View key={g.id} style={{ width: '48%' }}>
                  <GalleryCard
                    item={g}
                    onOpen={openGalleryAlbum}
                    onToggleVisibility={handleToggleGalleryVisibility}
                    onShowViewers={(it) => openViewers('gallery', it)}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Materials Tab */}
      {activeTab === 'materials' && (
        <FlashList
          data={materials}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MaterialCard
              item={item}
              onOpen={(it) => openViewers((it.type === 'pdf' ? 'pdf' : 'material'), it)}
              onLongPress={handleMaterialDeletePrompt}
              onToggleVisibility={handleToggleMaterialVisibility}
              onDelete={handleMaterialDeletePrompt}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <AddHeaderButton icon="add-circle" label="إضافة ملزمة" onPress={() => setMaterialModalVisible(true)} />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>لا توجد ملازم بعد</Text>}
        />
      )}

      {/* Homework Tab */}
      {activeTab === 'homework' && (
        <FlashList
          data={teacherTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <AddHeaderButton
              icon="add-circle"
              label="إضافة واجب"
              onPress={() => {
                setHomeworkTitle('');
                setHomeworkDescription('');
                // Preselect current class if we have one, else nothing — teacher can toggle more
                setHomeworkClassIds(selectedClassId ? [selectedClassId] : (classes.length === 1 ? [classes[0].id] : []));
                setHomeworkDueDate('');
                setHomeworkFile(null);
                setHomeworkModalVisible(true);
              }}
            />
          }
          renderItem={({ item }) => (
            <HomeworkCard
              item={item}
              onOpen={(it) => setViewingTask(it)}
              onToggleVisibility={handleToggleHomeworkVisibility}
              onDelete={handleHomeworkDeletePrompt}
            />
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>لا توجد واجبات بعد</Text>}
        />
      )}

      {/* PDFs Tab */}
      {activeTab === 'pdfs' && (
        <FlashList
          data={pdfFiles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <AddHeaderButton
              icon="cloud-upload"
              label="إضافة ملف PDF"
              onPress={() => {
                setPdfTitle('');
                setPdfClassIds(selectedClassId ? [selectedClassId] : (classes.length === 1 ? [classes[0].id] : []));
                setPdfFile(null);
                setPdfModalVisible(true);
              }}
            />
          }
          renderItem={({ item }) => (
            <PdfCard
              item={item}
              onOpen={handleOpenPdf}
              onToggleVisibility={handleTogglePdfVisibility}
              onDelete={handlePdfDeletePrompt}
            />
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>لا توجد ملفات PDF بعد</Text>}
        />
      )}

      {/* PDF Upload Modal */}
      <PdfUploadSheet
        visible={pdfModalVisible}
        onClose={() => setPdfModalVisible(false)}
        pdfTitle={pdfTitle}
        setPdfTitle={setPdfTitle}
        classes={classes}
        pdfClassIds={pdfClassIds}
        toggleClassId={togglePdfClassId}
        pdfFile={pdfFile}
        onPickFile={handlePickPdfFile}
        pdfSaving={pdfSaving}
        onUpload={handleUploadPdf}
      />

      {/* Viewers modal — shows students who opened this item */}
      <ViewersSheet
        visible={!!viewersFor}
        onClose={() => setViewersFor(null)}
        title={viewersFor?.title || ''}
        loading={loadingViewers}
        viewers={viewersList}
      />

      {/* Homework detail viewer — teacher preview (same look for student side via different screen) */}
      <HomeworkViewerSheet
        visible={!!viewingTask}
        onClose={() => setViewingTask(null)}
        task={viewingTask}
        onOpenAttachment={(url) => {
          setViewingPdfUrl(url);
          setPdfViewerVisible(true);
        }}
      />

      {/* PDF Viewer Modal */}
      <PdfViewerModal
        visible={pdfViewerVisible}
        onClose={() => setPdfViewerVisible(false)}
        pdfUrl={viewingPdfUrl}
      />

      {/* Homework Modal */}
      <HomeworkCreateSheet
        visible={homeworkModalVisible}
        onClose={() => setHomeworkModalVisible(false)}
        homeworkTitle={homeworkTitle}
        setHomeworkTitle={setHomeworkTitle}
        homeworkDescription={homeworkDescription}
        setHomeworkDescription={setHomeworkDescription}
        homeworkDueDate={homeworkDueDate}
        setHomeworkDueDate={setHomeworkDueDate}
        homeworkFile={homeworkFile}
        onPickFile={handlePickHomeworkFile}
        homeworkSaving={homeworkSaving}
        selectedTargetsCount={selectedTargets.length}
        onSave={handleSaveHomework}
      />

      {/* Video Upload Modal */}
      <VideoUploadSheet
        visible={videoModalVisible}
        onClose={() => setVideoModalVisible(false)}
        videoTitle={videoTitle}
        setVideoTitle={setVideoTitle}
        pickedFile={pickedFile}
        uploadProgress={uploadProgress}
        saving={saving}
        selectedTargetsCount={selectedTargets.length}
        onPickFile={handlePickFile}
        onUpload={handleUploadVideo}
      />

      {/* Exam Creation Modal */}
      <ExamCreateSheet
        visible={examModalVisible}
        onClose={() => setExamModalVisible(false)}
        examStep={examStep}
        setExamStep={setExamStep}
        examTitle={examTitle}
        setExamTitle={setExamTitle}
        examDuration={examDuration}
        setExamDuration={setExamDuration}
        questionTypes={QUESTION_TYPES}
        currentQuestion={currentQuestion}
        setCurrentQuestion={setCurrentQuestion}
        currentQuestionType={currentQuestionType}
        setCurrentQuestionType={setCurrentQuestionType}
        currentPoints={currentPoints}
        setCurrentPoints={setCurrentPoints}
        currentOptions={currentOptions}
        setCurrentOptions={setCurrentOptions}
        currentCorrectIndex={currentCorrectIndex}
        setCurrentCorrectIndex={setCurrentCorrectIndex}
        currentCorrectAnswer={currentCorrectAnswer}
        setCurrentCorrectAnswer={setCurrentCorrectAnswer}
        currentModelAnswer={currentModelAnswer}
        setCurrentModelAnswer={setCurrentModelAnswer}
        currentRubric={currentRubric}
        setCurrentRubric={setCurrentRubric}
        examQuestions={examQuestions}
        setExamQuestions={setExamQuestions}
        onAddQuestion={addQuestion}
        onCreate={handleCreateExam}
        saving={saving}
        onValidateStep1={() => {
          if (!examTitle.trim()) { Alert.alert(t('common.error'), t('teacherContent.enterTitle')); return; }
          setExamStep(2);
        }}
        onValidateStep2={() => {
          if (examQuestions.length === 0) { Alert.alert(t('common.error'), t('teacherContent.enterTitleAndQuestion')); return; }
          setExamStep(3);
        }}
      />

      {/* Gallery Modal */}
      <GalleryCreateSheet
        visible={galleryModalVisible}
        onClose={() => { setGalleryModalVisible(false); setGalleryCoverUri(null); }}
        galleryTitle={galleryTitle}
        setGalleryTitle={setGalleryTitle}
        galleryCoverUri={galleryCoverUri}
        onPickCover={handlePickGalleryCover}
        selectedTargetsCount={selectedTargets.length}
        saving={saving}
        onCreate={handleCreateGallery}
      />

      {/* Material Modal — with cover image picker */}
      <MaterialCreateSheet
        visible={materialModalVisible}
        onClose={() => { setMaterialModalVisible(false); setMaterialCoverUri(null); }}
        materialTitle={materialTitle}
        setMaterialTitle={setMaterialTitle}
        materialPrice={materialPrice}
        setMaterialPrice={setMaterialPrice}
        materialCoverUri={materialCoverUri}
        onPickCover={handlePickMaterialCover}
        saving={saving}
        selectedTargetsCount={selectedTargets.length}
        onCreate={handleCreateMaterial}
      />

      {/* Gallery Album View Modal — view + upload images */}
      <GalleryAlbumModal
        visible={!!galleryViewId}
        onClose={() => setGalleryViewId(null)}
        albumTitle={albumTitle}
        galleryImages={galleryImages}
        galleryUploading={galleryUploading}
        uploadProgress={uploadProgress}
        onUploadImage={handleUploadGalleryImage}
        onDeleteImage={handleDeleteGalleryImage}
      />

      {/* Video Edit Modal */}
      <VideoEditSheet
        visible={editVideoModalVisible}
        onClose={() => setEditVideoModalVisible(false)}
        title={editVideoTitle}
        setTitle={setEditVideoTitle}
        saving={saving}
        onSave={handleEditVideo}
      />

      {/* Video Player Modal */}
      <VideoPlayerModal
        visible={videoPlayerVisible}
        onClose={() => setVideoPlayerVisible(false)}
        playingVideo={playingVideo}
        embedUrl={playingVideo ? bunnyService.getEmbedUrl(playingVideo.bunny_video_id) : null}
        playUrl={playingVideo ? bunnyService.getPlayUrl(playingVideo.bunny_video_id) : null}
      />

      {/* Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        reportExam={reportExam}
        reportLoading={reportLoading}
        reportSubmissions={reportSubmissions}
        onShare={handleShareReport}
      />

      {/* Centralized confirm sheet — receives whatever destructive action
          is queued via askConfirm(). Replaces Alert.alert(...) confirms in
          materials / homework / pdfs renderers. */}
      <ConfirmSheet
        visible={confirmState.visible}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        destructive={confirmState.destructive}
        onConfirm={confirmState.onConfirm}
        onClose={closeConfirm}
      />

      {/* Exam Schedule Modal */}
      <ExamScheduleSheet
        visible={scheduleModalVisible}
        onClose={() => setScheduleModalVisible(false)}
        scheduleDate={scheduleDate}
        setScheduleDate={setScheduleDate}
        scheduleTime={scheduleTime}
        setScheduleTime={setScheduleTime}
        scheduleNotify={scheduleNotify}
        setScheduleNotify={setScheduleNotify}
        saving={saving}
        onSchedule={handleScheduleExam}
      />
    </SafeAreaView>
  );
}
