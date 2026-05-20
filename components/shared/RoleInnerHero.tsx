// RoleInnerHero — shared gradient header for any role's inner pages and tabs.
// Mirrors TeacherInnerHero structure but accepts a `gradient` prop so each role
// (admin, institute, teacher, student, parent, cafeteria, medical) can pass
// its own colour palette. Uses insets.top internally so the gradient bleeds
// to the very top of the screen — parent SafeAreaView must NOT include the
// `top` edge.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { haptics } from '../../utils/haptics';
import { sounds } from '../../utils/sounds';

// Roles whose inner tabs are hidden Tabs.Screen siblings. When a back-press
// reaches the bottom of the navigation stack from one of these leaf screens,
// we route the user back to that role's Services hub (one step back), not the
// root Home tab — matching user expectation: "ارجعني خطوه الي الخلف".
const ROLE_PREFIXES = new Set(['institute', 'teacher', 'student', 'parent', 'admin', 'cafeteria', 'medical']);
// useSegments() returns array entries WITH their group parens, e.g.
// ['(institute)', 'ads']. Strip parens and match against the known roles.
function detectRoleFromSegments(segments: readonly string[]): string | null {
  for (const seg of segments) {
    const stripped = seg.replace(/^\(/, '').replace(/\)$/, '');
    if (ROLE_PREFIXES.has(stripped)) return stripped;
  }
  return null;
}

type Props = {
  title: string;
  subtitle?: string | null;
  gradient: readonly [string, string, ...string[]];
  glowAccent?: string;
  fallbackRoute?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  showBack?: boolean;
};

export default function RoleInnerHero({
  title,
  subtitle,
  gradient,
  glowAccent,
  fallbackRoute,
  onBack,
  right,
  showBack = true,
}: Props) {
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
    // Prefer a real stack back when one exists — keeps deep navigation natural.
    try {
      if ((router as any).canGoBack?.()) { router.back(); return; }
    } catch {}
    // Fallback: from a hidden role tab, "one step back" is that role's Services
    // hub — NOT the root Home tab. router.back() in a Tabs navigator can land
    // on Home (the initial tab) which the user explicitly called out as wrong.
    const role = detectRoleFromSegments(segments as readonly string[]);
    if (role) {
      try { router.navigate(`/(${role})/services` as any); return; } catch {}
    }
    try { router.back(); return; } catch {}
    if (fallbackRoute) {
      try { router.replace(fallbackRoute as any); } catch {}
    }
  };

  const accent = glowAccent ?? 'rgba(255,255,255,0.18)';

  return (
    <LinearGradient
      colors={gradient as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 18 }]}
    >
      <View pointerEvents="none" style={styles.heroGlowTopLeft} />
      <View pointerEvents="none" style={[styles.heroGlowBottomRight, { backgroundColor: accent }]} />
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
            {/* Allow 2 lines so long titles like "إدارة المدرسة الذكية" stop
                truncating to "إدارة المدرسة الذك…" — user complaint Issue #12. */}
            <Text
              style={styles.title}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              allowFontScaling={false}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={styles.subtitle}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
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
