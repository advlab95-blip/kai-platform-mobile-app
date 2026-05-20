// Single payment row in the parent finance screen (brief §7.7).
// Receipt icon + description + date + green amount.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  description?: string;
  amount: number;
  paidAt?: string;
}

function PaymentRow({ description, amount, paidAt }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Ionicons name="receipt" size={20} color={tokens.color.p600} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{description || 'دفعة'}</Text>
        {paidAt ? (
          <Text style={styles.date}>{new Date(paidAt).toLocaleDateString('ar-IQ')}</Text>
        ) : null}
      </View>
      <Text style={styles.amount}>{amount.toLocaleString()} د.ع</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tokens.color.p100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, marginHorizontal: 12, alignItems: 'flex-end' },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  date: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    marginTop: 2,
  },
  amount: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.black,
    color: tokens.color.success,
  },
});

export default memo(PaymentRow);
