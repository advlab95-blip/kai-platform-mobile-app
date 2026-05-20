// Alert card in the parent medical alerts list (brief §7.8).
// Unread cards get a red right border + pink background tint.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  title?: string;
  message?: string;
  createdAt?: string;
  unread?: boolean;
}

function MedicalAlertCard({ title, message, createdAt, unread }: Props) {
  return (
    <View style={[styles.card, unread && styles.cardUnread]}>
      <View style={styles.row}>
        <Ionicons name="alert-circle" size={18} color={tokens.color.danger} />
        <Text style={styles.title}>{title || 'تنبيه طبي'}</Text>
      </View>
      {message ? <Text style={styles.body}>{message}</Text> : null}
      {createdAt ? (
        <Text style={styles.date}>{new Date(createdAt).toLocaleString('ar-IQ')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 4,
  },
  cardUnread: {
    borderRightWidth: 4,
    borderRightColor: tokens.color.danger,
    backgroundColor: tokens.color.m50,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    flex: 1,
  },
  body: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 4,
    lineHeight: 18,
  },
  date: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    textAlign: 'left',
    marginTop: 4,
  },
});

export default memo(MedicalAlertCard);
