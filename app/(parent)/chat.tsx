// ParentChat — single contact line: institute administration only.
// Brief §7.4 (revised 2026-05-08): parents talk only to the institute admin
// ("تواصل مع إدارة <school>"). The CTA shows the institute name dynamically.
// Hard rules preserved:
//   • Realtime channel + dual postgres_changes listeners (sender + receiver)
//   • Defense-in-depth filter on msg.institute_id !== userInstituteId
//   • Dedup via prev.some((m) => m.id === msg.id)
//   • userInstituteId guards on openChat + handleSend (refuse without tenantId)
//   • Feature flag gate: useFeatureFlag('admin_parent_chat')
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import useAuthStore from '../../stores/authStore';
import useParentStore from '../../stores/parentStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { tokens } from '../../constants/designTokens';

import RoleInnerHero from '../../components/shared/RoleInnerHero';
import ConversationRow, { Conversation } from '../../components/parent/chat/ConversationRow';
import ChatBubble from '../../components/parent/chat/ChatBubble';
import ChatInputBar from '../../components/parent/chat/ChatInputBar';
import VoiceMessageInput from '../../components/shared/VoiceMessageInput';
import VoiceMessageBubble from '../../components/shared/VoiceMessageBubble';

export default function ParentChat() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { conversations, loadConversations } = useParentStore();
  const { userInstituteId } = useDataStore();

  const [refreshing, setRefreshing] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const isAdminChatEnabled = useFeatureFlag('admin_parent_chat');
  const [instituteName, setInstituteName] = useState<string>('');

  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const flatListRef = useRef<FlashListRef<any>>(null);

  useEffect(() => {
    if (userId) loadConversations(userId, userInstituteId || undefined);
  }, [userId, userInstituteId]);

  useEffect(() => {
    if (!userInstituteId) return;
    api.getInstituteName(userInstituteId).then((n) => { if (n) setInstituteName(n); });
  }, [userInstituteId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (userId) await loadConversations(userId, userInstituteId || undefined);
    } finally {
      setRefreshing(false);
    }
  }, [userId, userInstituteId]);

  // Realtime subscription for new messages. Multi-tenant: refuse to subscribe
  // until userInstituteId is resolved — the effect re-runs once it lands.
  useEffect(() => {
    if (!userId || !selectedConv || !userInstituteId) return;
    const channel = supabase
      .channel(`chat_${userId}_${selectedConv.userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
    }, (payload) => {
      const msg = payload.new as any;
      // Only append if it belongs to the current conversation — skip chats with others
      if (msg?.sender_id !== selectedConv.userId) return;
      // Defense-in-depth: ignore messages from other institutes (shouldn't be delivered, but just in case)
      if (msg?.institute_id && msg.institute_id !== userInstituteId) return;
      setMessages((prev) => prev.some((m: any) => m.id === msg.id) ? prev : [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `sender_id=eq.${userId}`,
      }, (payload) => {
        const msg = payload.new as any;
        if (msg?.receiver_id !== selectedConv.userId) return;
        // Defense-in-depth: ignore messages from other institutes (shouldn't be delivered, but just in case)
        if (msg?.institute_id && msg.institute_id !== userInstituteId) return;
        setMessages((prev) => prev.some((m: any) => m.id === msg.id) ? prev : [...prev, msg]);
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, selectedConv, userInstituteId]);

  const openChat = useCallback(async (conv: Conversation) => {
    if (!userInstituteId) {
      Alert.alert(t('common.warning', { defaultValue: 'تنبيه' }), 'جاري تحميل بيانات المؤسسة...');
      return;
    }
    setSelectedConv(conv);
    setLoadingMsgs(true);
    try {
      const data = await api.getMessages(userId || '', conv.userId, userInstituteId);
      setMessages(data);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('parent.loadFailed'));
    } finally {
      setLoadingMsgs(false);
    }
  }, [userId, userInstituteId, t]);

  const handleSend = useCallback(async () => {
    if (!newMessage.trim() || !userId || !selectedConv) return;
    if (!userInstituteId) {
      Alert.alert(t('common.warning', { defaultValue: 'تنبيه' }), 'جاري تحميل بيانات المؤسسة...');
      return;
    }
    setSending(true);
    try {
      await api.sendMessage(userId, selectedConv.userId, newMessage.trim(), userInstituteId);
      setNewMessage('');
      const data = await api.getMessages(userId, selectedConv.userId, userInstituteId);
      setMessages(data);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('parent.sendFailed'));
    } finally {
      setSending(false);
    }
  }, [newMessage, userId, selectedConv, userInstituteId, t]);

  // Voice send — same path as text but with type='voice' + audio_url + duration.
  // Tenant guard mirrors handleSend: refuse if institute id hasn't resolved yet.
  // We append the inserted row optimistically (instead of re-fetching) since
  // VoiceMessageInput already paid the upload cost — saves a round trip.
  const handleSendVoice = useCallback(
    async ({ audioUrl, duration }: { audioUrl: string; duration: number }) => {
      if (!userId || !selectedConv) return;
      if (!userInstituteId) {
        Alert.alert(t('common.warning', { defaultValue: 'تنبيه' }), 'جاري تحميل بيانات المؤسسة...');
        return;
      }
      try {
        const inserted = await api.sendMessage(
          userId,
          selectedConv.userId,
          '',
          userInstituteId,
          { type: 'voice', audioUrl, duration },
        );
        setMessages((prev: any[]) => {
          if (inserted?.id && prev.some((m: any) => m.id === inserted.id)) return prev;
          return inserted ? [...prev, inserted] : prev;
        });
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
      } catch (err: any) {
        Alert.alert(t('common.error'), err?.message || t('parent.sendFailed'));
      }
    },
    [userId, selectedConv, userInstituteId, t],
  );

  const roleLabel = useCallback((role: string) => {
    const map: Record<string, string> = {
      admin:     t('parent.chatRoleMap.admin'),
      teacher:   t('parent.chatRoleMap.teacher'),
      institute: t('parent.chatRoleMap.institute'),
    };
    return map[role] || role;
  }, [t]);

  // ----- Thread view -----
  if (selectedConv) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.chatHeader}>
          <View style={{ flex: 1 }} />
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName}>{selectedConv.name}</Text>
            <Text style={styles.chatHeaderRole}>{roleLabel(selectedConv.role)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setSelectedConv(null)}
            style={styles.backBtn}
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-forward" size={22} color={tokens.color.text} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {loadingMsgs ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={tokens.color.p600} />
            </View>
          ) : (
            <FlashList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, idx) => item.id || `${idx}`}
              renderItem={({ item }) => {
                const mine = item.sender_id === userId;
                const isVoice = item.type === 'voice' && item.audio_url;
                if (isVoice) {
                  // Use a parent-themed bubble so voice messages match the chat thread style
                  // (violet for mine, surface+border for theirs). VoiceMessageBubble itself
                  // renders the play button + waveform + duration.
                  return (
                    <View style={[voiceBubbleStyles.bubble, mine ? voiceBubbleStyles.mine : voiceBubbleStyles.other]}>
                      <VoiceMessageBubble
                        audioUrl={item.audio_url}
                        duration={item.duration}
                        variant={mine ? 'me' : 'other'}
                      />
                      {item.created_at ? (
                        <Text style={[voiceBubbleStyles.time, mine && voiceBubbleStyles.timeMine]}>
                          {new Date(item.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      ) : null}
                    </View>
                  );
                }
                return (
                  <ChatBubble
                    text={item.content}
                    mine={mine}
                    createdAt={item.created_at}
                  />
                );
              }}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            />
          )}

          <ChatInputBar
            value={newMessage}
            onChange={setNewMessage}
            onSend={handleSend}
            sending={sending}
            voiceSlot={
              userId && userInstituteId ? (
                <VoiceMessageInput
                  instituteId={userInstituteId}
                  userId={userId}
                  accentColor={tokens.color.p600}
                  disabled={sending}
                  onSend={handleSendVoice}
                />
              ) : null
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ----- Conversation list view -----
  const handleContactAdmin = async () => {
    if (!userId) {
      Alert.alert(t('common.warning', { defaultValue: 'تنبيه' }), 'الجلسة منتهية — سجّل الدخول من جديد');
      return;
    }
    if (!userInstituteId) {
      Alert.alert(t('common.warning', { defaultValue: 'تنبيه' }), 'جاري تحميل بيانات المؤسسة... حاول بعد لحظات');
      return;
    }
    setStartingChat(true);
    try {
      const admin = await api.getAdminByInstitute(userInstituteId);
      if (!admin) {
        // Diagnostic — surfaces to the device console so we can see WHY the lookup
        // returned null. The most common cause used to be RLS hiding the admin's
        // enrollment from the parent session; that path is now covered by the
        // `get_institute_admin` SECURITY DEFINER RPC.
        if (__DEV__) {
          console.warn('[ParentChat] getAdminByInstitute returned null', { userInstituteId });
        }
        Alert.alert(
          t('common.warning', { defaultValue: 'تنبيه' }),
          'تعذّر العثور على حساب إدارة المؤسسة. تواصل مع المعهد للتحقق من تفعيل الحساب الإداري.',
        );
        setStartingChat(false);
        return;
      }
      const msgs = await api.getMessages(userId, admin.id, userInstituteId);
      setSelectedConv({
        userId: admin.id,
        name: instituteName ? `إدارة ${instituteName}` : (admin.full_name || 'الإدارة'),
        role: 'admin',
      });
      setMessages(msgs);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('parent.chatOpenFailed'));
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={instituteName ? `تواصل مع إدارة ${instituteName}` : 'التواصل'}
        gradient={tokens.gradient.parent}
        glowAccent="rgba(167,139,250,0.30)"
        showBack={false}
      />

      {/* Contact Admin — only if feature enabled */}
      {isAdminChatEnabled ? (
        <TouchableOpacity
          style={styles.ctaAdmin}
          onPress={handleContactAdmin}
          disabled={startingChat}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          {startingChat ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="shield-checkmark" size={18} color="#fff" />
          )}
          <Text style={styles.ctaText}>
            {instituteName ? `تواصل مع إدارة ${instituteName}` : 'تواصل مع الإدارة'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <FlashList
        data={conversations}
        keyExtractor={(item, idx) => item.userId || `${idx}`}
        renderItem={({ item }) => (
          <ConversationRow conv={item} roleLabel={roleLabel} onPress={openChat} />
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('parent.noConversations')}</Text>}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.p600} />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 40,
  },
  // Chat thread view
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  chatHeaderInfo: { alignItems: 'center', flex: 2 },
  chatHeaderName: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  chatHeaderRole: { fontSize: tokens.font.size.xs, color: tokens.color.text3 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messagesList: { paddingHorizontal: 16, paddingVertical: 12 },
  // Top CTAs
  ctaAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.color.indigo,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  ctaText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: '#fff',
  },
});

// Voice bubble styles — mirror ChatBubble (mine = violet/start, other = surface/end)
// but reuse here so VoiceMessageBubble sits inside a thread-styled container without
// modifying ChatBubble (which is text-only by contract).
const voiceBubbleStyles = StyleSheet.create({
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    padding: 10,
    marginBottom: 6,
  },
  mine: {
    backgroundColor: tokens.color.p600,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  other: {
    backgroundColor: tokens.color.surface,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  time: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    textAlign: 'left',
    marginTop: 4,
  },
  timeMine: { color: 'rgba(255,255,255,0.65)' },
});
