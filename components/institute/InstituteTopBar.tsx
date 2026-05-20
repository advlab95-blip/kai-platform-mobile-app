import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';

interface Action {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  badge?: number;
  accessibilityLabel?: string;
}

interface Props {
  title: string;
  onBack?: () => void;
  actions?: Action[];
  showBack?: boolean;
}

export default function InstituteTopBar({ title, onBack, actions = [], showBack = true }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    haptics.light();
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
  };

  const Content = (
    <View style={[styles.inner, { paddingTop: insets.top + 10 }]}>
      {showBack && (
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.7} onPress={handleBack}>
          <Ionicons name="chevron-forward" size={20} color={tokens.text[1]} />
        </TouchableOpacity>
      )}
      <Text
        style={styles.title}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
      >
        {title}
      </Text>
      <View style={styles.actions}>
        {actions.map((a, i) => (
          <TouchableOpacity
            key={i}
            style={styles.actionBtn}
            activeOpacity={0.7}
            onPress={() => { haptics.light(); a.onPress(); }}
            accessibilityLabel={a.accessibilityLabel}
          >
            <Ionicons name={a.icon} size={18} color={tokens.text[2]} />
            {!!a.badge && a.badge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{a.badge > 99 ? '99+' : a.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return <View style={[styles.wrap, styles.wrapFallback]}>{Content}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.border[2],
  },
  wrapTint: {
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  wrapFallback: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: tokens.surface.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: tokens.text[1],
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: tokens.surface.surface2,
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
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
});
