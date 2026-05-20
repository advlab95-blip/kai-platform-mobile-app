// PDF export trigger. The text-assembly + exportAIToolOutputPDF call lives in the parent
// (where the data already lives). This is a presentation-only button.
import React, { memo } from 'react';
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  onPress: () => void;
  busy?: boolean;
}

function ExportButton({ onPress, busy }: Props) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={[styles.btn, busy && styles.btnDisabled]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('medical.exportReport')}
    >
      {busy ? (
        <ActivityIndicator color={tokens.color.brand500} size="small" />
      ) : (
        <>
          <Ionicons name="download-outline" size={20} color={tokens.color.brand500} />
          <Text style={styles.text}>{t('medical.exportReport')}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.color.brand50,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: tokens.color.brand100,
  },
  btnDisabled: { opacity: 0.6 },
  text: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.brand500,
  },
});

export default memo(ExportButton);
