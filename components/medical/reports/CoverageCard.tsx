// Coverage card: 3 stats + tier-colored progress bar.
// Color tier: green ≥80, amber ≥50, red <50.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  withRecords: number;
  totalStudents: number;
  coveragePercent: number;
}

function tierColor(pct: number) {
  if (pct >= 80) return tokens.color.success;
  if (pct >= 50) return tokens.color.warning;
  return tokens.color.danger;
}

function CoverageCard({ withRecords, totalStudents, coveragePercent }: Props) {
  const { t } = useTranslation();
  const color = tierColor(coveragePercent);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('medical.recordCoverage')}</Text>
      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.value}>{withRecords}</Text>
          <Text style={styles.label}>{t('medical.withRecord')}</Text>
        </View>
        <View style={styles.center}>
          <Text style={[styles.percent, { color }]}>{coveragePercent}%</Text>
          <Text style={styles.label}>{t('medical.coverageLabel')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.value}>{totalStudents}</Text>
          <Text style={styles.label}>{t('medical.totalStudentsLabel')}</Text>
        </View>
      </View>
      <View style={styles.barBg}>
        <View
          style={[
            styles.barFill,
            { width: `${coveragePercent}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 18,
    marginBottom: tokens.spacing[4],
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  cardTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[4],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: tokens.spacing[4],
  },
  stat: { alignItems: 'center' },
  center: { alignItems: 'center' },
  value: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    fontFamily: 'Rubik',
  },
  percent: {
    fontSize: tokens.font.size['5xl'],
    fontWeight: tokens.font.weight.black,
    fontFamily: 'Rubik',
  },
  label: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    fontWeight: tokens.font.weight.semi,
    marginTop: 2,
  },
  barBg: {
    height: 10,
    backgroundColor: tokens.color.surface3,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: 5 },
});

export default memo(CoverageCard);
