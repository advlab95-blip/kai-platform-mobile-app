// TeacherInnerHero — gradient header for teacher inner pages.
// Same gradient + glow + radii + dimensions as TeacherHero, but with
// a back button + page title instead of greeting/avatar/notifications.
// Uses insets.top internally so the gradient bleeds to the top edge —
// the parent screen should NOT wrap it in SafeAreaView with `top` edge.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import { sounds } from '../../../utils/sounds';

type Props = {
  title: string;
  subtitle?: string | null;
  fallbackRoute?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  showBack?: boolean;
};

export default function TeacherInnerHero({ title, subtitle, fallbackRoute, onBack, right, showBack = true }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();

  const handleBack = () => {
    haptics.light();
    sounds.play('whoosh');
    if (onBack) { onBack(); return; }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.history && window.history.length > 1) {
        try { window.history.back(); return; } catch {}
      }
    }
    // Prefer real stack back when one exists.
    try {
      if ((router as any).canGoBack?.()) { router.back(); return; }
    } catch {}
    // Fallback: from a teacher inner page, "one step back" is the teacher
    // Services hub — not the root Home tab (which Tabs.back() can land on).
    // useSegments() includes group parens, e.g. ['(teacher)', 'assignments'].
    const inTeacher = (segments as readonly string[]).some(s => s === '(teacher)' || s === 'teacher');
    if (inTeacher) {
      try { router.navigate('/(teacher)/services' as any); return; } catch {}
    }
    try { router.back(); return; } catch {}
    if (fallbackRoute) {
      try { router.replace(fallbackRoute as any); } catch {}
    }
  };

  return (
    <LinearGradient
      colors={[...tokens.gradient.brand] as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 18 }]}
    >
      <View pointerEvents="none" style={styles.heroGlowTopLeft} />
      <View pointerEvents="none" style={styles.heroGlowBottomRight} />
      <View style={styles.headerRow}>
        {showBack ? (
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleBack} style={styles.headerBtn} accessibilityLabel="رجوع" accessibilityRole="button">
              <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.95)" />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={[styles.headerRight, !showBack && { marginStart: 0 }]}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              allowFontScaling={false}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={styles.subtitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                allowFontScaling={false}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right ? <View style={{ marginStart: 8 }}>{right}</View> : null}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGlowTopLeft: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroGlowBottomRight: {
    position: 'absolute',
    bottom: -80,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(59,130,246,0.25)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginStart: 12,
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
    marginTop: 2,
  },
});
