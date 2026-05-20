import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { supabase } from '../../services/supabase';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useStudentStore from '../../stores/studentStore';
import { api } from '../../services/api';
import { clearAllCache } from '../../services/cache';
import { bunnyService } from '../../services/bunny';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { haptics } from '../../utils/haptics';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import ContentHeader, { ContentTab } from '../../components/student/content/ContentHeader';
import ContentGroupedList, { Group } from '../../components/student/content/ContentGroupedList';
import {
  VideoCard,
  LiveCard,
  GalleryCard,
  VoiceCard,
  MaterialCard,
} from '../../components/student/content/ContentCards';
import ContentBuySheet from '../../components/student/content/ContentBuySheet';
import ContentLiveModal from '../../components/student/content/ContentLiveModal';
import ContentPdfChatModal from '../../components/student/content/ContentPdfChatModal';
import ContentPdfViewerModal from '../../components/student/content/ContentPdfViewerModal';
import { ContentVideoModal, ContentGallerySheet } from '../../components/student/content/ContentMediaModals';

// Voice tab removed: voice & text messages from teachers are now a dedicated
// page at /(student)/messages. Keeping it here would duplicate the inbox in
// a tab the user can already reach from the home shortcut.
const TAB_KEYS: { key: ContentTab; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'videos', labelKey: 'student.videosTab', icon: 'videocam' },
  { key: 'live', labelKey: 'student.liveTab', icon: 'radio' },
  { key: 'gallery', labelKey: 'student.galleryTab', icon: 'images' },
  { key: 'materials', labelKey: 'student.materialsTab', icon: 'document-attach' },
];

export default function StudentContent() {
  const { t } = useTranslation();
  const isContentEnabled = useFeatureFlag('content_management');
  const isPdfChatEnabled = useFeatureFlag('ai_pdf_chat');
  const isLiveEnabled = useFeatureFlag('live_streaming');
  const isVoiceEnabled = useFeatureFlag('voice_messages');
  // Hide optional tabs when their feature flag is disabled for this institute
  const TABS = TAB_KEYS
    .filter(tab => tab.key !== 'live' || isLiveEnabled)
    .map(tab => ({ ...tab, label: t(tab.labelKey) }));
  const { userId, userName } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const {
    videos,
    liveStreams,
    galleries,
    voiceMessages,
    materials,
    selectedClassId,
    loadVideos,
    loadGalleries,
    loadLiveStreams,
    loadVoiceMessages,
    loadMaterials,
    markVoicesAsSeen,
  } = useStudentStore();

  // Subject filter (shared across videos/galleries/materials)
  // Multi-select: empty array = show all; non-empty = filter to those subjects (+ optional "other" bucket)
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [showOtherSubject, setShowOtherSubject] = useState(false); // show items with subject_id=null

  // Support deep-linking from the home voice-badge → content?tab=voice so the tap
  // opens directly on the right tab instead of requiring a second tap.
  // Also supports openVideoId/openMaterialId/openGalleryId from subject-detail screen.
  const params = useLocalSearchParams<{ tab?: string; openVideoId?: string; openMaterialId?: string; openGalleryId?: string }>();
  const initialTab: ContentTab = ((): ContentTab => {
    const t = (params?.tab as string) || '';
    if (params?.openVideoId) return 'videos';
    if (params?.openMaterialId) return 'materials';
    if (params?.openGalleryId) return 'gallery';
    const valid: ContentTab[] = ['videos', 'live', 'gallery', 'materials'];
    return (valid as string[]).includes(t) ? (t as ContentTab) : 'videos';
  })();
  const [activeTab, setActiveTab] = useState<ContentTab>(initialTab);
  const [refreshing, setRefreshing] = useState(false);
  const [buyModalVisible, setBuyModalVisible] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [buying, setBuying] = useState(false);
  const [buyerPhone, setBuyerPhone] = useState('');

  // PDF viewer
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [viewingPdfUrl, setViewingPdfUrl] = useState('');

  // PDF Chat with AI
  const [chatPdf, setChatPdf] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatRef = useRef<FlashListRef<any>>(null);

  // Video player modal
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);

  // Live stream modal
  const [liveModalVisible, setLiveModalVisible] = useState(false);
  const [selectedLive, setSelectedLive] = useState<any>(null);

  // Gallery detail modal
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<any>(null);

  // Voice playback
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // "Live not ready" ConfirmSheet (replaces Alert.alert for that flow)
  const [liveNotReadyVisible, setLiveNotReadyVisible] = useState(false);

  // Presence channel ref — kept here (not on the live record) so cleanup runs
  // deterministically via useEffect even if `selectedLive` is mutated/replaced.
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load subjects once per session (small + cached in memory)
  useEffect(() => {
    if (!userId) return;
    api.getStudentSubjects(userId).then(setSubjects).catch(() => setSubjects([]));
  }, [userId]);

  // Teacher→subject map (fallback classifier for content that lacks explicit subject_id)
  const [teacherSubjectMap, setTeacherSubjectMap] = useState<Record<string, { subject_id: string; subject_name: string }>>({});
  useEffect(() => {
    if (!userInstituteId) return;
    api.getTeachersSubjectMap(userInstituteId).then(setTeacherSubjectMap).catch(() => setTeacherSubjectMap({}));
  }, [userInstituteId]);

  useEffect(() => {
    if (userInstituteId) {
      // Always clear cache on mount so teacher's recent publish/hide actions reflect immediately
      (async () => {
        try { await clearAllCache(); } catch {}
        loadVideos(userInstituteId, userId || undefined);
        loadGalleries(userInstituteId, userId || undefined);
        // Only fetch live streams when the feature is enabled for this institute
        if (isLiveEnabled) loadLiveStreams(userInstituteId, userId || undefined);
        loadMaterials(userInstituteId, userId || undefined);
      })();
    }
    if (userId && isVoiceEnabled) {
      loadVoiceMessages(userId);
    }
    // Cleanup audio on unmount
    return () => {
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [userId, userInstituteId, selectedClassId]);

  // Live stream presence — when the live modal is open for a specific stream,
  // subscribe to a per-stream realtime channel so the teacher's viewer count
  // updates without polling. Cleanup unsubscribes deterministically on close
  // or unmount, preventing the previous channel-leak (dangling subscriptions
  // kept the viewer count inflated after students left).
  useEffect(() => {
    if (!liveModalVisible || !selectedLive?.id || !userId) return;
    const streamId = selectedLive.id;
    api.joinStream(streamId, userId).catch(() => {});

    const streamInstituteId = (selectedLive as any).institute_id || userInstituteId;
    const channelName = streamInstituteId
      ? `stream-presence:${streamInstituteId}:${streamId}`
      : `stream-presence:${streamId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: `student:${userId}` } },
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({
          role: 'student',
          institute_id: streamInstituteId || null,
          at: new Date().toISOString(),
        });
      }
    });
    presenceChannelRef.current = channel;

    return () => {
      api.leaveStream(streamId, userId).catch(() => {});
      try { channel.untrack(); } catch {}
      try { channel.unsubscribe(); } catch {}
      try { supabase.removeChannel(channel); } catch {}
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }
    };
  }, [liveModalVisible, selectedLive?.id, userId, userInstituteId]);

  // Voice tab no longer exists here — messages live at /(student)/messages and
  // mark themselves as seen on mount of that screen.

  // Deep-link from subject-detail screen → open the corresponding modal once the
  // matching content list is loaded. One-shot effect: clears handled state so
  // closing the modal doesn't re-open it.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    if (params?.openVideoId && videos.length > 0) {
      const v = (videos as any[]).find((x) => x.id === params.openVideoId);
      if (v) { setSelectedVideo(v); setVideoModalVisible(true); deepLinkHandled.current = true; }
    } else if (params?.openMaterialId && materials.length > 0) {
      const m = (materials as any[]).find((x) => x.id === params.openMaterialId);
      if (m) { setSelectedMaterial(m); setBuyModalVisible(true); deepLinkHandled.current = true; }
    } else if (params?.openGalleryId && galleries.length > 0) {
      const g = (galleries as any[]).find((x) => x.id === params.openGalleryId);
      if (g) { setSelectedGallery(g); setGalleryModalVisible(true); deepLinkHandled.current = true; }
    }
  }, [params?.openVideoId, params?.openMaterialId, params?.openGalleryId, videos, materials, galleries]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      // Bust cache so hidden/new content reflects immediately
      await clearAllCache();
      const promises: Promise<void>[] = [];
      if (userInstituteId) {
        promises.push(
          loadVideos(userInstituteId, userId || undefined),
          loadGalleries(userInstituteId, userId || undefined),
          loadMaterials(userInstituteId, userId || undefined),
        );
        if (isLiveEnabled) promises.push(loadLiveStreams(userInstituteId, userId || undefined));
      }
      if (userId && isVoiceEnabled) promises.push(loadVoiceMessages(userId));
      await Promise.all(promises);
    } finally {
      setRefreshing(false);
    }
  }, [userId, userInstituteId]);

  const handleBuyMaterial = async () => {
    if (!userId) { Alert.alert('خطأ', 'يرجى تسجيل الدخول'); return; }
    if (!selectedMaterial) return;
    if (!buyerPhone.trim()) { Alert.alert('خطأ', 'يرجى إدخال رقم الهاتف'); return; }
    setBuying(true);
    try {
      await api.reserveMaterial(
        selectedMaterial.id,
        userId,
        `${userName || 'طالب'} — ${buyerPhone.trim()}`,
        selectedMaterial.teacher_id || '',
        selectedMaterial.title || 'ملزمة',
        selectedMaterial.price || 0,
      );
      haptics.success();
      Alert.alert('تم الحجز', `تم حجز "${selectedMaterial.title}"\n\nالاسم: ${userName}\nالهاتف: ${buyerPhone}\n\nالتسديد كاش عند الاستلام من المعهد/المدرسة`);
      setBuyModalVisible(false);
      setBuyerPhone('');
      if (userInstituteId) loadMaterials(userInstituteId);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل الحجز');
    } finally {
      setBuying(false);
    }
  };

  const handlePlayVideo = (item: any) => {
    haptics.light();
    // Log view so teacher sees this student in viewers list
    if (userId) api.logContentView('video', item.id, userId, userInstituteId || undefined).catch(() => {});
    if (item.url) {
      // External URL - open in player modal or browser
      setSelectedVideo(item);
      setVideoModalVisible(true);
    } else if (item.bunny_video_id && !item.bunny_video_id.startsWith('local_')) {
      // Bunny CDN video
      setSelectedVideo(item);
      setVideoModalVisible(true);
    } else {
      Alert.alert(
        item.title || 'محاضرة',
        `الأستاذ: ${item.users?.full_name || 'غير محدد'}\nالتاريخ: ${item.created_at ? new Date(item.created_at).toLocaleDateString('ar-IQ') : 'غير محدد'}\n\nالفيديو غير متوفر للتشغيل حالياً`,
      );
    }
  };

  // Voice message playback
  const handlePlayVoice = async (item: any) => {
    haptics.light();
    if (playingVoiceId === item.id) {
      // Stop playing
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (!item.audio_url && !item.audio_data) {
      Alert.alert('تنبيه', 'لا يتوفر تسجيل صوتي لهذه الرسالة');
      return;
    }

    try {
      // Stop any currently playing sound
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const audioUri = item.audio_url || item.audio_data;
      if (Platform.OS === 'web') {
        // Web: native HTMLAudioElement (Audio.Sound unreliable on web)
        const audio = new window.Audio(audioUri);
        audio.addEventListener('ended', () => { setPlayingVoiceId(null); soundRef.current = null; });
        await audio.play();
        soundRef.current = { stopAsync: async () => audio.pause(), unloadAsync: async () => { audio.pause(); audio.src = ''; } } as any;
        setPlayingVoiceId(item.id);
      } else {
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setPlayingVoiceId(null);
              sound.unloadAsync();
              soundRef.current = null;
            }
          }
        );
        soundRef.current = sound;
        setPlayingVoiceId(item.id);
      }
    } catch (err: any) {
      console.error('voice play error:', err);
      Alert.alert('خطأ', err?.message || 'فشل تشغيل الرسالة الصوتية');
      setPlayingVoiceId(null);
    }
  };

  // Format a date as "يوم/شهر/سنة" short Arabic relative-ish label.
  const formatDate = (iso?: string) => {
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
  };

  // Apply client-side subject filter — multi-select + optional "other" bucket
  const bySubject = <T extends { subject_id?: string | null }>(arr: T[]): T[] => {
    if (selectedSubjectIds.length === 0 && !showOtherSubject) return arr; // nothing selected = show all
    return arr.filter(x => {
      if (selectedSubjectIds.includes(x.subject_id as string)) return true;
      if (showOtherSubject && !x.subject_id) return true;
      return false;
    });
  };
  const toggleSubject = (id: string) => {
    setSelectedSubjectIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };
  const filteredVideos = bySubject(videos);
  const filteredGalleries = bySubject(galleries);
  const filteredMaterials = bySubject(materials);

  // Group an array by subject — prefers explicit item.subject_id, falls back to teacher's assigned subject.
  // This means: uploads without explicit subject get auto-classified under the uploader's subject.
  const groupBySubject = <T extends { subject_id?: string | null; teacher_id?: string | null }>(arr: T[]): Group<T>[] => {
    const map = new Map<string, Group<T>>();
    // Pre-seed order from subjects list (student's enrolled subjects first)
    for (const sub of subjects) {
      map.set(sub.id, { key: sub.id, label: sub.name, items: [] });
    }
    for (const item of arr) {
      // 1. Explicit subject_id on the item
      // 2. Fallback: teacher's primary subject
      const teacherSubj = (item as any).teacher_id ? teacherSubjectMap[(item as any).teacher_id] : null;
      const resolvedSubjectId: string = (item as any).subject_id || teacherSubj?.subject_id || '__other__';
      const resolvedLabel = (item as any).subjects?.name
        || (resolvedSubjectId === '__other__' ? 'أخرى' : (subjects.find(s => s.id === resolvedSubjectId)?.name || teacherSubj?.subject_name || 'مادة'));

      if (!map.has(resolvedSubjectId)) {
        map.set(resolvedSubjectId, { key: resolvedSubjectId, label: resolvedLabel, items: [] });
      }
      map.get(resolvedSubjectId)!.items.push(item);
    }
    return Array.from(map.values()).filter(g => g.items.length > 0);
  };

  // Per-item renderers — pure functions that delegate to the card components
  const renderVideoItem = (item: any) => {
    const thumbnailUrl = item.thumbnail_url
      || (item.bunny_video_id && !item.bunny_video_id.startsWith('local_')
        ? bunnyService.getThumbnailUrl(item.bunny_video_id)
        : null);
    return (
      <VideoCard
        item={item}
        thumbnailUrl={thumbnailUrl}
        formattedDate={formatDate(item.created_at)}
        onPress={() => handlePlayVideo(item)}
      />
    );
  };

  const renderLiveItem = (item: any) => {
    const joinable = !!(item.url || item.hls_url || item.cloudflare_uid);
    return (
      <LiveCard
        item={item}
        joinable={joinable}
        onPress={() => {
          haptics.light();
          // Validate there's actually a playable source before opening the modal
          if (!joinable) {
            setLiveNotReadyVisible(true);
            return;
          }
          setSelectedLive(item);
          setLiveModalVisible(true);
        }}
      />
    );
  };

  const renderGalleryItem = (item: any) => {
    const count = item.image_count || (Array.isArray(item.images) ? item.images.length : 0);
    return (
      <GalleryCard
        item={item}
        count={count}
        onPress={() => {
          haptics.light();
          if (userId) api.logContentView('gallery', item.id, userId, userInstituteId || undefined).catch(() => {});
          setSelectedGallery(item);
          setGalleryModalVisible(true);
        }}
      />
    );
  };

  const renderVoiceItem = (item: any) => {
    return (
      <VoiceCard
        item={item}
        isPlaying={playingVoiceId === item.id}
        formattedDate={formatDate(item.created_at)}
        onPress={() => handlePlayVoice(item)}
      />
    );
  };

  const renderMaterialItem = (item: any) => {
    return (
      <MaterialCard
        item={item}
        isPdfChatEnabled={isPdfChatEnabled}
        onViewPdf={() => {
          haptics.light();
          if (item.cover_url) {
            if (userId) api.logContentView('pdf', item.id, userId, userInstituteId || undefined).catch(() => {});
            setViewingPdfUrl(item.cover_url);
            setPdfViewerVisible(true);
          }
        }}
        onAskAi={() => {
          haptics.light();
          setChatPdf(item);
          setChatMessages([]);
          setChatInput('');
        }}
        onReserveBooklet={() => {
          haptics.light();
          setSelectedMaterial(item);
          setBuyModalVisible(true);
        }}
      />
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'videos':
        return (
          <ContentGroupedList
            groups={groupBySubject(filteredVideos)}
            isEmpty={filteredVideos.length === 0}
            emptyText={t('student.noVideos')}
            itemRender={renderVideoItem}
          />
        );

      case 'live':
        return liveStreams.length === 0 ? (
          <View style={styles.emptyLive}>
            <Ionicons name="radio-outline" size={48} color={tokens.color.text3} />
            <Text style={styles.emptyText}>{t('student.noLiveStream')}</Text>
          </View>
        ) : (
          <FlashList
            data={liveStreams}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderLiveItem(item)}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 10 }}
          />
        );

      case 'gallery':
        return (
          <ContentGroupedList
            groups={groupBySubject(filteredGalleries)}
            isEmpty={filteredGalleries.length === 0}
            emptyText={t('student.noPhotos')}
            itemRender={renderGalleryItem}
          />
        );

      case 'materials':
        return (
          <ContentGroupedList
            groups={groupBySubject(filteredMaterials)}
            isEmpty={filteredMaterials.length === 0}
            emptyText={t('student.noMaterials')}
            itemRender={renderMaterialItem}
          />
        );
    }
  };

  const handleLiveModalClose = () => {
    setLiveModalVisible(false);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !chatPdf || !userId || !userInstituteId) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: question }]);
    setChatSending(true);

    try {
      await api.logAIUsage(userId, userInstituteId, 'pdf_chat');

      const systemPrompt = `أنت مساعد تعليمي ذكي. يجب أن تجيب فقط عن أسئلة تتعلق بالمحتوى التعليمي التالي: "${chatPdf.title}". لا تجب عن أي موضوع آخر. لو سألك الطالب شي خارج نطاق الملف، قل "هذا السؤال خارج نطاق الملف". أجب بالعربية بشكل واضح ومختصر.`;
      const fullPrompt = `${systemPrompt}\n\nالمحادثة السابقة:\n${chatMessages.map(m => `${m.role === 'user' ? 'الطالب' : 'المساعد'}: ${m.content}`).join('\n')}\n\nالطالب: ${question}\nالمساعد:`;

      const { callAIProxy } = await import('../../services/api');
      const answer = await callAIProxy(fullPrompt, userId, 'pdf_chat');

      setChatMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'حدث خطأ — حاول مرة أخرى' }]);
    } finally {
      setChatSending(false);
    }
    setTimeout(() => chatRef.current?.scrollToEnd(), 100);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('student.contentTitle', { defaultValue: 'المحتوى التعليمي' })}
        subtitle={`${t('student.videosTab')} · ${t('student.galleryTab')} · ${t('student.materialsTab')}`}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
        showBack={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.teal600} />}
      >
        <ContentHeader
          subjects={subjects}
          selectedSubjectIds={selectedSubjectIds}
          showOtherSubject={showOtherSubject}
          onClearFilter={() => { setSelectedSubjectIds([]); setShowOtherSubject(false); }}
          onToggleSubject={toggleSubject}
          onToggleOther={() => setShowOtherSubject(v => !v)}
          tabs={TABS}
          activeTab={activeTab}
          onTabPress={(tab) => setActiveTab(tab)}
        />

        {/* Content */}
        <View style={styles.contentArea}>
          {renderContent()}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Video Player Modal */}
      <ContentVideoModal
        visible={videoModalVisible}
        selectedVideo={selectedVideo}
        userId={userId}
        instituteId={userInstituteId}
        onClose={() => setVideoModalVisible(false)}
      />

      {/* Live Stream Modal */}
      <ContentLiveModal
        visible={liveModalVisible}
        selectedLive={selectedLive}
        onClose={handleLiveModalClose}
      />

      {/* Gallery Detail Modal */}
      <ContentGallerySheet
        visible={galleryModalVisible}
        selectedGallery={selectedGallery}
        onClose={() => setGalleryModalVisible(false)}
      />

      {/* Buy Confirmation Modal */}
      <ContentBuySheet
        visible={buyModalVisible}
        onClose={() => setBuyModalVisible(false)}
        selectedMaterial={selectedMaterial}
        userName={userName}
        buyerPhone={buyerPhone}
        onChangePhone={setBuyerPhone}
        buying={buying}
        onConfirm={handleBuyMaterial}
      />

      {/* PDF Viewer Modal */}
      <ContentPdfViewerModal
        visible={pdfViewerVisible}
        url={viewingPdfUrl}
        onClose={() => setPdfViewerVisible(false)}
      />

      {/* PDF Chat with AI Modal */}
      <ContentPdfChatModal
        chatPdf={chatPdf}
        chatMessages={chatMessages}
        chatInput={chatInput}
        chatSending={chatSending}
        chatRef={chatRef}
        onChangeInput={setChatInput}
        onClose={() => setChatPdf(null)}
        onSend={handleSendChat}
      />

      {/* "Live not ready" confirm sheet — replaces Alert.alert for that non-destructive flow */}
      <ConfirmSheet
        visible={liveNotReadyVisible}
        title={t('common.warning', { defaultValue: 'تنبيه' })}
        message={t('student.liveNotReady', { defaultValue: 'البث لم يبدأ بعد — حاول لاحقاً' })}
        confirmLabel={t('common.ok', { defaultValue: 'حسناً' })}
        onConfirm={() => setLiveNotReadyVisible(false)}
        onClose={() => setLiveNotReadyVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  contentArea: {
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 40,
  },
  emptyLive: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
});
