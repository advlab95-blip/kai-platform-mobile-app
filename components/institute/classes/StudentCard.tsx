// Expandable student card on the section drill-down view.
// Pure presentational — parent owns expand/detail state and per-action callbacks.

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import MetricTile from './MetricTile';
import AttendanceDot from './AttendanceDot';
import ActionPill from './ActionPill';
import type { UserLite, StudentDetail } from './_helpers';

interface Props {
  student: UserLite;
  expanded: boolean;
  detail: StudentDetail | undefined;
  onToggle: () => void;
  onResetCode: () => void;
  onTransferSection: () => void;
  onTransferGrade: () => void;
}

export default function StudentCard({
  student, expanded, detail, onToggle, onResetCode, onTransferSection, onTransferGrade,
}: Props) {
  return (
    <View style={styles.studentCard}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.85} style={styles.studentRow}>
        <View style={styles.studentAvatar}>
          <Text style={styles.studentAvatarText}>
            {(student.full_name || '?').trim().charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.studentName} numberOfLines={1}>{student.full_name}</Text>
          {student.code ? <Text style={styles.studentMeta}>رمز: {student.code}</Text> : null}
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.studentDetail}>
          {!detail || detail.loading ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 12 }} />
          ) : (
            <>
              <View style={styles.metricsRow}>
                <MetricTile
                  icon="trending-up" label="المعدل" value={`${detail.avgGrade}`}
                  tint={detail.avgGrade >= 85 ? '#10B981' : detail.avgGrade >= 70 ? '#F59E0B' : '#EF4444'}
                />
                <MetricTile
                  icon="checkmark-circle" label="الحضور" value={`${detail.attendance.percentage}%`}
                  tint={detail.attendance.percentage >= 85 ? '#10B981' : detail.attendance.percentage >= 70 ? '#F59E0B' : '#EF4444'}
                />
                <MetricTile
                  icon="document-text" label="درجات" value={`${detail.grades.length}`} tint="#4F46E5"
                />
              </View>

              <View style={styles.attendanceBreakdown}>
                <AttendanceDot label="حاضر" value={detail.attendance.present} color="#10B981" />
                <AttendanceDot label="متأخر" value={detail.attendance.late} color="#F59E0B" />
                <AttendanceDot label="غائب" value={detail.attendance.absent} color="#EF4444" />
                <AttendanceDot label="معذور" value={detail.attendance.excused} color="#64748B" />
              </View>

              {detail.grades.length > 0 && (
                <>
                  <Text style={styles.detailSectionTitle}>آخر الدرجات</Text>
                  {detail.grades.slice(0, 5).map((g: any, idx: number) => (
                    <View key={`grade-${idx}`} style={styles.gradePillRow}>
                      <Text style={styles.gradeSubject} numberOfLines={1}>
                        {g.subject_name || 'بدون مادة'}
                      </Text>
                      <View style={[styles.gradePill, {
                        backgroundColor: g.score >= 85 ? '#D1FAE5' : g.score >= 70 ? '#FEF3C7' : '#FEE2E2',
                      }]}>
                        <Text style={[styles.gradePillText, {
                          color: g.score >= 85 ? '#059669' : g.score >= 70 ? '#D97706' : '#DC2626',
                        }]}>
                          {g.score}{g.max_score ? ` / ${g.max_score}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              <Text style={styles.detailSectionTitle}>إجراءات الحساب</Text>
              <View style={styles.actionRow}>
                <ActionPill icon="key" label="تغيير الرمز" onPress={onResetCode} />
                <ActionPill icon="swap-horizontal" label="نقل لشعبة" onPress={onTransferSection} />
                <ActionPill icon="arrow-up-circle" label="نقل لصف" onPress={onTransferGrade} />
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  studentCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  studentAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0D9488',
    alignItems: 'center', justifyContent: 'center',
  },
  studentAvatarText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  studentName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  studentMeta: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  studentDetail: {
    padding: 12, paddingTop: 0,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  metricsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  attendanceBreakdown: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: 10, borderRadius: 10, marginTop: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  detailSectionTitle: {
    fontSize: 12, fontWeight: '800',
    color: Colors.textMuted,
    marginTop: 14, marginBottom: 8, textAlign: 'right',
  },
  gradePillRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: 10, borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  gradeSubject: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  gradePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  gradePillText: { fontSize: 12, fontWeight: '900' },
  actionRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginTop: 8, justifyContent: 'flex-end',
  },
});
