import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import ListRow from '../../components/teacher/cards/ListRow';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { haptics } from '../../utils/haptics';
import VoiceMessageInput from '../../components/shared/VoiceMessageInput';
import VoiceMessageBubble from '../../components/shared/VoiceMessageBubble';

// ── Types — narrow shapes from api.listStudentClassChats / api.getClassChatMessages.
// Backend returns nested join shapes; keep the local types minimal so we don't lie
// about fields we never read. Avoids `any` at callsites without overspecifying.

type ClassChat = {
  id: string;
  teacher_id: string;
  subject_id: string | null;
  section_id: string | null;
  class_id: string | null;
  title: string | null;
  write_locked: boolean;
  updated_at: string;
  subjects?: { name?: string | null } | null;
  sections?: { name?: string | null; grade_id?: string | null } | null;
  classes?: { name?: string | null } | null;
  users?: { full_name?: string | null; avatar_url?: string | null } | null;
};

type ChatMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_role: 'teacher' | 'student';
  content: string;
  type: string;
  audio_url?: string | null;
  duration?: number | null;
  image_url?: string | null;
  sent_at: string;
  users?: { full_name?: string | null; avatar_url?: string | null } | null;
};

// ── Relative time helper (Arabic) — short label suitable for ListRow meta column.
// Examples: "الآن", "٥ د", "أمس", "12/04". Keeps the row tight without
// pulling in a date-fns/i18n locale just for one-off formatting.
function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `${diffMin} د`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'أمس';
  return date.toLocaleDateString('ar-IQ', { month: '2-digit', day: '2-digit' });
}

// Subtitle helper — combine teacher name + section/class label so the student knows
// which class this chat belongs to at a glance (one chat per subject per section).
function buildSubtitle(chat: ClassChat): string {
  const teacherName = chat.users?.full_name?.trim();
  const groupLabel = chat.sections?.name?.trim() || chat.classes?.name?.trim() || '';
  if (teacherName && groupLabel) return `${teacherName} • ${groupLabel}`;
  return teacherName || groupLabel || '';
}

export default function StudentClassChat() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { t } = useTranslation();
  const isEnabled = useFeatureFlag('class_chat');

  const [chats, setChats] = useState<ClassChat[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Active thread state
  const [activeChat, setActiveChat] = useState<ClassChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // ── Load conversations list. Filtered server-side by institute_id +
  // student's enrolled sections/classes (see api.listStudentClassChats).
  const loadChats = useCallback(async () => {
    if (!userId || !userInstituteId) return;
    setListError(null);
    try {
      const data = (await api.listStudentClassChats(userId, userInstituteId)) as ClassChat[];
      setChats(data);
      const ids = data.map((c) => c.id);
      if (ids.length) {
        const counts = await api.getClassChatUnreadCounts(userId, ids);
        setUnreadMap(counts);
      } else {
        setUnreadMap({});
      }
    } catch (err: any) {
      console.error('[class-chat] loadChats failed', err);
      setListError(err?.message || String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, userInstituteId]);

  useEffect(() => {
    if (isEnabled) loadChats();
    else setLoading(false);
  }, [isEnabled, loadChats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadChats();
  }, [loadChats]);

  // ── Open a chat thread: load messages, mark read, scroll to bottom.
  const openChat = useCallback(async (chat: ClassChat) => {
    if (!userId) return;
    void haptics.selection();
    setActiveChat(chat);
    setLoadingMessages(true);
    setMessages([]);
    try {
      const msgs = (await api.getClassChatMessages(chat.id)) as ChatMessage[];
      setMessages(msgs);
      try { await api.markClassChatRead(chat.id, userId); } catch (e) { if (__DEV__) console.warn('[class-chat] markRead failed', e); }
      // Optimistically clear the unread badge for this chat
      setUnreadMap((prev) => ({ ...prev, [chat.id]: 0 }));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 200);
    } catch (err: any) {
      console.error('[class-chat] openChat failed', err);
      Alert.alert(t('common.error'), err?.message || String(err));
    } finally {
      setLoadingMessages(false);
    }
  }, [userId, t]);

  const closeThread = useCallback(() => {
    setActiveChat(null);
    setMessages([]);
    setMsgInput('');
    // Refresh list so updated_at + unread counts reflect the just-read chat
    loadChats();
  }, [loadChats]);

  // ── Send message. RLS on the backend rejects inserts when write_locked=true,
  // so even if the UI guard is bypassed the server is the source of truth.
  const handleSend = useCallback(async () => {
    if (!activeChat || !userId || !userInstituteId) return;
    const text = msgInput.trim();
    if (!text) return;
    if (activeChat.write_locked) {
      Alert.alert(t('common.warning'), 'الكتابة مغلقة من قبل الأستاذ');
      return;
    }
    setSending(true);
    try {
      const msg = (await api.sendClassChatMessage({
        chatId: activeChat.id,
        instituteId: userInstituteId,
        senderId: userId,
        senderRole: 'student',
        content: text,
      })) as ChatMessage;
      // Append (dedupe in case realtime echoes the same row)
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      setMsgInput('');
      void haptics.success();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      console.error('[class-chat] send failed', err);
      // RLS rejection on locked chat surfaces as a Postgres error — give a
      // friendlier message than the raw "new row violates row-level security".
      const raw = String(err?.message || err);
      const isLockError = /row-level security|policy|denied|locked/i.test(raw);
      Alert.alert(
        t('common.error'),
        isLockError ? 'تعذّر الإرسال — قد يكون الأستاذ أوقف المراسلة' : raw,
      );
      // Re-fetch chat metadata so write_locked reflects current state
      loadChats();
    } finally {
      setSending(false);
    }
  }, [activeChat, userId, userInstituteId, msgInput, t, loadChats]);

  // Voice send — shares the same write_locked guard as text. Server-side RLS still
  // rejects locked chats so the UI guard is just for fast feedback.
  const handleSendVoice = useCallback(
    async ({ audioUrl, duration }: { audioUrl: string; duration: number }) => {
      if (!activeChat || !userId || !userInstituteId) return;
      if (activeChat.write_locked) {
        Alert.alert(t('common.warning'), 'الكتابة مغلقة من قبل الأستاذ');
        return;
      }
      try {
        const sent = (await api.sendClassChatMessage({
          chatId: activeChat.id,
          instituteId: userInstituteId,
          senderId: userId,
          senderRole: 'student',
          content: '',
          type: 'voice',
          audioUrl,
          duration,
        })) as ChatMessage;
        setMessages((prev) => prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]);
        void haptics.success();
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      } catch (err: any) {
        console.error('[class-chat] sendVoice failed', err);
        const raw = String(err?.message || err);
        const isLockError = /row-level security|policy|denied|locked/i.test(raw);
        Alert.alert(
          t('common.error'),
          isLockError ? 'تعذّر الإرسال — قد يكون الأستاذ أوقف المراسلة' : raw,
        );
        loadChats();
      }
    },
    [activeChat, userId, userInstituteId, t, loadChats],
  );

  // ── Realtime: new messages on the active chat + write_locked flips on this chat.
  // Multi-tenant: we filter by chat_id (which is itself institute-scoped server-side
  // via RLS), so cross-tenant leakage is impossible even if a malicious channel sub
  // were attempted.
  useEffect(() => {
    if (!activeChat || !userId || !userInstituteId) return;
    // Channel name includes institute_id so it can never collide across tenants
    // even if two tenants somehow shared a chat_id.
    const channel = supabase
      .channel(`class_chat_${userInstituteId}_${activeChat.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'class_chat_messages',
        filter: `chat_id=eq.${activeChat.id}`,
      }, (payload) => {
        const raw = payload.new as ChatMessage;
        // Defense-in-depth: drop any message whose institute_id doesn't match
        // the current tenant. RLS already prevents cross-tenant delivery, but
        // a future regression here would silently leak messages otherwise.
        if ((raw as any).institute_id && (raw as any).institute_id !== userInstituteId) return;
        // Skip echoes from our own send (already appended optimistically)
        if (raw.sender_id === userId) return;
        setMessages((prev) => prev.some((m) => m.id === raw.id) ? prev : [...prev, raw]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
        // Auto-mark as read since the user is actively viewing the thread
        api.markClassChatRead(activeChat.id, userId).catch((e) => { if (__DEV__) console.warn('[class-chat] markRead realtime', e); });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'class_chats',
        filter: `id=eq.${activeChat.id}`,
      }, (payload) => {
        const updated = payload.new as Partial<ClassChat>;
        if ((updated as any).institute_id && (updated as any).institute_id !== userInstituteId) return;
        // Patch local active chat so the lock banner + input disable react instantly
        setActiveChat((prev) => prev ? { ...prev, ...updated } as ClassChat : prev);
        // Also sync the list so the lock indicator there stays accurate
        setChats((prev) => prev.map((c) => c.id === activeChat.id ? { ...c, ...updated } as ClassChat : c));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChat?.id, userId, userInstituteId]);

  // ── Realtime on the list view: any new message in any of the student's chats
  // bumps unread + reorders.
  //
  // PERF: Previously this channel filtered by `institute_id=eq.${userInstituteId}`
  // which meant every student in an institute received an INSERT broadcast for
  // EVERY class chat in the institute (then dropped client-side). At ~250 students
  // × ~1000 chats this fanned out to 250k+ broadcasts/day per institute and put us
  // on track for $500–2000/mo Supabase egress. We now subscribe with a tight
  // `chat_id=in.(...)` server-side filter so the realtime pipeline only sends us
  // rows for chats this student is actually enrolled in. The previous client-side
  // `chatIds.has(...)` guard is preserved as a defense-in-depth check.
  //
  // Postgres Realtime filters have a soft length limit (~1024 chars). UUIDs are
  // 36 chars + 1 separator = 37 each, so we can fit ~25 ids per channel safely.
  // We chunk into multiple channels if a student is enrolled in more chats —
  // realistic class loads are well under this, but we handle it for safety.
  useEffect(() => {
    if (activeChat || !userId || !userInstituteId || chats.length === 0) return;

    const chatIds = chats.map((c) => c.id);
    const chatIdSet = new Set(chatIds);

    // Chunk to stay well under Realtime filter length limits.
    const CHUNK_SIZE = 25;
    const chunks: string[][] = [];
    for (let i = 0; i < chatIds.length; i += CHUNK_SIZE) {
      chunks.push(chatIds.slice(i, i + CHUNK_SIZE));
    }

    const channels = chunks.map((chunk, idx) => {
      const idsCsv = chunk.join(',');
      return supabase
        .channel(`class_chats_list_${userId}_${idx}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'class_chat_messages',
          filter: `chat_id=in.(${idsCsv})`,
        }, (payload) => {
          const msg = payload.new as ChatMessage;
          // Defense-in-depth: even if the filter were ever bypassed, this guard
          // ensures we only ever badge chats the student is actually in.
          if (!chatIdSet.has(msg.chat_id)) return;
          if (msg.sender_id === userId) return; // don't badge our own sends
          setUnreadMap((prev) => ({ ...prev, [msg.chat_id]: (prev[msg.chat_id] || 0) + 1 }));
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'class_chats',
          filter: `id=in.(${idsCsv})`,
        }, (payload) => {
          const updated = payload.new as Partial<ClassChat> & { id: string };
          if (!chatIdSet.has(updated.id)) return;
          setChats((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } as ClassChat : c));
        })
        .subscribe();
    });

    return () => { channels.forEach((ch) => { supabase.removeChannel(ch); }); };
  }, [activeChat, userId, userInstituteId, chats]);

  // Total unread for header context (kept for future use / badge in list header)
  const totalUnread = useMemo(
    () => Object.values(unreadMap).reduce((sum, n) => sum + (n || 0), 0),
    [unreadMap],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Render: feature-flag gate
  // ────────────────────────────────────────────────────────────────────────────
  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title="دردشات الصف"
          gradient={tokens.gradient.student}
          glowAccent="rgba(20,184,166,0.30)"
        />
        <View style={s.centerEmpty}>
          <View style={s.emptyIconCircle}>
            <Ionicons name="lock-closed" size={36} color={tokens.color.text3} />
          </View>
          <Text style={s.emptyTitle}>هذه الميزة غير مفعّلة لمؤسستك</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Render: active thread view
  // ────────────────────────────────────────────────────────────────────────────
  if (activeChat) {
    const subjectName = activeChat.subjects?.name?.trim() || activeChat.title?.trim() || 'دردشة الصف';
    const teacherName = activeChat.users?.full_name?.trim() || '';
    const isLocked = !!activeChat.write_locked;

    return (
      <SafeAreaView style={s.container}>
        <View style={s.chatHeader}>
          <TouchableOpacity onPress={closeThread} style={s.chatHeaderBack} accessibilityLabel="رجوع">
            <Ionicons name="arrow-forward" size={22} color={tokens.color.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.chatHeaderTitle} numberOfLines={1}>{subjectName}</Text>
            {teacherName ? <Text style={s.chatHeaderSubtitle} numberOfLines={1}>{teacherName}</Text> : null}
          </View>
          <View style={{ width: 38 }} />
        </View>

        {isLocked ? (
          <View style={s.lockBanner}>
            <Ionicons name="lock-closed" size={16} color={tokens.color.warning} />
            <Text style={s.lockBannerText}>الأستاذ أوقف المراسلة — يمكنك القراءة فقط</Text>
          </View>
        ) : null}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}
        >
          {loadingMessages ? (
            <ActivityIndicator color={tokens.color.brand500} style={{ paddingTop: 40 }} />
          ) : (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={{ padding: tokens.spacing[4], paddingBottom: tokens.spacing[2] }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.length === 0 ? (
                <View style={s.centerEmpty}>
                  <Text style={s.emptyTitle}>لا توجد رسائل بعد</Text>
                </View>
              ) : messages.map((msg) => {
                const isMe = msg.sender_id === userId;
                const isTeacher = msg.sender_role === 'teacher';
                const senderName = msg.users?.full_name || (isTeacher ? 'الأستاذ' : 'طالب');
                const avatarUrl = msg.users?.avatar_url || undefined;
                const time = new Date(msg.sent_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });

                return (
                  <View
                    key={msg.id}
                    style={[
                      s.bubbleRow,
                      isMe ? s.bubbleRowMe : s.bubbleRowOther,
                    ]}
                  >
                    {!isMe ? (
                      <View style={s.bubbleAvatar}>
                        {avatarUrl ? (
                          <Image source={{ uri: avatarUrl }} style={s.bubbleAvatarImg} contentFit="cover" />
                        ) : (
                          <Ionicons
                            name={isTeacher ? 'school' : 'person'}
                            size={16}
                            color={isTeacher ? tokens.color.warning : tokens.color.text3}
                          />
                        )}
                      </View>
                    ) : null}
                    <View
                      style={[
                        s.bubble,
                        isMe ? s.bubbleMe : (isTeacher ? s.bubbleTeacher : s.bubbleOther),
                      ]}
                    >
                      {!isMe ? (
                        <View style={s.bubbleHeader}>
                          <Text style={[s.bubbleSender, isTeacher && s.bubbleSenderTeacher]}>
                            {senderName}
                          </Text>
                          {isTeacher ? (
                            <View style={s.teacherBadge}>
                              <Ionicons name="school" size={10} color={tokens.color.warning} />
                              <Text style={s.teacherBadgeText}>أستاذ</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      {msg.type === 'voice' && msg.audio_url ? (
                        <VoiceMessageBubble
                          audioUrl={msg.audio_url}
                          duration={msg.duration}
                          variant={isMe ? 'me' : 'other'}
                        />
                      ) : msg.type === 'image' && msg.image_url ? (
                        <Image
                          source={{ uri: msg.image_url }}
                          style={s.bubbleImage}
                          contentFit="cover"
                        />
                      ) : (
                        <Text style={[s.bubbleText, isMe && s.bubbleTextMe]}>{msg.content}</Text>
                      )}
                      <Text style={[s.bubbleTime, isMe && s.bubbleTimeMe]}>{time}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={s.inputBar}>
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending || !msgInput.trim() || isLocked}
              style={[s.sendBtn, (!msgInput.trim() || sending || isLocked) && { opacity: 0.4 }]}
              accessibilityLabel="إرسال"
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name={isLocked ? 'lock-closed' : 'send'} size={18} color="#fff" />
              )}
            </TouchableOpacity>
            {userId && userInstituteId ? (
              <VoiceMessageInput
                instituteId={userInstituteId}
                userId={userId}
                accentColor={tokens.color.teal600}
                disabled={isLocked}
                onSend={handleSendVoice}
              />
            ) : null}
            <TextInput
              style={[s.msgInput, isLocked && s.msgInputDisabled]}
              value={msgInput}
              onChangeText={setMsgInput}
              placeholder={isLocked ? 'الكتابة مغلقة من قبل الأستاذ' : 'اكتب رسالتك...'}
              placeholderTextColor={tokens.color.text3}
              textAlign="right"
              editable={!isLocked && !sending}
              multiline
              maxLength={2000}
            />
          </View>
          {isLocked ? (
            <Text style={s.inputHint}>الكتابة مغلقة من قبل الأستاذ</Text>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Render: list view
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="دردشات الصف"
        subtitle={totalUnread > 0 ? `${totalUnread} رسالة غير مقروءة` : null}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: tokens.spacing[4], paddingBottom: tokens.spacing[8] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.brand500} />}
      >
        {loading ? (
          <ActivityIndicator color={tokens.color.brand500} style={{ paddingTop: 40 }} />
        ) : listError ? (
          <View style={s.centerEmpty}>
            <View style={s.emptyIconCircle}>
              <Ionicons name="alert-circle" size={36} color={tokens.color.danger} />
            </View>
            <Text style={s.emptyTitle}>تعذّر تحميل الدردشات</Text>
            <Text style={s.errorDetail}>{listError}</Text>
            <TouchableOpacity onPress={loadChats} style={s.retryBtn}>
              <Text style={s.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : chats.length === 0 ? (
          <View style={s.centerEmpty}>
            <View style={s.emptyIconCircle}>
              <Ionicons name="chatbubbles-outline" size={36} color={tokens.color.text3} />
            </View>
            <Text style={s.emptyTitle}>لا توجد دردشات حتى الآن</Text>
            <Text style={s.emptyHint}>عندما يفتح الأستاذ دردشة لمادة، ستظهر هنا</Text>
          </View>
        ) : chats.map((chat) => {
          const unread = Number(unreadMap[chat.id] || 0);
          const subjectName = chat.subjects?.name?.trim() || chat.title?.trim() || 'دردشة الصف';
          const subtitleText = buildSubtitle(chat);
          const meta = formatRelativeTime(chat.updated_at);
          const avatarUrl = chat.users?.avatar_url || undefined;
          const isLocked = !!chat.write_locked;
          // Compose the title with a lock indicator suffix so the student knows
          // upfront which chats they can write to. Avatar covers the teacher.
          const titleWithLock = isLocked ? `${subjectName}  🔒` : subjectName;

          return (
            <View key={chat.id} style={unread > 0 ? s.unreadWrap : undefined}>
              <ListRow
                icon="chatbubbles"
                iconGradient="student"
                avatarUrl={avatarUrl}
                title={titleWithLock}
                subtitle={subtitleText || ' '}
                meta={meta}
                badge={unread > 0 ? { label: String(unread), tone: 'danger' } : undefined}
                onPress={() => openChat(chat)}
              />
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[4],
    paddingBottom: tokens.spacing[3],
  },
  title: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 2,
  },

  // Brand50 wrap for unread rows — applied as a tinted halo without modifying ListRow.
  unreadWrap: {
    backgroundColor: tokens.color.teal50,
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing[2],
  },

  // Empty / disabled / error state shared block
  centerEmpty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: tokens.spacing[5] },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: tokens.spacing[3],
  },
  emptyTitle: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: tokens.spacing[2],
  },
  errorDetail: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
  },
  retryBtn: {
    marginTop: tokens.spacing[4],
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.brand500,
    borderRadius: tokens.radius.pill,
  },
  retryText: { color: '#fff', fontWeight: tokens.font.weight.bold, fontSize: tokens.font.size.base },

  // Active thread header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  chatHeaderBack: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  chatHeaderTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  chatHeaderSubtitle: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    marginTop: 2,
  },

  // Lock banner (write_locked)
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.warning,
  },
  lockBannerText: {
    flex: 1,
    fontSize: tokens.font.size.base,
    color: tokens.color.warning,
    fontWeight: tokens.font.weight.semi,
    textAlign: 'right',
  },

  // Bubble rows
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 6,
  },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  bubbleAvatarImg: { width: '100%', height: '100%' },

  // Bubbles
  bubble: {
    maxWidth: '78%',
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.lg,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.color.teal600,
    borderBottomLeftRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderBottomRightRadius: 4,
  },
  // Teacher messages — visually distinct (warning/gold border + tinted bg) so
  // the student can quickly distinguish authoritative replies from peer chatter.
  bubbleTeacher: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.color.warningBg,
    borderWidth: 1.5,
    borderColor: tokens.color.warning,
    borderBottomRightRadius: 4,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  bubbleSender: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
  },
  bubbleSenderTeacher: { color: tokens.color.warning },
  teacherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.warning,
  },
  teacherBadgeText: {
    fontSize: 9,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.warning,
  },
  bubbleText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    lineHeight: 22,
  },
  bubbleImage: {
    width: 200,
    height: 200,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface2,
  },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 9, color: tokens.color.text3, marginTop: 4, textAlign: 'left' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.75)' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: tokens.spacing[2],
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: tokens.color.teal600,
    alignItems: 'center', justifyContent: 'center',
    ...tokens.shadow.teal,
  },
  msgInput: {
    flex: 1,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    fontSize: tokens.font.size.lg,
    color: tokens.color.text,
    maxHeight: 120,
    minHeight: 44,
  },
  msgInputDisabled: {
    backgroundColor: tokens.color.surface3,
    color: tokens.color.text3,
  },
  inputHint: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.warning,
    textAlign: 'center',
    paddingVertical: 4,
    backgroundColor: tokens.color.surface,
  },
});
