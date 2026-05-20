// AssignmentRow — single assignment card with status tags, meta, score, feedback.
// Pure presentational; parent decides what onPress should do (open vs view-task).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import TagChip from '../../teacher/chips/TagChip';
import { tierOf, daysRemaining } from './_helpers';

type Props = {
  assignment: any;
  groupLabel: string;
  onPress: () => void;
};

export default function AssignmentRow({ assignment, groupLabel, onPress }: Props) {
  const { t } = useTranslation();
  const a = assignment;
  const sub = a.submission;
  const ti = tierOf(a);
  const isReturned = ti === 'graded';
  const isSubmitted = ti === 'submitted' || ti === 'graded';
  const isGradedByTeacher = sub?.status === 'graded' || sub?.status === 'returned';

  const qCount = (a.assignment_questions || []).length;
  const scorePct = (isReturned && sub?.score != null && a.total_points)
    ? Math.max(0, Math.min(100, Math.round((Number(sub.score) / Number(a.total_points)) * 100)))
    : null;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardHeaderRow}>
        <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
          {isReturned && (
            <TagChip
              label={t('student.gradeLabel', { score: sub.score, defaultValue: `${sub.score}` })}
              tone="success"
              icon="checkmark-circle"
            />
          )}
          {isGradedByTeacher && !isReturned && (
            <TagChip
              label={t('student.awaitingRelease', { defaultValue: 'قيد التصحيح' })}
              tone="warning"
              icon="hourglass"
            />
          )}
          {isSubmitted && !isGradedByTeacher && (
            <TagChip
              label={t('student.submittedLabel', { defaultValue: 'مُسلّمة' })}
              tone="info"
              icon="paper-plane"
            />
          )}
          {ti === 'late' && (
            <TagChip
              label={t('student.pastDue', { defaultValue: 'متأخرة' })}
              tone="danger"
              icon="alert-circle"
            />
          )}
          {ti === 'pending' && (
            <TagChip
              label={t('student.requiredLabel', { defaultValue: 'معلّقة' })}
              tone="warning"
              icon="time"
            />
          )}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{a.title}</Text>
      </View>

      {a.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{a.description}</Text>
      ) : null}

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="book-outline" size={12} color={tokens.color.text3} />
          <Text style={styles.cardMeta}>{groupLabel}</Text>
        </View>
        {qCount > 0 ? (
          <View style={styles.metaItem}>
            <Ionicons name="document-outline" size={12} color={tokens.color.text3} />
            <Text style={styles.cardMeta}>{t('student.questionCount', { count: qCount })}</Text>
          </View>
        ) : null}
        {a.due_date ? (
          <View style={styles.metaItem}>
            <Ionicons
              name={isSubmitted ? 'checkmark-circle-outline' : 'time-outline'}
              size={12}
              color={ti === 'late' ? tokens.color.danger : tokens.color.text3}
            />
            <Text style={[styles.cardMeta, ti === 'late' && { color: tokens.color.danger, fontWeight: tokens.font.weight.bold }]}>
              {isSubmitted && sub?.submitted_at
                ? new Date(sub.submitted_at).toLocaleDateString('ar-IQ')
                : daysRemaining(a.due_date, t).label}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Progress bar — only once grade is released to student */}
      {scorePct != null && (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${scorePct}%` }]} />
          </View>
          <Text style={styles.progressText}>{sub.score} / {a.total_points}</Text>
        </>
      )}

      {isReturned && sub?.feedback ? (
        <View style={styles.feedbackBox}>
          <Text style={styles.feedbackText}>
            {t('student.feedbackLabel', { feedback: sub.feedback })}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardDesc: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 6,
    writingDirection: 'rtl',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 14,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMeta: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text3,
  },
  progressTrack: {
    height: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.color.teal600,
    borderRadius: tokens.radius.pill,
  },
  progressText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.teal700,
    textAlign: 'right',
    marginTop: 4,
  },
  feedbackBox: {
    backgroundColor: tokens.color.successBg,
    borderRadius: tokens.radius.sm,
    padding: 10,
    marginTop: 8,
  },
  feedbackText: {
    fontSize: tokens.font.size.base,
    color: tokens.color.success,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
