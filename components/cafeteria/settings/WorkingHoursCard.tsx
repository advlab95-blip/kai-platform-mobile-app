// Working-hours card (from / to) — orange-tinted time boxes with HH:MM input.
// The hook gates Supabase persistence on isValidTime; partial input only
// updates the visible value.
import React, { memo } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  from: string;
  to: string;
  onChangeFrom: (val: string) => void;
  onChangeTo: (val: string) => void;
}

function WorkingHoursCard({ from, to, onChangeFrom, onChangeTo }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('cafeteria.workingHours')}</Text>
        <Ionicons name="time" size={20} color={tokens.color.o600} />
      </View>
      <View style={styles.row}>
        <View style={styles.item}>
          <Text style={styles.label}>{t('cafeteria.fromLabel')}</Text>
          <View style={styles.box}>
            <TextInput
              style={styles.value}
              value={from}
              onChangeText={onChangeFrom}
              placeholder="08:00"
              placeholderTextColor={tokens.color.text3}
              textAlign="center"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
        </View>
        <View style={styles.item}>
          <Text style={styles.label}>{t('cafeteria.toLabel')}</Text>
          <View style={styles.box}>
            <TextInput
              style={styles.value}
              value={to}
              onChangeText={onChangeTo}
              placeholder="14:00"
              placeholderTextColor={tokens.color.text3}
              textAlign="center"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  item: { alignItems: 'center', gap: 6 },
  label: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text2,
  },
  box: {
    backgroundColor: tokens.color.o50,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: tokens.color.o200,
  },
  value: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.o600,
    minWidth: 70,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});

export default memo(WorkingHoursCard);
