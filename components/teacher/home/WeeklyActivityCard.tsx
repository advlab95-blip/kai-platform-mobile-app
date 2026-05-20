// WeeklyActivityCard — purple gradient summary of teacher's weekly activity.
// Renders nothing if all values are zero (caller can also short-circuit).

import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

type WeeklyStats = {
  aiLessons: number;
  assignments: number;
  gradesEntered: number;
  voiceMessages: number;
  videos: number;
};

type Props = {
  weeklyStats: WeeklyStats | null;
};

export default function WeeklyActivityCard({ weeklyStats }: Props) {
  if (!weeklyStats) return null;
  const total = weeklyStats.aiLessons + weeklyStats.assignments + weeklyStats.gradesEntered + weeklyStats.voiceMessages + weeklyStats.videos;
  if (total <= 0) return null;
  return (
    <LinearGradient
      colors={[...tokens.gradient.purple] as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 18, padding: 16, marginHorizontal: 16, marginTop: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ionicons name="trending-up" size={18} color="#fff" />
        <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff', flex: 1, textAlign: 'right' }}>
          نشاطك هذا الأسبوع
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[
          { key: 'aiLessons', label: 'درس AI', icon: 'sparkles', val: weeklyStats.aiLessons },
          { key: 'assignments', label: 'واجب', icon: 'document-text', val: weeklyStats.assignments },
          { key: 'gradesEntered', label: 'درجة', icon: 'trophy', val: weeklyStats.gradesEntered },
          { key: 'voiceMessages', label: 'رسالة', icon: 'mic', val: weeklyStats.voiceMessages },
          { key: 'videos', label: 'فيديو', icon: 'videocam', val: weeklyStats.videos },
        ].filter(x => x.val > 0).map(x => (
          <View
            key={x.key}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: 'rgba(255,255,255,0.2)',
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100,
            }}
          >
            <Ionicons name={x.icon as any} size={12} color="#fff" />
            <Text style={{ fontSize: 11, color: '#fff', fontWeight: '800' }}>
              {x.val} {x.label}
            </Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}
