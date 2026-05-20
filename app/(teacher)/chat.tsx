import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import ListRow from '../../components/teacher/cards/ListRow';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';

// ── Relative time helper (Arabic) — short label suitable for ListRow meta column.
// Examples: "الآن", "٥ د", "٢ س", "أمس", "12/04". Keeps the row tight without
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

export default function TeacherChat() {
  const { userId, userName } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { t } = useTranslation();
  const isEnabled = useFeatureFlag('parent_teacher_chat');

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active chat
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    try {
      const convs = await api.getChatConversations(userId, userInstituteId || undefined);
      setConversations(convs);
    } catch (err: any) {
      console.error(err);
      Alert.alert(t('common.error'), err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [userId, userInstituteId]);

  useEffect(() => { loadConversations(); }, [userId, userInstituteId]);

  const openChat = async (parentId: string) => {
    try {
      const conv = await api.getOrCreateConversation(userId || '', parentId, userInstituteId || '');
      setActiveConvId(conv.id);
      const msgs = await api.getChatMessages2(conv.id);
      setMessages(msgs);
      await api.markChatRead(conv.id, userId || '');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    } catch (err: any) {
      console.error(err);
      Alert.alert(t('common.error'), err?.message || String(err));
    }
  };

  const handleSend = async () => {
    if (!msgInput.trim() || !activeConvId || !userId) return;
    setSending(true);
    try {
      const msg = await api.sendChatMessage2(activeConvId, userId, msgInput.trim(), 'text', undefined, userInstituteId || undefined);
      setMessages(prev => [...prev, msg]);
      setMsgInput('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      console.error(err);
      Alert.alert(t('common.error'), err?.message || String(err));
    } finally {
      setSending(false);
    }
  };

  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <TeacherInnerHero title={t('teacherChat.conversations')} fallbackRoute="/(teacher)/services" />
        <View style={s.centerEmpty}>
          <View style={s.emptyIconCircle}>
            <Ionicons name="lock-closed" size={36} color={tokens.color.text3} />
          </View>
          <Text style={s.emptyTitle}>{t('teacherChat.featureDisabled')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Active thread view — bubbles + input bar (logic preserved verbatim).
  if (activeConvId) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <View style={s.chatHeader}>
          <TouchableOpacity onPress={() => { setActiveConvId(null); loadConversations(); }} style={s.chatHeaderBack}>
            <Ionicons name="arrow-forward" size={22} color={tokens.color.text} />
          </TouchableOpacity>
          <Text style={s.chatHeaderTitle}>{t('teacherChat.conversation')}</Text>
          <View style={{ width: 38 }} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: tokens.spacing[4], paddingBottom: tokens.spacing[2] }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {messages.map((msg: any) => {
              const isMe = msg.sender_id === userId;
              return (
                <View key={msg.id} style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
                  <Text style={[s.bubbleText, isMe && s.bubbleTextMe]}>{msg.content}</Text>
                  <Text style={[s.bubbleTime, isMe && s.bubbleTimeMe]}>{new Date(msg.sent_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              );
            })}
          </ScrollView>
          <View style={s.inputBar}>
            <TouchableOpacity onPress={handleSend} disabled={sending || !msgInput.trim()} style={[s.sendBtn, (!msgInput.trim() || sending) && { opacity: 0.4 }]}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
            <TextInput style={s.msgInput} value={msgInput} onChangeText={setMsgInput} placeholder={t('teacherChat.writeMessage')} placeholderTextColor={tokens.color.text3} textAlign="right" />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Conversations list — ListRow primitive per row; brand50 background for unread.
  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero
        title={t('teacherChat.conversations')}
        subtitle={t('teacherChat.connectWithParents')}
        fallbackRoute="/(teacher)/services"
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: tokens.spacing[4], paddingBottom: tokens.spacing[8] }}>
        {loading ? (
          <ActivityIndicator color={tokens.color.brand500} style={{ paddingTop: 40 }} />
        ) : conversations.length === 0 ? (
          <View style={s.centerEmpty}>
            <View style={s.emptyIconCircle}>
              <Ionicons name="chatbubbles-outline" size={36} color={tokens.color.text3} />
            </View>
            <Text style={s.emptyTitle}>{t('teacherChat.noConversations')}</Text>
          </View>
        ) : conversations.map((conv: any) => {
          const unread = Number(conv.unread_count || 0);
          const lastPreview = conv.last_message || conv.last_content || '';
          const meta = formatRelativeTime(conv.updated_at || conv.last_message_at);
          const partnerName = conv.parent_name || conv.other_name || t('teacherChat.conversation');
          const avatarUrl = conv.parent_avatar || conv.other_avatar || conv.avatar_url || undefined;
          return (
            <View
              key={conv.id}
              style={unread > 0 ? s.unreadWrap : undefined}
            >
              <ListRow
                icon="chatbubbles"
                iconGradient="brand"
                avatarUrl={avatarUrl}
                title={partnerName}
                subtitle={lastPreview || ' '}
                meta={meta}
                badge={unread > 0 ? { label: String(unread), tone: 'danger' } : undefined}
                onPress={() => openChat(conv.parent_id || conv.other_id)}
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
  header: { paddingHorizontal: tokens.spacing[5], paddingTop: tokens.spacing[4], paddingBottom: tokens.spacing[3] },
  title: { fontSize: tokens.font.size['3xl'], fontWeight: tokens.font.weight.heavy, color: tokens.color.text, textAlign: 'right' },
  subtitle: { fontSize: tokens.font.size.md, color: tokens.color.text2, textAlign: 'right', marginTop: 2 },

  // Brand50 wrap for unread rows — applied as a tinted halo without modifying ListRow.
  unreadWrap: {
    backgroundColor: tokens.color.brand50,
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing[2],
  },

  // Empty / disabled state shared block
  centerEmpty: { alignItems: 'center', paddingTop: 60 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: tokens.spacing[3],
  },
  emptyTitle: { fontSize: tokens.font.size.lg, color: tokens.color.text2, fontWeight: tokens.font.weight.semi },

  // Active thread header
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[3],
    borderBottomWidth: 1, borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  chatHeaderBack: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  chatHeaderTitle: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.heavy, color: tokens.color.text },

  // Bubbles
  bubble: { maxWidth: '80%', padding: tokens.spacing[3], borderRadius: tokens.radius.lg, marginBottom: 6 },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.color.brand500,
    borderBottomLeftRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.semi, color: tokens.color.text, lineHeight: 22 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 9, color: tokens.color.text3, marginTop: 4 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[2],
    borderTopWidth: 1, borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface, gap: tokens.spacing[2],
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: tokens.color.brand500,
    alignItems: 'center', justifyContent: 'center',
    ...tokens.shadow.brand,
  },
  msgInput: {
    flex: 1, backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[3],
    fontSize: tokens.font.size.lg, color: tokens.color.text,
  },
});
