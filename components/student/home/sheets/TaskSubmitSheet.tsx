// TaskSubmitSheet — bottom-sheet form for submitting a task: write notes + attach file.
// Stateful (text input, picked file, submitting flag) live in parent — sheet is a controlled view.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../../constants/designTokens';
import { haptics } from '../../../../utils/haptics';
import SwipeableSheet from '../../../shared/SwipeableSheet';

type Props = {
  visible: boolean;
  taskTitle?: string;
  notes: string;
  fileName?: string | null;
  submitting: boolean;
  onClose: () => void;
  onChangeNotes: (s: string) => void;
  onPickFile: () => void;
  onClearFile: () => void;
  onSubmit: () => void;
};

export default function TaskSubmitSheet({
  visible,
  taskTitle,
  notes,
  fileName,
  submitting,
  onClose,
  onChangeNotes,
  onPickFile,
  onClearFile,
  onSubmit,
}: Props) {
  const { t } = useTranslation();

  return (
    <SwipeableSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => { haptics.light(); onClose(); }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color={tokens.color.text} />
            </TouchableOpacity>
            <Text style={styles.title}>
              {t('student.taskDelivery', { title: taskTitle || t('student.task') })}
            </Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder={t('student.writeAnswerPlaceholder')}
            placeholderTextColor={tokens.color.text3}
            value={notes}
            onChangeText={onChangeNotes}
            multiline
            numberOfLines={4}
          />
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => { haptics.selection(); onPickFile(); }}
            activeOpacity={0.85}
          >
            <Ionicons name="attach" size={18} color={tokens.color.teal700} />
            <Text style={styles.attachText}>
              {fileName || t('student.attachFile')}
            </Text>
          </TouchableOpacity>
          {fileName && (
            <TouchableOpacity
              onPress={() => { haptics.selection(); onClearFile(); }}
              style={{ alignItems: 'center', marginBottom: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.removeText}>إزالة الملف</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={() => { haptics.selection(); onSubmit(); }}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={tokens.gradient.student as unknown as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitGradient}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.submitText}>{t('student.submitTask')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: '800',
    color: tokens.color.text,
  },
  input: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingTop: 10,
    fontSize: tokens.font.size.md,
    fontWeight: '600',
    color: tokens.color.text,
    marginBottom: 10,
    minHeight: 100,
    textAlign: 'right',
    textAlignVertical: 'top',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  attachText: {
    fontSize: tokens.font.size.md,
    fontWeight: '700',
    color: tokens.color.teal700,
  },
  removeText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.danger,
    fontWeight: '700',
  },
  submitBtn: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    ...tokens.shadow.teal,
  },
  submitGradient: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: tokens.font.size.lg,
    fontWeight: '800',
  },
});
