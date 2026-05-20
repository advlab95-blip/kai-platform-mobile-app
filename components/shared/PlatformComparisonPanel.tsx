import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { api } from '../../services/api';
import type { PlatformInstituteSummary } from '../../types';

interface Props {
  refreshNonce?: number;
}

// Super-admin only — horizontal ranking of institutes by student count.
// Scales gracefully whether there's 1, 2, or 8 institutes (vertical bar charts
// look broken with a single tall bar; a ranked list stays balanced).
export default function PlatformComparisonPanel({ refreshNonce }: Props) {
  const [data, setData] = useState<PlatformInstituteSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await api.getPlatformInstitutesSummary();
        if (!alive) return;
        setData(rows);
      } catch (err: any) {
        if (!alive) return;
        const raw = err?.message || '';
        const friendly =
          /not_authenticated|JWT|expired|session/i.test(raw) ? 'انتهت الجلسة — أعد تسجيل الدخول'
          : /not_authorized|permission|denied/i.test(raw)    ? ''
          : 'تعذّر تحميل مقارنة المؤسسات';
        setError(friendly);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshNonce]);

  if (loading && !data) {
    return (
      <View style={styles.section}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (error !== null && !data) {
    if (!error) return null;
    return (
      <View style={styles.errorBox}>
        <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) return null;

  // Sort descending by student count so ranking is always meaningful
  const sorted = [...data].sort((a, b) => b.students - a.students);
  const top = sorted.slice(0, 8);
  const max = Math.max(1, ...top.map((i) => i.students));
  const totalStudents = sorted.reduce((s, i) => s + i.students, 0);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.titleIcon}>
            <Ionicons name="trophy" size={14} color="#F59E0B" />
          </View>
          <Text style={styles.title}>ترتيب المؤسسات (طلاب)</Text>
        </View>
        <View style={styles.totalPill}>
          <Text style={styles.totalPillText}>{totalStudents.toLocaleString('ar')}</Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {top.map((inst, idx) => {
          const pct = max === 0 ? 0 : Math.round((inst.students / max) * 100);
          const rank = idx + 1;
          const chars = Array.from(inst.name || '');
          const label = chars.length > 22 ? chars.slice(0, 21).join('') + '…' : inst.name;
          return (
            <View key={inst.institute_id || `inst-${idx}`} style={styles.row}>
              <View style={styles.rankWrap}>
                {rank <= 3 ? (
                  <LinearGradient
                    colors={RANK_GRADIENTS[rank - 1]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.rankBadge}
                  >
                    <Text style={styles.rankBadgeText}>{rank}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.rankBadge, styles.rankBadgeDim]}>
                    <Text style={styles.rankBadgeTextDim}>{rank}</Text>
                  </View>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={styles.name} numberOfLines={1}>{label}</Text>
                  <Text style={styles.count}>{inst.students.toLocaleString('ar')}</Text>
                </View>
                <View style={styles.trackSlim}>
                  <LinearGradient
                    colors={rank === 1 ? ['#4F46E5', '#7C3AED'] : ['#64748B', '#94A3B8']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[styles.fillSlim, { width: `${Math.max(pct, 4)}%` }]}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {sorted.length > 8 && (
        <Text style={styles.footnote}>
          عرض أعلى 8 من أصل {sorted.length} مؤسسة
        </Text>
      )}
    </View>
  );
}

const RANK_GRADIENTS: [string, string][] = [
  ['#F59E0B', '#D97706'], // gold
  ['#94A3B8', '#64748B'], // silver
  ['#CD7F32', '#A0522D'], // bronze
];

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  totalPill: {
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  totalPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankWrap: {
    width: 32,
    alignItems: 'center',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
  },
  rankBadgeDim: {
    backgroundColor: '#F1F5F9',
  },
  rankBadgeTextDim: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
  },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginLeft: 8,
  },
  count: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primary,
  },
  trackSlim: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fillSlim: {
    height: '100%',
    borderRadius: 3,
  },
  footnote: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '600',
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
