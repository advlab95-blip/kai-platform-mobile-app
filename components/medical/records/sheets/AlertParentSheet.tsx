// Alert-parent bottom sheet (textarea + send button).
// All Supabase wiring (sendAlert) is owned by the parent screen — this sheet is presentational.
import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { tokens } from '../../../../constants/designTokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  studentName: string;
  message: string;
  onChangeMessage: (text: string) => void;
  onSend: () => void;
  sending: boolean;
}

function AlertParentSheet({
  visible,
  onClose,
  studentName,
  message,
  onChangeMessage,
  onSend,
  sending,
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
            <Text style={styles.title}>{t('medical.alertParent')}</Text>
          </View>

          <View style={styles.contextCard}>
            <Text style={styles.contextLabel}>
              {t('medical.alertParentOf', { name: studentName })}
            </Text>
          </View>

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('medical.alertMessagePlaceholder')}
            placeholderTextColor={tokens.color.text3}
            value={message}
            onChangeText={onChangeMessage}
            multiline
            numberOfLines={4}
            textAlign="right"
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={onSend}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={t('medical.sendAlert')}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.sendBtnText}>{t('medical.sendAlert')}</Text>
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
    paddingTop: 4,
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
  contextCard: {
    backgroundColor: tokens.color.m50,
    borderRadius: tokens.radius.sm,
    padding: 10,
    marginBottom: tokens.spacing[3],
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  contextLabel: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.m700,
    textAlign: 'right',
  },
  input: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    marginBottom: tokens.spacing[3],
  },
  textArea: { minHeight: 100, paddingTop: 10 },
  sendBtn: {
    backgroundColor: tokens.color.m600,
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

export default memo(AlertParentSheet);
