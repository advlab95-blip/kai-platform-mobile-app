// Certificate card in the parent academic screen (brief §7.5).
// Download button (brand-blue tint) + title + date + ribbon icon.
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  title: string;
  issuedAt?: string;
  onDownload: () => void;
}

function CertificateCard({ title, issuedAt, onDownload }: Props) {
  const handleDownload = useCallback(() => onDownload(), [onDownload]);
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.dlBtn}
        onPress={handleDownload}
        accessibilityRole="button"
        accessibilityLabel="تحميل PDF"
      >
        <Ionicons name="download" size={16} color={tokens.color.brand500} />
        <Text style={styles.dlText}>PDF</Text>
      </TouchableOpacity>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {issuedAt ? (
          <Text style={styles.date}>{new Date(issuedAt).toLocaleDateString('ar-IQ')}</Text>
        ) : null}
      </View>
      <Ionicons name="ribbon" size={22} color={tokens.color.warning} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dlBtn: {
    backgroundColor: tokens.color.brand100,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dlText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.brand500,
  },
  info: { flex: 1, alignItems: 'flex-end', gap: 2 },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  date: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
  },
});

export default memo(CertificateCard);
