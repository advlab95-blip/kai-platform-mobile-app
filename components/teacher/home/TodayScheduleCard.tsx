// TodayScheduleCard — timeline-style today schedule with live/next/past status.
// Parent passes: todayLessons (already filtered for today), classes (for name lookup).

import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { tokens } from '../../../constants/designTokens';

type Props = {
  todayLessons: any[];
  classes: any[];
};

export default function TodayScheduleCard({ todayLessons, classes }: Props) {
  if (todayLessons.length === 0) return null;

  const classNameById: Record<string, string> = {};
  classes.forEach((c: any) => { classNameById[c.id] = c.name; });
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const sorted = [...todayLessons].sort((a: any, b: any) => toMin(a.start_time) - toMin(b.start_time));
  const statusOf = (lesson: any, idx: number): 'live' | 'next' | 'past' | 'upcoming' => {
    const s = toMin(lesson.start_time);
    const e = toMin(lesson.end_time);
    if (nowMin >= s && nowMin < e) return 'live';
    if (nowMin >= e) return 'past';
    // upcoming — check if it's the earliest upcoming
    const firstUpcomingIdx = sorted.findIndex((l: any) => toMin(l.end_time) > nowMin);
    return idx === firstUpcomingIdx ? 'next' : 'upcoming';
  };
  const fmtTime = (t: string) => {
    if (!t) return { hm: '', ampm: '' };
    const [h, m] = t.split(':').map(Number);
    const hh = h || 0;
    const ampm = hh < 12 ? 'ص' : 'م';
    const h12 = hh % 12 || 12;
    return { hm: `${h12}:${String(m || 0).padStart(2, '0')}`, ampm };
  };
  return (
    <View style={styles.scheduleCard}>
      <View style={styles.scheduleHeader}>
        <View style={styles.scheduleCountPill}>
          <Text style={styles.scheduleCountText}>{sorted.length} حصص</Text>
        </View>
        <Text style={styles.scheduleTitle}>جدول اليوم</Text>
      </View>
      <View style={styles.scheduleList}>
        {sorted.map((lesson: any, idx: number) => {
          const status = statusOf(lesson, idx);
          const isLast = idx === sorted.length - 1;
          const barColor = status === 'live' ? '#EF4444' : status === 'next' ? '#F59E0B' : status === 'past' ? '#CBD5E1' : '#94A3B8';
          const time = fmtTime(lesson.start_time);
          const className = classNameById[lesson.class_id] || '';
          return (
            <View key={lesson.id || idx} style={[styles.scheduleRow, !isLast && styles.scheduleRowBorder, status === 'past' && { opacity: 0.55 }]}>
              {status === 'live' && (
                <View style={styles.scheduleBadgeLive}>
                  <Text style={styles.scheduleBadgeLiveText}>مباشر الآن</Text>
                </View>
              )}
              {status === 'next' && (
                <View style={styles.scheduleBadgeNext}>
                  <Text style={styles.scheduleBadgeNextText}>التالي</Text>
                </View>
              )}
              <View style={styles.scheduleMiddle}>
                <Text style={styles.scheduleSubject} numberOfLines={1}>
                  {lesson.subject}{className ? ` ${className}` : ''}
                </Text>
                {lesson.room ? (
                  <Text style={styles.scheduleRoom}>قاعة {lesson.room}</Text>
                ) : null}
              </View>
              <View style={[styles.scheduleBar, { backgroundColor: barColor }]} />
              <View style={styles.scheduleTimeBox}>
                <Text style={styles.scheduleTimeHM}>{time.hm}</Text>
                <Text style={styles.scheduleTimeAmPm}>{time.ampm}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  scheduleTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: tokens.color.text,
    textAlign: 'right',
  },
  scheduleCountPill: {
    backgroundColor: tokens.color.brand100,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  scheduleCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: tokens.color.brand500,
  },
  scheduleList: {
    backgroundColor: tokens.color.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: tokens.color.surface2,
    shadowColor: tokens.color.brand500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  scheduleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface2,
  },
  scheduleBadgeLive: {
    backgroundColor: tokens.color.dangerBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  scheduleBadgeLiveText: {
    fontSize: 11,
    fontWeight: '900',
    color: tokens.color.danger,
  },
  scheduleBadgeNext: {
    backgroundColor: tokens.color.warningBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  scheduleBadgeNextText: {
    fontSize: 11,
    fontWeight: '900',
    color: tokens.color.warning,
  },
  scheduleMiddle: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 3,
  },
  scheduleSubject: {
    fontSize: 14,
    fontWeight: '900',
    color: tokens.color.text,
    textAlign: 'right',
  },
  scheduleRoom: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.color.text3,
    textAlign: 'right',
  },
  scheduleBar: {
    width: 4,
    height: 38,
    borderRadius: 2,
  },
  scheduleTimeBox: {
    minWidth: 52,
    alignItems: 'center',
  },
  scheduleTimeHM: {
    fontSize: 15,
    fontWeight: '900',
    color: tokens.color.text,
  },
  scheduleTimeAmPm: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.color.text3,
    marginTop: 1,
  },
});
