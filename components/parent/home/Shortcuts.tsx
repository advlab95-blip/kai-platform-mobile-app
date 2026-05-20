// 4-up shortcut tiles row on parent home (brief §7.1).
// grades / chat / attendance / fees — colored by token tints.
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

interface Tile {
  key: string;
  labelKey: string;
  defaultLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  bg: string;
  route: string;
}

const TILES: Tile[] = [
  {
    key: 'grades',
    labelKey: 'parent.shortcutGrades',
    defaultLabel: 'الدرجات',
    icon: 'trophy',
    tint: tokens.color.success,
    bg: tokens.color.successBg,
    route: '/(parent)/grades',
  },
  {
    key: 'attendance',
    labelKey: 'parent.shortcutAttendance',
    defaultLabel: 'الحضور',
    icon: 'calendar',
    tint: tokens.color.teal,
    bg: tokens.color.tealBg,
    route: '/(parent)/attendance',
  },
  {
    key: 'fees',
    labelKey: 'parent.shortcutPayment',
    defaultLabel: 'الدفع',
    icon: 'card',
    tint: tokens.color.orange,
    bg: tokens.color.orangeBg,
    route: '/(parent)/finance',
  },
];

function ShortcutTile({ tile }: { tile: Tile }) {
  const router = useRouter();
  const { t } = useTranslation();
  const press = useSpringPress(0.96);

  const handlePress = useCallback(() => {
    haptics.selection();
    router.push(tile.route as any);
  }, [router, tile.route]);

  return (
    <Animated.View style={[styles.tileWrap, { transform: [{ scale: press.scale }] }]}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={handlePress}
        style={styles.tile}
        accessibilityRole="button"
      >
        <View style={[styles.icon, { backgroundColor: tile.bg }]}>
          <Ionicons name={tile.icon} size={22} color={tile.tint} />
        </View>
        <Text style={styles.label}>{t(tile.labelKey, { defaultValue: tile.defaultLabel })}</Text>
      </Pressable>
    </Animated.View>
  );
}

function Shortcuts() {
  const { t } = useTranslation();
  return (
    <>
      <Text style={styles.sectionTitle}>
        {t('parent.shortcuts', { defaultValue: 'الاختصارات' })}
      </Text>
      <View style={styles.row}>
        {TILES.map((tile) => (
          <ShortcutTile key={tile.key} tile={tile} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[3],
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: tokens.spacing[4],
  },
  tileWrap: { flex: 1 },
  tile: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.color.border2,
    ...tokens.shadow.sm,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'center',
  },
});

export default memo(Shortcuts);
