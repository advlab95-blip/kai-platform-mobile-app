// TopBottomStudents — collapsible "أفضل/أضعف" panel for the teacher students list.
//
// Fetches manual_grades rows for the visible students once on expand, computes
// each student's average (score / max_score × 100), and renders the top-3 +
// bottom-3 by that average. The fetch is teacher-scoped (teacher_id = me)
// AND student-id list scoped, so the payload stays small (~30 students × a
// few grades each).
//
// We deliberately use a single .in('student_id', […]) query instead of N+1
// per-student lookups.

import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import { supabase } from '../../../services/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Student = { id: string; full_name: string };
type Ranking = { id: string; full_name: string; avg: number; count: number };

type Props = {
  students: Student[];
  teacherId: string;
  instituteId: string;
  /** Optional subject filter — when the teacher is drilled into a specific
   *  section that's tied to a subject, scope grades to that subject so the
   *  ranking reflects what THIS teacher actually graded. */
  subjectName?: string | null;
};

const TOP_N = 3;

export default function TopBottomStudents({ students, teacherId, instituteId, subjectName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rankings, setRankings] = useState<Ranking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    if (!next || rankings || loading) return;

    setLoading(true);
    setError(null);
    try {
      const studentIds = students.map((s) => s.id);
      if (studentIds.length === 0) {
        setRankings([]);
        return;
      }

      let q = supabase
        .from('manual_grades')
        .select('student_id, score, max_score, subject')
        .eq('institute_id', instituteId)
        .eq('teacher_id', teacherId)
        .eq('is_published', true)
        .in('student_id', studentIds)
        .limit(2000);
      if (subjectName) q = q.eq('subject', subjectName);

      const { data, error: qErr } = await q;
      if (qErr) throw qErr;

      // Aggregate per student.
      const agg = new Map<string, { sum: number; count: number }>();
      for (const r of (data || []) as any[]) {
        const sc = Number(r.score);
        const max = Number(r.max_score) || 100;
        if (Number.isFinite(sc) && max > 0) {
          const pct = (sc / max) * 100;
          const cur = agg.get(r.student_id) || { sum: 0, count: 0 };
          cur.sum += pct;
          cur.count += 1;
          agg.set(r.student_id, cur);
        }
      }

      const rows: Ranking[] = students
        .map((s) => {
          const a = agg.get(s.id);
          if (!a || a.count === 0) return null;
          return { id: s.id, full_name: s.full_name, avg: a.sum / a.count, count: a.count };
        })
        .filter((x): x is Ranking => x !== null)
        .sort((a, b) => b.avg - a.avg);

      setRankings(rows);
    } catch (err: any) {
      setError(err?.message || 'فشل جلب البيانات');
    } finally {
      setLoading(false);
    }
  }, [expanded, rankings, loading, students, teacherId, instituteId, subjectName]);

  const top = useMemo(() => rankings?.slice(0, TOP_N) || [], [rankings]);
  const bottom = useMemo(() => {
    if (!rankings || rankings.length <= TOP_N) return [];
    return rankings.slice(-TOP_N).reverse();
  }, [rankings]);

  // Hide entirely when there aren't enough students to make a ranking meaningful.
  if (students.length < 3) return null;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.85} style={styles.header}>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={tokens.color.text3}
        />
        <View style={styles.headerRight}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="podium" size={14} color={tokens.color.brand500} />
          </View>
          <Text style={styles.headerTitle}>أفضل وأضعف الطلاب</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={tokens.color.brand500} style={{ marginVertical: 16 }} />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : !rankings || rankings.length === 0 ? (
            <Text style={styles.emptyText}>
              لا توجد درجات منشورة بعد لحساب الترتيب
            </Text>
          ) : (
            <View style={{ gap: 14 }}>
              <Section
                title="الأفضل"
                icon="trophy"
                color={tokens.color.success}
                rows={top}
                rankPrefix={1}
              />
              {bottom.length > 0 && (
                <Section
                  title="بحاجة دعم"
                  icon="alert-circle"
                  color={tokens.color.warning}
                  rows={bottom}
                  rankPrefix={rankings.length - bottom.length + 1}
                />
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Section({
  title, icon, color, rows, rankPrefix,
}: {
  title: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  color: string;
  rows: Ranking[];
  rankPrefix: number;
}) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {rows.map((r, i) => (
          <View key={r.id} style={styles.row}>
            <Text style={[styles.avgText, { color }]}>{Math.round(r.avg)}%</Text>
            <Text style={styles.nameText} numberOfLines={1}>{r.full_name}</Text>
            <View style={styles.rankPill}>
              <Text style={styles.rankText}>{rankPrefix + i}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  headerIconWrap: {
    width: 26, height: 26, borderRadius: 9,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 13, fontWeight: '800', color: tokens.color.text },

  body: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border2,
    paddingTop: 12,
  },

  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  sectionIconWrap: {
    width: 22, height: 22, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 12, fontWeight: '800' },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface2,
    gap: 10,
  },
  rankPill: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 11, fontWeight: '800', color: tokens.color.text3 },
  nameText: { flex: 1, fontSize: 13, color: tokens.color.text, textAlign: 'right' },
  avgText: { fontSize: 13, fontWeight: '900' },

  emptyText: {
    fontSize: 12,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
