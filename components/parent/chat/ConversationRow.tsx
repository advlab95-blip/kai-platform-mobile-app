// One conversation row in the parent chat list (brief §7.4).
// Avatar (role-tinted) + name + time + role badge + last message preview.
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

export interface Conversation {
  userId: string;
  name: string;
  role: string;
  lastMessage?: string;
  lastTime?: string;
  unreadCount?: number;
}

interface Props {
  conv: Conversation;
  roleLabel: (role: string) => string;
  onPress: (conv: Conversation) => void;
}

const ROLE_TINTS: Record<string, { bg: string; fg: string }> = {
  admin:     { bg: tokens.color.indigoBg,   fg: tokens.color.indigo },
  teacher:   { bg: tokens.color.successBg,  fg: tokens.color.success },
  institute: { bg: tokens.color.warningBg,  fg: tokens.color.warning },
};

function ConversationRow({ conv, roleLabel, onPress }: Props) {
  const tint = ROLE_TINTS[conv.role] || { bg: tokens.color.p100, fg: tokens.color.p600 };

  const handlePress = useCallback(() => {
    haptics.selection();
    onPress(conv);
  }, [conv, onPress]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
        <Ionicons name="person" size={20} color={tint.fg} />
      </View>
      <View style={styles.info}>
        <View style={styles.row}>
          <Text style={styles.time}>
            {conv.lastTime
              ? new Date(conv.lastTime).toLocaleTimeString('ar-IQ', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''}
          </Text>
          <Text style={styles.name} numberOfLines={1}>{conv.name}</Text>
        </View>
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: tint.bg }]}>
            <Text style={[styles.badgeText, { color: tint.fg }]}>{roleLabel(conv.role)}</Text>
          </View>
          <Text style={styles.lastMsg} numberOfLines={1}>{conv.lastMessage || ''}</Text>
        </View>
      </View>
      {conv.unreadCount && conv.unreadCount > 0 ? (
        <View style={styles.unreadDot} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, marginLeft: 12, gap: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    flexShrink: 1,
  },
  time: { fontSize: tokens.font.size.xs, color: tokens.color.text3 },
  lastMsg: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    textAlign: 'right',
    flex: 1,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.danger,
    marginLeft: 8,
  },
});

export default memo(ConversationRow);
