import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { api } from '../../services/api';
import ProgressRing from '../charts/ProgressRing';
import type { StudentProgress as StudentProgressData, ProgressPeriod } from '../../types';

interface Props {
  studentId: string;
  defaultPeriod?: ProgressPeriod;
  compact?: boolean;  // when true, only show one ring (overall) — used in lists
}

const PERIOD_LABELS: Record<ProgressPeriod, string> = {
  week: 'أسبوع',
  month: 'شهر',
  semester: 'فصل',
  year: 'سنة',
};

const TREND_ICON: Record<'up' | 'down' | 'flat', { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  up:   { name: 'arrow-up',   color: Colors.success },
  down: { name: 'arrow-down', color: Colors.error },
  flat: { name: 'remove',     color: Colors.textMuted },
};

export default function StudentProgress({
  studentId,
  defaultPeriod = 'month',
  compact = false,
}: Props) {
  const [period, setPeriod] = useState<ProgressPeriod>(defaultPeriod);
  const [data, setData] = useState<StudentProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const progress = await api.getStudentProgress(studentId, period);
        if (!alive) return;
        setData(progress);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'تعذّر تحميل التقدم الأكاديمي');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [studentId, period]);

  if (loading && !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.errorBox}>
        <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!data) return null;

  const overallPct = data.overall_avg ?? 0;
  const attendancePct = data.attendance.pct ?? 0;

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <ProgressRing value={overallPct} size={56} stroke={6} label="معدل" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Period toggle */}
      <View style={styles.periodRow}>
        {(Object.keys(PERIOD_LABELS) as ProgressPeriod[]).map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPeriod(p)}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p }}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Rings row */}
      <View style={styles.ringsRow}>
        <ProgressRing value={overallPct} label="المعدل" color={Colors.primary} />
        <ProgressRing value={attendancePct} label="الحضور" color={Colors.success} />
      </View>

      {/* Attendance detail */}
      {data.attendance.total_days > 0 && (
        <Text style={styles.detailLine}>
          {data.attendance.total_days} يوم دراسي — {data.attendance.absent_days} غياب
        </Text>
      )}

      {/* Subjects list */}
      {data.subjects.length > 0 ? (
        <View style={styles.subjectsBox}>
          <Text style={styles.sectionTitle}>المواد</Text>
          {data.subjects.map((s) => {
            const pct = s.avg_pct ?? 0;
            const trendInfo = TREND_ICON[s.trend];
            return (
              <View key={s.subject_name} style={styles.subjectRow}>
                <View style={styles.subjectHeader}>
                  <Ionicons name={trendInfo.name} size={14} color={trendInfo.color} />
                  <Text style={styles.subjectName} numberOfLines={1}>
                    {s.subject_name}
                  </Text>
                  <Text style={styles.subjectPct}>{Math.round(pct)}%</Text>
                </View>
                <View style={styles.subjectBarTrack}>
                  <View style={[styles.subjectBarFill, { width: `${pct}%` }]} />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyText}>لا توجد درجات في هذه الفترة</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  loading: { padding: 24, alignItems: 'center' },
  periodRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: Colors.background,
    padding: 4,
    borderRadius: 10,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodBtnActive: {
    backgroundColor: Colors.primary,
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  periodTextActive: {
    color: Colors.textOnPrimary,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  detailLine: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  subjectsBox: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  subjectRow: {
    gap: 4,
  },
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subjectName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  subjectPct: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
    minWidth: 40,
    textAlign: 'left',
  },
  subjectBarTrack: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  subjectBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  compactRow: {
    alignItems: 'center',
    padding: 4,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: Colors.error + '10',
    borderRadius: 10,
  },
  errorText: { color: Colors.error, fontSize: 12, flex: 1 },
});
