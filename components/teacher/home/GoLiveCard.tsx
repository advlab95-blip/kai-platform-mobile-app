// GoLiveCard — gradient CTA that takes the teacher to the live streaming screen.
// Rendered only when the live_streaming feature flag is enabled (caller guards).

import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

type Props = {
  onPress: () => void;
};

export default function GoLiveCard({ onPress }: Props) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <LinearGradient
        colors={[...tokens.gradient.danger] as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.goLiveCard}
      >
        <View style={styles.goLiveIcon}>
          <Ionicons name="videocam" size={22} color="#fff" />
        </View>
        <View style={styles.goLiveBody}>
          <Text style={styles.goLiveOverline}>GO LIVE · {t('teacherHome.liveStream', { defaultValue: 'بث مباشر' })}</Text>
          <Text style={styles.goLiveTitle}>{t('teacherHome.startClassNow', { defaultValue: 'ابدأ الحصة الآن' })}</Text>
        </View>
        <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.8)" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  goLiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 6,
  },
  goLiveIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goLiveBody: { flex: 1, alignItems: 'flex-end' },
  goLiveOverline: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.8,
  },
  goLiveTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'right',
    marginTop: 2,
  },
});
