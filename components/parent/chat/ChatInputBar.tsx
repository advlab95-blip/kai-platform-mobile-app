// Sticky input bar at the bottom of the chat thread (brief §7.4).
// Circular violet send button + multiline text input. Caller owns state + send action.
import React, { memo } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  /**
   * Optional slot rendered between the send button and the text input —
   * used to mount a VoiceMessageInput so voice + text share one bar.
   * Kept optional so existing callers (text-only) keep working unchanged.
   */
  voiceSlot?: React.ReactNode;
}

function ChatInputBar({ value, onChange, onSend, sending, voiceSlot }: Props) {
  const { t } = useTranslation();
  const disabled = !value.trim() || sending;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.sendBtn, disabled && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('parent.sendMessageLabel', { defaultValue: 'إرسال' })}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
        {voiceSlot}
        <TextInput
          style={styles.input}
          placeholder={t('parent.writeMessagePlaceholder', { defaultValue: 'اكتب رسالة...' })}
          placeholderTextColor={tokens.color.text3}
          value={value}
          onChangeText={onChange}
          textAlign="right"
          multiline
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: tokens.color.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: tokens.color.surface2,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.p600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});

export default memo(ChatInputBar);
