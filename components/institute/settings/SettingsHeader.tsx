// SettingsHeader — gradient hero strip at the top of the settings page.
// Pure presentational; styling preserved verbatim from the original page.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../../constants/theme';

type Props = {
  title: string;
};

export default function SettingsHeader({ title }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={tokens.heroGradient as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 20 }]}
    >
      <View style={styles.heroBlurCircle1} pointerEvents="none" />
      <View style={styles.heroBlurCircle2} pointerEvents="none" />
      <Ionicons name="settings" size={30} color="rgba(255,255,255,0.95)" />
      <Text style={styles.headerTitle}>{title}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: tokens.radius.xxl,
    borderBottomRightRadius: tokens.radius.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  heroBlurCircle1: {
    position: 'absolute',
    top: -20, right: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(47,47,186,0.35)',
  },
  heroBlurCircle2: {
    position: 'absolute',
    bottom: -40, left: -20,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(0,212,255,0.2)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
  },
});
