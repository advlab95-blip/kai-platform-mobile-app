// Two gradient stat cards (total students + completed records w/ percentage badge).
import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  totalStudents: number;
  withRecords: number;
}

function StatsRow({ totalStudents, withRecords }: Props) {
  const { t } = useTranslation();
  const coveragePct = useMemo(
    () => (totalStudents > 0 ? Math.round((withRecords / totalStudents) * 100) : 0),
    [totalStudents, withRecords],
  );

  return (
    <View style={styles.row}>
      <LinearGradient colors={tokens.gradient.medicalBtn} style={styles.card}>
        <Text style={styles.value}>{totalStudents}</Text>
        <Text style={styles.label}>{t('medical.totalStudents')}</Text>
        <View style={styles.iconBg}>
          <Ionicons name="people" size={30} color="rgba(255,255,255,0.08)" />
        </View>
      </LinearGradient>

      <LinearGradient colors={tokens.gradient.success} style={styles.card}>
        <View style={styles.pctBadge}>
          <Text style={styles.pctText}>{coveragePct}%</Text>
        </View>
        <Text style={styles.value}>{withRecords}</Text>
        <Text style={styles.label}>{t('medical.completedRecords')}</Text>
        <View style={styles.iconBg}>
          <Ionicons name="document-text" size={30} color="rgba(255,255,255,0.08)" />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: tokens.spacing[4] },
  card: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    padding: 14,
    minHeight: 85,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  value: {
    fontSize: tokens.font.size['3xl'] + 2,
    fontWeight: tokens.font.weight.black,
    color: '#fff',
    textAlign: 'right',
  },
  label: {
    fontSize: tokens.font.size.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: tokens.font.weight.semi,
    textAlign: 'right',
    marginTop: 2,
  },
  iconBg: { position: 'absolute', bottom: 8, left: 8 },
  pctBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  pctText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.heavy,
    color: '#fff',
  },
});

export default memo(StatsRow);
