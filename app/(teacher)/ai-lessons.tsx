import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../stores/authStore';
import { api } from '../../services/api';
import { confirmAlert } from '../../utils/alerts';
import { exportAILessonPDF } from '../../services/pdfExport';
import useDataStore from '../../stores/dataStore';
import { hapticSuccess, hapticLight } from '../../utils/performance';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { searchMatch } from '../../hooks/useSmartSearch';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import { styles } from '../../components/teacher/ai-lessons/styles';
import { buildRichPrompt } from '../../components/teacher/ai-lessons/utils';
import type { RichLessonData, SavedLesson } from '../../components/teacher/ai-lessons/types';
import AILessonsHero from '../../components/teacher/ai-lessons/AILessonsHero';
import LessonComposer from '../../components/teacher/ai-lessons/LessonComposer';
import LessonsToolbar from '../../components/teacher/ai-lessons/LessonsToolbar';
import { LessonsSkeleton, LessonsEmpty } from '../../components/teacher/ai-lessons/LessonsListStates';
import LessonCard from '../../components/teacher/ai-lessons/LessonCard';
import FeatureDisabledView from '../../components/teacher/ai-lessons/FeatureDisabledView';

export default function AILessons() {
  const { userId, userName } = useAuthStore();
  const { institutes, userInstituteId } = useDataStore();
  const instituteName = institutes?.find((i: any) => i.id === userInstituteId)?.name;
  const isEnabled = useFeatureFlag('ai_teacher_assistant');
  const [teacherSubjects, setTeacherSubjects] = useState<string[]>([]);
  const [teacherGrades, setTeacherGrades] = useState<string[]>([]);
  // ConfirmSheet replaces Alert.alert for destructive delete confirmations.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  // Load the teacher's assigned subjects + grades once so AI calls and the
  // suggestion chips can both be scoped to the teacher's actual scope.
  useEffect(() => {
    if (!userId) return;
    api.getTeacherSubjectNames(userId)
      .then(setTeacherSubjects)
      .catch(() => setTeacherSubjects([]));
    api.getTeacherGradeNames(userId)
      .then(setTeacherGrades)
      .catch(() => setTeacherGrades([]));
  }, [userId]);
  const { t } = useTranslation();
  const [sourceContent, setSourceContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingStage, setGeneratingStage] = useState('');
  const [savedLessons, setSavedLessons] = useState<SavedLesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [engagement, setEngagement] = useState<Record<string, { attempts: number; uniqueStudents: number; avgScore: number }>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'draft' | 'published'>('all');

  useEffect(() => {
    if (userId) loadSavedLessons();
  }, [userId]);

  const loadSavedLessons = async () => {
    if (!userId) return;
    setLoadingLessons(true);
    try {
      const data = await api.getTeacherAILessons(userId);
      const mapped: SavedLesson[] = data.map((item: any) => {
        let raw: any = {};
        try {
          raw = typeof item.lesson_data === 'string'
            ? JSON.parse(item.lesson_data)
            : (item.lesson_data || {});
        } catch { raw = {}; }

        // Migrate legacy shape (quiz: string[], flashcards: string[]) → rich shape.
        const normalized: RichLessonData = {
          title: raw.title,
          objectives: raw.objectives,
          summary: raw.summary,
          concepts: raw.concepts,
          mindMap: raw.mindMap,
          infographics: Array.isArray(raw.infographics) ? raw.infographics : undefined,
          quiz: Array.isArray(raw.quiz) && raw.quiz[0] && typeof raw.quiz[0] === 'object'
            ? raw.quiz
            : undefined,
          quizLegacy: Array.isArray(raw.quiz) && typeof raw.quiz[0] === 'string' ? raw.quiz : undefined,
          flashcards: Array.isArray(raw.flashcards) && raw.flashcards[0] && typeof raw.flashcards[0] === 'object'
            ? raw.flashcards
            : undefined,
          flashcardsLegacy: Array.isArray(raw.flashcards) && typeof raw.flashcards[0] === 'string'
            ? raw.flashcards
            : undefined,
          faq: raw.faq,
          examples: raw.examples,
          keyStats: raw.keyStats,
          furtherReading: raw.furtherReading,
        };

        return {
          id: item.id,
          title: item.title || raw.title || '—',
          date: item.created_at ? new Date(item.created_at).toLocaleDateString('ar-IQ') : '',
          status: (item.status as 'draft' | 'published') || 'draft',
          data: normalized,
          expanded: false,
        };
      });
      setSavedLessons(mapped);
      // Fetch engagement stats in parallel — they don't block the list render, so one-time
      // error just leaves stats empty without affecting the UI.
      try {
        const stats = await api.getTeacherLessonEngagement(userId);
        setEngagement(stats);
      } catch { /* silent */ }
    } catch (err: any) {
      console.error('Failed to load AI lessons:', err);
      Alert.alert(t('common.error'), t('teacherAI.loadLessonsFailed'));
    } finally {
      setLoadingLessons(false);
    }
  };

  const handleGenerate = async () => {
    if (!sourceContent.trim() || !userId) return;
    if (sourceContent.trim().length < 30) {
      Alert.alert(t('common.error'), 'المحتوى قصير جداً — أدخل على الأقل 30 حرفاً');
      return;
    }
    setGenerating(true);
    setGeneratingStage('جاري تحليل المحتوى...');

    try {
      const trimmed = sourceContent.trim();

      setGeneratingStage('يُنشئ الأهداف والملخّص...');
      const { callAIProxy } = await import('../../services/api');
      const prompt = buildRichPrompt(trimmed);

      setGeneratingStage('يُنشئ الخريطة الذهنية والكويز...');
      const aiText = await callAIProxy(prompt, userId, 'lessons', undefined, teacherSubjects);

      setGeneratingStage('يُنظّم الدرس...');
      // Strip markdown code fences if present — Gemini sometimes wraps JSON in ```json ... ```
      const cleaned = aiText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('فشل تحليل استجابة AI');

      const parsed: RichLessonData = JSON.parse(jsonMatch[0]);
      if (!parsed.summary) throw new Error('الاستجابة ناقصة — أعد المحاولة');

      const title = parsed.title || (trimmed.length > 40 ? trimmed.substring(0, 40) + '...' : trimmed);
      const saved = await api.saveAILesson(userId, title, trimmed, parsed as any);

      const newLesson: SavedLesson = {
        id: saved.id,
        title,
        date: new Date().toLocaleDateString('ar-IQ'),
        status: 'draft',
        data: parsed,
        expanded: true,
      };
      setSavedLessons([newLesson, ...savedLessons]);
      setSourceContent('');
      hapticSuccess();
      Alert.alert(t('common.success'), 'تم إنشاء الدرس بنجاح — راجعه قبل النشر');
    } catch (err: any) {
      const raw = err?.message || '';
      // Detect specific provider failures so the alert points at a cause, not just "failed".
      let friendly = raw;
      if (!raw) friendly = 'فشل إنشاء الدرس';
      else if (raw.includes('502') || raw.toLowerCase().includes('provider')) {
        friendly = 'تعذّر الاتصال بـ AI الآن. تحقق من مفتاح OpenRouter في إعدادات السيرفر ثم أعد المحاولة.';
      } else if (raw.includes('429') || raw.includes('حد الاستخدام')) {
        friendly = 'وصلت للحد اليومي (50 طلب). جرّب بكرا.';
      } else if (raw.toLowerCase().includes('timeout') || raw.toLowerCase().includes('abort')) {
        friendly = 'انتهت مهلة الاتصال. جرّب بمحتوى أقصر.';
      }
      Alert.alert('فشل إنشاء الدرس', friendly);
    } finally {
      setGenerating(false);
      setGeneratingStage('');
    }
  };

  const toggleExpanded = (id: string) => {
    setSavedLessons(savedLessons.map((l) =>
      l.id === id ? { ...l, expanded: !l.expanded } : l
    ));
  };

  const togglePublish = (id: string) => {
    const lesson = savedLessons.find((l) => l.id === id);
    if (!lesson) return;
    const toPublished = lesson.status !== 'published';
    const title = toPublished ? 'نشر الدرس للطلاب؟' : 'إخفاء الدرس عن الطلاب؟';
    const msg = toPublished
      ? 'سيظهر الدرس لجميع الطلاب المسموح لهم فوراً — وسيتلقّون إشعاراً'
      : 'لن يعود الدرس ظاهراً في شاشة الطلاب';
    confirmAlert(title, msg, async () => {
      setTogglingId(id);
      try {
        await api.publishAILesson(id, toPublished);
        setSavedLessons((prev) => prev.map((l) =>
          l.id === id ? { ...l, status: toPublished ? 'published' : 'draft' } : l
        ));
        hapticSuccess();

        // Push + in-app notification to students in the teacher's classes when publishing.
        // We use the teacher's currently-assigned classes as the reach, since AI lessons
        // aren't yet class-scoped at save time — this mirrors student-side visibility.
        if (toPublished && userId) {
          try {
            const assignments = await api.getTeacherAssignments(userId);
            const classIds = Array.from(new Set(
              (assignments || [])
                .map((a: any) => a.class_id)
                .filter((x: any): x is string => !!x)
            ));
            const sectionIds = Array.from(new Set(
              (assignments || [])
                .map((a: any) => a.section_id)
                .filter((x: any): x is string => !!x)
            ));
            if ((classIds.length || sectionIds.length)) {
              await api.notifyStudentsInClasses({
                classIds: classIds.length ? classIds : undefined,
                sectionIds: sectionIds.length ? sectionIds : undefined,
                title: 'درس ذكي جديد 📚',
                message: lesson.title,
                type: 'ai_lesson',
                senderId: userId,
                senderRole: 'teacher',
                instituteId: userInstituteId || undefined,
              });
            }
          } catch (err) { console.warn('[ai-lesson] notify students failed:', err); }
        }
      } catch (err: any) {
        Alert.alert(t('common.error'), err.message || t('teacherAI.updateStatusFailed'));
      } finally {
        setTogglingId(null);
      }
    }, toPublished);
  };

  /**
   * Duplicate — saves a new draft with "(نسخة)" suffix so the teacher can tweak a lesson
   * without regenerating via AI (which burns API quota and takes ~30s).
   */
  const handleDuplicate = async (lesson: SavedLesson) => {
    if (!userId) return;
    try {
      const newTitle = `${lesson.title} (نسخة)`;
      const saved = await api.saveAILesson(userId, newTitle, '', lesson.data as any);
      const newLesson: SavedLesson = {
        id: saved.id,
        title: newTitle,
        date: new Date().toLocaleDateString('ar-IQ'),
        status: 'draft',
        data: lesson.data,
        expanded: false,
      };
      setSavedLessons((prev) => [newLesson, ...prev]);
      hapticLight();
      Alert.alert('تم', 'تم إنشاء نسخة — كمسودّة');
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل النسخ');
    }
  };

  const handleDelete = (id: string, title: string) => {
    // Open sheet instead of native alert — preserves api.deleteAILesson on confirm.
    setDeleteTarget({ id, title });
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeletingId(id);
    try {
      await api.deleteAILesson(id);
      setSavedLessons((prev) => prev.filter((l) => l.id !== id));
      hapticLight();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || 'تعذّر حذف الدرس');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredLessons = useMemo(() => {
    let list = savedLessons;
    if (filter !== 'all') list = list.filter((l) => l.status === filter);
    if (search.trim()) {
      list = list.filter((l) => searchMatch(l.title, search));
    }
    return list;
  }, [savedLessons, filter, search]);

  const charCount = sourceContent.length;
  const canGenerate = sourceContent.trim().length >= 30 && !generating;

  // Feature flag gate — hide screen entirely when admin hasn't enabled AI teacher assistant.
  if (!isEnabled) {
    return <FeatureDisabledView />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title="دروس AI الذكية" fallbackRoute="/(teacher)/services" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loadingLessons} onRefresh={loadSavedLessons} />}
      >
        <AILessonsHero />

        <View style={styles.content}>
          <LessonComposer
            sourceContent={sourceContent}
            onChangeContent={setSourceContent}
            generating={generating}
            generatingStage={generatingStage}
            teacherSubjects={teacherSubjects}
            teacherGrades={teacherGrades}
            charCount={charCount}
            canGenerate={canGenerate}
            onGenerate={handleGenerate}
          />

          <LessonsToolbar
            totalCount={savedLessons.length}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            showSearch={savedLessons.length > 3}
          />

          {/* List */}
          {loadingLessons ? (
            <LessonsSkeleton />
          ) : filteredLessons.length === 0 ? (
            <LessonsEmpty totalCount={savedLessons.length} />
          ) : (
            <View style={{ gap: 12 }}>
              {filteredLessons.map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  stats={engagement[lesson.id]}
                  isToggling={togglingId === lesson.id}
                  isDeleting={deletingId === lesson.id}
                  onToggle={() => toggleExpanded(lesson.id)}
                  onPublish={() => togglePublish(lesson.id)}
                  onDelete={() => handleDelete(lesson.id, lesson.title)}
                  onDuplicate={() => handleDuplicate(lesson)}
                  onExportPDF={() => exportAILessonPDF({
                    title: lesson.title,
                    teacherName: userName || undefined,
                    instituteName: instituteName || undefined,
                    createdAt: lesson.date,
                    lesson: lesson.data as any,
                  })}
                />
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Destructive delete confirmation — replaces Alert.alert flow. */}
      <ConfirmSheet
        visible={!!deleteTarget}
        title="حذف الدرس"
        message={deleteTarget ? `هل تريد حذف "${deleteTarget.title}"؟` : undefined}
        confirmLabel="حذف"
        destructive
        onConfirm={performDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </SafeAreaView>
  );
}
