import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useTeacherStore from '../../stores/teacherStore';
import { api } from '../../services/api';
import { bunnyStorage } from '../../services/bunny';
import * as DocumentPicker from 'expo-document-picker';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { router } from 'expo-router';
import { exportAIToolOutputPDF } from '../../services/pdfExport';
import { confirmAlert } from '../../utils/alerts';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { LinearGradient } from 'expo-linear-gradient';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import ListRow from '../../components/teacher/cards/ListRow';

// ── AI Question Types ──
interface AIQuestion {
  type: 'mcq' | 'tf';
  content: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: boolean;
  points: number;
}

// ── AI Tools List (other tools stay as placeholder) ──
// Icon + gradient tone per Phase-8 spec; preserves keys/titles/descriptions verbatim.
const OTHER_TOOLS_KEYS: Array<{
  key: string;
  titleKey: string;
  descKey: string;
  icon: string;
  color: string;
  gradient: 'info' | 'success' | 'warning' | 'purple' | 'danger';
}> = [
  { key: 'lesson_plan', titleKey: 'teacher.lessonPlan', descKey: 'teacher.lessonPlanDesc', icon: 'clipboard', color: tokens.color.info, gradient: 'info' },
  { key: 'summarize', titleKey: 'teacher.summarize', descKey: 'teacher.summarizeDesc', icon: 'document-text', color: tokens.color.success, gradient: 'success' },
  { key: 'activities', titleKey: 'teacherAITools.activities', descKey: 'teacherAITools.activitiesDesc', icon: 'game-controller', color: tokens.color.warning, gradient: 'warning' },
  { key: 'translate', titleKey: 'teacherAITools.translate', descKey: 'teacherAITools.translateDesc', icon: 'language', color: tokens.color.purple, gradient: 'purple' },
  { key: 'report', titleKey: 'teacherAITools.report', descKey: 'teacherAITools.reportDesc', icon: 'stats-chart', color: tokens.color.danger, gradient: 'danger' },
];

export default function TeacherAITools() {
  const { userId, userName } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { t } = useTranslation();
  const { classes } = useTeacherStore();
  const isEnabled = useFeatureFlag('ai_teacher_assistant');
  const OTHER_TOOLS = OTHER_TOOLS_KEYS.map(tool => ({ ...tool, title: t(tool.titleKey), desc: t(tool.descKey) }));
  const [loadingTool, setLoadingTool] = useState<string | null>(null);
  const [toolResult, setToolResult] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [showToolInput, setShowToolInput] = useState(false);
  const [toolInputText, setToolInputText] = useState('');
  const [pendingToolKey, setPendingToolKey] = useState('');
  const [currentToolKey, setCurrentToolKey] = useState('');
  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyToolKey, setHistoryToolKey] = useState('');
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  // Subjects constrain AI: every callAIProxy passes these so the model stays in-curriculum.
  const [teacherSubjects, setTeacherSubjects] = useState<string[]>([]);
  useEffect(() => {
    if (!userId) return;
    api.getTeacherSubjectNames(userId)
      .then(setTeacherSubjects)
      .catch(() => setTeacherSubjects([]));
  }, [userId]);

  // ── AI Exam Generator State ──
  const [showExamGen, setShowExamGen] = useState(false);
  const [pdfList, setPdfList] = useState<any[]>([]);
  const [loadingPdfs, setLoadingPdfs] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<AIQuestion[]>([]);
  const [examTitle, setExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('30');
  // Real teacher assignments (sections the teacher actually teaches)
  const [teacherTargets, setTeacherTargets] = useState<any[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  // Multi-select of targets (by assignment_id)
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [showDifficultyPicker, setShowDifficultyPicker] = useState(false);
  // On-screen status banner (replaces Alert.alert reliance which is unreliable on web)
  const [statusBanner, setStatusBanner] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null);
  // ConfirmSheet state for destructive delete confirmations (history + PDF).
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'history'; item: any }
    | { kind: 'pdf'; item: any }
    | null
  >(null);

  // Load PDFs + teacher's real assignments when exam generator opens
  useEffect(() => {
    if (showExamGen && userId) {
      setLoadingPdfs(true);
      api.getPdfMaterials(userId, undefined, userInstituteId || undefined).then(data => {
        setPdfList(data || []);
        setLoadingPdfs(false);
      }).catch(() => setLoadingPdfs(false));

      setLoadingTargets(true);
      api.getTeacherAssignmentsResolved(userId).then(data => {
        setTeacherTargets(data || []);
        setLoadingTargets(false);
      }).catch(() => setLoadingTargets(false));
    }
  }, [showExamGen, userId]);

  const handleOtherTool = async (toolKey: string) => {
    if (!userId) {
      Alert.alert(t('common.error'), t('student.pleaseLogin'));
      return;
    }
    let allowed = true;
    try { allowed = await api.checkAIRateLimit(userId, 'teacher_assistant', 30); } catch {}
    if (!allowed) { Alert.alert(t('teacherAITools.usageLimit'), t('teacherAITools.usageLimitReached')); return; }

    // Open input modal (don't block on instituteId — it'll be checked at execute time)
    setPendingToolKey(toolKey);
    setToolInputText('');
    setShowToolInput(true);
  };

  const executeToolWithInput = async () => {
    if (!toolInputText.trim()) return;
    if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); return; }
    setShowToolInput(false);
    const toolKey = pendingToolKey;
    setLoadingTool(toolKey);
    try {
      if (userInstituteId) {
        await api.logAIUsage(userId, userInstituteId, 'teacher_assistant');
      }

      const prompts: Record<string, string> = {
        lesson_plan: `أنت خبير تربوي عراقي. ولّد خطة درس مفصّلة بالعربية للموضوع التالي: "${toolInputText}"\n\nتتضمن: الأهداف، المقدمة، العرض، التقويم، الواجب البيتي. بتنسيق واضح.`,
        summarize: `لخّص النص التالي بالعربية لنقاط رئيسية مرقّمة:\n\n"${toolInputText}"`,
        activities: `اقترح 5 أنشطة تفاعلية ممتعة بالعربية لصف دراسي حول الموضوع: "${toolInputText}"\n\nكل نشاط يتضمن: الاسم، الوصف، المدة، المواد المطلوبة.`,
        translate: `ترجم النص التالي من العربية للإنكليزية بشكل تعليمي واضح:\n\n"${toolInputText}"`,
        report: `أنت معلم خبير. اكتب تقرير أداء أكاديمي بالعربية عن: "${toolInputText}"\n\nيتضمن: نقاط القوة، نقاط الضعف، التوصيات، الملاحظات العامة.`,
      };

      const { callAIProxy } = await import('../../services/api');
      const result = await callAIProxy(prompts[toolKey] || toolInputText, userId, toolKey, undefined, teacherSubjects);

      if (result) {
        setToolResult(result);
        setShowResult(true);
        setCurrentToolKey(toolKey);
        // Save to history (best-effort; won't block UI)
        api.saveAIToolOutput(userId, userInstituteId || null, toolKey, toolInputText.slice(0, 80), toolInputText, result)
          .catch((e: any) => console.warn('[ai-tools] saveOutput failed:', e?.message));
      } else {
        Alert.alert(t('common.error'), 'لم يتم الحصول على نتيجة');
      }
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setLoadingTool(null);
    }
  };

  // ── History open/load ──
  const openHistory = async (toolKey: string) => {
    if (!userId) return;
    setHistoryToolKey(toolKey);
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const rows = await api.getAIToolOutputs(userId, toolKey);
      setHistoryList((rows as any) || []);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل تحميل السجل');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistoryItem = (item: any) => {
    setToolResult(item.output_text);
    setCurrentToolKey(item.tool_key);
    setShowHistory(false);
    setShowResult(true);
  };

  const handleDeleteHistoryItem = (item: any) => {
    if (!userId) return;
    setPendingDelete({ kind: 'history', item });
  };

  const performHistoryDelete = async (item: any) => {
    if (!userId) return;
    try {
      await api.deleteAIToolOutput(item.id, userId);
      setHistoryList(prev => prev.filter(p => p.id !== item.id));
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل الحذف');
    }
  };

  const toolDisplayName = (key: string): string => {
    const map: Record<string, string> = {
      lesson_plan: t('teacher.lessonPlan', { defaultValue: 'خطة درس' }),
      summarize: t('teacher.summarize', { defaultValue: 'تلخيص نص' }),
      activities: t('teacherAITools.activities', { defaultValue: 'اقتراح أنشطة' }),
      translate: t('teacherAITools.translate', { defaultValue: 'ترجمة محتوى' }),
      report: t('teacherAITools.report', { defaultValue: 'تقرير أداء' }),
    };
    return map[key] || key;
  };

  const handleExportResultPDF = async () => {
    if (!toolResult) return;
    setSavingPdf(true);
    try {
      await exportAIToolOutputPDF({
        title: `${toolDisplayName(currentToolKey)} — ${new Date().toLocaleDateString('ar-IQ')}`,
        toolName: toolDisplayName(currentToolKey),
        outputText: toolResult,
        teacherName: userName || '',
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل حفظ PDF');
    } finally {
      setSavingPdf(false);
    }
  };

  // ── Pick & upload a fresh PDF inline (no need to go to Content page) ──
  const handlePickAndUploadPdf = async () => {
    if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); return; }
    if (!bunnyStorage.isConfigured()) {
      Alert.alert(t('common.error'), t('teacherAITools.storageNotConfigured', { defaultValue: 'خزان الملفات غير مهيّأ. تواصل مع المدير.' }));
      return;
    }
    let picked;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل فتح منتقي الملفات');
      return;
    }
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    // Sanitize filename — remove Arabic/special chars that break Bunny paths
    const safeName = (asset.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
    const title = (asset.name || 'document.pdf').replace(/\.pdf$/i, '');
    setUploadingPdf(true);
    try {
      const remotePath = `pdfs/${userId}/${Date.now()}_${safeName}`;
      const pdfUrl = await bunnyStorage.uploadFile(asset.uri, remotePath);

      // DB save — if this fails we still want the PDF usable for this session
      let saved: any = null;
      let dbError: string | null = null;
      try {
        saved = await api.createPdfMaterial(title, pdfUrl, userId, userInstituteId || '');
      } catch (err: any) {
        dbError = err?.message || String(err);
      }

      const newItem = saved || {
        id: `local_${Date.now()}`,
        title,
        cover_url: pdfUrl,
        teacher_id: userId,
        type: 'pdf',
        created_at: new Date().toISOString(),
        _localOnly: !saved,
      };

      // Insert at top of local list immediately
      setPdfList(prev => [newItem, ...prev.filter(p => p.id !== newItem.id)]);
      setSelectedPdf(newItem);

      if (dbError) {
        Alert.alert(
          t('common.warning', { defaultValue: 'تنبيه' }),
          `تم رفع الملف لكن فشل حفظه في قاعدة البيانات. الملف قابل للاستخدام الآن فقط.\n\nالسبب: ${dbError.slice(0, 200)}`
        );
      } else {
        Alert.alert(
          t('common.success'),
          t('teacherAITools.pdfUploadedAutoSelect', { defaultValue: 'تم رفع الـ PDF وتحديده. اضغط "توليد" للمتابعة.' })
        );
      }
    } catch (err: any) {
      Alert.alert(
        t('common.error'),
        (err?.message || 'فشل رفع الملف') + '\n\nالتفاصيل: ' + (err?.toString?.() || '').slice(0, 200)
      );
    } finally {
      setUploadingPdf(false);
    }
  };

  // ── Delete a PDF from the list (and from DB if not local-only) ──
  const handleDeletePdf = async (pdf: any) => {
    if (!userId) return;
    setPendingDelete({ kind: 'pdf', item: pdf });
  };

  const performPdfDelete = async (pdf: any) => {
    if (!userId) return;
    try {
      if (!pdf._localOnly && pdf.id && !String(pdf.id).startsWith('local_')) {
        await api.deletePdfMaterial(pdf.id, userId);
      }
      setPdfList(prev => prev.filter(p => p.id !== pdf.id));
      if (selectedPdf?.id === pdf.id) setSelectedPdf(null);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل الحذف');
    }
  };

  // ── AI Generate Questions from PDF (with difficulty level) ──
  const handleGenerateFromPdf = async (difficulty: 'easy' | 'medium' | 'hard') => {
    if (!selectedPdf) { Alert.alert(t('common.error'), t('teacherAITools.selectPdfFirst', { defaultValue: 'اختر ملف PDF أولاً' })); return; }
    if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); return; }
    const pdfUrl: string | undefined = selectedPdf.cover_url || selectedPdf.file_url;
    if (!pdfUrl) {
      Alert.alert(t('common.error'), t('teacherAITools.pdfUrlMissing', { defaultValue: 'رابط ملف الـ PDF غير متوفر' }));
      return;
    }
    setGenerating(true);
    try {
      if (userInstituteId) {
        await api.logAIUsage(userId, userInstituteId, 'teacher_assistant');
      }

      const difficultyLabel = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' }[difficulty];
      const difficultyGuidance = {
        easy: 'أسئلة بسيطة مباشرة، تتطلب استدعاء معلومة واضحة من النص.',
        medium: 'أسئلة تتطلب فهم وربط بين مفاهيم من النص.',
        hard: 'أسئلة تحليلية وتطبيقية تتطلب تفكير عميق وربط بين أكثر من فكرة.',
      }[difficulty];

      const prompt = `أنت خبير تعليمي. اقرأ محتوى ملف الـ PDF المرفق بعناية، ثم ولّد 10 أسئلة امتحانية من المادة.

المادة: "${selectedPdf.title}"
مستوى الصعوبة: ${difficultyLabel}
توجيه: ${difficultyGuidance}

المطلوب: ولّد 10 أسئلة بالعربية مستخرجة فعلاً من محتوى هذا الـ PDF تحديداً (لا تبتكر معلومات خارجية). 7 اختيار من متعدد (4 خيارات) و 3 صح/خطأ. جميع الأسئلة بمستوى "${difficultyLabel}".

أجب بصيغة JSON فقط، بدون أي نص إضافي:
{"questions": [
  {"type": "mcq", "content": "نص السؤال", "options": ["خيار1", "خيار2", "خيار3", "خيار4"], "correctIndex": 0, "points": 10},
  {"type": "tf", "content": "نص السؤال", "correctAnswer": true, "points": 5}
]}`;

      let result: { questions?: AIQuestion[] } | null = null;

      const { callAIProxy } = await import('../../services/api');
      // Attempt up to 2 times for transient JSON-shape failures
      let aiText = '';
      for (let attempt = 1; attempt <= 2; attempt++) {
        aiText = await callAIProxy(prompt, userId, 'quiz', pdfUrl, teacherSubjects);
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { result = JSON.parse(jsonMatch[0]); } catch { result = null; }
        }
        if (result?.questions?.length) break;
      }

      if (!result || !result.questions || result.questions.length === 0) {
        throw new Error(t('teacherAITools.generateFailed'));
      }

      setAiQuestions((result.questions || []).map(q => ({ ...q, points: q.points || 10 })));
      setExamTitle(`${t('teacherAITools.examTitle')}: ${selectedPdf.title}`);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherAITools.generateFailed'));
    } finally {
      setGenerating(false);
    }
  };

  // ── Update question points ──
  const updateQuestionPoints = (index: number, points: number) => {
    setAiQuestions(prev => prev.map((q, i) => i === index ? { ...q, points: Math.max(1, points) } : q));
  };

  // ── Remove question ──
  const removeQuestion = (index: number) => {
    setAiQuestions(prev => prev.filter((_, i) => i !== index));
  };

  // ── Send as Exam (one exam row per selected target section/class) ──
  const handleSendAsExam = async () => {
    if (__DEV__) console.log('[handleSendAsExam] START', { examTitle, selectedTargetIds, aiQuestionsCount: aiQuestions.length, userId, userInstituteId, examDuration });

    // Validation — each failure shows BOTH alert AND banner so user sees it
    if (!examTitle.trim()) {
      console.warn('[handleSendAsExam] blocked: no title');
      setStatusBanner({ type: 'error', text: 'اكتب عنوان الامتحان أولاً' });
      return;
    }
    if (selectedTargetIds.length === 0) {
      console.warn('[handleSendAsExam] blocked: no target selected');
      setStatusBanner({ type: 'error', text: 'اختر شعبة واحدة على الأقل (خانات خضراء فوق)' });
      return;
    }
    if (aiQuestions.length === 0) {
      setStatusBanner({ type: 'error', text: 'لا توجد أسئلة' });
      return;
    }
    if (!userId) {
      setStatusBanner({ type: 'error', text: 'يرجى تسجيل الدخول' });
      return;
    }
    if (!userInstituteId) {
      setStatusBanner({ type: 'error', text: 'بيانات المؤسسة لم تُحمَّل — أعد فتح التطبيق' });
      return;
    }

    const duration = parseInt(examDuration);
    if (isNaN(duration) || duration < 1) {
      setStatusBanner({ type: 'error', text: 'أدخل مدة امتحان صحيحة (بالدقائق)' });
      return;
    }

    setSending(true);
    setStatusBanner({ type: 'info', text: 'جاري إنشاء الامتحان...' });
    try {
      const totalPoints = aiQuestions.reduce((sum, q) => sum + q.points, 0);
      const examQuestions = aiQuestions.map((q, i) => ({
        type: q.type === 'mcq' ? 'mcq' : 'tf',
        content: q.content,
        options: q.type === 'mcq' ? q.options : [t('teacherAssignments.true'), t('teacherAssignments.false')],
        correctIndex: q.type === 'mcq' ? q.correctIndex : (q.correctAnswer ? 0 : 1),
        correctAnswer: q.type === 'tf' ? q.correctAnswer : undefined,
        points: q.points,
        order: i,
      }));

      const targets = teacherTargets.filter(x => selectedTargetIds.includes(x.assignment_id));
      if (__DEV__) console.log('[handleSendAsExam] targets:', targets.map(x => ({ class_id: x.class_id, section_id: x.section_id, name: x.display_name })));

      let created = 0;
      const errors: string[] = [];
      let firstExamId: string | null = null;
      for (const tgt of targets) {
        try {
          const ex = await api.createExam(
            examTitle.trim(), userId, tgt.class_id || null,
            userInstituteId, examQuestions, totalPoints, duration, 'active',
            tgt.section_id || null,
          );
          if (__DEV__) console.log('[handleSendAsExam] exam created:', ex?.id, 'for', tgt.display_name);
          if (!firstExamId) firstExamId = ex?.id || null;
          created++;
        } catch (e: any) {
          console.error('[handleSendAsExam] createExam failed for', tgt.display_name, ':', e?.message);
          errors.push(`${tgt.display_name}: ${e?.message || 'failed'}`);
        }
      }

      if (created === 0) {
        const msg = 'فشل إنشاء الامتحان في جميع الشعب.\n' + errors.join('\n');
        setStatusBanner({ type: 'error', text: msg });
        throw new Error(msg);
      }

      // Partial failure — keep form filled so teacher can retry failed targets
      if (errors.length > 0) {
        const failedNames = errors.map(e => e.split(':')[0]).join('، ');
        setStatusBanner({
          type: 'error',
          text: `نجح ${created} / ${targets.length} — فشلت: ${failedNames}. (الفورم محفوظ لإعادة المحاولة)`,
        });
        // Keep form intact (don't clear aiQuestions/examTitle)
        // Remove only the successful targets from selection so user can retry only the failed ones
        const successIds = targets
          .filter(t => !errors.some(e => e.startsWith(t.display_name + ':')))
          .map(t => t.assignment_id);
        setSelectedTargetIds(prev => prev.filter(id => !successIds.includes(id)));
        return; // skip form reset + navigation
      }

      // Notify ONLY the students in the targeted sections/classes (not a broadcast)
      try {
        const classIds = targets.map(t => t.class_id).filter(Boolean) as string[];
        const sectionIds = targets.map(t => t.section_id).filter(Boolean) as string[];
        const notifyResult = await api.notifyStudentsInClasses({
          classIds: classIds.length ? classIds : undefined,
          sectionIds: sectionIds.length ? sectionIds : undefined,
          title: t('teacherAITools.newExamTitle', { defaultValue: 'امتحان جديد' }),
          message: examTitle.trim(),
          type: 'exam',
          senderId: userId,
          senderRole: 'teacher',
          instituteId: userInstituteId,
        });
        if (__DEV__) console.log('[handleSendAsExam] notified', notifyResult?.sent, 'students');
      } catch (pushErr) {
        console.warn('[handleSendAsExam] notify failed (non-critical):', pushErr);
      }

      // Success banner then auto-navigate to live dashboard (don't wait on Alert dismiss)
      setStatusBanner({ type: 'success', text: `تم إنشاء الامتحان في ${created} شعبة. جاري فتح اللوحة المباشرة...` });

      // Reset form
      setAiQuestions([]);
      setSelectedPdf(null);
      setExamTitle('');
      setExamDuration('30');
      setSelectedTargetIds([]);

      // Small delay so user sees the success banner, then navigate
      setTimeout(() => {
        setShowExamGen(false);
        setStatusBanner(null);
        try { router.push('/(teacher)/exams'); } catch (e) { console.error('navigation error:', e); }
      }, 1500);
    } catch (err: any) {
      Alert.alert(
        t('common.error'),
        (err?.message || t('teacherAITools.examCreateFailed')) + '\n\nالتفاصيل: ' + (err?.toString?.() || '').slice(0, 200)
      );
    } finally {
      setSending(false);
    }
  };

  // ── Feature flag guard ──
  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <TeacherInnerHero title={t('teacherAITools.smartAssistant')} fallbackRoute="/(teacher)/services" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="lock-closed" size={48} color={tokens.color.text4} />
          <Text style={{ fontSize: 16, color: tokens.color.text2, marginTop: 12, fontWeight: '700' }}>
            {t('teacher.featureDisabled', { defaultValue: 'هذه الميزة غير مفعّلة' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════
  // ── AI Exam Generator Flow ──
  // ══════════════════════════════════════════════
  if (showExamGen) {
    // Step 3: Review & Send
    if (aiQuestions.length > 0) {
      const totalPoints = aiQuestions.reduce((sum, q) => sum + q.points, 0);
      return (
        <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {/* Header */}
            <View style={s.genHeader}>
              <TouchableOpacity
                onPress={() => {
                  confirmAlert(
                    'تنبيه',
                    `سيتم حذف ${aiQuestions.length} سؤال مولّد. هل أنت متأكد؟`,
                    () => setAiQuestions([]),
                    true
                  );
                }}
                style={s.backBtn}
              >
                <Ionicons name="arrow-forward" size={20} color={Colors.text} />
              </TouchableOpacity>
              <Text style={s.genHeaderTitle}>{t('teacherAITools.reviewQuestions')}</Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted }}>{aiQuestions.length} {t('teacherAITools.question')} • {totalPoints} {t('teacherAssignments.points')}</Text>
            </View>

            {/* On-screen status banner — reliable feedback (Alert.alert can be blocked on web) */}
            {statusBanner && (
              <View style={{
                paddingHorizontal: 16, paddingVertical: 12,
                backgroundColor: statusBanner.type === 'success' ? '#D1FAE5' : statusBanner.type === 'error' ? '#FEE2E2' : '#DBEAFE',
                borderBottomWidth: 1,
                borderBottomColor: statusBanner.type === 'success' ? '#10B981' : statusBanner.type === 'error' ? '#DC2626' : '#3B82F6',
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Ionicons
                  name={statusBanner.type === 'success' ? 'checkmark-circle' : statusBanner.type === 'error' ? 'alert-circle' : 'information-circle'}
                  size={18}
                  color={statusBanner.type === 'success' ? '#10B981' : statusBanner.type === 'error' ? '#DC2626' : '#3B82F6'}
                />
                <Text style={{
                  flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'right',
                  color: statusBanner.type === 'success' ? '#065F46' : statusBanner.type === 'error' ? '#991B1B' : '#1E40AF',
                }}>{statusBanner.text}</Text>
                <TouchableOpacity onPress={() => setStatusBanner(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 200 }}>
              {/* Exam Title */}
              <TextInput
                style={s.input}
                placeholder={t('teacherAITools.examTitle')}
                placeholderTextColor={Colors.textMuted}
                value={examTitle}
                onChangeText={setExamTitle}
                textAlign="right"
              />

              {/* Duration */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={t('teacherAITools.durationMinutes')}
                  placeholderTextColor={Colors.textMuted}
                  value={examDuration}
                  onChangeText={setExamDuration}
                  keyboardType="numeric"
                  textAlign="right"
                />
                <Ionicons name="time-outline" size={20} color={Colors.textMuted} />
              </View>

              {/* Multi-target picker (real teacher assignments) */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 6, marginTop: 4 }}>
                {t('teacherAITools.selectTargets', { defaultValue: 'اختر الشعب (اختيار متعدد)' })}
              </Text>
              {loadingTargets ? (
                <ActivityIndicator color={Colors.primary} style={{ marginVertical: 8 }} />
              ) : teacherTargets.length === 0 ? (
                <View style={{ backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: '#92400E', textAlign: 'right', lineHeight: 20 }}>
                    {t('teacherAITools.noAssignments', { defaultValue: 'ما عندك أي تعيين بعد. راجع إدارة المستخدمين وأضف شعبة/مادة للأستاذ.' })}
                  </Text>
                </View>
              ) : (
                <View style={{ marginBottom: 14, gap: 6 }}>
                  {teacherTargets.map(tgt => {
                    const active = selectedTargetIds.includes(tgt.assignment_id);
                    return (
                      <TouchableOpacity
                        key={tgt.assignment_id}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: active ? '#ECFDF5' : '#F8FAFC', borderWidth: 1.5, borderColor: active ? '#059669' : '#E2E8F0' }}
                        onPress={() => setSelectedTargetIds(prev => prev.includes(tgt.assignment_id) ? prev.filter(id => id !== tgt.assignment_id) : [...prev, tgt.assignment_id])}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={active ? '#059669' : '#CBD5E1'} />
                        <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.text }}>{tgt.display_name}</Text>
                          {tgt.subject_name && (
                            <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>{tgt.subject_name}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Questions List */}
              {aiQuestions.map((q, idx) => (
                <View key={idx} style={s.questionCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => removeQuestion(idx)}>
                      <Ionicons name="close-circle" size={22} color={Colors.error} />
                    </TouchableOpacity>
                    <View style={[s.typeBadge, { backgroundColor: q.type === 'mcq' ? '#EEF2FF' : '#FFF7ED' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: q.type === 'mcq' ? '#4F46E5' : '#B45309' }}>
                        {q.type === 'mcq' ? t('teacherAITools.multipleChoice') : t('teacherAITools.trueFalseType')}
                      </Text>
                    </View>
                  </View>

                  <Text style={s.questionText}>{q.content}</Text>

                  {q.type === 'mcq' && q.options && (
                    <View style={{ marginTop: 8, gap: 4 }}>
                      {q.options.map((opt, oi) => (
                        <View key={oi} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 12, color: oi === q.correctIndex ? '#059669' : Colors.textMuted, fontWeight: oi === q.correctIndex ? '800' : '600', flex: 1, textAlign: 'right' }}>
                            {opt}
                          </Text>
                          <Ionicons
                            name={oi === q.correctIndex ? 'checkmark-circle' : 'ellipse-outline'}
                            size={16}
                            color={oi === q.correctIndex ? '#059669' : '#CBD5E1'}
                          />
                        </View>
                      ))}
                    </View>
                  )}

                  {q.type === 'tf' && (
                    <Text style={{ fontSize: 12, color: '#059669', fontWeight: '800', textAlign: 'right', marginTop: 6 }}>
                      {t('teacherAITools.answer')}: {q.correctAnswer ? t('teacherAssignments.true') : t('teacherAssignments.false')}
                    </Text>
                  )}

                  {/* Points Editor */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
                    <TouchableOpacity onPress={() => updateQuestionPoints(idx, q.points - 1)} style={s.pointBtn}>
                      <Ionicons name="remove" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: Colors.primary, minWidth: 30, textAlign: 'center' }}>{q.points}</Text>
                    <TouchableOpacity onPress={() => updateQuestionPoints(idx, q.points + 1)} style={s.pointBtn}>
                      <Ionicons name="add" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 12, color: Colors.textMuted }}>{t('teacherAssignments.score')}:</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Send Button */}
            <View style={s.bottomBar}>
              <TouchableOpacity style={[s.sendExamBtn, sending && { opacity: 0.6 }]} onPress={handleSendAsExam} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={s.sendExamBtnText}>{t('teacherAITools.createExam', { points: totalPoints, duration: examDuration })}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

          </KeyboardAvoidingView>
        </SafeAreaView>
      );
    }

    // Step 2: Select PDF & Generate
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <View style={s.genHeader}>
          <TouchableOpacity onPress={() => { setShowExamGen(false); setSelectedPdf(null); }} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={s.genHeaderTitle}>{t('teacherAITools.generateFromContent')}</Text>
          <Ionicons name="sparkles" size={20} color="#7C3AED" />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {/* Helper card — explains the 3-step flow */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: tokens.color.purpleBg, borderRadius: tokens.radius.lg,
            padding: 12, marginBottom: 14,
            borderWidth: 1, borderColor: tokens.color.purple + '30',
          }}>
            <Ionicons name="information-circle" size={18} color={tokens.color.purple} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: Colors.text, fontWeight: '800', textAlign: 'right', marginBottom: 4 }}>
                خطوات سريعة
              </Text>
              <Text style={{ fontSize: 11, color: Colors.textSecondary, textAlign: 'right', lineHeight: 18 }}>
                1) ارفع/اختر ملف PDF  •  2) اختر الصعوبة  •  3) راجع الأسئلة وأرسلها كامتحان
              </Text>
            </View>
          </View>

          {/* Inline upload — pick a fresh PDF without leaving this screen */}
          <TouchableOpacity
            style={[s.uploadPdfBtn, uploadingPdf && { opacity: 0.6 }]}
            onPress={handlePickAndUploadPdf}
            disabled={uploadingPdf}
            activeOpacity={0.7}
          >
            {uploadingPdf ? (
              <ActivityIndicator color="#7C3AED" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="#7C3AED" />
                <Text style={s.uploadPdfBtnText}>
                  {t('teacherAITools.uploadPdfInline', { defaultValue: 'رفع ملف PDF جديد' })}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {loadingPdfs ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : pdfList.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 10 }}>
              <View style={{
                width: 76, height: 76, borderRadius: 38,
                backgroundColor: tokens.color.purpleBg,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 4,
              }}>
                <Ionicons name="document-text-outline" size={36} color={tokens.color.purple} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'center' }}>
                لا توجد ملفات PDF بعد
              </Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 }}>
                ارفع ملف PDF فوق ليبدأ AI بتحليله وتوليد أسئلة منه
              </Text>
            </View>
          ) : (
            pdfList.map(pdf => (
              <TouchableOpacity
                key={pdf.id}
                style={[s.pdfCard, selectedPdf?.id === pdf.id && s.pdfCardSelected]}
                onPress={() => setSelectedPdf(pdf)}
                activeOpacity={0.7}
              >
                <TouchableOpacity
                  onPress={() => handleDeletePdf(pdf)}
                  style={{ padding: 4, marginRight: 4 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                </TouchableOpacity>
                <Ionicons name="document-attach" size={28} color={selectedPdf?.id === pdf.id ? '#7C3AED' : '#EF4444'} />
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={s.pdfTitle}>{pdf.title}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right' }}>
                    {new Date(pdf.created_at).toLocaleDateString('ar-IQ')}
                  </Text>
                </View>
                {selectedPdf?.id === pdf.id && <Ionicons name="checkmark-circle" size={22} color="#7C3AED" />}
              </TouchableOpacity>
            ))
          )}

          {selectedPdf && (
            <TouchableOpacity
              style={[s.generateBtn, generating && { opacity: 0.6 }]}
              onPress={() => setShowDifficultyPicker(true)}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={s.generateBtnText}>{t('teacherAITools.generateFrom', { title: selectedPdf.title })}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Difficulty picker sheet */}
        <SwipeableSheet
          visible={showDifficultyPicker}
          onClose={() => setShowDifficultyPicker(false)}
          maxHeight={0.55}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 6 }}>
              {t('teacherAITools.chooseDifficulty', { defaultValue: 'اختر مستوى الصعوبة' })}
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginBottom: 16 }}>
              {t('teacherAITools.chooseDifficultyDesc', { defaultValue: 'الأسئلة ستُولّد من محتوى الملف المختار فقط' })}
            </Text>

            {([
              { key: 'easy', label: 'سهلة', color: '#10B981', icon: 'happy-outline', desc: 'أسئلة مباشرة من النص' },
              { key: 'medium', label: 'متوسطة', color: '#F59E0B', icon: 'bulb-outline', desc: 'فهم وربط بين مفاهيم' },
              { key: 'hard', label: 'صعبة', color: '#EF4444', icon: 'flame-outline', desc: 'تحليل وتطبيق عميق' },
            ] as const).map(lvl => (
              <TouchableOpacity
                key={lvl.key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#F8FAFC', marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}
                onPress={() => {
                  setShowDifficultyPicker(false);
                  handleGenerateFromPdf(lvl.key);
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.text }}>{lvl.label}</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>{lvl.desc}</Text>
                </View>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${lvl.color}15`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={lvl.icon as any} size={22} color={lvl.color} />
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity onPress={() => setShowDifficultyPicker(false)} style={{ marginTop: 8, alignSelf: 'center', paddingVertical: 8 }}>
              <Text style={{ color: Colors.textMuted, fontWeight: '700' }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </SwipeableSheet>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════
  // ── Main Tools List ──
  // ══════════════════════════════════════════════
  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title={t('teacherAITools.smartAssistant')} fallbackRoute="/(teacher)/services" />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Intro card — pink gradient hero w/ sparkle accent. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <LinearGradient
            colors={tokens.gradient.pink}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.introCard}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.introTitle}>مساعدك في التحضير</Text>
              <Text style={s.introSubtitle}>6 أدوات</Text>
              <Text style={s.introDesc} numberOfLines={2}>
                {t('teacherAITools.smartAssistantDesc')}
              </Text>
            </View>
            <View style={s.introSparkle}>
              <Ionicons name="sparkles" size={22} color="#fff" />
            </View>
          </LinearGradient>

          {teacherSubjects.length > 0 && (
            <View style={{
              flexDirection: 'row', alignSelf: 'flex-end', marginTop: 10, marginBottom: 6,
              backgroundColor: tokens.color.infoBg, borderColor: '#7DD3FC', borderWidth: 1,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: tokens.radius.pill,
              alignItems: 'center', gap: 4,
            }}>
              <Ionicons name="lock-closed" size={10} color={tokens.color.info} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: tokens.color.info }}>
                مقيّد بـ: {teacherSubjects.join('، ')}
              </Text>
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          {/* AI Exam Generator — مولّد أسئلة (purple). */}
          <ListRow
            icon="help-circle"
            iconGradient="purple"
            title={t('teacherAITools.generateExamFromPdf')}
            subtitle={t('teacherAITools.generateExamFromPdfDesc')}
            onPress={() => setShowExamGen(true)}
          />

          {/* Other Tools — tap opens tool-specific input sheet. */}
          {OTHER_TOOLS.map(tool => (
            <View key={tool.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ flex: 1 }}>
                <ListRow
                  icon={tool.icon as any}
                  iconGradient={tool.gradient}
                  title={tool.title}
                  subtitle={tool.desc}
                  onPress={() => handleOtherTool(tool.key)}
                />
              </View>
              {/* History affordance kept beside each tool row. */}
              <TouchableOpacity
                onPress={() => openHistory(tool.key)}
                style={{
                  width: 40, height: 40, borderRadius: tokens.radius.md,
                  backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border2,
                  alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                }}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityLabel="السجل"
              >
                <Ionicons name="time-outline" size={18} color={tokens.color.text3} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
      {/* AI Input Sheet */}
      <SwipeableSheet
        visible={showToolInput}
        onClose={() => setShowToolInput(false)}
        maxHeight={0.85}
        overlayTapDisabled={!!loadingTool}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 4 }}>
              {{ lesson_plan: 'خطة درس', summarize: 'تلخيص نص', activities: 'اقتراح أنشطة', translate: 'ترجمة محتوى', report: 'تقرير أداء' }[pendingToolKey] || 'أداة AI'}
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginBottom: 12 }}>
              {{ lesson_plan: 'اكتب الموضوع أو المادة', summarize: 'الصق النص المراد تلخيصه', activities: 'اكتب الموضوع', translate: 'الصق النص المراد ترجمته', report: 'اكتب اسم الطالب أو الصف' }[pendingToolKey] || 'اكتب طلبك'}
            </Text>
            <TextInput
              style={{ backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: Colors.text, textAlign: 'right', borderWidth: 1, borderColor: '#E2E8F0', minHeight: 120, textAlignVertical: 'top' }}
              value={toolInputText}
              onChangeText={setToolInputText}
              placeholder="اكتب هنا..."
              placeholderTextColor={Colors.textMuted}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' }}
                onPress={() => setShowToolInput(false)}
                disabled={!!loadingTool}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textMuted }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#7C3AED', alignItems: 'center', opacity: toolInputText.trim() && !loadingTool ? 1 : 0.4 }}
                onPress={executeToolWithInput}
                disabled={!toolInputText.trim() || !!loadingTool}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>🤖 توليد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SwipeableSheet>

      {/* AI Result Modal */}
      <SwipeableSheet visible={showResult} onClose={() => { setShowResult(false); setToolResult(''); }} maxHeight={0.9} minHeight={0.5}>
        <View style={{ padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity onPress={() => { setShowResult(false); setToolResult(''); }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text }}>
                {currentToolKey ? toolDisplayName(currentToolKey) : t('teacherAITools.aiResult', { defaultValue: 'نتيجة AI' })}
              </Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
              <Text style={{ fontSize: 14, color: Colors.text, lineHeight: 26, textAlign: 'right' }}>{toolResult}</Text>
            </ScrollView>
            {/* Floating save-as-PDF button */}
            <TouchableOpacity
              style={{ position: 'absolute', left: 16, right: 16, bottom: 16, backgroundColor: '#059669', paddingVertical: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: savingPdf ? 0.6 : 1 }}
              onPress={handleExportResultPDF}
              disabled={savingPdf}
            >
              {savingPdf ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>
                    {t('teacherAITools.savePdf', { defaultValue: 'حفظ PDF' })}
                  </Text>
                </>
              )}
            </TouchableOpacity>
        </View>
      </SwipeableSheet>

      {/* AI History Modal */}
      <SwipeableSheet visible={showHistory} onClose={() => setShowHistory(false)} maxHeight={0.9} minHeight={0.5}>
        <View style={{ padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text }}>
                {t('teacherAITools.history', { defaultValue: 'السجل' })} — {toolDisplayName(historyToolKey)}
              </Text>
            </View>
            {loadingHistory ? (
              <ActivityIndicator style={{ marginTop: 40 }} size="large" color={Colors.primary} />
            ) : historyList.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 10 }}>
                <View style={{
                  width: 76, height: 76, borderRadius: 38,
                  backgroundColor: tokens.color.purpleBg,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 4,
                }}>
                  <Ionicons name="time-outline" size={36} color={tokens.color.purple} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'center' }}>
                  لا يوجد تاريخ بعد
                </Text>
                <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
                  لمّا تستخدم "{toolDisplayName(historyToolKey)}" أول مرة، النتائج راح تنحفظ هنا تلقائياً للرجوع لها لاحقاً.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {historyList.map(item => {
                  const dateStr = `${new Date(item.created_at).toLocaleDateString('ar-IQ')} ${new Date(item.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`;
                  const titleStr = item.title || (item.input_text || '').slice(0, 60) || '—';
                  return (
                    <ListRow
                      key={item.id}
                      icon="document"
                      iconTint="text3"
                      title={titleStr}
                      subtitle={dateStr}
                      meta={toolDisplayName(item.tool_key)}
                      onPress={() => handleOpenHistoryItem(item)}
                      onLongPress={() => handleDeleteHistoryItem(item)}
                    />
                  );
                })}
              </ScrollView>
            )}
        </View>
      </SwipeableSheet>

      {/* Destructive delete confirmation — replaces Alert.alert flow. */}
      <ConfirmSheet
        visible={!!pendingDelete}
        title={pendingDelete?.kind === 'pdf' ? 'حذف الملف' : 'حذف العنصر'}
        message={pendingDelete ? `هل تريد حذف "${pendingDelete.item?.title || 'هذا العنصر'}"؟` : undefined}
        confirmLabel="حذف"
        destructive
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.kind === 'history') performHistoryDelete(pendingDelete.item);
          else performPdfDelete(pendingDelete.item);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text },
  introCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 18, borderRadius: tokens.radius.xl,
    ...tokens.shadow.brand,
  },
  introTitle: { fontSize: tokens.font.size['2xl'], fontWeight: '800', color: '#fff', textAlign: 'right' },
  introSubtitle: { fontSize: tokens.font.size.lg, color: 'rgba(255,255,255,0.92)', textAlign: 'right', marginTop: 4, fontWeight: '700' },
  introDesc: { fontSize: tokens.font.size.base, color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 6, lineHeight: 20 },
  introSparkle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  toolCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  toolIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 14 },
  toolTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  toolDesc: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  // Generator
  genHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  genHeaderTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, flex: 1, textAlign: 'right' },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  uploadPdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FAF5FF', borderRadius: 14, paddingVertical: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#7C3AED', borderStyle: 'dashed' },
  uploadPdfBtnText: { fontSize: 14, fontWeight: '800', color: '#7C3AED' },
  pdfCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  pdfCardSelected: { borderColor: '#7C3AED', borderWidth: 2, backgroundColor: '#FAF5FF' },
  pdfTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 16, marginTop: 20 },
  generateBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  // Review
  input: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  classPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14, gap: 8 },
  questionCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  typeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  questionText: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right', lineHeight: 22 },
  pointBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.border },
  sendExamBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 14, paddingVertical: 16 },
  sendExamBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  classOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '60%' },
});
