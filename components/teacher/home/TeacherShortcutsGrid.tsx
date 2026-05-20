// TeacherShortcutsGrid — 4 shortcut cards (upload, voice, AI lesson, exam).
// Parent owns: ai_teacher_assistant feature flag value + each press handler.

import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

type Props = {
  isAiTeacherEnabled: boolean;
  onUploadPress: () => void;
  onVoicePress?: () => void;
  onAiPress: () => void;
  onExamPress: () => void;
};

// Voice was removed as a standalone surface — voice messages now live inside
// class chat (see /(teacher)/class-chat).
export default function TeacherShortcutsGrid({
  isAiTeacherEnabled,
  onUploadPress,
  onAiPress,
  onExamPress,
}: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.shortcutGrid}>
      <TouchableOpacity style={styles.shortcutCard} activeOpacity={0.85} onPress={onUploadPress}>
        <View style={[styles.shortcutIcon, { backgroundColor: tokens.color.brand500 + '15' }]}>
          <Ionicons name="document-text" size={22} color={tokens.color.brand500} />
        </View>
        <Text style={styles.shortcutLabel}>{t('teacherHome.shortcutAssignments', { defaultValue: 'الواجبات' })}</Text>
      </TouchableOpacity>
      {isAiTeacherEnabled && (
        <TouchableOpacity style={styles.shortcutCard} activeOpacity={0.85} onPress={onAiPress}>
          <View style={[styles.shortcutIcon, { backgroundColor: tokens.color.purple + '15' }]}>
            <Ionicons name="sparkles" size={22} color={tokens.color.purple} />
          </View>
          <Text style={styles.shortcutLabel}>{t('teacherHome.shortcutAi', { defaultValue: 'AI درس' })}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.shortcutCard} activeOpacity={0.85} onPress={onExamPress}>
        <View style={[styles.shortcutIcon, { backgroundColor: tokens.color.danger + '15' }]}>
          <Ionicons name="flask" size={22} color={tokens.color.danger} />
        </View>
        <Text style={styles.shortcutLabel}>{t('teacherHome.shortcutExam', { defaultValue: 'اختبار' })}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shortcutGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.color.surface2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  shortcutIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'center',
  },
});
