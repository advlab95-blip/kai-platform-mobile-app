import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import SimpleLineChart, { LinePoint } from '../charts/SimpleLineChart';
import SimpleBarChart, { BarSegment } from '../charts/SimpleBarChart';
import type { DashboardStats } from '../../types';

interface Props {
  instituteId: string;
  refreshNonce?: number; // bump to trigger reload (e.g. from pull-to-refresh)
}

// Institute-admin dashboard widgets: 7-day attendance trend + fees bar + alerts.
// (Top stat cards moved to StatsStrip on the home screen to avoid duplication.)
// Pulls everything from a single RPC (`get_institute_dashboard_stats`) so weak
// connections only pay for one round trip.
export default function InstituteDashboardPanel({ instituteId, refreshNonce }: Props) {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!instituteId) return;
    let alive = true;
    setLoading(true);
    setError(null);

    const fetchStats = async () => {
      try {
        const stats = await api.getDashboardStats(instituteId);
        if (!alive) return;
        setData(stats);
        setError(null);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'تعذّر تحميل الإحصائيات');
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchStats();

    // Realtime: refresh stats whenever this institute's enrollments/attendance/fees
    // change. Debounced to absorb bulk-operation bursts (e.g. taking attendance for
    // a full class sends one recompute instead of one per student).
    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (alive) fetchStats();
      }, 1000);
    };

    const chan = supabase
      .channel(`institute-stats-${instituteId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'enrollments',
        filter: `institute_id=eq.${instituteId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'attendance',
        filter: `institute_id=eq.${instituteId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'student_fees',
        filter: `institute_id=eq.${instituteId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'fee_payments',
        filter: `institute_id=eq.${instituteId}`,
      }, scheduleRefresh)
      .subscribe();

    return () => {
      alive = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(chan);
    };
  }, [instituteId, refreshNonce]);

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
        <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!data) return null;

  const linePoints: LinePoint[] = (data.attendance_history || []).map((d) => ({
    label: String(d.date).slice(5, 10), // MM-DD (defensive against ISO-with-time)
    value: d.present,
  }));

  const feesBars: BarSegment[] = [
    { label: 'مُحصّل', value: data.fees.collected, color: Colors.success },
    { label: 'متبقي', value: data.fees.remaining, color: Colors.warning },
  ];

  const fmtMoney = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}م` :
    v >= 1_000     ? `${Math.round(v / 1_000)}ألف` :
    String(Math.round(v));

  return (
    <View style={styles.container}>
      {/* Stat cards row removed — duplicated by StatsStrip on the home screen.
          Keep this panel for the deeper aggregations (weekly trend, fees bar, alerts). */}

      {/* Weekly attendance trend */}
      {linePoints.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الحضور خلال الأسبوع</Text>
          <SimpleLineChart data={linePoints} color={Colors.primary} />
        </View>
      )}

      {/* Fees bar chart */}
      {(data.fees.collected > 0 || data.fees.remaining > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الأقساط</Text>
          <SimpleBarChart data={feesBars} formatValue={fmtMoney} />
        </View>
      )}

      {/* Alerts */}
      {(data.alerts.chronic_absent.length > 0 || data.alerts.overdue_fees > 0) && (
        <View style={styles.alertsBox}>
          <View style={styles.alertsHeader}>
            <Ionicons name="warning-outline" size={16} color={Colors.warning} />
            <Text style={styles.alertsTitle}>تنبيهات</Text>
          </View>
          {data.alerts.overdue_fees > 0 && (
            <Text style={styles.alertLine}>
              • {data.alerts.overdue_fees} قسط متأخر عن موعده
            </Text>
          )}
          {data.alerts.chronic_absent.map((s) => (
            <Text key={s.student_id} style={styles.alertLine}>
              • {s.full_name}: {s.absences} أيام غياب (30 يوم)
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  loading: { padding: 24, alignItems: 'center' },
  cardsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'right',
  },
  alertsBox: {
    backgroundColor: Colors.warning + '12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    padding: 12,
    gap: 4,
  },
  alertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  alertsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  alertLine: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 18,
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
