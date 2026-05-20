// ScheduleHeader — institute schedule hero with gradient and slot count.
// Pure presentational: title text + count rendered from props.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/theme';

type Props = {
  title: string;
  slotCount: number;
};

export default function ScheduleHeader({ title, slotCount }: Props) {
  return (
    <LinearGradient
      colors={tokens.heroGradient as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <View style={styles.heroBlurCircle1} pointerEvents="none" />
      <View style={styles.heroBlurCircle2} pointerEvents="none" />
      <Ionicons name="calendar" size={34} color="rgba(255,255,255,0.95)" />
      <Text style={styles.headerTitle}>{title}</Text>
      <Text style={styles.headerSub}>{slotCount} حصة مسجلة</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: tokens.radius.xxl,
    borderBottomRightRadius: tokens.radius.xxl,
    alignItems: 'center',
    overflow: 'hidden',
    gap: 6,
  },
  heroBlurCircle1: {
    position: 'absolute',
    top: -20,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(47,47,186,0.35)',
  },
  heroBlurCircle2: {
    position: 'absolute',
    bottom: -40,
    left: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,212,255,0.2)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    marginTop: 4,
  },
});
