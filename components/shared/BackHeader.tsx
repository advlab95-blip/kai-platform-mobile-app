import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import { sounds } from '../../utils/sounds';

// Reusable back-navigation header — drop in at the top of any sub-screen so the
// user always has a visible way to return to the PREVIOUS screen (one step back).
// Fallback only fires when history is truly empty (deep link / direct reload).

interface Props {
  title: string;
  subtitle?: string;
  fallbackRoute?: string;
  right?: React.ReactNode;
  // When provided, fully overrides default back behavior. Use this when the caller
  // knows exactly where to go (e.g. admin opening an institute sub-screen via
  // cross-stack push — router.back() would land on the institute tab root instead
  // of the admin screen that initiated the navigation).
  onBack?: () => void;
}

export default function BackHeader({ title, subtitle, fallbackRoute, right, onBack }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleBack = () => {
    haptics.light();
    sounds.play('whoosh');
    if (onBack) { onBack(); return; }
    // Priority 1: Web browser history (most reliable on web — tracks every push/replace)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.history && window.history.length > 1) {
        try { window.history.back(); return; } catch {}
      }
    }
    // Priority 2: expo-router canGoBack check
    try {
      if ((router as any).canGoBack?.()) {
        router.back();
        return;
      }
    } catch {}
    // Priority 3: Try router.back() unconditionally (some platforms don't expose canGoBack reliably)
    try {
      router.back();
      return;
    } catch {}
    // Priority 4 (last resort): Navigate to fallback route
    if (fallbackRoute) {
      try { router.replace(fallbackRoute as any); } catch {}
    }
  };
  return (
    <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity onPress={handleBack} style={s.btn} accessibilityLabel="رجوع" accessibilityRole="button">
        <Ionicons name="arrow-forward" size={22} color={Colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text
          style={s.title}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          allowFontScaling={false}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={s.subtitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            allowFontScaling={false}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  btn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
});
