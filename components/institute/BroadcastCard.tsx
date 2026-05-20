import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';
import FadeSlideIn from '../animated/FadeSlideIn';
import { useInteractions } from '../../contexts/InteractionsContext';

interface Props {
  title: string;
  sub: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  delay?: number;
}

const { width: SCREEN_W } = Dimensions.get('window');

export default function BroadcastCard({
  title, sub, icon = 'megaphone', onPress, delay = 0,
}: Props) {
  const shineX = useSharedValue(-140);
  const { settings, reduceMotion } = useInteractions();

  useEffect(() => {
    if (!settings.animationsEnabled || reduceMotion) return;
    shineX.value = withDelay(
      600,
      withRepeat(
        withTiming(SCREEN_W + 140, { duration: 2400, easing: Easing.inOut(Easing.cubic) }),
        -1,
        false,
      ),
    );
  }, [settings.animationsEnabled, reduceMotion]);

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shineX.value }, { rotate: '25deg' }],
  }));

  return (
    <FadeSlideIn delay={delay} translateFrom={14}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => { haptics.medium(); onPress(); }}
        style={styles.touchWrap}
      >
        <LinearGradient
          colors={tokens.broadcastGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Animated.View style={[styles.shine, shineStyle]} pointerEvents="none" />
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={22} color="#fff" />
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.7)" />
        </LinearGradient>
      </TouchableOpacity>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  touchWrap: {
    marginBottom: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 17,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    position: 'relative',
    ...tokens.shadow.broadcast,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
    textAlign: 'right',
  },
  sub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    textAlign: 'right',
  },
  shine: {
    position: 'absolute',
    top: '-40%',
    left: 0,
    width: 100,
    height: '180%',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});
