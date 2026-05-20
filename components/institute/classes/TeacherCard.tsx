// Teacher row card on the section detail view.
// Pure presentational; parent passes the user + per-action handlers.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../../constants/colors';
import ActionPill from './ActionPill';
import type { UserLite } from './_helpers';

interface Props {
  teacher: UserLite;
  onResetCode: () => void;
  onTransferSection: () => void;
  onTransferGrade: () => void;
}

export default function TeacherCard({ teacher, onResetCode, onTransferSection, onTransferGrade }: Props) {
  return (
    <View style={styles.teacherCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={styles.teacherAvatar}>
          <Text style={styles.teacherAvatarText}>
            {(teacher.full_name || '?').trim().charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.teacherName}>{teacher.full_name}</Text>
          {teacher.subjects && teacher.subjects.length > 0 ? (
            <Text style={styles.teacherSubject} numberOfLines={2}>
              {teacher.subjects.join(' · ')}
            </Text>
          ) : null}
          {teacher.code ? <Text style={styles.teacherCode}>رمز: {teacher.code}</Text> : null}
        </View>
      </View>
      <View style={styles.actionRow}>
        <ActionPill icon="key" label="تغيير الرمز" onPress={onResetCode} />
        <ActionPill icon="swap-horizontal" label="نقل لشعبة" onPress={onTransferSection} />
        <ActionPill icon="arrow-up-circle" label="نقل لصف" onPress={onTransferGrade} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  teacherCard: {
    backgroundColor: Colors.surface,
    padding: 12, borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  teacherAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#4F46E5',
    alignItems: 'center', justifyContent: 'center',
  },
  teacherAvatarText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  teacherName: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  teacherSubject: { fontSize: 12, color: '#0D9488', fontWeight: '700', marginTop: 3, textAlign: 'right' },
  teacherCode: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textAlign: 'right' },
  actionRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginTop: 8, justifyContent: 'flex-end',
  },
});
