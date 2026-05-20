// Subject card on parent grades screen (brief §7.10).
// Card header (violet-tinted): subject name + teacher name + "N درجات" + average pill.
// Below: rows of GradeRow for each grade in this subject.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../../constants/designTokens';
import GradeRow from './GradeRow';

export interface SubjectGradeItem {
  id: string;
  categoryName: string;
  categoryType?: string;
  score: number;
  maxScore: number;
  enteredAt?: string;
}

interface Props {
  subject: string;
  teacherName?: string;
  avg: number;
  items: SubjectGradeItem[];
}

function GradeSubjectCard({ subject, teacherName, avg, items }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avgPill}>
          <Text style={styles.avgValue}>{avg}%</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.subject} numberOfLines={1}>{subject}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {teacherName ? `${teacherName} · ` : ''}{items.length} درجات
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {items.map((item) => (
          <GradeRow
            key={item.id}
            categoryName={item.categoryName}
            categoryType={item.categoryType}
            score={item.score}
            maxScore={item.maxScore}
            enteredAt={item.enteredAt}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
    ...tokens.shadow.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: tokens.color.p50,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.p100,
  },
  avgPill: {
    minWidth: 56,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.p100,
  },
  avgValue: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.black,
    color: tokens.color.p600,
    textAlign: 'center',
  },
  subject: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  meta: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  body: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4 },
});

export default memo(GradeSubjectCard);
