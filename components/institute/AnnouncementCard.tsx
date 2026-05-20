import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';
import FadeSlideIn from '../animated/FadeSlideIn';

export type AnnTone = 'brand' | 'success' | 'warning';

interface Props {
  title: string;
  content: string;
  chip: string;
  date: string;
  tone?: AnnTone;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Optional explicit delete button — shown only when provided (admin views). */
  onDelete?: () => void;
  delay?: number;
}

const toneMap = {
  brand:   { bar: tokens.brand[500],       chipBg: tokens.brand[100],           chipFg: tokens.brand[500] },
  success: { bar: tokens.semantic.success, chipBg: tokens.semantic.successBg,   chipFg: tokens.semantic.success },
  warning: { bar: tokens.semantic.warning, chipBg: tokens.semantic.warningBg,   chipFg: tokens.semantic.warning },
} as const;

export default function AnnouncementCard({
  title, content, chip, date, tone = 'brand', onPress, onLongPress, onDelete, delay = 0,
}: Props) {
  const t = toneMap[tone];

  return (
    <FadeSlideIn delay={delay} translateFrom={12}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => { haptics.light(); onPress?.(); }}
        onLongPress={onLongPress ? () => { haptics.medium(); onLongPress(); } : undefined}
        delayLongPress={350}
      >
        <View style={[styles.bar, { backgroundColor: t.bar }]} />
        <View style={styles.body}>
          <View style={styles.head}>
            <View style={[styles.chip, { backgroundColor: t.chipBg }]}>
              <Text style={[styles.chipText, { color: t.chipFg }]}>{chip}</Text>
            </View>
            <Text style={styles.date}>{date}</Text>
            {onDelete && (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); haptics.warning(); onDelete(); }}
                hitSlop={10}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel="حذف الإعلان"
              >
                <Ionicons name="trash-outline" size={16} color={tokens.semantic.danger} />
              </Pressable>
            )}
          </View>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.content} numberOfLines={2}>{content}</Text>
        </View>
      </TouchableOpacity>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    overflow: 'hidden',
    ...tokens.shadow.xs,
  },
  bar: {
    width: 4,
  },
  body: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  date: {
    fontSize: 10,
    color: tokens.text[4],
    fontWeight: '500',
    flex: 1,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.semantic.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.text[1],
    marginBottom: 4,
    textAlign: 'right',
  },
  content: {
    fontSize: 12,
    color: tokens.text[3],
    lineHeight: 19,
    textAlign: 'right',
  },
});
