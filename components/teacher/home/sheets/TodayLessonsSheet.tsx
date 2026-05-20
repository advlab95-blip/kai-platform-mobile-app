import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { Colors } from '../../../../constants/colors';

export type TodayLesson = {
  id: string;
  subject: string;
  start_time: string;
  end_time: string;
  room?: string;
  sectionName?: string;
  attendance?: { present: number; total: number };
};

type Props = {
  visible: boolean;
  onClose: () => void;
  lessons: TodayLesson[];
};

function fmt(t?: string): { hm: string; ampm: string } {
  if (!t) return { hm: '', ampm: '' };
  const [h, m] = t.split(':').map(Number);
  const hh = h || 0;
  const ampm = hh < 12 ? 'ص' : 'م';
  const h12 = hh % 12 || 12;
  return { hm: `${h12}:${String(m || 0).padStart(2, '0')}`, ampm };
}

export default function TodayLessonsSheet({ visible, onClose, lessons }: Props) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (t?: string) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const sorted = [...lessons].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <View style={styles.header}>
        <Text style={styles.title}>حصص اليوم</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{sorted.length}</Text>
        </View>
      </View>

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>لا توجد حصص لك اليوم</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
          {sorted.map((l) => {
            const s = toMin(l.start_time);
            const e = toMin(l.end_time);
            const isLive = nowMin >= s && nowMin < e;
            const isPast = nowMin >= e;
            const start = fmt(l.start_time);
            const end = fmt(l.end_time);
            const att = l.attendance || { present: 0, total: 0 };
            const pct = att.total > 0 ? Math.round((att.present / att.total) * 100) : null;

            return (
              <View key={l.id} style={[styles.row, isPast && { opacity: 0.55 }]}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeHM}>{start.hm}</Text>
                  <Text style={styles.timeAm}>{start.ampm}</Text>
                  <View style={styles.timeBar} />
                  <Text style={styles.timeHM}>{end.hm}</Text>
                  <Text style={styles.timeAm}>{end.ampm}</Text>
                </View>

                <View style={styles.body}>
                  <View style={styles.bodyTop}>
                    <Text style={styles.subject} numberOfLines={1}>{l.subject || 'حصة'}</Text>
                    {isLive && (
                      <View style={styles.livePill}>
                        <View style={styles.liveDot} />
                        <Text style={styles.livePillText}>الآن</Text>
                      </View>
                    )}
                  </View>
                  {l.sectionName ? (
                    <Text style={styles.section} numberOfLines={1}>
                      <Ionicons name="people-outline" size={12} color={Colors.textSecondary} /> {l.sectionName}
                    </Text>
                  ) : null}
                  {l.room ? (
                    <Text style={styles.room} numberOfLines={1}>
                      <Ionicons name="location-outline" size={12} color={Colors.textMuted} /> قاعة {l.room}
                    </Text>
                  ) : null}
                  {pct !== null ? (
                    <View style={styles.attRow}>
                      <Text style={styles.attLabel}>الحضور:</Text>
                      <Text style={[styles.attPct, pct >= 80 ? styles.attGood : pct >= 50 ? styles.attMid : styles.attLow]}>
                        {pct}%
                      </Text>
                      <Text style={styles.attCount}>({att.present}/{att.total})</Text>
                    </View>
                  ) : (
                    <Text style={styles.attMissing}>لم يُسجَّل الحضور بعد</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: '900', color: Colors.text },
  countPill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 50, gap: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  timeCol: {
    width: 56,
    alignItems: 'center',
    paddingTop: 2,
  },
  timeHM: { fontSize: 14, fontWeight: '900', color: Colors.text },
  timeAm: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, marginTop: -2 },
  timeBar: { width: 2, height: 18, backgroundColor: Colors.border, marginVertical: 4, borderRadius: 1 },
  body: { flex: 1, gap: 4, alignItems: 'flex-end' },
  bodyTop: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end', width: '100%' },
  subject: { fontSize: 15, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  section: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right' },
  room: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textAlign: 'right' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  livePillText: { fontSize: 10, fontWeight: '900', color: '#EF4444' },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  attLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  attPct: { fontSize: 13, fontWeight: '900' },
  attGood: { color: '#16A34A' },
  attMid: { color: '#F59E0B' },
  attLow: { color: '#EF4444' },
  attCount: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  attMissing: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 4 },
});
