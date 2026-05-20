// AssignmentsByDay — groups assignments by due date into calendar-style
// buckets: Today / Tomorrow / This week / Later / No due date.
//
// Used as the "by-day view" alternative to the flat AssignmentList in
// (student)/assignments.tsx. Doesn't fetch — receives the already-filtered
// `assignments` array from the screen.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import FadeSlideIn from '../../animated/FadeSlideIn';

type Assignment = {
  id: string;
  title?: string;
  subject?: string | null;
  due_date?: string | null;
  source?: string;
  [k: string]: any;
};

type Bucket = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  items: Assignment[];
};

type Props = {
  assignments: Assignment[];
  onRowPress: (a: Assignment) => void;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / (24 * 60 * 60 * 1000));
}

export default function AssignmentsByDay({ assignments, onRowPress }: Props) {
  const buckets = useMemo<Bucket[]>(() => {
    const today = startOfDay(new Date());
    const groups: Record<string, Assignment[]> = {
      overdue: [], today: [], tomorrow: [], this_week: [], later: [], no_due: [],
    };
    for (const a of assignments) {
      if (!a.due_date) { groups.no_due.push(a); continue; }
      const d = new Date(a.due_date);
      if (isNaN(d.getTime())) { groups.no_due.push(a); continue; }
      const diff = daysBetween(today, d);
      if (diff < 0) groups.overdue.push(a);
      else if (diff === 0) groups.today.push(a);
      else if (diff === 1) groups.tomorrow.push(a);
      else if (diff <= 7) groups.this_week.push(a);
      else groups.later.push(a);
    }

    // Sort each group by due_date ascending.
    const sortByDue = (arr: Assignment[]) =>
      arr.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

    return ([
      { key: 'overdue',   label: 'متأخر',           icon: 'alert-circle',     accent: tokens.color.danger },
      { key: 'today',     label: 'اليوم',            icon: 'today',            accent: tokens.color.brand500 },
      { key: 'tomorrow',  label: 'غداً',             icon: 'sunny-outline',    accent: tokens.color.warning },
      { key: 'this_week', label: 'هذا الأسبوع',      icon: 'calendar-outline', accent: tokens.color.info },
      { key: 'later',     label: 'لاحقاً',           icon: 'time-outline',     accent: tokens.color.text3 },
      { key: 'no_due',    label: 'بدون موعد',        icon: 'help-circle-outline', accent: tokens.color.text4 },
    ] as Bucket[])
      .map((b) => ({ ...b, items: sortByDue(groups[b.key]) }))
      .filter((b) => b.items.length > 0);
  }, [assignments]);

  if (buckets.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16, gap: 14 }}>
      {buckets.map((b, idx) => (
        <FadeSlideIn key={b.key} delay={idx * 50} translateFrom={8}>
          <View>
            <View style={styles.bucketHeader}>
              <View style={[styles.bucketIcon, { backgroundColor: b.accent + '20' }]}>
                <Ionicons name={b.icon} size={14} color={b.accent} />
              </View>
              <Text style={[styles.bucketTitle, { color: b.accent }]}>
                {b.label} ({b.items.length})
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {b.items.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => onRowPress(a)}
                  activeOpacity={0.85}
                  style={[styles.row, { borderRightColor: b.accent }]}
                >
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {a.title || 'واجب'}
                  </Text>
                  <View style={styles.rowMeta}>
                    {a.subject ? (
                      <View style={styles.subjectPill}>
                        <Text style={styles.subjectText}>{a.subject}</Text>
                      </View>
                    ) : null}
                    {a.due_date ? (
                      <Text style={styles.dueText}>
                        {formatDueDate(a.due_date)}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </FadeSlideIn>
      ))}
    </View>
  );
}

function formatDueDate(ymd: string): string {
  try {
    const d = new Date(ymd);
    return d.toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return ymd; }
}

const styles = StyleSheet.create({
  bucketHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  bucketIcon: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  bucketTitle: { fontSize: 13, fontWeight: '800' },
  row: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRightWidth: 4,
    padding: 12,
    gap: 8,
  },
  rowTitle: { fontSize: 13, fontWeight: '800', color: tokens.color.text, textAlign: 'right' },
  rowMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  subjectPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: tokens.color.brand100,
  },
  subjectText: { fontSize: 10, fontWeight: '700', color: tokens.color.brand500 },
  dueText: { fontSize: 11, color: tokens.color.text3, fontWeight: '600' },
});
