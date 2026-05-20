// Shortcuts — 4-up grid (exam / AI lesson / voice / assignments) with optional badges.
// AI tile is gated by useFeatureFlag('ai_student_chatbot'). Counts come from props.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import { useFeatureFlag } from '../../../hooks/useFeatureFlag';

type Props = {
  examCount: number;
  aiLessonCount: number;
  unreadMessagesCount: number;
  unseenAssignmentsCount: number;
  onExamPress: () => void;
  onAiPress: () => void;
  onMessagesPress: () => void;
  onAssignmentsPress: () => void;
};

export default function Shortcuts({
  examCount,
  aiLessonCount,
  unreadMessagesCount,
  unseenAssignmentsCount,
  onExamPress,
  onAiPress,
  onMessagesPress,
  onAssignmentsPress,
}: Props) {
  const { t } = useTranslation();
  const isAiStudentEnabled = useFeatureFlag('ai_student_chatbot');

  return (
    <>
      <Text style={styles.sectionTitle}>
        {t('student.shortcuts', { defaultValue: 'الاختصارات' })}
      </Text>
      <View style={styles.shortcutRow}>
        {/* Exam */}
        <TouchableOpacity
          style={styles.shortcutCard}
          activeOpacity={0.85}
          onPress={() => { haptics.selection(); onExamPress(); }}
        >
          <View style={[styles.shortcutIcon, { backgroundColor: tokens.color.purpleBg }]}>
            <Ionicons name="document-text" size={22} color={tokens.color.purple} />
          </View>
          <Text style={styles.shortcutLabel}>
            {t('student.shortcutExam', { defaultValue: 'امتحانات' })}
          </Text>
          {examCount > 0 && (
            <View style={styles.shortcutBadge}>
              <Text style={styles.shortcutBadgeText}>{examCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* AI Lesson */}
        {isAiStudentEnabled && (
          <TouchableOpacity
            style={styles.shortcutCard}
            activeOpacity={0.85}
            onPress={() => { haptics.selection(); onAiPress(); }}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: tokens.color.purpleBg }]}>
              <Ionicons name="sparkles" size={22} color={tokens.color.purple} />
            </View>
            <Text style={styles.shortcutLabel}>
              {t('student.shortcutAi', { defaultValue: 'AI درس' })}
            </Text>
            {aiLessonCount > 0 && (
              <View style={styles.shortcutBadge}>
                <Text style={styles.shortcutBadgeText}>{aiLessonCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Messages — teacher → student (text + voice) per teacher/subject */}
        <TouchableOpacity
          style={styles.shortcutCard}
          activeOpacity={0.85}
          onPress={() => { haptics.selection(); onMessagesPress(); }}
        >
          <View style={[styles.shortcutIcon, { backgroundColor: tokens.color.pinkBg }]}>
            <Ionicons name="chatbubbles" size={22} color={tokens.color.pink} />
          </View>
          <Text style={styles.shortcutLabel}>
            {t('student.shortcutMessages', { defaultValue: 'الرسائل' })}
          </Text>
          {unreadMessagesCount > 0 && (
            <View style={styles.shortcutBadge}>
              <Text style={styles.shortcutBadgeText}>{unreadMessagesCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Assignments */}
        <TouchableOpacity
          style={styles.shortcutCard}
          activeOpacity={0.85}
          onPress={() => { haptics.selection(); onAssignmentsPress(); }}
        >
          <View style={[styles.shortcutIcon, { backgroundColor: tokens.color.brand100 }]}>
            <Ionicons name="document-text" size={22} color={tokens.color.brand500} />
          </View>
          <Text style={styles.shortcutLabel}>
            {t('student.homework', { defaultValue: 'الواجبات' })}
          </Text>
          {unseenAssignmentsCount > 0 && (
            <View style={styles.shortcutBadge}>
              <Text style={styles.shortcutBadgeText}>{unseenAssignmentsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.color.border2,
    position: 'relative',
    ...tokens.shadow.sm,
  },
  shortcutIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: {
    fontSize: tokens.font.size.base,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'center',
  },
  shortcutBadge: {
    position: 'absolute',
    top: 6,
    start: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.color.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  shortcutBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
});
