import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import StudentAITabBar from '../../components/shared/StudentAITabBar';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/designTokens';
import { useTranslation } from 'react-i18next';
import useStudentStore from '../../stores/studentStore';
import useDataStore from '../../stores/dataStore';
import useAuthStore from '../../stores/authStore';
import { api } from '../../services/api';
import { haptics } from '../../utils/haptics';
import AIHeroRibbon from '../../components/student/ai/AIHeroRibbon';
import AILessonCard from '../../components/student/ai/AILessonCard';

export default function StudentAI() {
  const { t } = useTranslation();
  const { aiLessons, loadAILessons, isLoading, classId } = useStudentStore();
  const { userInstituteId } = useDataStore();
  const { userId } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Quiz state per lesson
  const [quizAnswers, setQuizAnswers] = useState<Record<string, Record<number, string>>>({});
  const [showResults, setShowResults] = useState<Record<string, boolean>>({});
  const [quizScores, setQuizScores] = useState<Record<string, { correct: number; total: number }>>({});
  const [quizHistory, setQuizHistory] = useState<Record<string, { score: number; total: number; date: string }[]>>({});

  useEffect(() => {
    loadAILessons(classId, undefined, userInstituteId || undefined);
  }, [classId, userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await loadAILessons(classId, undefined, userInstituteId || undefined);
    } finally {
      setRefreshing(false);
    }
  }, [classId]);

  // Load quiz history from AsyncStorage on mount — offline fallback for progress.
  useEffect(() => {
    AsyncStorage.getItem('quiz_history').then((data) => {
      if (data) setQuizHistory(JSON.parse(data));
    }).catch((err) => console.error('[Quiz history load]:', err));
  }, []);

  const toggleExpand = (id: string) => {
    haptics.light();
    setExpandedId(expandedId === id ? null : id);
  };

  const setQuizAnswer = (lessonId: string, questionIdx: number, answer: string) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [lessonId]: { ...prev[lessonId], [questionIdx]: answer },
    }));
  };

  const calculateQuizScore = async (lessonId: string, questions: any[]) => {
    const answers = quizAnswers[lessonId] || {};
    // Count questions that are scoreable (have an answer key). If the AI
    // response dropped answer keys, we would otherwise silently score 0.
    const scoreable = questions.filter(q => (q.correct_answer ?? q.answer ?? q.correctAnswer) != null).length;
    if (scoreable === 0) {
      Alert.alert(
        'تعذّر حساب النتيجة',
        'هذا الاختبار لا يحتوي مفاتيح إجابات صالحة. أعد توليد الدرس من الأستاذ.'
      );
      return;
    }
    let correct = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const studentAnswer = answers[i];
      if (!studentAnswer) continue;
      const correctAnswer = q.correct_answer ?? q.answer ?? q.correctAnswer;
      if (correctAnswer !== undefined && correctAnswer !== null) {
        if (String(studentAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
          correct++;
        }
      }
    }
    const score = { correct, total: questions.length };
    setQuizScores((prev) => ({ ...prev, [lessonId]: score }));
    setShowResults((prev) => ({ ...prev, [lessonId]: true }));
    haptics.success();

    // Save to history
    const newEntry = { score: correct, total: questions.length, date: new Date().toISOString() };
    const newHistory = {
      ...quizHistory,
      [lessonId]: [...(quizHistory[lessonId] || []), newEntry],
    };
    setQuizHistory(newHistory);
    // Keep AsyncStorage for offline display
    await AsyncStorage.setItem('quiz_history', JSON.stringify(newHistory)).catch(() => {});
    // Persist to DB so teachers/institute can see student's quiz attempts
    if (userId) {
      api.logAIQuizAttempt(userId, userInstituteId || null, lessonId || null, correct, questions.length)
        .catch((e: any) => console.warn('[quiz] DB save failed:', e?.message));
    }
  };

  const resetQuiz = (lessonId: string) => {
    haptics.light();
    setQuizAnswers((prev) => ({ ...prev, [lessonId]: {} }));
    setShowResults((prev) => ({ ...prev, [lessonId]: false }));
    setQuizScores((prev) => { const next = { ...prev }; delete next[lessonId]; return next; });
  };

  const renderLessonItem = ({ item }: { item: any }) => {
    const isExpanded = expandedId === item.id;
    let questions: any[] = [];
    let flashcards: any[] = [];
    try {
      if (item.quiz_questions) {
        questions = typeof item.quiz_questions === 'string' ? JSON.parse(item.quiz_questions) : item.quiz_questions;
      }
      if (item.flashcards) {
        flashcards = typeof item.flashcards === 'string' ? JSON.parse(item.flashcards) : item.flashcards;
      }
    } catch (err) {
      console.error('[AI lesson parse]:', err);
    }

    return (
      <AILessonCard
        item={item}
        isExpanded={isExpanded}
        onToggle={() => toggleExpand(item.id)}
        questions={questions}
        flashcards={flashcards}
        answers={quizAnswers[item.id] || {}}
        isResultsShown={!!showResults[item.id]}
        score={quizScores[item.id]}
        history={quizHistory[item.id] || []}
        onAnswer={(questionIdx, value) => setQuizAnswer(item.id, questionIdx, value)}
        onShowResults={() => calculateQuizScore(item.id, questions)}
        onRetry={() => resetQuiz(item.id)}
      />
    );
  };

  const completedCount = aiLessons.filter((l: any) => (quizHistory[l.id]?.length || 0) > 0).length;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الذكاء الاصطناعي"
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
      />
      <StudentAITabBar active="lessons" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.purple} />}
      >
        <AIHeroRibbon totalLessons={aiLessons.length} completedCount={completedCount} />

        <View style={styles.contentArea}>
          {isLoading && aiLessons.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={tokens.color.purple} />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          ) : aiLessons.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyChip}>
                <Ionicons name="sparkles-outline" size={32} color={tokens.color.purple} />
              </View>
              <Text style={styles.emptyTitle}>{t('student.noSmartLessons')}</Text>
              <Text style={styles.emptySubtitle}>{t('student.lessonsAddedByTeachers')}</Text>
            </View>
          ) : (
            <FlashList
              data={aiLessons}
              keyExtractor={(item) => item.id}
              renderItem={renderLessonItem}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 12 }}
            />
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  contentArea: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: tokens.color.text3,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyChip: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.purpleBg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.color.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: tokens.color.text3,
  },
});
