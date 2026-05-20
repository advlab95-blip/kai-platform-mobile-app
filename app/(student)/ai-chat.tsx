import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import StudentAITabBar from '../../components/shared/StudentAITabBar';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { haptics } from '../../utils/haptics';

export default function StudentAIChat() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const isEnabled = useFeatureFlag('ai_student_chatbot');

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const [studentSubjects, setStudentSubjects] = useState<string[]>([]);
  const listRef = useRef<FlashListRef<any>>(null);

  useEffect(() => {
    if (!userId || !userInstituteId) return;
    (async () => {
      try {
        const [convs, subjects] = await Promise.all([
          api.getAIConversations(userId, userInstituteId),
          api.getStudentSubjectNames(userId),
        ]);
        setStudentSubjects(subjects);
        if (convs.length > 0) {
          setConversationId(convs[0].id);
          const msgs = await api.getAIMessages(convs[0].id);
          setMessages(msgs);
        }
      } catch (err) { console.error(err); } finally {
        setLoading(false);
      }
    })();
  }, [userId, userInstituteId]);

  const scrollToEnd = () => {
    setTimeout(() => {
      try { listRef.current?.scrollToEnd({ animated: true }); } catch {}
    }, 100);
  };

  const handleSend = async () => {
    if (!input.trim() || !userId || !userInstituteId || sending) return;
    if (rateLimitedUntil > Date.now()) {
      const secondsLeft = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
      Alert.alert(t('student.usageLimitTitle'), `يرجى الانتظار ${secondsLeft} ثانية قبل إرسال رسالة جديدة`);
      return;
    }

    // Rate limit check — 50 chatbot calls per window, 60s client lockout on throttle.
    let allowed = true;
    try { allowed = await api.checkAIRateLimit(userId, 'chatbot', 50); } catch {}
    if (!allowed) {
      setRateLimitedUntil(Date.now() + 60_000);
      Alert.alert(t('student.usageLimitTitle'), t('student.aiChatLimit'));
      setMessages(prev => [...prev, { id: `limit-${Date.now()}`, role: 'assistant', content: t('student.aiChatLimit'), created_at: new Date().toISOString() }]);
      return;
    }

    haptics.selection();
    setSending(true);
    const userMsg = input.trim();
    setInput('');

    try {
      // Create conversation lazily on first send so we don't orphan empty convos
      // if the student opens the screen and bounces.
      let convId: string = conversationId ?? '';
      if (!convId) {
        const conv = await api.createAIConversation(userId, userInstituteId);
        convId = conv.id;
        setConversationId(convId);
      }

      // Persist user message
      const sentMsg = await api.sendAIMessage(convId!, userMsg, 'user');
      setMessages(prev => [...prev, sentMsg]);
      scrollToEnd();

      // Log usage BEFORE the AI call so admin per-feature counters are accurate
      // even if the proxy times out.
      await api.logAIUsage(userId, userInstituteId, 'chatbot');

      // AI response — call via Edge Function (API key stays server-side)
      const systemPrompt = 'أنت مساعد تعليمي ذكي يساعد الطلاب. أجب بالعربية بشكل واضح ومختصر ومفيد. ساعد الطالب بالفهم والشرح.';
      // Build recent history from fresh messages (not stale React state) so multi-turn context is correct
      const freshHistory = [...messages, sentMsg].slice(-10);
      const recentMsgs = freshHistory.map(m => `${m.role === 'user' ? 'الطالب' : 'المساعد'}: ${m.content}`).join('\n');
      const fullPrompt = `${systemPrompt}\n\n${recentMsgs}\n\nالمساعد:`;

      let aiText = '';
      try {
        const { callAIProxy } = await import('../../services/api');
        // Pass student's subjects so AI refuses off-topic questions.
        aiText = await callAIProxy(fullPrompt, userId, 'chatbot', undefined, studentSubjects);
        if (!aiText) aiText = t('student.aiNoAnswer');
      } catch {
        aiText = t('student.aiConnectionError');
      }

      const aiResponse = await api.sendAIMessage(convId, aiText, 'assistant');
      setMessages(prev => [...prev, aiResponse]);
      scrollToEnd();
    } catch (err: any) {
      const msg = (err?.message || '').toString();
      const status = err?.status;
      const isRateLimit = status === 429 || /rate/i.test(msg) || msg.includes('حد');
      if (isRateLimit) {
        setRateLimitedUntil(Date.now() + 60_000);
        Alert.alert(t('student.usageLimitTitle'), 'تم تجاوز حد الطلبات — يرجى الانتظار 60 ثانية');
      } else {
        Alert.alert(t('common.error'), err.message || t('common.operationFailed'));
      }
    } finally {
      setSending(false);
    }
  };

  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title="الذكاء الاصطناعي"
          gradient={tokens.gradient.student}
          glowAccent="rgba(20,184,166,0.30)"
        />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <View style={[s.emptyChip, { backgroundColor: tokens.color.purpleBg }]}>
            <Ionicons name="lock-closed" size={30} color={tokens.color.purple} />
          </View>
          <Text style={s.emptyTitle}>{t('student.featureDisabled')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canSend = !!input.trim() && !sending && rateLimitedUntil <= Date.now();

  const renderBubble = ({ item: msg }: { item: any }) => {
    const isUser = msg.role === 'user';
    if (isUser) {
      return (
        <View style={[s.bubble, s.userBubble]}>
          <Text style={[s.bubbleText, { color: '#fff' }]}>{msg.content}</Text>
          <Text style={[s.bubbleTime, { color: 'rgba(255,255,255,0.6)' }]}>
            {new Date(msg.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      );
    }
    return (
      <View style={[s.bubble, s.aiBubble]}>
        <Ionicons name="sparkles" size={14} color={tokens.color.purple} style={{ marginBottom: 4 }} />
        <Text style={s.bubbleText}>{msg.content}</Text>
        <Text style={s.bubbleTime}>
          {new Date(msg.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الذكاء الاصطناعي"
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
      />
      <StudentAITabBar active="chat" />

      {/* Subject restriction pill */}
      {studentSubjects.length > 0 && (
        <View style={s.pillWrap}>
          <View style={s.pill}>
            <Ionicons name="lock-closed" size={11} color={tokens.color.purple} />
            <Text style={s.pillText}>
              مقيّد بموادك: {studentSubjects.slice(0, 3).join('، ')}
              {studentSubjects.length > 3 ? ` +${studentSubjects.length - 3}` : ''}
            </Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={tokens.color.purple} />
          </View>
        ) : messages.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={[s.emptyChip, { backgroundColor: tokens.color.purpleBg }]}>
              <Ionicons name="sparkles" size={32} color={tokens.color.purple} />
            </View>
            <Text style={s.emptyTitle}>{t('student.welcomeAssistant')}</Text>
            <Text style={s.emptyDesc}>{t('student.askMeAnything')}</Text>
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={sending ? [...messages, { id: '__typing__', role: 'assistant', content: '__typing__', created_at: new Date().toISOString() }] : messages}
            keyExtractor={(item: any) => String(item.id)}
            renderItem={({ item }: { item: any }) => {
              if (item.id === '__typing__') {
                return (
                  <View style={[s.bubble, s.aiBubble, { alignItems: 'center' }]}>
                    <ActivityIndicator color={tokens.color.purple} size="small" />
                  </View>
                );
              }
              return renderBubble({ item });
            }}
            contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
            onContentSizeChange={() => {
              try { listRef.current?.scrollToEnd({ animated: false }); } catch {}
            }}
          />
        )}

        <View style={s.inputBar}>
          <TouchableOpacity
            onPress={handleSend}
            disabled={!canSend}
            style={[s.sendBtn, !canSend && { opacity: 0.4 }]}
            accessibilityLabel={t('common.send')}
            accessibilityRole="button"
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
          <TextInput
            style={s.msgInput}
            value={input}
            onChangeText={setInput}
            placeholder={t('student.askQuestion')}
            placeholderTextColor={tokens.color.text3}
            textAlign="right"
            onSubmitEditing={handleSend}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },

  // Restriction pill
  pillWrap: {
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: tokens.color.purpleBg,
    borderColor: tokens.color.purple,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.pill,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.color.purple,
  },

  // Bubbles. In RTL: user message sits visually on the right — use flex-end.
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: tokens.radius.lg,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.color.purple,
    borderBottomEndRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.color.purpleBg,
    borderBottomStartRadius: 4,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  bubbleText: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.text,
    lineHeight: 24,
    textAlign: 'right',
  },
  bubbleTime: {
    fontSize: 9,
    color: tokens.color.text3,
    marginTop: 4,
    textAlign: 'left',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 8,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.purple,
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.shadow.purple,
  },
  msgInput: {
    flex: 1,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: tokens.color.text,
    minHeight: 44,
  },

  // Empty / disabled
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyChip: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: tokens.color.text,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: tokens.color.text3,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 22,
  },
});
