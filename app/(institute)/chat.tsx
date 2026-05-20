import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useTranslation } from 'react-i18next';
import BackHeader from '../../components/shared/BackHeader';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { haptics } from '../../utils/haptics';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import VoiceMessageInput from '../../components/shared/VoiceMessageInput';
import VoiceMessageBubble from '../../components/shared/VoiceMessageBubble';

export default function InstituteChat() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin', teacher: t('roles.teacher'), parent: t('roles.parent'), student: t('roles.student'), institute: t('roles.institute'),
  };
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [teachers, setTeachers] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [contactTab, setContactTab] = useState<'teachers' | 'parents'>('teachers');

  const [showGroupMsg, setShowGroupMsg] = useState(false);
  // Audience options for the composer:
  //   teachers          → all teachers in institute (broadcast)
  //   parents           → all parents in institute (broadcast)
  //   class_teachers    → teachers of a specific class (broadcast)
  //   parents_of_class  → parents of students of a specific class (broadcast)
  //   one_teacher       → pick one teacher → open 1-1 chat
  //   one_parent        → pick one parent → open 1-1 chat
  type GroupTarget =
    | 'teachers'
    | 'parents'
    | 'class_teachers'
    | 'parents_of_class'
    | 'one_teacher'
    | 'one_parent';
  const [groupTarget, setGroupTarget] = useState<GroupTarget>('teachers');
  const [groupMsgText, setGroupMsgText] = useState('');
  const [sendingGroup, setSendingGroup] = useState(false);
  // Class picker — used when groupTarget is class_teachers OR parents_of_class.
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [loadingClassTeachers, setLoadingClassTeachers] = useState(false);
  // Resolved parents-of-class — fan-out across students in the selected class.
  const [classParents, setClassParents] = useState<any[]>([]);
  const [loadingClassParents, setLoadingClassParents] = useState(false);
  // Single-recipient pickers — used to open a 1-1 chat from the composer.
  const [singlePickerOpen, setSinglePickerOpen] = useState(false);
  const [singlePickerSearch, setSinglePickerSearch] = useState('');

  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const flatListRef = useRef<FlashListRef<any>>(null);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching]);

  const loadData = useCallback(async () => {
    if (!userId || !userInstituteId) { setLoading(false); return; }
    try {
      const [convs, teacherList, parentList, classList] = await Promise.all([
        api.getConversations(userId, userInstituteId),
        api.getTeachersByInstitute(userInstituteId),
        api.getParentsByInstitute(userInstituteId),
        api.getClassesByInstitute(userInstituteId),
      ]);
      setConversations(convs);
      setTeachers(teacherList);
      setParents(parentList);
      setClasses(classList || []);
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [userId, userInstituteId]);

  // Fetch teachers for the picked class — runs only when class_teachers mode + a class is chosen.
  // Memoized via class id so switching back to a previous class avoids a redundant fetch.
  useEffect(() => {
    if (groupTarget !== 'class_teachers' || !selectedClassId || !userInstituteId) {
      setClassTeachers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingClassTeachers(true);
      try {
        const list = await api.getTeachersByClass(selectedClassId, userInstituteId);
        if (!cancelled) setClassTeachers(list || []);
      } catch (err: any) {
        if (!cancelled) {
          setClassTeachers([]);
          if (__DEV__) console.warn('[chat] getTeachersByClass failed', err);
        }
      } finally {
        if (!cancelled) setLoadingClassTeachers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupTarget, selectedClassId, userInstituteId]);

  // Fetch parents-of-class: students of the class → parents of each student → dedup.
  // Runs only when parents_of_class mode + a class is chosen. Tenant-scoped via instituteId
  // on both queries (getStudentsByClass + getParentsOfStudent).
  useEffect(() => {
    if (groupTarget !== 'parents_of_class' || !selectedClassId || !userInstituteId) {
      setClassParents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingClassParents(true);
      try {
        const students = await api.getStudentsByClass(selectedClassId, userInstituteId);
        // Walk children → parents in parallel, then dedup by parent id since a parent may
        // have multiple kids in the same class.
        const parentLists = await Promise.all(
          (students || []).map((st: any) =>
            api.getParentsOfStudent(st.id, userInstituteId).catch(() => []),
          ),
        );
        const seen = new Set<string>();
        const flat: any[] = [];
        for (const list of parentLists) {
          for (const p of list || []) {
            if (p?.id && !seen.has(p.id)) {
              seen.add(p.id);
              flat.push(p);
            }
          }
        }
        if (!cancelled) setClassParents(flat);
      } catch (err: any) {
        if (!cancelled) {
          setClassParents([]);
          if (__DEV__) console.warn('[chat] parents_of_class resolve failed', err);
        }
      } finally {
        if (!cancelled) setLoadingClassParents(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupTarget, selectedClassId, userInstituteId]);

  useEffect(() => { loadData(); }, [userId, userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  // Realtime — append on new inbound messages. Multi-tenant: refuse to subscribe
  // until userInstituteId is resolved so we never open a channel that could
  // receive messages from another tenant (RLS + the client guard below are
  // defense-in-depth). The effect re-runs once detectInstitute() populates it.
  useEffect(() => {
    if (!userId || !selectedConv || !userInstituteId) return;
    const convPartnerId = selectedConv.userId;
    const channel = supabase
      .channel(`inst_chat_${userId}_${convPartnerId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      }, (payload: any) => {
        if (payload.new?.sender_id !== convPartnerId) return;
        if (payload.new?.institute_id && payload.new.institute_id !== userInstituteId) return;
        setMessages((prev: any[]) => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, selectedConv, userInstituteId]);

  const openChat = async (conv: any) => {
    setSelectedConv(conv);
    setLoadingMsgs(true);
    try {
      const data = await api.getMessages(userId || '',  conv.userId, userInstituteId || '');
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  };

  const startNewChat = (user: any) => {
    setShowNewChat(false);
    openChat({ userId: user.id, name: user.full_name, role: user.role || 'teacher' });
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !userId || !selectedConv) return;
    const text = newMessage.trim();
    setSending(true);
    try {
      const inserted = await api.sendMessage(userId, selectedConv.userId, text, userInstituteId || undefined);
      setNewMessage('');
      setMessages((prev: any[]) => {
        if (inserted?.id && prev.some(m => m.id === inserted.id)) return prev;
        return inserted ? [...prev, inserted] : prev;
      });
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('common.operationFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleSendVoice = useCallback(
    async ({ audioUrl, duration }: { audioUrl: string; duration: number }) => {
      if (!userId || !selectedConv) return;
      try {
        const inserted = await api.sendMessage(
          userId,
          selectedConv.userId,
          '',
          userInstituteId || undefined,
          { type: 'voice', audioUrl, duration },
        );
        setMessages((prev: any[]) => {
          if (inserted?.id && prev.some((m) => m.id === inserted.id)) return prev;
          return inserted ? [...prev, inserted] : prev;
        });
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
      } catch (err: any) {
        Alert.alert(t('common.error'), err?.message || t('common.operationFailed'));
      }
    },
    [userId, selectedConv, userInstituteId, t],
  );

  // Resolve current recipient list based on the selected target. Broadcast modes only —
  // single-recipient modes (one_teacher / one_parent) are handled by openSingleChat and
  // bypass this list entirely. class_* targets use lazily-fetched lists; institute-wide
  // targets reuse the rosters loaded in loadData.
  const groupRecipients = useCallback(() => {
    if (groupTarget === 'teachers') return teachers;
    if (groupTarget === 'parents') return parents;
    if (groupTarget === 'class_teachers') return classTeachers;
    if (groupTarget === 'parents_of_class') return classParents;
    return []; // one_teacher / one_parent — handled separately
  }, [groupTarget, teachers, parents, classTeachers, classParents]);

  // Is the current composer target a single-recipient mode? Determines whether the
  // primary action opens a 1-1 chat instead of broadcasting.
  const isSingleMode = groupTarget === 'one_teacher' || groupTarget === 'one_parent';

  // Open a 1-1 chat directly with one user, dismissing the composer sheet.
  const openSingleChat = (user: any) => {
    setSinglePickerOpen(false);
    setSinglePickerSearch('');
    setShowGroupMsg(false);
    setGroupMsgText('');
    openChat({ userId: user.id, name: user.full_name, role: groupTarget === 'one_teacher' ? 'teacher' : 'parent' });
  };

  const handleSendGroupMessage = async () => {
    if (!groupMsgText.trim() || !userId || !userInstituteId) return;
    const recipients = groupRecipients();
    if (recipients.length === 0) {
      const key =
        groupTarget === 'teachers' ? 'institute.noTeachersGroup'
        : groupTarget === 'parents' ? 'institute.noParentsGroup'
        : 'institute.noTeachersGroup';
      Alert.alert(t('common.warning'), t(key));
      return;
    }
    setSendingGroup(true);
    try {
      await Promise.all(
        recipients.map((r: any) => api.sendMessage(userId, r.id, groupMsgText.trim(), userInstituteId))
      );
      Alert.alert(t('common.success'), `${t('institute.messageSent')} — ${recipients.length}`);
      setGroupMsgText('');
      setShowGroupMsg(false);
      loadData();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('institute.messageFailed'));
    } finally {
      setSendingGroup(false);
    }
  };

  // Voice broadcast — fan out the same audio_url + duration to every recipient.
  // Uses the same upload artifact, so cost is one Bunny upload regardless of audience size.
  const handleSendGroupVoice = useCallback(
    async ({ audioUrl, duration }: { audioUrl: string; duration: number }) => {
      if (!userId || !userInstituteId) return;
      const recipients = groupRecipients();
      if (recipients.length === 0) {
        Alert.alert(t('common.warning'), t('institute.noTeachersGroup'));
        return;
      }
      setSendingGroup(true);
      try {
        await Promise.all(
          recipients.map((r: any) =>
            api.sendMessage(userId, r.id, '', userInstituteId, { type: 'voice', audioUrl, duration }),
          ),
        );
        Alert.alert(t('common.success'), `${t('institute.messageSent')} — ${recipients.length}`);
        setShowGroupMsg(false);
        loadData();
      } catch (err: any) {
        Alert.alert(t('common.error'), err?.message || t('institute.messageFailed'));
      } finally {
        setSendingGroup(false);
      }
    },
    [userId, userInstituteId, groupRecipients, t, loadData],
  );

  const avatarColor = (role: string) =>
    role === 'teacher' ? tokens.semantic.success
    : role === 'parent' ? tokens.semantic.warning
    : tokens.brand[500];

  if (!userInstituteId) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerFill}>
          <ActivityIndicator size="large" color={tokens.brand[500]} />
          <Text style={s.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Chat View ──
  if (selectedConv) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
        <View style={s.chatHeader}>
          <TouchableOpacity onPress={() => { haptics.light(); setSelectedConv(null); loadData(); }} style={s.iconBtn}>
            <Ionicons name="arrow-forward" size={20} color={tokens.text[1]} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.chatHeaderName} numberOfLines={1}>{selectedConv.name}</Text>
            <Text style={s.chatHeaderRole}>{ROLE_LABELS[selectedConv.role] || selectedConv.role}</Text>
          </View>
          <View style={[s.iconBtn, { backgroundColor: avatarColor(selectedConv.role) }]}>
            <Ionicons
              name={selectedConv.role === 'teacher' ? 'school' : selectedConv.role === 'parent' ? 'person' : 'shield'}
              size={18}
              color="#fff"
            />
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
          {loadingMsgs ? (
            <View style={s.centerFill}><ActivityIndicator size="large" color={tokens.brand[500]} /></View>
          ) : (
            <FlashList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, idx) => item.id || `${idx}`}
              renderItem={({ item }) => {
                const isMe = item.sender_id === userId;
                return (
                  <View style={[s.bubble, isMe ? s.myBubble : s.otherBubble]}>
                    {item.type === 'voice' && item.audio_url ? (
                      <VoiceMessageBubble
                        audioUrl={item.audio_url}
                        duration={item.duration}
                        variant={isMe ? 'me' : 'other'}
                      />
                    ) : (
                      <Text style={[s.bubbleText, isMe && { color: '#fff' }]}>{item.content}</Text>
                    )}
                    <Text style={[s.bubbleTime, isMe && { color: 'rgba(255,255,255,0.65)' }]}>
                      {new Date(item.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                );
              }}
              contentContainerStyle={{ padding: 16, gap: 8 }}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
              ListEmptyComponent={<Text style={s.emptyMsg}>{t('institute.noMessages')}</Text>}
            />
          )}

          <View style={s.inputRow}>
            <TouchableOpacity
              style={[s.sendBtn, (!newMessage.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
            {userId && userInstituteId ? (
              <VoiceMessageInput
                instituteId={userInstituteId}
                userId={userId}
                accentColor={tokens.brand[500]}
                onSend={handleSendVoice}
              />
            ) : null}
            <TextInput
              style={s.msgInput}
              placeholder={t('admin.writeMessage')}
              placeholderTextColor={tokens.text[4]}
              value={newMessage}
              onChangeText={setNewMessage}
              textAlign="right"
              multiline
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── New Chat Picker ──
  if (showNewChat) {
    const contacts = contactTab === 'teachers' ? teachers : parents;
    return (
      <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
        <BackHeader title={t('institute.newConversation')} onBack={() => setShowNewChat(false)} />
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabChip, contactTab === 'parents' && { backgroundColor: tokens.semantic.warning }]}
            onPress={() => setContactTab('parents')}
          >
            <Text style={[s.tabChipText, contactTab === 'parents' && { color: '#fff' }]}>{t('common.parents')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabChip, contactTab === 'teachers' && { backgroundColor: tokens.semantic.success }]}
            onPress={() => setContactTab('teachers')}
          >
            <Text style={[s.tabChipText, contactTab === 'teachers' && { color: '#fff' }]}>{t('common.teachers')}</Text>
          </TouchableOpacity>
        </View>

        <FlashList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <FadeSlideIn delay={index * 30} translateFrom={8}>
              <TouchableOpacity style={s.convCard} onPress={() => startNewChat(item)} activeOpacity={0.85}>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={s.convName}>{item.full_name}</Text>
                </View>
                <View style={[s.convAvatar, { backgroundColor: contactTab === 'teachers' ? tokens.semantic.success : tokens.semantic.warning }]}>
                  <Ionicons name={contactTab === 'teachers' ? 'school' : 'person'} size={18} color="#fff" />
                </View>
              </TouchableOpacity>
            </FadeSlideIn>
          )}
          ListEmptyComponent={<Text style={s.emptyContacts}>{contactTab === 'teachers' ? t('institute.noTeachersGroup') : t('institute.noParentsGroup')}</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      </SafeAreaView>
    );
  }

  // ── Conversations List ──
  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerFill}><ActivityIndicator size="large" color={tokens.brand[500]} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الرسائل"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[s.headerActionBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}
              onPress={() => { haptics.light(); setShowNewChat(true); }}
            >
              <Ionicons name="create-outline" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.headerActionBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}
              onPress={() => { haptics.light(); setShowGroupMsg(true); }}
            >
              <Ionicons name="megaphone-outline" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        }
      />

      <FlashList
        data={conversations}
        keyExtractor={(item, idx) => item.id || `${idx}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />}
        renderItem={({ item, index }) => (
          <FadeSlideIn delay={index * 30} translateFrom={8}>
            <TouchableOpacity style={s.convCard} onPress={() => openChat(item)} activeOpacity={0.85}>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={s.convName}>{item.name}</Text>
                <Text style={s.convPreview} numberOfLines={1}>{item.lastMessage || t('institute.openConversation')}</Text>
              </View>
              <View style={[s.convAvatar, { backgroundColor: avatarColor(item.role) }]}>
                <Ionicons
                  name={item.role === 'teacher' ? 'school' : item.role === 'parent' ? 'person' : 'shield'}
                  size={18}
                  color="#fff"
                />
              </View>
            </TouchableOpacity>
          </FadeSlideIn>
        )}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={s.emptyTitle}>{t('admin.noChatConversations')}</Text>
            <Text style={s.emptyHint}>{t('institute.startConversation')}</Text>
          </View>
        }
        contentContainerStyle={{ padding: 16 }}
      />

      <SwipeableSheet visible={showGroupMsg} onClose={() => setShowGroupMsg(false)} maxHeight={0.85}>
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}>
          <View style={s.sheetHeader}>
            <View />
            <Text style={s.sheetTitle}>{t('institute.groupMessage')}</Text>
            <TouchableOpacity onPress={() => setShowGroupMsg(false)}>
              <Ionicons name="close" size={22} color={tokens.text[3]} />
            </TouchableOpacity>
          </View>

          {/* Audience options — 2 rows of 3. The first 4 are broadcast targets, the last 2 open a 1-1 chat. */}
          <Text style={s.pickerLabel}>إلى من؟</Text>
          <View style={s.audienceGrid}>
            <TouchableOpacity
              style={[s.audienceChip, groupTarget === 'teachers' && { backgroundColor: tokens.semantic.success, borderColor: tokens.semantic.success }]}
              onPress={() => { haptics.light(); setGroupTarget('teachers'); }}
            >
              <Ionicons name="school" size={14} color={groupTarget === 'teachers' ? '#fff' : tokens.text[2]} />
              <Text style={[s.audienceChipText, groupTarget === 'teachers' && { color: '#fff' }]} numberOfLines={1}>
                كل الأساتذة ({teachers.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.audienceChip, groupTarget === 'one_teacher' && { backgroundColor: tokens.semantic.success, borderColor: tokens.semantic.success }]}
              onPress={() => { haptics.light(); setGroupTarget('one_teacher'); setSinglePickerOpen(true); }}
            >
              <Ionicons name="person" size={14} color={groupTarget === 'one_teacher' ? '#fff' : tokens.text[2]} />
              <Text style={[s.audienceChipText, groupTarget === 'one_teacher' && { color: '#fff' }]} numberOfLines={1}>
                أستاذ واحد
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.audienceChip, groupTarget === 'class_teachers' && { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] }]}
              onPress={() => { haptics.light(); setGroupTarget('class_teachers'); }}
            >
              <Ionicons name="library" size={14} color={groupTarget === 'class_teachers' ? '#fff' : tokens.text[2]} />
              <Text style={[s.audienceChipText, groupTarget === 'class_teachers' && { color: '#fff' }]} numberOfLines={1}>
                أساتذة صف معيّن
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.audienceChip, groupTarget === 'parents' && { backgroundColor: tokens.semantic.warning, borderColor: tokens.semantic.warning }]}
              onPress={() => { haptics.light(); setGroupTarget('parents'); }}
            >
              <Ionicons name="people" size={14} color={groupTarget === 'parents' ? '#fff' : tokens.text[2]} />
              <Text style={[s.audienceChipText, groupTarget === 'parents' && { color: '#fff' }]} numberOfLines={1}>
                كل أولياء الأمور ({parents.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.audienceChip, groupTarget === 'one_parent' && { backgroundColor: tokens.semantic.warning, borderColor: tokens.semantic.warning }]}
              onPress={() => { haptics.light(); setGroupTarget('one_parent'); setSinglePickerOpen(true); }}
            >
              <Ionicons name="person" size={14} color={groupTarget === 'one_parent' ? '#fff' : tokens.text[2]} />
              <Text style={[s.audienceChipText, groupTarget === 'one_parent' && { color: '#fff' }]} numberOfLines={1}>
                ولي أمر واحد
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.audienceChip, groupTarget === 'parents_of_class' && { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] }]}
              onPress={() => { haptics.light(); setGroupTarget('parents_of_class'); }}
            >
              <Ionicons name="people-outline" size={14} color={groupTarget === 'parents_of_class' ? '#fff' : tokens.text[2]} />
              <Text style={[s.audienceChipText, groupTarget === 'parents_of_class' && { color: '#fff' }]} numberOfLines={1}>
                أولياء أمور صف معيّن
              </Text>
            </TouchableOpacity>
          </View>

          {/* Class picker — shared between class_teachers and parents_of_class targets. */}
          {(groupTarget === 'class_teachers' || groupTarget === 'parents_of_class') ? (
            <View style={{ marginTop: 12, marginBottom: 4 }}>
              <Text style={s.pickerLabel}>اختر الصف</Text>
              <View style={s.classChipRow}>
                {classes.length === 0 ? (
                  <Text style={s.emptyContacts}>لا توجد صفوف</Text>
                ) : (
                  classes.map((c: any) => {
                    const active = selectedClassId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[s.classChip, active && { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] }]}
                        onPress={() => setSelectedClassId(c.id)}
                      >
                        <Text style={[s.classChipText, active && { color: '#fff' }]} numberOfLines={1}>
                          {c.name || c.title || 'صف'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
              {selectedClassId ? (
                <Text style={s.pickerHint}>
                  {groupTarget === 'class_teachers'
                    ? (loadingClassTeachers ? 'جاري التحميل…' : `${classTeachers.length} أستاذ في هذا الصف`)
                    : (loadingClassParents ? 'جاري التحميل…' : `${classParents.length} ولي أمر مرتبط بطلاب هذا الصف`)}
                </Text>
              ) : (
                <Text style={s.pickerHint}>اختر صفاً لرؤية المستقبلين</Text>
              )}
            </View>
          ) : null}

          {/* Single-recipient hint — composer body hidden until the user picks the actual person. */}
          {isSingleMode ? (
            <Text style={[s.pickerHint, { marginTop: 12 }]}>
              {groupTarget === 'one_teacher' ? 'اختر أستاذاً لفتح محادثة فردية معه' : 'اختر ولي أمر لفتح محادثة فردية معه'}
            </Text>
          ) : (
            <>
              <TextInput
                style={[s.groupInput, { marginTop: 12 }]}
                placeholder={t('institute.groupMessagePlaceholder')}
                placeholderTextColor={tokens.text[4]}
                value={groupMsgText}
                onChangeText={setGroupMsgText}
                multiline
              />

              <View style={s.groupActionRow}>
                <TouchableOpacity
                  style={[
                    s.groupSendBtn,
                    {
                      backgroundColor:
                        groupTarget === 'teachers' ? tokens.semantic.success
                        : groupTarget === 'class_teachers' ? tokens.brand[500]
                        : groupTarget === 'parents_of_class' ? tokens.brand[500]
                        : tokens.semantic.warning,
                      flex: 1,
                    },
                    (!groupMsgText.trim() || sendingGroup || groupRecipients().length === 0) && { opacity: 0.5 },
                  ]}
                  onPress={handleSendGroupMessage}
                  disabled={!groupMsgText.trim() || sendingGroup || groupRecipients().length === 0}
                >
                  {sendingGroup ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.groupSendText}>
                      {t('institute.sendToCount')} {groupRecipients().length}
                    </Text>
                  )}
                </TouchableOpacity>
                {userId && userInstituteId && groupRecipients().length > 0 ? (
                  <VoiceMessageInput
                    instituteId={userInstituteId}
                    userId={userId}
                    accentColor={tokens.brand[500]}
                    disabled={sendingGroup}
                    onSend={handleSendGroupVoice}
                  />
                ) : null}
              </View>
            </>
          )}
        </View>
      </SwipeableSheet>

      {/* Single-recipient picker — opens when user taps "أستاذ واحد" or "ولي أمر واحد" in the composer. */}
      <SwipeableSheet
        visible={singlePickerOpen}
        onClose={() => { setSinglePickerOpen(false); setSinglePickerSearch(''); }}
        maxHeight={0.75}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Text style={s.sheetTitle}>
            {groupTarget === 'one_teacher' ? 'اختر الأستاذ' : 'اختر ولي الأمر'}
          </Text>
          <Text style={s.pickerHint}>
            {groupTarget === 'one_teacher'
              ? 'سيُفتح بعد الاختيار محادثة فردية معك'
              : 'سيُفتح بعد الاختيار محادثة فردية معك'}
          </Text>
          <TextInput
            style={[s.groupInput, { marginTop: 10, minHeight: 44 }]}
            placeholder="بحث بالاسم…"
            placeholderTextColor={tokens.text[4]}
            value={singlePickerSearch}
            onChangeText={setSinglePickerSearch}
          />
          {/* Bounded height — FlashList inside a sheet needs an explicit container size. */}
          <View style={{ height: 400, marginTop: 8 }}>
            <FlashList
              data={(groupTarget === 'one_teacher' ? teachers : parents).filter((u: any) => {
                const q = singlePickerSearch.trim().toLowerCase();
                if (!q) return true;
                return (u.full_name || '').toLowerCase().includes(q);
              })}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: any) => (
                <TouchableOpacity
                  style={s.convCard}
                  onPress={() => openSingleChat(item)}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={s.convName}>{item.full_name}</Text>
                  </View>
                  <View style={[s.convAvatar, { backgroundColor: groupTarget === 'one_teacher' ? tokens.semantic.success : tokens.semantic.warning }]}>
                    <Ionicons name={groupTarget === 'one_teacher' ? 'school' : 'person'} size={18} color="#fff" />
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={s.emptyContacts}>
                  {groupTarget === 'one_teacher' ? t('institute.noTeachersGroup') : t('institute.noParentsGroup')}
                </Text>
              }
              contentContainerStyle={{ paddingVertical: 8 }}
            />
          </View>
        </View>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 13, color: tokens.text[3], marginTop: 12, fontWeight: '500' },

  headerActionBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    ...tokens.shadow.xs,
  },

  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: tokens.surface.surface,
    borderBottomWidth: 1, borderBottomColor: tokens.border[2],
  },
  chatHeaderName: { fontSize: 15, fontWeight: '800', color: tokens.text[1] },
  chatHeaderRole: { fontSize: 10, color: tokens.text[3], marginTop: 2, fontWeight: '500' },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },

  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tabChip: {
    flex: 1, paddingVertical: 10, borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[2],
    alignItems: 'center',
  },
  tabChipText: { fontSize: 13, fontWeight: '700', color: tokens.text[2] },

  convCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  convAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  convName: { fontSize: 14, fontWeight: '800', color: tokens.text[1] },
  convPreview: { fontSize: 12, color: tokens.text[3], marginTop: 3, fontWeight: '500' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: tokens.border[2],
    backgroundColor: tokens.surface.surface,
  },
  msgInput: {
    flex: 1, backgroundColor: tokens.surface.surface2,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: tokens.text[1], maxHeight: 100,
    borderWidth: 1, borderColor: tokens.border[2],
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.brand[500],
    alignItems: 'center', justifyContent: 'center',
    ...tokens.shadow.xs,
  },

  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  myBubble: { alignSelf: 'flex-start', backgroundColor: tokens.brand[500], borderBottomLeftRadius: 4 },
  otherBubble: {
    alignSelf: 'flex-end', backgroundColor: tokens.surface.surface,
    borderWidth: 1, borderColor: tokens.border[2],
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, color: tokens.text[1], lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: tokens.text[4], marginTop: 4, fontWeight: '500' },

  emptyMsg: { textAlign: 'center', color: tokens.text[3], paddingTop: 60, fontSize: 13 },
  emptyContacts: { textAlign: 'center', color: tokens.text[3], paddingTop: 40, fontSize: 13 },
  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 14, color: tokens.text[1], fontWeight: '800' },
  emptyHint: { fontSize: 12, color: tokens.text[3], marginTop: 4, fontWeight: '500' },

  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  groupTargetBtn: {
    flex: 1, paddingVertical: 14, borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[2],
    alignItems: 'center', gap: 4,
  },
  groupTargetText: { fontSize: 12, fontWeight: '700', color: tokens.text[2], marginTop: 4 },
  // 2-row chip grid for the 6 audience options. Each chip is min 30% wide so 3 fit per row.
  audienceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  audienceChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1,
    borderColor: tokens.border[2],
    flexBasis: '31%',
    flexGrow: 1,
  },
  audienceChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.text[2],
    flex: 1,
    textAlign: 'right',
  },
  groupInput: {
    backgroundColor: tokens.surface.surface2,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 14, color: tokens.text[1], textAlign: 'right',
    borderWidth: 1, borderColor: tokens.border[2],
    minHeight: 100, textAlignVertical: 'top',
  },
  groupSendBtn: {
    borderRadius: tokens.radius.md, paddingVertical: 14,
    alignItems: 'center',
    ...tokens.shadow.xs,
  },
  groupSendText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  groupActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16,
  },
  pickerLabel: { fontSize: 12, fontWeight: '700', color: tokens.text[2], marginBottom: 8, textAlign: 'right' },
  pickerHint: { fontSize: 11, color: tokens.text[3], marginTop: 8, textAlign: 'right', fontWeight: '500' },
  classChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  classChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[2],
  },
  classChipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
});
