// AIHeroRibbon — purple/pink AI gradient ribbon at the top of the AI lessons screen.
// Pure presentational: shows lesson count, subtitle, and (when applicable) a completed/progress summary.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

type Props = {
  totalLessons: number;
  completedCount: number;
};

export default function AIHeroRibbon({ totalLessons, completedCount }: Props) {
  const { t } = useTranslation();
  const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const showProgress = completedCount > 0 && totalLessons > 0;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
      <LinearGradient
        colors={tokens.gradient.ai as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ribbon}
      >
        <View style={styles.ribbonSparkles}>
          <Ionicons name="sparkles" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.ribbonTitle}>دروسي الذكية ({totalLessons})</Text>
          <Text style={styles.ribbonSub}>{t('student.aiGeneratedLessons')}</Text>
        </View>

        {/* Progress summary — encourages the student to keep going. Only rendered when
            they've actually taken at least one quiz so the UI isn't noisy for new users. */}
        {showProgress && (
          <View style={styles.progressBox}>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.progressStat}>{completedCount}/{totalLessons}</Text>
              <Text style={styles.progressLabel}>أكملت</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.progressStat, { color: '#FFD700' }]}>{pct}%</Text>
              <Text style={styles.progressLabel}>التقدّم</Text>
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    borderRadius: tokens.radius['2xl'],
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    ...tokens.shadow.purple,
  },
  ribbonSparkles: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbonTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'right',
  },
  ribbonSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'right',
  },
  progressBox: {
    flexDirection: 'row',
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: tokens.radius.md,
    padding: 10,
    alignSelf: 'stretch',
    justifyContent: 'space-evenly',
    width: '100%',
  },
  progressStat: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
  },
  progressLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  progressDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
});
