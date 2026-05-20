import React, { memo, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

type AccentTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

type BadgeTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'teal'
  | 'neutral';

export interface AnnouncementCardProps {
  title: string;
  body: string;
  date: string;
  tone?: AccentTone;
  badge?: { label: string; tone: BadgeTone };
  onPress?: () => void;
  onDismiss?: () => void;
}

const BADGE_FG: Record<BadgeTone, string> = {
  success: tokens.color.success,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
  info: tokens.color.info,
  purple: tokens.color.purple,
  orange: tokens.color.orange,
  pink: tokens.color.pink,
  teal: tokens.color.teal,
  neutral: tokens.color.text2,
};

const BADGE_BG: Record<BadgeTone, string> = {
  success: tokens.color.successBg,
  warning: tokens.color.warningBg,
  danger: tokens.color.dangerBg,
  info: tokens.color.infoBg,
  purple: tokens.color.purpleBg,
  orange: tokens.color.orangeBg,
  pink: tokens.color.pinkBg,
  teal: tokens.color.tealBg,
  neutral: tokens.color.surface2,
};

function AnnouncementCardInner({
  title,
  body,
  date,
  tone = 'brand',
  badge,
  onPress,
  onDismiss,
}: AnnouncementCardProps) {
  const { scale, onPressIn, onPressOut } = useSpringPress(0.98);

  const accentColors = useMemo<readonly [string, string, ...string[]]>(
    () => tokens.gradient[tone] as unknown as readonly [string, string, ...string[]],
    [tone],
  );

  const handlePress = onPress
    ? () => {
        void haptics.selection();
        onPress();
      }
    : undefined;

  const inner = (
    <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
      <LinearGradient
        colors={accentColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.accent}
      />
      <View style={styles.content}>
        <View style={styles.header}>
          {badge ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: BADGE_BG[badge.tone] },
              ]}
            >
              <Text
                style={[styles.badgeText, { color: BADGE_FG[badge.tone] }]}
                numberOfLines={1}
              >
                {badge.label}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <View style={styles.headerEnd}>
            <Text style={styles.date} numberOfLines={1}>
              {date}
            </Text>
            {onDismiss ? (
              <TouchableOpacity
                onPress={() => { void haptics.light(); onDismiss(); }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="إخفاء التبليغ"
                style={styles.dismissBtn}
              >
                <Ionicons name="close" size={14} color={tokens.color.text3} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {body}
        </Text>
      </View>
    </Animated.View>
  );

  if (handlePress) {
    return (
      <Pressable
        onPress={handlePress}
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
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border2,
    overflow: 'hidden',
    position: 'relative',
    ...tokens.shadow.sm,
  },
  accent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    width: 4,
  },
  content: {
    paddingStart: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: tokens.radius.sm,
  },
  badgeText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
  },
  date: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    fontWeight: tokens.font.weight.semi,
    fontVariant: ['tabular-nums'],
  },
  headerEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface2,
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    marginTop: 8,
  },
  body: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    marginTop: 4,
    lineHeight: 18,
  },
});

const AnnouncementCard = memo(AnnouncementCardInner);
AnnouncementCard.displayName = 'AnnouncementCard';

export default AnnouncementCard;
