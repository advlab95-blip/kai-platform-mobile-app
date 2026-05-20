// Student Messages — teacher → student inbox grouped by sender (teacher).
// Sources: voice_messages table (text + voice). Each teacher card expands to
// show the messages they sent, with inline audio playback. We don't store
// per-message read receipts on this table — we use the existing "last seen"
// timestamp from useStudentStore (lastVoiceSeenAt) to determine unread state,
// and call markVoicesAsSeen on mount so the bell badge clears.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { tokens } from '../../constants/designTokens';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import useAuthStore from '../../stores/authStore';
import useStudentStore from '../../stores/studentStore';
import { haptics } from '../../utils/haptics';

type Msg = {
  id: string;
  sender_id: string;
  sender_name?: string | null;
  sender_role?: string | null;
  target_id?: string | null;
  target_name?: string | null;
  target_type?: string | null;
  audio_url?: string | null;
  audio_data?: string | null;
  duration?: number | null;
  created_at: string;
};

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDay === 0) return 'اليوم';
    if (diffDay === 1) return 'أمس';
    if (diffDay < 7) return `قبل ${diffDay} أيام`;
    return d.toLocaleDateString('ar-IQ');
  } catch { return ''; }
}

export default function StudentMessages() {
  const userId = useAuthStore(s => s.userId);
  const lastSeen = useStudentStore(s => s.lastVoiceSeenAt);
  const messages = useStudentStore(s => s.voiceMessages) as Msg[];
  const loadVoiceMessages = useStudentStore(s => s.loadVoiceMessages);
  const markVoicesAsSeen = useStudentStore(s => s.markVoicesAsSeen);

  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Initial load + clear unread badge
  useEffect(() => {
    if (!userId) return;
    loadVoiceMessages(userId);
    markVoicesAsSeen(userId);
  }, [userId, loadVoiceMessages, markVoicesAsSeen]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try { await loadVoiceMessages(userId); } finally { setRefreshing(false); }
  }, [userId, loadVoiceMessages]);

  // Filter out messages the student sent themselves — this is an inbox.
  // Group by sender_id (teacher), preserving newest-first order.
  const grouped = useMemo(() => {
    const incoming = (messages || []).filter(m => m.sender_id !== userId);
    const groups: Record<string, { senderId: string; senderName: string; items: Msg[] }> = {};
    for (const m of incoming) {
      const key = m.sender_id;
      if (!groups[key]) {
        groups[key] = {
          senderId: m.sender_id,
          senderName: m.sender_name || 'الأستاذ',
          items: [],
        };
      }
      groups[key].items.push(m);
    }
    // Sort each group by date desc, then sort groups by their newest message
    return Object.values(groups)
      .map(g => ({
        ...g,
        items: g.items.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
      }))
      .sort((a, b) => +new Date(b.items[0].created_at) - +new Date(a.items[0].created_at));
  }, [messages, userId]);

  const totalUnread = useMemo(() => {
    if (!lastSeen) return grouped.reduce((acc, g) => acc + g.items.length, 0);
    const ts = +new Date(lastSeen);
    return grouped.reduce((acc, g) =>
      acc + g.items.filter(m => +new Date(m.created_at) > ts).length, 0);
  }, [grouped, lastSeen]);

  const toggle = (senderId: string) => {
    haptics.selection();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(senderId)) next.delete(senderId);
      else next.add(senderId);
      return next;
    });
  };

  const playAudio = async (msg: Msg) => {
    haptics.selection();
    // If tapping the currently playing one, stop it.
    if (playingId === msg.id) {
      try {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
      } catch { /* ignore */ }
      setPlayingId(null);
      return;
    }
    if (!msg.audio_url && !msg.audio_data) {
      Alert.alert('تنبيه', 'لا يتوفر تسجيل صوتي لهذه الرسالة');
      return;
    }
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const audioUri = (msg.audio_url || msg.audio_data) as string;
      if (Platform.OS === 'web') {
        const audio = new (window as any).Audio(audioUri);
        audio.addEventListener('ended', () => { setPlayingId(null); soundRef.current = null; });
        await audio.play();
        soundRef.current = {
          stopAsync: async () => audio.pause(),
          unloadAsync: async () => { audio.pause(); audio.src = ''; },
        } as any;
      } else {
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setPlayingId(null);
              sound.unloadAsync().catch(() => {});
              soundRef.current = null;
            }
          },
        );
        soundRef.current = sound;
      }
      setPlayingId(msg.id);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تشغيل الرسالة الصوتية');
      setPlayingId(null);
    }
  };

  const isUnread = (m: Msg) => {
    if (!lastSeen) return true;
    return +new Date(m.created_at) > +new Date(lastSeen);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الرسائل"
        subtitle={totalUnread > 0 ? `${totalUnread} رسالة جديدة` : 'كل الرسائل من أساتذتك'}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
        showBack
        fallbackRoute="/(student)"
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.teal600} />}
        showsVerticalScrollIndicator={false}
      >
        {grouped.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={36} color={tokens.color.teal600} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد رسائل</Text>
            <Text style={styles.emptyHint}>عند إرسال أساتذتك رسائل لك ستظهر هنا</Text>
          </View>
        ) : (
          grouped.map(group => {
            const open = expanded.has(group.senderId);
            const groupUnread = group.items.filter(isUnread).length;
            const newest = group.items[0];
            return (
              <View key={group.senderId} style={styles.card}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggle(group.senderId)}
                  style={styles.cardHeader}
                >
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={22} color={tokens.color.teal600} />
                  </View>
                  <View style={styles.cardHeaderInfo}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.senderName} numberOfLines={1}>{group.senderName}</Text>
                      {groupUnread > 0 && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{groupUnread}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.lastMsgPreview} numberOfLines={1}>
                      {newest.target_name ? `${newest.target_name} · ` : ''}
                      {newest.audio_url || newest.audio_data ? 'رسالة صوتية' : 'رسالة'}
                      {' · '}{formatDate(newest.created_at)}
                    </Text>
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={tokens.color.text2}
                  />
                </TouchableOpacity>

                {open && (
                  <View style={styles.thread}>
                    {group.items.map(msg => {
                      const playing = playingId === msg.id;
                      const hasAudio = !!(msg.audio_url || msg.audio_data);
                      const unread = isUnread(msg);
                      return (
                        <View key={msg.id} style={[styles.msgRow, unread && styles.msgRowUnread]}>
                          {hasAudio ? (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              style={[
                                styles.playBtn,
                                { backgroundColor: playing ? tokens.color.danger : tokens.color.teal600 },
                              ]}
                              onPress={() => playAudio(msg)}
                            >
                              <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
                            </TouchableOpacity>
                          ) : (
                            <View style={[styles.playBtn, { backgroundColor: tokens.color.pinkBg }]}>
                              <Ionicons name="chatbubble" size={16} color={tokens.color.pink} />
                            </View>
                          )}
                          <View style={styles.msgInfo}>
                            <Text style={styles.msgTitle} numberOfLines={2}>
                              {hasAudio
                                ? `رسالة صوتية${msg.duration ? ` · ${Math.round(msg.duration)} ث` : ''}`
                                : 'رسالة نصية'}
                            </Text>
                            {!!msg.target_name && (
                              <Text style={styles.msgTarget} numberOfLines={1}>
                                إلى: {msg.target_name}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.msgDate}>{formatDate(msg.created_at)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: { padding: 16, paddingBottom: 32 },
  empty: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 60,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    ...tokens.shadow.sm,
  },
  emptyTitle: {
    fontSize: tokens.font.size.lg, fontWeight: '800', color: tokens.color.text,
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: tokens.font.size.base, color: tokens.color.text2, textAlign: 'center',
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.color.border2,
    marginBottom: 10,
    overflow: 'hidden',
    ...tokens.shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeaderInfo: { flex: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  senderName: {
    flex: 1, fontSize: tokens.font.size.base, fontWeight: '800', color: tokens.color.text,
    textAlign: 'right',
  },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: tokens.color.danger,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lastMsgPreview: {
    fontSize: tokens.font.size.sm, color: tokens.color.text2,
    textAlign: 'right', marginTop: 2,
  },
  thread: {
    paddingHorizontal: 14, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: tokens.color.border2,
  },
  msgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: tokens.color.border2,
  },
  msgRowUnread: { backgroundColor: tokens.color.brand100 + '30' },
  playBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  msgInfo: { flex: 1 },
  msgTitle: {
    fontSize: tokens.font.size.base, fontWeight: '700',
    color: tokens.color.text, textAlign: 'right',
  },
  msgTarget: {
    fontSize: tokens.font.size.xs, color: tokens.color.text2, marginTop: 2,
    textAlign: 'right',
  },
  msgDate: {
    fontSize: tokens.font.size.xs, color: tokens.color.text2,
  },
});
