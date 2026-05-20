import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import ListRow from '../../components/teacher/cards/ListRow';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import VoiceMessageInput from '../../components/shared/VoiceMessageInput';
import VoiceMessageBubble from '../../components/shared/VoiceMessageBubble';

import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';
import { compressImage } from '../../utils/imageCompress';
import { bunnyStorage } from '../../services/bunny';
import * as ImagePicker from 'expo-image-picker';

import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';

// ─────────────────────────────────────────────────────────────────────────────
// Types — narrow shapes locally so we don't poison the global types/.
// Joined relations from PostgREST come back as either an object or an array
// depending on the relationship metadata; we normalize via helpers below.
// ─────────────────────────────────────────────────────────────────────────────
type JoinedName = { name?: string | null } | { name?: string | null }[] | null | undefined;
type JoinedUser = { full_name?: string | null; avatar_url?: string | null } | { full_name?: string | null; avatar_url?: string | null }[] | null | undefined;

interface ClassChat {
  id: string;
  teacher_id: string;
  subject_id: string | null;
  section_id: string | null;
  class_id: string | null;
  title: string | null;
  write_locked: boolean;
  updated_at: string | null;
  subjects?: JoinedName;
  sections?: JoinedName;
  classes?: JoinedName;
}

interface ClassChatMessage {
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
  users?: JoinedUser;
}

interface TeacherAssignment {
  id?: string;
  subject_id: string | null;
  section_id: string | null;
  class_id: string | null;
  subjects?: JoinedName;
  sections?: JoinedName;
  classes?: JoinedName;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function pickName(rel: JoinedName): string {
  if (!rel) return '';
  if (Array.isArray(rel)) return rel[0]?.name || '';
  return rel.name || '';
}

function pickUser(rel: JoinedUser): { full_name: string; avatar_url?: string | null } {
  if (!rel) return { full_name: '' };
  if (Array.isArray(rel)) return { full_name: rel[0]?.full_name || '', avatar_url: rel[0]?.avatar_url };
  return { full_name: rel.full_name || '', avatar_url: rel.avatar_url };
}

function chatLabel(chat: ClassChat): string {
  if (chat.title) return chat.title;
  const subject = pickName(chat.subjects);
  const group = pickName(chat.sections) || pickName(chat.classes);
  if (subject && group) return `${subject} — ${group}`;
  return subject || group || 'دردشة الصف';
}

function assignmentLabel(a: TeacherAssignment): string {
  const subject = pickName(a.subjects);
  const group = pickName(a.sections) || pickName(a.classes);
  if (subject && group) return `${subject} — ${group}`;
  return subject || group || 'تعيين';
}

// Same Arabic relative-time helper used by parent-teacher chat — kept local to
// avoid leaking through a util barrel just for one screen.
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

// Stable signature for an assignment so we can dedupe against existing chats.
// Treats a null section/class as "*" so create flow stays predictable.
function assignmentKey(subjectId: string | null, sectionId: string | null, classId: string | null): string {
  return `${subjectId || ''}|${sectionId || ''}|${classId || ''}`;
}

function chatKey(chat: ClassChat): string {
  return assignmentKey(chat.subject_id, chat.section_id, chat.class_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function TeacherClassChat() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { t } = useTranslation();
  const isEnabled = useFeatureFlag('class_chat');

  // List state
  const [chats, setChats] = useState<ClassChat[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active thread state
  const [activeChat, setActiveChat] = useState<ClassChat | null>(null);
  const [messages, setMessages] = useState<ClassChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Sheets
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  // ── Load list of chats ─────────────────────────────────────────────────────
  const loadChats = useCallback(async () => {
    if (!userId || !userInstituteId) {
      setLoading(false);
      return;
    }
    try {
      const data = (await api.listTeacherClassChats(userId, userInstituteId)) as ClassChat[];
      setChats(data || []);
      // Fetch unread counts for visible chats only — bulk in one batch.
      const ids = (data || []).map((c) => c.id);
      if (ids.length > 0) {
        const counts = await api.getClassChatUnreadCounts(userId, ids);
        setUnreadMap(counts || {});
      } else {
        setUnreadMap({});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[class-chat] loadChats failed:', msg);
      Alert.alert(t('common.error', { defaultValue: 'خطأ' }), msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, userInstituteId, t]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // ── Realtime: subscribe to inserts on the active chat's messages ───────────
  useEffect(() => {
    if (!activeChat || !userInstituteId) return;
    const chatId = activeChat.id;
    // Channel name includes institute_id for tenant isolation.
    const channel = supabase
      .channel(`class_chat:${userInstituteId}:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'class_chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload: { new: ClassChatMessage }) => {
          const incoming = payload.new;
          // Defense-in-depth: drop messages from other tenants. RLS prevents
          // cross-tenant delivery, but a future regression would otherwise
          // silently leak messages here.
          if ((incoming as any).institute_id && (incoming as any).institute_id !== userInstituteId) return;
          // Ignore if we already optimistically appended it.
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat, userInstituteId]);

  // ── Open a chat (load messages + mark read) ────────────────────────────────
  const openChat = useCallback(
    async (chat: ClassChat) => {
      if (!userId) return;
      setActiveChat(chat);
      setLoadingMessages(true);
      setMessages([]);
      try {
        const msgs = (await api.getClassChatMessages(chat.id, 200)) as ClassChatMessage[];
        setMessages(msgs || []);
        await api.markClassChatRead(chat.id, userId);
        setUnreadMap((prev) => ({ ...prev, [chat.id]: 0 }));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 200);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert(t('common.error', { defaultValue: 'خطأ' }), msg);
      } finally {
        setLoadingMessages(false);
      }
    },
    [userId, t],
  );

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = msgInput.trim();
    if (!text || !activeChat || !userId || !userInstituteId) return;
    setSending(true);
    try {
      const sent = (await api.sendClassChatMessage({
        chatId: activeChat.id,
        instituteId: userInstituteId,
        senderId: userId,
        senderRole: 'teacher',
        content: text,
        type: 'text',
      })) as ClassChatMessage;
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });
      setMsgInput('');
      haptics.light();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(t('common.error', { defaultValue: 'خطأ' }), msg);
    } finally {
      setSending(false);
    }
  }, [msgInput, activeChat, userId, userInstituteId, t]);

  // ── Send image message — pick → compress → upload → insert row ────────────
  const handleSendImage = useCallback(async () => {
    if (!activeChat || !userId || !userInstituteId || uploadingImage) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الصلاحيات', 'يرجى السماح بالوصول للصور');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      setUploadingImage(true);
      const compressed = await compressImage(picked.assets[0].uri);
      const url = await bunnyStorage.uploadFile(compressed, 'class-chat');
      const sent = (await api.sendClassChatMessage({
        chatId: activeChat.id,
        instituteId: userInstituteId,
        senderId: userId,
        senderRole: 'teacher',
        content: '',
        type: 'image',
        imageUrl: url,
      })) as ClassChatMessage;
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      haptics.success();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(t('common.error', { defaultValue: 'خطأ' }), msg);
    } finally {
      setUploadingImage(false);
    }
  }, [activeChat, userId, userInstituteId, uploadingImage, t]);

  // ── Send voice message ─────────────────────────────────────────────────────
  const handleSendVoice = useCallback(
    async ({ audioUrl, duration }: { audioUrl: string; duration: number }) => {
      if (!activeChat || !userId || !userInstituteId) return;
      const sent = (await api.sendClassChatMessage({
        chatId: activeChat.id,
        instituteId: userInstituteId,
        senderId: userId,
        senderRole: 'teacher',
        content: '',
        type: 'voice',
        audioUrl,
        duration,
      })) as ClassChatMessage;
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    },
    [activeChat, userId, userInstituteId],
  );

  // ── Toggle write lock ─────────────────────────────────────────────────────
  const handleToggleLock = useCallback(async () => {
    if (!activeChat || togglingLock) return;
    const nextLocked = !activeChat.write_locked;
    setTogglingLock(true);
    try {
      const updated = (await api.toggleClassChatLock(activeChat.id, nextLocked)) as ClassChat;
      setActiveChat({ ...activeChat, write_locked: updated.write_locked });
      // Mirror to list state so the lock indicator stays consistent on return.
      setChats((prev) =>
        prev.map((c) => (c.id === activeChat.id ? { ...c, write_locked: updated.write_locked } : c)),
      );
      haptics.success();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(t('common.error', { defaultValue: 'خطأ' }), msg);
    } finally {
      setTogglingLock(false);
    }
  }, [activeChat, togglingLock, t]);

  // ── Delete chat ─────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!activeChat) return;
    try {
      await api.deleteClassChat(activeChat.id);
      haptics.success();
      setActiveChat(null);
      setMessages([]);
      await loadChats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(t('common.error', { defaultValue: 'خطأ' }), msg);
    }
  }, [activeChat, loadChats, t]);

  // ── Open create sheet — fetch assignments lazily ───────────────────────────
  const openCreateSheet = useCallback(async () => {
    if (!userId) return;
    setCreateSheetVisible(true);
    setSelectedKeys(new Set());
    setLoadingAssignments(true);
    try {
      const data = (await api.getTeacherAssignments(userId)) as TeacherAssignment[];
      setAssignments(data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(t('common.error', { defaultValue: 'خطأ' }), msg);
    } finally {
      setLoadingAssignments(false);
    }
  }, [userId, t]);

  const closeCreateSheet = useCallback(() => {
    if (bulkCreating) return; // don't allow close mid-batch
    setCreateSheetVisible(false);
    setSelectedKeys(new Set());
  }, [bulkCreating]);

  // Set of existing assignment-keys so we can mark "موجود" instead of duplicating.
  const existingChatKeys = useMemo(() => {
    const set = new Set<string>();
    chats.forEach((c) => set.add(chatKey(c)));
    return set;
  }, [chats]);

  // Group assignments by subject so the teacher can scan subjects and tick
  // multiple sections at once. Each group lists only the rows that don't yet
  // have a chat — existing ones are surfaced separately so they don't clutter
  // the picker.
  type AssignmentGroup = {
    subjectId: string;
    subjectName: string;
    rows: Array<{ key: string; assignment: TeacherAssignment; exists: boolean }>;
  };
  const assignmentGroups: AssignmentGroup[] = useMemo(() => {
    const map = new Map<string, AssignmentGroup>();
    assignments
      .filter((a) => a.subject_id)
      .forEach((a) => {
        const sid = a.subject_id as string;
        const subjectName = pickName(a.subjects) || 'مادة';
        const key = assignmentKey(a.subject_id, a.section_id, a.class_id);
        const exists = existingChatKeys.has(key);
        if (!map.has(sid)) map.set(sid, { subjectId: sid, subjectName, rows: [] });
        map.get(sid)!.rows.push({ key, assignment: a, exists });
      });
    // Stable order: by subject name asc.
    return Array.from(map.values()).sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName, 'ar'),
    );
  }, [assignments, existingChatKeys]);

  const toggleSelect = useCallback((key: string) => {
    haptics.light();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAllInGroup = useCallback((group: AssignmentGroup) => {
    haptics.light();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const selectableKeys = group.rows.filter((r) => !r.exists).map((r) => r.key);
      const allSelected = selectableKeys.every((k) => next.has(k));
      if (allSelected) {
        selectableKeys.forEach((k) => next.delete(k));
      } else {
        selectableKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  }, []);

  // ── Bulk-create selected chats (sequential to keep error reporting sane) ──
  const handleBulkCreate = useCallback(async () => {
    if (!userId || !userInstituteId || selectedKeys.size === 0 || bulkCreating) return;
    // Map back from keys → assignments. Skip any key that already exists.
    const targets: TeacherAssignment[] = [];
    assignmentGroups.forEach((g) => {
      g.rows.forEach((r) => {
        if (selectedKeys.has(r.key) && !r.exists) targets.push(r.assignment);
      });
    });
    if (targets.length === 0) return;
    setBulkCreating(true);
    setBulkProgress({ done: 0, total: targets.length });
    const failures: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const a = targets[i];
      try {
        await api.createClassChat({
          teacherId: userId,
          instituteId: userInstituteId,
          subjectId: a.subject_id as string,
          sectionId: a.section_id,
          classId: a.class_id,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`${assignmentLabel(a)}: ${msg}`);
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }
    setBulkCreating(false);
    setBulkProgress(null);
    if (failures.length === 0) {
      haptics.success();
      setCreateSheetVisible(false);
      setSelectedKeys(new Set());
      await loadChats();
    } else {
      Alert.alert(
        'بعض الدردشات فشلت',
        `تم إنشاء ${targets.length - failures.length} من ${targets.length}.\n\n${failures.slice(0, 3).join('\n')}`,
      );
      await loadChats();
    }
  }, [userId, userInstituteId, selectedKeys, bulkCreating, assignmentGroups, loadChats]);

  // ── Feature-flag gate ──────────────────────────────────────────────────────
  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <TeacherInnerHero title="دردشة الصف" fallbackRoute="/(teacher)/services" />
        <View style={s.centerEmpty}>
          <View style={s.emptyIconCircle}>
            <Ionicons name="lock-closed" size={36} color={tokens.color.text3} />
          </View>
          <Text style={s.emptyTitle}>{t('teacherChat.featureDisabled', { defaultValue: 'هذه الميزة غير مفعلة' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Active thread view
  // ─────────────────────────────────────────────────────────────────────────
  if (activeChat) {
    const headerTitle = chatLabel(activeChat);
    const isLocked = !!activeChat.write_locked;
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <View style={s.chatHeader}>
          <TouchableOpacity
            onPress={() => {
              haptics.light();
              setActiveChat(null);
              setMessages([]);
              loadChats();
            }}
            style={s.chatHeaderBack}
            accessibilityLabel="رجوع"
          >
            <Ionicons name="arrow-forward" size={22} color={tokens.color.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.chatHeaderTitle} numberOfLines={1}>{headerTitle}</Text>
            <Text style={s.chatHeaderSub} numberOfLines={1}>
              {isLocked ? 'الكتابة مغلقة للطلاب' : 'الكتابة مفتوحة للطلاب'}
            </Text>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity
              onPress={handleToggleLock}
              style={[s.headerIconBtn, isLocked && s.headerIconBtnActive]}
              disabled={togglingLock}
              accessibilityLabel={isLocked ? 'فتح الكتابة' : 'إقفال الكتابة'}
            >
              {togglingLock ? (
                <ActivityIndicator size="small" color={tokens.color.brand500} />
              ) : (
                <Ionicons
                  name={isLocked ? 'lock-closed' : 'lock-open'}
                  size={18}
                  color={isLocked ? tokens.color.warning : tokens.color.text2}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmDeleteVisible(true)}
              style={s.headerIconBtn}
              accessibilityLabel="حذف الدردشة"
            >
              <Ionicons name="trash-outline" size={18} color={tokens.color.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {isLocked ? (
          <View style={s.lockBanner}>
            <Ionicons name="lock-closed" size={14} color={tokens.color.warning} />
            <Text style={s.lockBannerText}>الكتابة مغلقة — الطلاب لا يستطيعون الإرسال</Text>
          </View>
        ) : null}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}
        >
          {loadingMessages ? (
            <View style={s.centerFlex}>
              <ActivityIndicator color={tokens.color.brand500} />
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={{ padding: tokens.spacing[4], paddingBottom: tokens.spacing[2] }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
              keyboardShouldPersistTaps="handled"
            >
              {messages.length === 0 ? (
                <View style={s.threadEmpty}>
                  <View style={s.emptyIconCircle}>
                    <Ionicons name="chatbubbles-outline" size={32} color={tokens.color.text3} />
                  </View>
                  <Text style={s.emptyTitle}>لا توجد رسائل بعد</Text>
                  <Text style={s.emptySub}>كن أول من يكتب في هذه الدردشة</Text>
                </View>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === userId;
                  const sender = pickUser(msg.users);
                  const time = new Date(msg.sent_at).toLocaleTimeString('ar-IQ', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <View
                      key={msg.id}
                      style={[s.bubbleRow, isMe ? s.bubbleRowMe : s.bubbleRowOther]}
                    >
                      {!isMe ? (
                        <View style={s.smallAvatar}>
                          {sender.avatar_url ? (
                            <Image source={{ uri: sender.avatar_url }} style={s.smallAvatarImg} contentFit="cover" />
                          ) : (
                            <Text style={s.smallAvatarTxt}>
                              {(sender.full_name || '?').slice(0, 1)}
                            </Text>
                          )}
                        </View>
                      ) : null}
                      <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
                        {!isMe && sender.full_name ? (
                          <Text style={s.senderName} numberOfLines={1}>
                            {sender.full_name}
                          </Text>
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
                })
              )}
            </ScrollView>
          )}

          {/* Input bar — teachers can always send (even when student-write is locked). */}
          <View style={s.inputBar}>
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending || !msgInput.trim()}
              style={[s.sendBtn, (!msgInput.trim() || sending) && { opacity: 0.4 }]}
              accessibilityLabel="إرسال"
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
            {userId && userInstituteId ? (
              <VoiceMessageInput
                instituteId={userInstituteId}
                userId={userId}
                accentColor={tokens.color.brand500}
                onSend={handleSendVoice}
              />
            ) : null}
            <TouchableOpacity
              onPress={handleSendImage}
              disabled={uploadingImage}
              style={[s.imageBtn, uploadingImage && { opacity: 0.5 }]}
              accessibilityLabel="إرفاق صورة"
            >
              {uploadingImage ? (
                <ActivityIndicator color={tokens.color.brand500} size="small" />
              ) : (
                <Ionicons name="image" size={20} color={tokens.color.brand500} />
              )}
            </TouchableOpacity>
            <TextInput
              style={s.msgInput}
              value={msgInput}
              onChangeText={setMsgInput}
              placeholder="اكتب رسالة..."
              placeholderTextColor={tokens.color.text3}
              textAlign="right"
              multiline
              maxLength={2000}
            />
          </View>
        </KeyboardAvoidingView>

        <ConfirmSheet
          visible={confirmDeleteVisible}
          title="حذف الدردشة"
          message="سيتم حذف جميع الرسائل بشكل نهائي. هل أنت متأكد؟"
          confirmLabel="حذف"
          cancelLabel="إلغاء"
          destructive
          onConfirm={handleDelete}
          onClose={() => setConfirmDeleteVisible(false)}
        />
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // List view
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero
        title="دردشة الصف"
        fallbackRoute="/(teacher)/services"
        right={
          <TouchableOpacity
            onPress={openCreateSheet}
            style={s.headerCreateBtn}
            accessibilityLabel="إنشاء دردشة جديدة"
          >
            <LinearGradient
              colors={tokens.gradient.brand as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.headerCreateGrad}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        }
      />

      <View style={s.header}>
        <Text style={s.title}>دردشة الصف</Text>
        <Text style={s.subtitle}>تواصل جماعياً مع طلاب الصف حسب المادة</Text>
      </View>

      {loading ? (
        <View style={s.centerFlex}>
          <ActivityIndicator color={tokens.color.brand500} size="large" />
        </View>
      ) : chats.length === 0 ? (
        <ScrollView
          contentContainerStyle={s.emptyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadChats();
              }}
              tintColor={tokens.color.brand500}
            />
          }
        >
          <View style={s.centerEmpty}>
            <View style={s.emptyIconCircle}>
              <Ionicons name="chatbubbles-outline" size={36} color={tokens.color.text3} />
            </View>
            <Text style={s.emptyTitle}>لا توجد دردشات بعد</Text>
            <Text style={s.emptySub}>ابدأ أول دردشة مع أحد صفوفك</Text>
            <TouchableOpacity onPress={openCreateSheet} style={s.emptyCta}>
              <LinearGradient
                colors={tokens.gradient.brand as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.emptyCtaGrad}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={s.emptyCtaText}>إنشاء دردشة جديدة</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: tokens.spacing[4], paddingBottom: tokens.spacing[8] }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadChats();
              }}
              tintColor={tokens.color.brand500}
            />
          }
        >
          {chats.map((chat) => {
            const unread = unreadMap[chat.id] || 0;
            const subject = pickName(chat.subjects);
            const group = pickName(chat.sections) || pickName(chat.classes);
            const subtitle = [group, chat.write_locked ? 'مغلقة' : ''].filter(Boolean).join(' • ');
            const meta = formatRelativeTime(chat.updated_at);
            return (
              <View key={chat.id} style={unread > 0 ? s.unreadWrap : undefined}>
                <ListRow
                  icon={chat.write_locked ? 'lock-closed' : 'people'}
                  iconGradient="brand"
                  title={subject || chatLabel(chat)}
                  subtitle={subtitle || ' '}
                  meta={meta}
                  badge={unread > 0 ? { label: String(unread), tone: 'danger' } : undefined}
                  onPress={() => openChat(chat)}
                />
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Create chat sheet — multi-select per subject ─────────────────── */}
      <SwipeableSheet
        visible={createSheetVisible}
        onClose={closeCreateSheet}
        maxHeight={0.85}
        minHeight={0.55}
      >
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle}>إنشاء دردشة جديدة</Text>
          <Text style={s.sheetSubtitle}>
            اختر شعبة أو أكثر تحت كل مادة، ثم اضغط "إنشاء"
          </Text>
        </View>
        {loadingAssignments ? (
          <View style={s.centerFlex}>
            <ActivityIndicator color={tokens.color.brand500} />
          </View>
        ) : assignmentGroups.length === 0 ? (
          (() => {
            // Diagnose WHY the picker is empty so the teacher gets actionable feedback.
            // Three distinct causes need different copy + actions:
            //  1) no rows at all → admin hasn't assigned them yet
            //  2) rows exist but none has subject_id → admin saved class without subject
            //  3) every assignment already has a chat → nothing left to create
            const totalAssignments = assignments.length;
            const withSubject = assignments.filter((a) => a.subject_id).length;
            const allAlreadyHaveChats =
              withSubject > 0 &&
              assignments
                .filter((a) => a.subject_id)
                .every((a) => existingChatKeys.has(assignmentKey(a.subject_id, a.section_id, a.class_id)));
            let title: string;
            let sub: string;
            let icon: 'school-outline' | 'book-outline' | 'checkmark-done' = 'school-outline';
            if (totalAssignments === 0) {
              title = 'لا توجد تعيينات';
              sub = 'اطلب من الإدارة تعيينك على صفوف ومواد';
            } else if (withSubject === 0) {
              title = 'تعييناتك بدون مادة';
              sub = 'لديك صفوف معيّنة لكن بدون مادة محددة — اطلب من الإدارة إضافة المادة لكي تستطيع فتح دردشة الصف';
              icon = 'book-outline';
            } else if (allAlreadyHaveChats) {
              title = 'كل صفوفك لها دردشات';
              sub = 'لقد أنشأت دردشة لكل تعييناتك. أغلق هذه النافذة لرؤيتها في القائمة';
              icon = 'checkmark-done';
            } else {
              title = 'لا توجد تعيينات';
              sub = 'اطلب من الإدارة تعيينك على صفوف ومواد';
            }
            return (
              <View style={s.centerEmpty}>
                <View style={s.emptyIconCircle}>
                  <Ionicons name={icon} size={32} color={tokens.color.text3} />
                </View>
                <Text style={s.emptyTitle}>{title}</Text>
                <Text style={s.emptySub}>{sub}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    if (!userId) return;
                    haptics.light();
                    setLoadingAssignments(true);
                    try {
                      const data = (await api.getTeacherAssignments(userId)) as TeacherAssignment[];
                      setAssignments(data || []);
                      await loadChats();
                    } finally {
                      setLoadingAssignments(false);
                    }
                  }}
                  style={s.refreshBtn}
                  accessibilityLabel="تحديث التعيينات"
                >
                  <Ionicons name="refresh" size={16} color={tokens.color.brand600} />
                  <Text style={s.refreshBtnText}>تحديث</Text>
                </TouchableOpacity>
              </View>
            );
          })()
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: tokens.spacing[4],
              paddingBottom: tokens.spacing[6] + 80, // leave room for footer button
            }}
          >
            {assignmentGroups.map((group) => {
              const selectableKeys = group.rows.filter((r) => !r.exists).map((r) => r.key);
              const allSelected =
                selectableKeys.length > 0 && selectableKeys.every((k) => selectedKeys.has(k));
              const someSelected = selectableKeys.some((k) => selectedKeys.has(k));
              return (
                <View key={group.subjectId} style={s.groupCard}>
                  <View style={s.groupHeader}>
                    <View style={s.groupHeaderTitleWrap}>
                      <View style={s.subjectTile}>
                        <LinearGradient
                          colors={tokens.gradient.brand as unknown as readonly [string, string, ...string[]]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                        <Ionicons name="book" size={16} color="#fff" />
                      </View>
                      <Text style={s.groupTitle} numberOfLines={1}>
                        {group.subjectName}
                      </Text>
                    </View>
                    {selectableKeys.length > 1 ? (
                      <Pressable
                        onPress={() => toggleSelectAllInGroup(group)}
                        style={s.selectAllBtn}
                        disabled={bulkCreating}
                      >
                        <Text style={s.selectAllText}>
                          {allSelected ? 'إلغاء التحديد' : 'تحديد الكل'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {group.rows.map(({ key, assignment, exists }) => {
                    const sectionName =
                      pickName(assignment.sections) || pickName(assignment.classes) || '—';
                    const checked = selectedKeys.has(key);
                    return (
                      <Pressable
                        key={key}
                        onPress={() => !exists && !bulkCreating && toggleSelect(key)}
                        disabled={exists || bulkCreating}
                        style={[
                          s.sectionRow,
                          checked && s.sectionRowSelected,
                          exists && s.assignmentRowDisabled,
                        ]}
                      >
                        <View
                          style={[
                            s.checkbox,
                            checked && s.checkboxChecked,
                            exists && s.checkboxDisabled,
                          ]}
                        >
                          {checked ? (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          ) : null}
                        </View>
                        <Text style={s.sectionRowText} numberOfLines={1}>
                          {sectionName}
                        </Text>
                        {exists ? (
                          <View style={s.existsBadge}>
                            <Text style={s.existsBadgeText}>موجودة</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                  {someSelected ? (
                    <Text style={s.groupSelectedHint}>
                      {`تم اختيار ${
                        group.rows.filter((r) => selectedKeys.has(r.key) && !r.exists).length
                      }`}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
        {/* Footer button — bulk create */}
        {assignmentGroups.length > 0 ? (
          <View style={s.sheetFooter}>
            <TouchableOpacity
              onPress={handleBulkCreate}
              disabled={selectedKeys.size === 0 || bulkCreating}
              style={[s.bulkCreateBtn, (selectedKeys.size === 0 || bulkCreating) && { opacity: 0.4 }]}
              accessibilityLabel="إنشاء الدردشات المختارة"
            >
              <LinearGradient
                colors={tokens.gradient.brand as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.bulkCreateGrad}
              >
                {bulkCreating ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={s.bulkCreateText}>
                      {bulkProgress
                        ? `جاري الإنشاء ${bulkProgress.done}/${bulkProgress.total}`
                        : 'جاري الإنشاء...'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="add-circle" size={20} color="#fff" />
                    <Text style={s.bulkCreateText}>
                      {selectedKeys.size > 0
                        ? `إنشاء ${selectedKeys.size} ${selectedKeys.size === 1 ? 'دردشة' : 'دردشات'}`
                        : 'اختر شعبة واحدة على الأقل'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : null}
      </SwipeableSheet>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — mirrored from app/(teacher)/chat.tsx for visual consistency, with
// additions for lock header, sender names, and create sheet rows.
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  centerFlex: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  // Header create button (right slot)
  headerCreateBtn: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden' },
  headerCreateGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Empty / disabled state shared block
  emptyScroll: { flexGrow: 1, justifyContent: 'center' },
  centerEmpty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: tokens.spacing[5] },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[3],
  },
  emptyTitle: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyCta: { marginTop: tokens.spacing[5], borderRadius: tokens.radius.lg, overflow: 'hidden', ...tokens.shadow.brand },
  emptyCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
  },
  emptyCtaText: { color: '#fff', fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold },
  refreshBtn: {
    marginTop: tokens.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.brand50,
    borderWidth: 1,
    borderColor: tokens.color.brand500,
  },
  refreshBtnText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.brand600,
    fontWeight: tokens.font.weight.bold,
  },

  // Unread halo wrap
  unreadWrap: {
    backgroundColor: tokens.color.brand50,
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing[2],
  },

  // Active chat header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 8,
  },
  chatHeaderBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHeaderTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  chatHeaderSub: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnActive: { backgroundColor: tokens.color.warningBg },

  // Lock banner (status under header)
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.color.warningBg,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
  },
  lockBannerText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.warning,
    fontWeight: tokens.font.weight.semi,
  },

  // Bubbles
  threadEmpty: { alignItems: 'center', paddingTop: 80 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8, gap: 6 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', padding: tokens.spacing[3], borderRadius: tokens.radius.lg },
  bubbleMe: {
    backgroundColor: tokens.color.brand500,
    borderBottomLeftRadius: 4,
  },
  bubbleOther: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderBottomRightRadius: 4,
  },
  senderName: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.brand600,
    fontWeight: tokens.font.weight.bold,
    marginBottom: 2,
    textAlign: 'right',
  },
  bubbleText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    lineHeight: 22,
    textAlign: 'right',
  },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 9, color: tokens.color.text3, marginTop: 4, textAlign: 'right' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },

  smallAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  smallAvatarImg: { width: '100%', height: '100%' },
  smallAvatarTxt: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.bold,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: tokens.spacing[2],
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.brand500,
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.shadow.brand,
  },
  imageBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.brand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleImage: {
    width: 200,
    height: 200,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface2,
  },
  msgInput: {
    flex: 1,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: Platform.OS === 'ios' ? tokens.spacing[3] : tokens.spacing[2],
    fontSize: tokens.font.size.lg,
    color: tokens.color.text,
    maxHeight: 120,
  },

  // Create sheet
  sheetHeader: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[2],
    paddingBottom: tokens.spacing[4],
  },
  sheetTitle: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  sheetSubtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 4,
  },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tokens.color.border2,
    gap: 10,
  },
  assignmentRowDisabled: { opacity: 0.55 },

  // Grouped multi-select sheet
  groupCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border2,
    padding: tokens.spacing[3],
    marginBottom: tokens.spacing[3],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[2],
    gap: tokens.spacing[2],
  },
  groupHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  subjectTile: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    flexShrink: 1,
  },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.brand50,
  },
  selectAllText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.brand600,
    fontWeight: tokens.font.weight.bold,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 10,
  },
  sectionRowSelected: {
    backgroundColor: tokens.color.brand50,
    borderColor: tokens.color.brand500,
  },
  sectionRowText: {
    flex: 1,
    fontSize: tokens.font.size.md,
    color: tokens.color.text,
    fontWeight: tokens.font.weight.semi,
    textAlign: 'right',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: tokens.color.brand500,
    borderColor: tokens.color.brand500,
  },
  checkboxDisabled: {
    backgroundColor: tokens.color.surface2,
    borderColor: tokens.color.border,
  },
  groupSelectedHint: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.brand600,
    fontWeight: tokens.font.weight.bold,
    textAlign: 'right',
    marginTop: 4,
  },
  sheetFooter: {
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[2],
    paddingBottom: tokens.spacing[3],
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  bulkCreateBtn: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    ...tokens.shadow.brand,
  },
  bulkCreateGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: tokens.spacing[3],
  },
  bulkCreateText: {
    color: '#fff',
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
  },
  assignmentTile: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignmentBody: { flex: 1, minWidth: 0 },
  assignmentTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
  },
  assignmentSub: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  createBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.color.brand500,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
  },
  createBadgeText: {
    color: '#fff',
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
  },
  existsBadge: {
    backgroundColor: tokens.color.surface2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
  },
  existsBadgeText: {
    color: tokens.color.text3,
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
  },
});
