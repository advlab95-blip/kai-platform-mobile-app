import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';
import { useInteractions } from '../../contexts/InteractionsContext';

interface HeroAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  badge?: number;
  accessibilityLabel?: string;
}

interface Props {
  greeting: string;
  name: string;
  platformLabel: string;
  logoText?: string;
  logoImage?: React.ReactNode;
  actions: HeroAction[];
}

export default function InstituteHero({
  greeting, name, platformLabel, logoText = 'ك', logoImage, actions,
}: Props) {
  const insets = useSafeAreaInsets();
  const { settings, reduceMotion } = useInteractions();

  const circle1X = useSharedValue(0);
  const circle1Y = useSharedValue(0);
  const circle2X = useSharedValue(0);
  const circle2Y = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!settings.animationsEnabled || reduceMotion) return;

    const loopXY = (sv: SharedValue<number>, peak: number, ms: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(peak, { duration: ms, easing: Easing.inOut(Easing.ease) }),
          withTiming(0,    { duration: ms, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    };
    loopXY(circle1X, 15, 4000);
    loopXY(circle1Y, -15, 4000);
    loopXY(circle2X, -15, 5000);
    loopXY(circle2Y, 15, 5000);

    pulse.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1,   { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [settings.animationsEnabled, reduceMotion]);

  const circle1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: circle1X.value }, { translateY: circle1Y.value }],
  }));
  const circle2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: circle2X.value }, { translateY: circle2Y.value }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <LinearGradient
      colors={tokens.heroGradient}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.hero, { paddingTop: insets.top + 14 }]}
    >
      {/* Floating blur circles */}
      <Animated.View style={[styles.blurCircle, styles.blurCircle1, circle1Style]} />
      <Animated.View style={[styles.blurCircle, styles.blurCircle2, circle2Style]} />

      {/* Top: actions + identity (RTL: actions on the right when dir=rtl via layout) */}
      <View style={styles.top}>
        <View style={styles.actions}>
          {actions.map((a, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.75}
              onPress={() => { haptics.light(); a.onPress(); }}
              style={styles.heroBtn}
              accessibilityLabel={a.accessibilityLabel}
            >
              <Ionicons name={a.icon} size={18} color="rgba(255,255,255,0.95)" />
              {!!a.badge && a.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{a.badge > 99 ? '99+' : a.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.identity}>
          <View style={styles.greetWrap}>
            <Text style={styles.greet} numberOfLines={1}>{greeting}</Text>
            <Text
              style={styles.name}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              allowFontScaling={false}
            >
              {name}
            </Text>
          </View>
          <View style={styles.logoBox}>
            {logoImage ?? <Text style={styles.logoText}>{logoText}</Text>}
          </View>
        </View>
      </View>

      {/* Platform chip */}
      <View style={styles.platformWrap}>
        <View style={styles.platformChip}>
          <Animated.View style={[styles.pulseDot, pulseStyle]} />
          <Text style={styles.platformText}>{platformLabel}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  blurCircle: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.35,
  },
  blurCircle1: {
    width: 220,
    height: 220,
    top: -70,
    right: -50,
    backgroundColor: '#6366F1',
    ...Platform.select({
      ios: { shadowColor: '#6366F1', shadowOpacity: 0.6, shadowRadius: 60, shadowOffset: { width: 0, height: 0 } },
      default: {},
    }),
  },
  blurCircle2: {
    width: 180,
    height: 180,
    bottom: -60,
    left: -30,
    backgroundColor: '#8B5CF6',
    ...Platform.select({
      ios: { shadowColor: '#8B5CF6', shadowOpacity: 0.6, shadowRadius: 60, shadowOffset: { width: 0, height: 0 } },
      default: {},
    }),
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
    zIndex: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  heroBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -3,
    left: -3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#E11D48',
    borderWidth: 2,
    borderColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 2,
    flexShrink: 1,
  },
  greetWrap: {
    alignItems: 'flex-start',
    flexShrink: 1,
    maxWidth: 220,
  },
  greet: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  name: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  logoBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
    overflow: 'hidden',
  },
  logoText: {
    fontWeight: '900',
    fontSize: 20,
    color: tokens.brand[700],
  },
  platformWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22D3EE',
  },
  platformText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
});
