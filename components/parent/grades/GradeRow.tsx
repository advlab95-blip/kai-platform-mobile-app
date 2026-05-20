// Single grade row inside a subject card on parent grades screen (brief §7.10).
// Category icon (right, color-coded) + category name + date · score X/Y · % · mini bar.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  categoryName: string;
  categoryType?: string;
  score: number;
  maxScore: number;
  enteredAt?: string;
}

const CATEGORY_TINT: Record<string, { bg: string; fg: string; icon: any }> = {
  exam:          { bg: tokens.color.p100,        fg: tokens.color.p600,    icon: 'document-text' },
  quiz:          { bg: tokens.color.brand100,    fg: tokens.color.brand500, icon: 'help-circle' },
  homework:      { bg: tokens.color.warningBg,   fg: tokens.color.warning,  icon: 'pencil' },
  participation: { bg: tokens.color.successBg,   fg: tokens.color.success,  icon: 'hand-right' },
  project:       { bg: tokens.color.pinkBg,      fg: tokens.color.pink,     icon: 'briefcase' },
  default:       { bg: tokens.color.surface2,    fg: tokens.color.text2,    icon: 'pricetag' },
};

function tintFor(type?: string) {
  if (!type) return CATEGORY_TINT.default;
  return CATEGORY_TINT[type] || CATEGORY_TINT.default;
}

function tierColor(pct: number) {
  if (pct >= 85) return tokens.color.success;
  if (pct >= 70) return tokens.color.warning;
  return tokens.color.danger;
}

function GradeRow({ categoryName, categoryType, score, maxScore, enteredAt }: Props) {
  const safeMax = Math.max(maxScore, 1);
  const pct = Math.round((score / safeMax) * 100);
  const color = tierColor(pct);
  const tint = tintFor(categoryType);

  return (
    <View style={styles.row}>
      {/* Left side — score + bar */}
      <View style={styles.scoreSide}>
        <Text style={[styles.score, { color }]}>{score}/{safeMax}</Text>
        <Text style={[styles.pct, { color }]}>{pct}%</Text>
        <View style={styles.barBg}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.max(0, Math.min(100, pct))}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      </View>

      {/* Right side — category icon + name + date */}
      <View style={styles.rightSide}>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.catName} numberOfLines={1}>{categoryName}</Text>
          {enteredAt ? (
            <Text style={styles.date}>
              {new Date(enteredAt).toLocaleDateString('ar-IQ')}
            </Text>
          ) : null}
        </View>
        <View style={[styles.icon, { backgroundColor: tint.bg }]}>
          <Ionicons name={tint.icon} size={16} color={tint.fg} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
    gap: 10,
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: {
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
  scoreSide: {
    width: 96,
    alignItems: 'flex-start',
    gap: 2,
  },
  score: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.black,
  },
  pct: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
  },
  barBg: {
    width: '100%',
    height: 4,
    backgroundColor: tokens.color.surface3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  barFill: { height: 4, borderRadius: 2 },
});

export default memo(GradeRow);
