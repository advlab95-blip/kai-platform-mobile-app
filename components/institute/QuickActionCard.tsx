import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';
import FadeSlideIn from '../animated/FadeSlideIn';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  sub: string;
  onPress: () => void;
  active?: boolean;
  delay?: number;
}

export default function QuickActionCard({
  icon, iconBg, iconColor, title, sub, onPress, active = false, delay = 0,
}: Props) {
  const inner = (
    <>
      <View style={styles.top}>
        <View style={[
          styles.iconWrap,
          { backgroundColor: active ? 'rgba(255,255,255,0.2)' : iconBg },
        ]}>
          <Ionicons name={icon} size={18} color={active ? '#fff' : iconColor} />
        </View>
        <Ionicons
          name="chevron-back"
          size={16}
          color={active ? 'rgba(255,255,255,0.9)' : tokens.text[4]}
          style={{ opacity: active ? 1 : 0.6 }}
        />
      </View>
      <Text
        style={[styles.title, active && styles.titleActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        allowFontScaling={false}
      >
        {title}
      </Text>
      <Text
        style={[styles.sub, active && styles.subActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
      >
        {sub}
      </Text>
    </>
  );

  return (
    <FadeSlideIn delay={delay} translateFrom={12} style={styles.wrap}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { haptics.light(); onPress(); }}
        style={styles.touchWrap}
      >
        {active ? (
          <LinearGradient
            colors={tokens.qrActiveGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, styles.cardActive]}
          >
            {inner}
          </LinearGradient>
        ) : (
          <View style={styles.card}>{inner}</View>
        )}
      </TouchableOpacity>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  touchWrap: {
    width: '100%',
  },
  card: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  cardActive: {
    borderColor: 'transparent',
    ...tokens.shadow.qrActive,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.text[1],
    marginBottom: 2,
    textAlign: 'right',
  },
  titleActive: {
    color: '#fff',
  },
  sub: {
    fontSize: 10,
    color: tokens.text[3],
    fontWeight: '500',
    textAlign: 'right',
  },
  subActive: {
    color: 'rgba(255,255,255,0.85)',
  },
});
