// Bottom sheet to submit an absence justification (brief §7.3).
// Submission via api.createJustification — preserved verbatim from the
// previous attendance screen — only the chrome is restyled.
import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SwipeableSheet from '../../shared/SwipeableSheet';
import { tokens } from '../../../constants/designTokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  reason: string;
  onChangeReason: (v: string) => void;
  onSubmit: () => void;
  sending: boolean;
  context?: { date?: string; subject?: string } | null;
}

function JustifyAbsenceSheet({
  visible,
  onClose,
  reason,
  onChangeReason,
  onSubmit,
  sending,
  context,
}: Props) {
  const { t } = useTranslation();
  return (
    <SwipeableSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={tokens.color.text} />
            </TouchableOpacity>
            <Text style={styles.title}>
              {t('parent.absenceJustification', { defaultValue: 'تبرير الغياب' })}
            </Text>
          </View>

          {context?.subject || context?.date ? (
            <View style={styles.contextRow}>
              <Text style={styles.contextText} numberOfLines={1}>
                {context?.subject ?? ''}
                {context?.date ? `  ·  ${new Date(context.date).toLocaleDateString('ar-IQ')}` : ''}
              </Text>
            </View>
          ) : null}

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('parent.absenceReason', { defaultValue: 'اشرح سبب غياب الطالبة...' })}
            placeholderTextColor={tokens.color.text3}
            value={reason}
            onChangeText={onChangeReason}
            multiline
            numberOfLines={4}
            textAlign="right"
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={onSubmit}
            disabled={sending}
            accessibilityRole="button"
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.sendBtnText}>
                  {t('common.send', { defaultValue: 'إرسال' })}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[1],
    paddingBottom: tokens.spacing[5],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing[4],
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  contextRow: {
    backgroundColor: tokens.color.p50,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: tokens.spacing[3],
    borderWidth: 1,
    borderColor: tokens.color.p100,
  },
  contextText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.p700,
    fontWeight: tokens.font.weight.bold,
    textAlign: 'right',
  },
  input: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    marginBottom: 10,
  },
  textArea: { minHeight: 100, paddingTop: 10 },
  sendBtn: {
    backgroundColor: tokens.color.p600,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: {
    color: '#fff',
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
  },
});

export default memo(JustifyAbsenceSheet);
