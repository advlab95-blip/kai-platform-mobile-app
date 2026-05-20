// Overall grade card on parent grades screen (brief §7.10).
// Gradient tier (good ≥ 70 / mid 50-69 / low < 50). Big % on right, letter pill on left,
// 3 sub-stats below a divider (total grades / subjects count / categories count).
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../../constants/designTokens';

interface Props {
  pct: number;
  letter: string;
  totalGrades: number;
  subjectCount: number;
  categoryCount: number;
}

function tierGradient(pct: number) {
  if (pct >= 70) return tokens.gradient.gradeGood;
  if (pct >= 50) return tokens.gradient.gradeMid;
  return tokens.gradient.gradeLow;
}

function OverallGradeCard({ pct, letter, totalGrades, subjectCount, categoryCount }: Props) {
  return (
    <LinearGradient
      colors={tierGradient(pct)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.row}>
        <View style={styles.letterPill}>
          <Text style={styles.letter}>{letter}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.pct}>{pct}%</Text>
          <Text style={styles.label}>المتوسط العام</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <Stat value={totalGrades} label="درجة" />
        <View style={styles.statDivider} />
        <Stat value={subjectCount} label="مادة" />
        <View style={styles.statDivider} />
        <Stat value={categoryCount} label="فئة" />
      </View>
    </LinearGradient>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.xl,
    padding: 22,
    marginBottom: tokens.spacing[4],
    ...tokens.shadow.parent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  letterPill: {
    minWidth: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: '#fff',
  },
  pct: {
    fontSize: tokens.font.size['5xl'],
    fontWeight: tokens.font.weight.black,
    color: '#fff',
  },
  label: {
    fontSize: tokens.font.size.sm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: tokens.font.weight.semi,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  statValue: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.black,
    color: '#fff',
  },
  statLabel: {
    fontSize: tokens.font.size.xs,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: tokens.font.weight.semi,
    marginTop: 2,
  },
});

export default memo(OverallGradeCard);
