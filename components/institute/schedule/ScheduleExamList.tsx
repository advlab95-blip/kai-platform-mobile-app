// ScheduleExamList — exam schedule cards (read-only summary).
// Pure presentational: parent supplies exams array (already sliced/filtered).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import FadeSlideIn from '../../animated/FadeSlideIn';

type Props = {
  exams: any[];
  emptyLabel: string;
  statusActiveLabel: string;
  statusDraftLabel: string;
};

export default function ScheduleExamList({ exams, emptyLabel, statusActiveLabel, statusDraftLabel }: Props) {
  if (exams.length === 0) {
    return <Text style={styles.emptyTextSmall}>{emptyLabel}</Text>;
  }

  return (
    <View style={{ gap: 10 }}>
      {exams.slice(0, 10).map((item, i) => (
        <FadeSlideIn key={item.id} delay={Math.min(i * 35, 400)} translateFrom={8}>
          <View style={styles.examCard}>
            <View style={styles.examIconBox}>
              <Ionicons name="document-text" size={20} color={Colors.cyan} />
            </View>
            <View style={styles.examInfo}>
              <Text style={styles.examTitle}>{item.title}</Text>
              <Text style={styles.examMeta}>
                {item.duration_minutes} دقيقة {'\u2022'} {item.total_points} درجة
              </Text>
              <Text style={styles.examDate}>
                {new Date(item.created_at).toLocaleDateString('ar-IQ')}
              </Text>
            </View>
            <View style={[styles.examStatusBadge, item.status === 'active' && styles.examStatusActive]}>
              <Text style={[styles.examStatusText, item.status === 'active' && styles.examStatusTextActive]}>
                {item.status === 'active' ? statusActiveLabel : item.status === 'draft' ? statusDraftLabel : item.status}
              </Text>
            </View>
          </View>
        </FadeSlideIn>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyTextSmall: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  examCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 12,
  },
  examIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  examInfo: {
    flex: 1,
  },
  examTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  examMeta: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },
  examDate: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  examStatusBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  examStatusActive: {
    backgroundColor: '#DCFCE7',
  },
  examStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  examStatusTextActive: {
    color: Colors.success,
  },
});
