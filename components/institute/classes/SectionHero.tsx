// Gradient hero card at the top of the section drill-down view.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HeroStat from './HeroStat';

interface Props {
  sectionName: string;
  gradeName: string;
  studentsCount: number;
  teachersCount: number;
}

export default function SectionHero({ sectionName, gradeName, studentsCount, teachersCount }: Props) {
  return (
    <LinearGradient
      colors={['#065F46', '#10B981']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroBadge}>
        <Text style={styles.heroBadgeText}>{sectionName}</Text>
      </View>
      <Text style={styles.heroName}>{gradeName}</Text>
      <View style={styles.heroStatsRow}>
        <HeroStat icon="people" label="طلاب" value={studentsCount} />
        <HeroStat icon="person" label="أساتذة" value={teachersCount} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    overflow: 'hidden',
    alignItems: 'center',
  },
  heroBadge: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  heroBadgeText: { fontSize: 24, fontWeight: '900', color: '#fff' },
  heroName: { fontSize: 18, fontWeight: '900', color: '#fff', textAlign: 'center', marginTop: 4 },
  heroStatsRow: { flexDirection: 'row', marginTop: 16, gap: 10, alignSelf: 'stretch' },
});
