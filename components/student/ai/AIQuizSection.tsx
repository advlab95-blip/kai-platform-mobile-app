// AIQuizSection — interactive quiz UI for an AI lesson: questions, options, results reveal,
// score box, retry button, and previous attempts history. Parent owns all state/handlers.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

type Attempt = { score: number; total: number; date: string };

type Props = {
  lessonId: string;
  questions: any[];
  answers: Record<number, string>;
  isResultsShown: boolean;
  score?: { correct: number; total: number };
  history: Attempt[];
  onAnswer: (questionIdx: number, value: string) => void;
  onShowResults: () => void;
  onRetry: () => void;
};

export default function AIQuizSection({
  lessonId,
  questions,
  answers,
  isResultsShown,
  score,
  history,
  onAnswer,
  onShowResults,
  onRetry,
}: Props) {
  const { t } = useTranslation();

  if (questions.length === 0) return null;

  return (
    <View style={styles.lessonSection}>
      <Text style={styles.sectionLabel}>{t('student.reviewQuestions2')}</Text>
      {questions.map((q: any, idx: number) => {
        const correctAnswer = q.correct_answer ?? q.answer ?? q.correctAnswer;
        const studentAnswer = answers[idx];
        const isCorrect = correctAnswer !== undefined && correctAnswer !== null
          && String(studentAnswer || '').trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();

        return (
          <View key={idx} style={[styles.questionCard, isResultsShown && {
            borderWidth: 1,
            borderColor: isCorrect ? tokens.color.success : tokens.color.danger,
          }]}>
            <Text style={styles.questionText}>
              {idx + 1}. {q.question || q.text || ''}
            </Text>
            {q.options && Array.isArray(q.options) ? (
              <View style={styles.optionsContainer}>
                {q.options.map((opt: string, oIdx: number) => {
                  const isSelected = studentAnswer === String(oIdx);
                  const isCorrectOption = isResultsShown && String(correctAnswer) === String(oIdx);
                  return (
                    <TouchableOpacity
                      key={oIdx}
                      style={[
                        styles.optionRow,
                        isSelected && { backgroundColor: tokens.color.purpleBg, borderRadius: tokens.radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
                        // Correct option tinted green on reveal — shown even if student
                        // didn't pick it, so they learn the right answer.
                        isResultsShown && isCorrectOption && { backgroundColor: tokens.color.successBg, borderRadius: tokens.radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
                        // Wrong-selected option tinted red on reveal.
                        isResultsShown && isSelected && !isCorrect && { backgroundColor: tokens.color.dangerBg, borderRadius: tokens.radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
                      ]}
                      onPress={() => !isResultsShown && onAnswer(idx, String(oIdx))}
                      disabled={isResultsShown}
                    >
                      <Text style={[styles.optionText, isSelected && { color: tokens.color.purple, fontWeight: '700' }]}>{opt}</Text>
                      <View style={[
                        styles.optionBullet,
                        isSelected && { backgroundColor: tokens.color.purple, borderColor: tokens.color.purple },
                      ]} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={{
                  backgroundColor: tokens.color.surface2, borderWidth: 1, borderColor: tokens.color.border,
                  borderRadius: tokens.radius.sm, paddingHorizontal: 12, paddingVertical: 8,
                  fontSize: 13, color: tokens.color.text, textAlign: 'right', marginTop: 8,
                }}
                placeholder={t('student.writeAnswerPlaceholder2')}
                placeholderTextColor={tokens.color.text3}
                value={studentAnswer || ''}
                onChangeText={(text) => onAnswer(idx, text)}
                editable={!isResultsShown}
              />
            )}
            {isResultsShown && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6, gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: isCorrect ? tokens.color.success : tokens.color.danger }}>
                  {isCorrect ? t('student.correct2') : (correctAnswer !== undefined ? t('student.wrongWithAnswer', { answer: q.options ? q.options[Number(correctAnswer)] : correctAnswer }) : t('student.wrong'))}
                </Text>
                <Ionicons name={isCorrect ? 'checkmark-circle' : 'close-circle'} size={16} color={isCorrect ? tokens.color.success : tokens.color.danger} />
              </View>
            )}
          </View>
        );
      })}

      {/* Quiz Actions */}
      {!isResultsShown ? (
        <TouchableOpacity
          style={styles.showResultsBtn}
          onPress={onShowResults}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={tokens.gradient.ai as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.showResultsGradient}
          >
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{t('student.showResults')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        <View style={{ marginTop: 8 }}>
          <View style={styles.scoreBox}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: tokens.color.text }}>
              {score?.correct || 0}/{score?.total || questions.length}
            </Text>
            <Text style={{ fontSize: 12, color: tokens.color.text2, fontWeight: '600' }}>{t('student.correctAnswers')}</Text>
          </View>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={onRetry}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={14} color={tokens.color.purple} />
            <Text style={{ color: tokens.color.purple, fontSize: 13, fontWeight: '700' }}>{t('student.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quiz History */}
      {history && history.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: tokens.color.text3, textAlign: 'right', marginBottom: 4 }}>{t('student.previousAttempts')}</Text>
          {history.slice(-3).reverse().map((attempt, aIdx) => (
            <View key={aIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, color: tokens.color.text3 }}>{new Date(attempt.date).toLocaleDateString('ar-IQ')}</Text>
              <Text style={{ fontSize: 10, color: tokens.color.text2, fontWeight: '700' }}>{attempt.score}/{attempt.total}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lessonSection: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.purple,
    textAlign: 'right',
    marginBottom: 8,
  },
  questionCard: {
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 8,
  },
  questionText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 8,
  },
  optionsContainer: {
    gap: 6,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  optionText: {
    fontSize: 12,
    color: tokens.color.text2,
  },
  optionBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: tokens.color.text3,
  },
  showResultsBtn: {
    marginTop: 8,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  showResultsGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  scoreBox: {
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.lg,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.color.purpleBg,
    borderRadius: tokens.radius.lg,
    paddingVertical: 12,
    marginTop: 8,
  },
});
