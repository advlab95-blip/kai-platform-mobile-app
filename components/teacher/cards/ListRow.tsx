import React, { memo, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

type GradientKey = keyof typeof tokens.gradient;
type ColorKey = keyof typeof tokens.color;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

type BadgeTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'orange'
  | 'teal'
  | 'pink'
  | 'neutral';

export interface ListRowProps {
  icon?: IconName;
  avatarUrl?: string;
  iconGradient?: GradientKey;
  iconTint?: ColorKey;
  title: string;
  subtitle?: string;
  meta?: string;
  trailingIcon?: IconName;
  badge?: { label: string; tone?: BadgeTone };
  onPress?: () => void;
  onLongPress?: () => void;
}

const TONE_TO_FG: Record<BadgeTone, string> = {
  success: tokens.color.success,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
  info: tokens.color.info,
  purple: tokens.color.purple,
  orange: tokens.color.orange,
  teal: tokens.color.teal,
  pink: tokens.color.pink,
  neutral: tokens.color.text2,
};

const TONE_TO_BG: Record<BadgeTone, string> = {
  success: tokens.color.successBg,
  warning: tokens.color.warningBg,
  danger: tokens.color.dangerBg,
  info: tokens.color.infoBg,
  purple: tokens.color.purpleBg,
  orange: tokens.color.orangeBg,
  teal: tokens.color.tealBg,
  pink: tokens.color.pinkBg,
  neutral: tokens.color.surface2,
};

function ListRowInner({
  icon,
  avatarUrl,
  iconGradient,
  iconTint,
  title,
  subtitle,
  meta,
  trailingIcon = 'chevron-back',
  badge,
  onPress,
  onLongPress,
}: ListRowProps) {
  const { scale, onPressIn, onPressOut } = useSpringPress(0.97);

  const tileColors = useMemo<readonly [string, string, ...string[]]>(() => {
    if (iconGradient) {
      return tokens.gradient[iconGradient] as unknown as readonly [
        string,
        string,
        ...string[],
      ];
    }
    const single = iconTint ? (tokens.color[iconTint] as string) : tokens.color.brand500;
    return [single, single] as const;
  }, [iconGradient, iconTint]);

  const handlePress = onPress
    ? () => {
        void haptics.selection();
        onPress();
      }
    : undefined;

  const tile = (
    <View style={styles.tile}>
      {avatarUrl ? (
        <>
          <LinearGradient
            colors={tileColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
            transition={150}
          />
        </>
      ) : (
        <>
          <LinearGradient
            colors={tileColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {icon ? <Ionicons name={icon} size={20} color="#FFFFFF" /> : null}
        </>
      )}
    </View>
  );

  const badgeTone: BadgeTone = badge?.tone ?? 'neutral';

  const inner = (
    <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
      {tile}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
          {badge ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: TONE_TO_BG[badgeTone] },
              ]}
            >
              <Text style={[styles.badgeText, { color: TONE_TO_FG[badgeTone] }]} numberOfLines={1}>
                {badge.label}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <Ionicons
          name={trailingIcon}
          size={18}
          color={tokens.color.text3}
          style={styles.chev}
        />
      </View>
    </Animated.View>
  );

  if (handlePress || onLongPress) {
    return (
      <Pressable
        onPress={handlePress}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={styles.pressable}
      >
        {inner}
      </Pressable>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  pressable: {},
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tokens.color.border2,
    ...tokens.shadow.xs,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  body: {
    flex: 1,
    paddingStart: 12,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flexShrink: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
  },
  subtitle: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text3,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
  },
  badgeText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    marginStart: 8,
  },
  meta: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    fontVariant: ['tabular-nums'],
  },
  chev: {
    marginStart: 8,
  },
});

const ListRow = memo(ListRowInner);
ListRow.displayName = 'ListRow';

export default ListRow;
