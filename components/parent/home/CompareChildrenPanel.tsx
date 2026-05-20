// CompareChildrenPanel — side-by-side mini stats for every child the parent
// is linked to. Renders nothing when there's only one child (no comparison
// makes sense). For each child we pull attendance summary + grade avg +
// outstanding fees in parallel. RLS scopes everything to the parent.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { api } from '../../../services/api';
import { getChildFees } from '../../../services/parentService';

type ChildRow = {
  id: string;
  name: string;
  instituteId?: string | null;
};

type Summary = {
  attendanceRate: number;     // 0-100
  attendanceTotal: number;    // total days recorded
  gradeAvg: number;           // 0-100
  gradesCount: number;
  remaining: number;          // unpaid fees
  loading: boolean;
};

type Props = { children: ChildRow[] };

function fmtIQ(n: number): string {
  return Math.round(n).toLocaleString('ar-IQ');
}

export default function CompareChildrenPanel({ children }: Props) {
  // Hide the whole panel when there's nothing to compare.
  if (children.length < 2) return null;

  const [summaries, setSummaries] = useState<Record<string, Summary>>({});

  const loadOne = useCallback(async (child: ChildRow) => {
    setSummaries((prev) => ({
      ...prev,
      [child.id]: { ...(prev[child.id] || { attendanceRate: 0, attendanceTotal: 0, gradeAvg: 0, gradesCount: 0, remaining: 0 }), loading: true },
    }));
    try {
      const instituteId = child.instituteId || undefined;
      const [att, grades, fees] = await Promise.all([
        api.getAttendanceSummary(child.id, instituteId).catch(() => null),
        instituteId
          ? api.getStudentManualGrades(child.id, instituteId).catch(() => [])
          : Promise.resolve([]),
        getChildFees(child.id).catch(() => []),
      ]);

      const rawGrades = (grades as any[]) || [];
      const valid = rawGrades.filter((g) => Number(g.score) >= 0 && Number(g.max_score) > 0);
      const avg = valid.length > 0
        ? valid.reduce((s, g) => s + (Number(g.score) / Number(g.max_score)) * 100, 0) / valid.length
        : 0;

      const remaining = (fees || []).reduce((s, f) => s + Number(f.remaining_amount || 0), 0);

      const a = (att as any) || {};
      setSummaries((prev) => ({
        ...prev,
        [child.id]: {
          attendanceRate: a.percentage != null ? Number(a.percentage) : 0,
          attendanceTotal: a.total != null ? Number(a.total) : 0,
          gradeAvg: avg,
          gradesCount: valid.length,
          remaining,
          loading: false,
        },
      }));
    } catch (err) {
      setSummaries((prev) => ({
        ...prev,
        [child.id]: { attendanceRate: 0, attendanceTotal: 0, gradeAvg: 0, gradesCount: 0, remaining: 0, loading: false },
      }));
    }
  }, []);

  useEffect(() => {
    children.forEach((c) => { void loadOne(c); });
  }, [children, loadOne]);

  const sorted = useMemo(() => children.slice(), [children]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Ionicons name="people" size={14} color={tokens.color.brand500} />
        </View>
        <Text style={styles.title}>مقارنة الأبناء</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
        {sorted.map((c) => {
          const s = summaries[c.id];
          const attRate = s?.attendanceRate ?? 0;
          const attColor =
            attRate >= 85 ? tokens.color.success
            : attRate >= 60 ? tokens.color.warning
            : tokens.color.danger;
          const gradeColor =
            (s?.gradeAvg ?? 0) >= 70 ? tokens.color.success
            : (s?.gradeAvg ?? 0) >= 50 ? tokens.color.warning
            : tokens.color.danger;
          return (
            <View key={c.id} style={styles.card}>
              <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
              {s?.loading ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <ActivityIndicator color={tokens.color.brand500} size="small" />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Stat
                    label="حضور"
                    value={s ? `${Math.round(s.attendanceRate)}%` : '—'}
                    color={attColor}
                    icon="checkmark-circle"
                  />
                  <Stat
                    label="معدل"
                    value={s && s.gradesCount > 0 ? `${Math.round(s.gradeAvg)}%` : '—'}
                    color={gradeColor}
                    icon="school"
                  />
                  <Stat
                    label="متبقي"
                    value={s ? (s.remaining > 0 ? `${fmtIQ(s.remaining)} د.ع` : '✓') : '—'}
                    color={s && s.remaining > 0 ? tokens.color.danger : tokens.color.success}
                    icon="wallet"
                  />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, color, icon }: {
  label: string;
  value: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={12} color={color} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  headerIconWrap: {
    width: 26, height: 26, borderRadius: 9,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '800', color: tokens.color.text, textAlign: 'right' },
  card: {
    width: 180,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 12,
    gap: 10,
  },
  name: { fontSize: 13, fontWeight: '900', color: tokens.color.text, textAlign: 'right' },
  statRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  statIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  statLabel: { flex: 1, fontSize: 11, color: tokens.color.text3, fontWeight: '600', textAlign: 'right' },
  statValue: { fontSize: 12, fontWeight: '900' },
});
