// Stable-height filter row above the grades list.
// In إعدادية stage: shows track pills (الكل/علمي/أدبي).
// In other stages: shows a simple count info row.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

export type TrackFilter = 'all' | 'علمي' | 'أدبي';

interface Props {
  isPrepStage: boolean;
  trackFilter: TrackFilter;
  onTrackChange: (t: TrackFilter) => void;
  gradesCount: number;
  sectionsCount: number;
}

export default function FilterBar({
  isPrepStage, trackFilter, onTrackChange, gradesCount, sectionsCount,
}: Props) {
  return (
    <View style={styles.filterBar}>
      {isPrepStage ? (
        <View style={styles.trackRow}>
          {(['all', 'علمي', 'أدبي'] as const).map((t) => {
            const active = trackFilter === t;
            const label = t === 'all' ? 'الكل' : t === 'علمي' ? 'علمي' : 'أدبي';
            return (
              <TouchableOpacity
                key={t}
                activeOpacity={0.8}
                onPress={() => onTrackChange(t)}
                style={[styles.trackPill, active && styles.trackPillActive]}
              >
                <Text style={[styles.trackPillText, active && styles.trackPillTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.filterBarInfo}>
          <Ionicons name="layers-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.filterBarInfoText}>
            {gradesCount} صف · {sectionsCount} شعبة
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    height: 52,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  filterBarInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
  },
  filterBarInfoText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  trackRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  trackPill: {
    minWidth: 92,
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1.2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  trackPillText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  trackPillTextActive: { color: '#fff' },
});
