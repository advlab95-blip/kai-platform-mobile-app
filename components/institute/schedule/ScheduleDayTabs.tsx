// ScheduleDayTabs — horizontal day selector strip with per-day slot count badges.
// Pure presentational: parent owns selectedDay + slot data, passes counts in via props.
//
// Today indicator: the pill matching JS Date().getDay() shows a small accent
// dot at the top so the admin's eye lands on "today" instantly — even when
// they navigate to a different day for editing.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';
import type { DayItem } from './_helpers';

type Props = {
  days: DayItem[];
  selectedDay: number;
  countForDay: (key: number) => number;
  onSelectDay: (key: number) => void;
};

export default function ScheduleDayTabs({ days, selectedDay, countForDay, onSelectDay }: Props) {
  // JS Date.getDay() → 0=Sunday, 6=Saturday. Matches our DayItem.key encoding.
  const todayKey = useMemo(() => new Date().getDay(), []);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabsScroll}>
      <View style={styles.dayTabsRow}>
        {days.map((day) => {
          const count = countForDay(day.key);
          const isActive = selectedDay === day.key;
          const isToday = day.key === todayKey;
          return (
            <TouchableOpacity
              key={day.key}
              onPress={() => onSelectDay(day.key)}
              activeOpacity={0.85}
              style={[styles.dayTab, isActive && styles.dayTabActive]}
            >
              {isToday ? <View style={[styles.todayDot, isActive && styles.todayDotActive]} /> : null}
              <Text style={[styles.dayTabLabel, isActive && styles.dayTabLabelActive]}>
                {day.label}
              </Text>
              {count > 0 && (
                <View style={[styles.dayTabBadge, isActive && styles.dayTabBadgeActive]}>
                  <Text style={[styles.dayTabBadgeText, isActive && styles.dayTabBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dayTabsScroll: {
    marginBottom: 16,
  },
  dayTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4, // leave room for the today-dot above the pill
  },
  dayTab: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  dayTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    ...tokens.shadow.brand,
  },
  dayTabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  dayTabLabelActive: {
    color: '#fff',
  },
  dayTabBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dayTabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dayTabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
  },
  dayTabBadgeTextActive: {
    color: '#fff',
  },
  todayDot: {
    position: 'absolute',
    top: -4,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.success,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  todayDotActive: {
    backgroundColor: '#fff',
    borderColor: tokens.color.success,
  },
});
