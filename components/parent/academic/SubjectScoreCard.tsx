// Subject score card in the parent academic screen (brief §7.5).
// Score pill + exam title + colored progress bar.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../../constants/designTokens';

interface Props {
  title: string;
  score: number;
  totalPoints: number;
}

function tierColor(pct: number) {
  if (pct >= 90) return tokens.color.success;
  if (pct >= 75) return tokens.color.warning;
  return tokens.color.danger;
}

function SubjectScoreCard({ title, score, totalPoints }: Props) {
  const safeTotal = totalPoints || 1;
  const percentage = Math.round((score / safeTotal) * 100);
  const color = tierColor(percentage);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.score, { color }]}>{score}/{safeTotal}</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, percentage))}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    flex: 1,
    marginLeft: 8,
  },
  score: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.black,
  },
  barBg: {
    height: 8,
    backgroundColor: tokens.color.surface3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4 },
});

export default memo(SubjectScoreCard);
