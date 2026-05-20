// Lesson row in the parent schedule screen (brief §7.6).
// Left color accent bar (subject-hashed) + body with time + subject + meta + cancelled pill.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../../constants/designTokens';

interface Props {
  subject?: string;
  startTime?: string;
  endTime?: string;
  teacherName?: string;
  room?: string;
  cancelled?: boolean;
  accentColor: string;
}

function LessonRow({ subject, startTime, endTime, teacherName, room, cancelled, accentColor }: Props) {
  return (
    <View style={[styles.card, cancelled && { opacity: 0.55 }]}>
      <View style={[styles.bar, { backgroundColor: accentColor }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.time}>
            {(startTime || '').substring(0, 5)} - {(endTime || '').substring(0, 5)}
          </Text>
          <Text style={styles.subject}>{subject}</Text>
        </View>
        <View style={styles.metaRow}>
          {teacherName ? <Text style={styles.meta}>{teacherName}</Text> : null}
          {room ? <Text style={styles.meta}>{room}</Text> : null}
          {cancelled ? (
            <View style={styles.cancelledPill}>
              <Text style={styles.cancelledText}>ملغاة</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
  },
  bar: { width: 5 },
  body: { flex: 1, padding: 14 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  time: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.p600,
  },
  subject: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 12,
  },
  meta: { fontSize: tokens.font.size.sm, color: tokens.color.text3 },
  cancelledPill: {
    backgroundColor: tokens.color.dangerBg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  cancelledText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.danger,
  },
});

export default memo(LessonRow);
