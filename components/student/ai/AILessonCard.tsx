// AILessonCard — collapsed/expanded card for a single AI lesson. Shows the header
// (icon, title, teacher, date, completion badges), and when expanded composes the
// content sections (objectives/summary/...) and the interactive quiz block.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import AILessonSections from './AILessonSections';
import AIQuizSection from './AIQuizSection';

type Attempt = { score: number; total: number; date: string };

type Props = {
  item: any;
  isExpanded: boolean;
  onToggle: () => void;
  // Quiz state for this lesson
  questions: any[];
  flashcards: any[];
  answers: Record<number, string>;
  isResultsShown: boolean;
  score?: { correct: number; total: number };
  history: Attempt[];
  onAnswer: (questionIdx: number, value: string) => void;
  onShowResults: () => void;
  onRetry: () => void;
};

export default function AILessonCard({
  item,
  isExpanded,
  onToggle,
  questions,
  flashcards,
  answers,
  isResultsShown,
  score,
  history,
  onAnswer,
  onShowResults,
  onRetry,
}: Props) {
  const { t } = useTranslation();

  // Progress badges — let student see "done" state + best score at a glance,
  // without opening the card. Only rendered when history exists locally.
  const renderBadges = () => {
    if (!history || history.length === 0) return null;
    const best = Math.max(...history.map(h => Math.round((h.score / Math.max(1, h.total)) * 100)));
    const bestTint =
      best >= 70 ? tokens.color.success :
      best >= 50 ? tokens.color.warning :
      tokens.color.danger;
    const bestBg =
      best >= 70 ? tokens.color.successBg :
      best >= 50 ? tokens.color.warningBg :
      tokens.color.dangerBg;
    return (
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignSelf: 'flex-end' }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 3,
          backgroundColor: tokens.color.successBg, borderRadius: tokens.radius.pill,
          paddingHorizontal: 8, paddingVertical: 2,
        }}>
          <Ionicons name="checkmark-circle" size={10} color={tokens.color.success} />
          <Text style={{ fontSize: 10, fontWeight: '800', color: tokens.color.success }}>مُكتمل</Text>
        </View>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 3,
          backgroundColor: bestBg, borderRadius: tokens.radius.pill,
          paddingHorizontal: 8, paddingVertical: 2,
        }}>
          <Ionicons name="trophy" size={10} color={bestTint} />
          <Text style={{ fontSize: 10, fontWeight: '800', color: bestTint }}>أعلى: {best}%</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.lessonCard}>
      <TouchableOpacity
        style={styles.lessonHeader}
        onPress={onToggle}
        activeOpacity={0.85}
      >
        <View style={styles.lessonIconContainer}>
          <View style={styles.lessonIconChip}>
            <Ionicons name="sparkles" size={20} color={tokens.color.purple} />
          </View>
        </View>
        <View style={styles.lessonInfo}>
          <Text style={styles.lessonTitle} numberOfLines={2}>{item.title || t('student.aiLesson')}</Text>
          {item.teacher_name ? (
            <Text style={styles.lessonTeacher}>أ. {item.teacher_name}</Text>
          ) : null}
          {item.created_at && (
            <Text style={styles.lessonDate}>
              {new Date(item.created_at).toLocaleDateString('ar-IQ')}
            </Text>
          )}
          {renderBadges()}
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={tokens.color.text3}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.lessonBody}>
          <AILessonSections item={item} flashcards={flashcards} />
          <AIQuizSection
            lessonId={item.id}
            questions={questions}
            answers={answers}
            isResultsShown={isResultsShown}
            score={score}
            history={history}
            onAnswer={onAnswer}
            onShowResults={onShowResults}
            onRetry={onRetry}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lessonCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
    ...tokens.shadow.sm,
  },
  lessonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  lessonIconContainer: {
    marginRight: 12,
  },
  lessonIconChip: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.purpleBg,
  },
  lessonInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  lessonTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
  },
  lessonTeacher: {
    fontSize: 11,
    color: tokens.color.text2,
    marginTop: 2,
  },
  lessonDate: {
    fontSize: 9,
    color: tokens.color.text3,
    marginTop: 2,
  },
  lessonBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
});
