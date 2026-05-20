// Violet gradient fees card on the parent home (brief §7.1).
// Shows totalPaid + 2 sub-stats (count + semester year).
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  totalPaid: number;
  paymentCount: number;
}

function FeesCard({ totalPaid, paymentCount }: Props) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <LinearGradient
      colors={tokens.gradient.parent}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Ionicons name="wallet" size={20} color="rgba(255,255,255,0.8)" />
        <Text style={styles.title}>{t('parent.fees', { defaultValue: 'الرسوم' })}</Text>
      </View>
      <Text style={styles.amount}>{totalPaid.toLocaleString()} د.ع</Text>
      <Text style={styles.label}>
        {t('parent.totalPayments', { defaultValue: 'إجمالي المدفوع هذا الفصل' })}
      </Text>
      <View style={styles.divider} />
      <View style={styles.subRow}>
        <View style={styles.subItem}>
          <Text style={styles.subValue}>{paymentCount}</Text>
          <Text style={styles.subLabel}>
            {t('parent.paymentCount', { defaultValue: 'عدد الدفعات' })}
          </Text>
        </View>
        <View style={styles.subItem}>
          <Text style={styles.subValue}>{year}</Text>
          <Text style={styles.subLabel}>
            {t('parent.semesterYear', { defaultValue: 'السنة الدراسية' })}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: tokens.spacing[3],
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: 'rgba(255,255,255,0.9)',
  },
  amount: {
    fontSize: tokens.font.size['4xl'],
    fontWeight: tokens.font.weight.black,
    color: '#fff',
    textAlign: 'center',
  },
  label: {
    fontSize: tokens.font.size.sm,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: tokens.spacing[4],
  },
  subRow: { flexDirection: 'row', justifyContent: 'space-around' },
  subItem: { alignItems: 'center' },
  subValue: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.black,
    color: '#fff',
  },
  subLabel: {
    fontSize: tokens.font.size.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    fontWeight: tokens.font.weight.semi,
  },
});

export default memo(FeesCard);
