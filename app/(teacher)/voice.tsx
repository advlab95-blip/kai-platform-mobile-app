import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import FilterChip from '../../components/teacher/chips/FilterChip';
import FAB from '../../components/teacher/buttons/FAB';
import PrimaryButton from '../../components/teacher/buttons/PrimaryButton';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useTeacherStore from '../../stores/teacherStore';
import { api } from '../../services/api';
import { bunnyStorage } from '../../services/bunny';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { haptics } from '../../utils/haptics';

// ── Deterministic 20-bar waveform from a message id (no Math.random — must be
// stable across renders so the bars don't twitch). LCG seeded from char-code sum.
const WAVEFORM_BAR_COUNT = 20;
function deterministicWaveform(id: string | undefined): number[] {
  const heights: number[] = [];
  let seed = 0;
  if (id) for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i);
  if (seed === 0) seed = 1;
  for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    heights.push(6 + (seed / 233280) * 18);
  }
  return heights;
}

export default function TeacherVoice() {
  const isEnabled = useFeatureFlag('voice_messages');
  const { t } = useTranslation();
  const { userId, userName } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { voiceMessages, classes, loadVoiceMessages, selectedTargets } = useTeacherStore();

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<'all' | string>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Animated waveform bars for active recording (intentionally Math.random — keep).
  const waveAnimations = useMemo(() =>
    Array.from({ length: 12 }, () => new Animated.Value(6)),
  []);

  useEffect(() => {
    if (isRecording) {
      const animations = waveAnimations.map((anim) => {
        const animate = () => {
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 8 + Math.random() * 28,
              duration: 150 + Math.random() * 200,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 4 + Math.random() * 10,
              duration: 150 + Math.random() * 200,
              useNativeDriver: false,
            }),
          ]).start(() => {
            if (recordingRef.current) animate();
          });
        };
        animate();
        return anim;
      });
      return () => {
        animations.forEach((anim) => anim.stopAnimation());
      };
    } else {
      waveAnimations.forEach((anim) => {
        Animated.timing(anim, { toValue: 6, duration: 200, useNativeDriver: false }).start();
      });
    }
  }, [isRecording]);

  useEffect(() => {
    if (userId) loadVoiceMessages(userId);
  }, [userId]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userId) await loadVoiceMessages(userId);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const webMediaRecorderRef = useRef<any>(null);
  const webMediaStreamRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      if (Platform.OS === 'web') {
        if (!(navigator as any).mediaDevices?.getUserMedia) {
          Alert.alert('خطأ', 'المتصفح لا يدعم التسجيل الصوتي');
          return;
        }
        const stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });
        webMediaStreamRef.current = stream;
        webChunksRef.current = [];
        const mr = new (window as any).MediaRecorder(stream);
        mr.ondataavailable = (e: any) => { if (e.data?.size > 0) webChunksRef.current.push(e.data); };
        mr.start();
        webMediaRecorderRef.current = mr;
        setIsRecording(true);
        setRecordSeconds(0);
        setRecordingUri(null);
        return;
      }
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('common.warning'), t('teacher.allowMicrophone'));
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordSeconds(0);
      setRecordingUri(null);
    } catch (err: any) {
      console.error('startRecording:', err);
      Alert.alert(t('common.error'), err?.message || t('teacher.startRecordingFailed'));
    }
  };

  const stopRecording = async () => {
    try {
      if (Platform.OS === 'web') {
        const mr = webMediaRecorderRef.current;
        if (!mr) return;
        await new Promise<void>((resolve) => {
          mr.onstop = () => resolve();
          mr.stop();
        });
        const blob = new Blob(webChunksRef.current, { type: 'audio/webm' });
        const uri = URL.createObjectURL(blob);
        webMediaStreamRef.current?.getTracks?.().forEach((t: any) => t.stop());
        webMediaStreamRef.current = null;
        webMediaRecorderRef.current = null;
        setIsRecording(false);
        // Revoke the previous blob URL if recording again without sending
        setRecordingUri(prev => {
          if (prev && prev.startsWith('blob:')) {
            try { URL.revokeObjectURL(prev); } catch {}
          }
          return uri;
        });
        return;
      }
      if (!recordingRef.current) return;
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      if (uri) setRecordingUri(uri);
    } catch (err) {
      setIsRecording(false);
      Alert.alert(t('common.error'), t('teacher.stopRecordingFailed'));
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleSend = async () => {
    if (!recordingUri && !isRecording) return;
    if (isRecording) await stopRecording();

    const uri = recordingUri;
    if (!uri) {
      Alert.alert(t('common.warning'), t('teacher.noAudioRecorded'));
      return;
    }

    // Priority: multi-target picker from home → local single picker → none
    const homeTargetClassIds = selectedTargets.map(tg => tg.classId).filter(Boolean) as string[];
    const willUseHomeTargets = homeTargetClassIds.length > 0;

    if (!willUseHomeTargets && selectedTarget !== 'all' && !selectedTarget) {
      Alert.alert(t('common.error'), 'اختر الصف/الشعبة من الرئيسية أو "الجميع" قبل الإرسال.');
      return;
    }

    setSending(true);
    try {
      // Upload audio to Bunny Storage
      const audioUrl = await bunnyStorage.uploadFile(uri, `voice/${Date.now()}.m4a`);

      if (willUseHomeTargets) {
        // Fan out: one voice-message row per targeted class (same audio URL)
        for (const classId of homeTargetClassIds) {
          const targetName = classes.find((c: any) => c.id === classId)?.name
            || selectedTargets.find(tg => tg.classId === classId)?.displayName
            || t('common.class');
          await api.sendVoiceMessage(
            userId || '', userName || t('teacher.defaultName'), 'teacher',
            'class', classId, targetName, recordSeconds, audioUrl,
            userInstituteId || undefined,
          );
        }
      } else {
        const targetId = selectedTarget === 'all' ? 'all' : selectedTarget;
        const targetName = selectedTarget === 'all' ? t('teacher.allStudents') : (classes.find((c: any) => c.id === selectedTarget)?.name || t('common.class'));
        await api.sendVoiceMessage(
          userId || '', userName || t('teacher.defaultName'), 'teacher',
          selectedTarget === 'all' ? 'all_students' : 'class',
          targetId, targetName, recordSeconds, audioUrl,
          userInstituteId || undefined,
        );
      }
      Alert.alert(t('common.success'), t('teacher.voiceSent'));
      setRecordSeconds(0);
      // Release the blob URL after upload — prevents memory leak on web
      if (recordingUri && recordingUri.startsWith('blob:')) {
        try { URL.revokeObjectURL(recordingUri); } catch {}
      }
      setRecordingUri(null);
      setRecorderOpen(false);
      if (userId) loadVoiceMessages(userId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacher.voiceFailed'));
    } finally {
      setSending(false);
    }
  };

  // Playback for voice messages
  const handlePlayVoice = async (item: any) => {
    if (playingId === item.id) {
      // Stop
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setPlayingId(null);
      return;
    }

    const audioUri = item.audio_url || item.audio_data;
    if (!audioUri) {
      Alert.alert(t('common.warning'), t('teacher.noVoiceRecording'));
      return;
    }

    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (Platform.OS === 'web') {
        const audio = new window.Audio(audioUri);
        audio.addEventListener('ended', () => { setPlayingId(null); soundRef.current = null; });
        // Cover load/decode/CORS failures — without this the UI gets stuck in
        // the "playing" state forever when the browser silently drops the track.
        audio.addEventListener('error', () => { setPlayingId(null); soundRef.current = null; });
        // Install the stop handle + playingId BEFORE awaiting play(). Otherwise
        // a rapid second tap during the play() await falls through the
        // `if (soundRef.current)` cleanup in handlePlayVoice and stacks a second
        // HTMLAudioElement, causing overlapping playback that can't be stopped.
        soundRef.current = { stopAsync: async () => audio.pause(), unloadAsync: async () => { audio.pause(); audio.src = ''; } } as any;
        setPlayingId(item.id);
        try {
          await audio.play();
        } catch (playErr) {
          // Autoplay policy / unsupported codec — clean up state that the
          // error event may not fire for, then rethrow so the outer catch
          // shows the user-facing alert.
          setPlayingId(null);
          soundRef.current = null;
          throw playErr;
        }
      } else {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setPlayingId(null);
              sound.unloadAsync();
              soundRef.current = null;
            }
          }
        );
        soundRef.current = sound;
        setPlayingId(item.id);
      }
    } catch (err: any) {
      console.error('voice play error:', err);
      Alert.alert(t('common.error'), err?.message || t('teacher.voicePlayFailed'));
      setPlayingId(null);
    }
  };

  // Date label for "إلى X · منذ Y" subtitle
  const formatRelative = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return t('common.now', { defaultValue: 'الآن' });
    if (diffMin < 60) return `منذ ${diffMin} د`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `منذ ${diffHr} س`;
    const diffDay = Math.floor(diffHr / 24);
    return `منذ ${diffDay} ي`;
  };

  // Stable heights per message — deterministic, no Math.random.
  const waveformHeights = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const msg of voiceMessages) {
      const incoming: number[] | undefined = Array.isArray(msg.waveform) ? msg.waveform : undefined;
      map[msg.id] = incoming && incoming.length > 0 ? incoming : deterministicWaveform(msg.id);
    }
    return map;
  }, [voiceMessages]);

  const confirmDeleteVoice = async () => {
    if (!pendingDelete || !userId) return;
    const item = pendingDelete;
    try {
      await api.deleteVoiceMessage(item.id, userId);
      await loadVoiceMessages(userId);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'تعذّر حذف الرسالة');
    }
  };

  if (!isEnabled) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <TeacherInnerHero title={t('teacherVoice.recordVoiceMessage', { defaultValue: 'الصوت' })} fallbackRoute="/(teacher)/services" />
        <View style={styles.centerEmpty}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="lock-closed" size={36} color={tokens.color.text3} />
          </View>
          <Text style={styles.emptyTitle}>{t('teacher.featureDisabled', { defaultValue: 'هذه الميزة غير مفعّلة' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title={t('teacherVoice.recordVoiceMessage', { defaultValue: 'الصوت' })} fallbackRoute="/(teacher)/services" />

      {/* Target chips row — drives selectedTarget for the inline list view (keeps existing state). */}
      <View style={styles.chipsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <FilterChip
            label={t('teacher.allStudents')}
            active={selectedTarget === 'all'}
            onPress={() => setSelectedTarget('all')}
          />
          {classes.map((cls: any) => (
            <FilterChip
              key={cls.id}
              label={cls.name || t('common.class')}
              active={selectedTarget === cls.id}
              onPress={() => setSelectedTarget(cls.id)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.brand500} />}
        contentContainerStyle={{ paddingHorizontal: tokens.spacing[4], paddingTop: tokens.spacing[3], paddingBottom: 120 }}
      >
        {voiceMessages.length === 0 ? (
          <View style={styles.centerEmpty}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="mic-outline" size={36} color={tokens.color.text3} />
            </View>
            <Text style={styles.emptyTitle}>{t('teacherVoice.noVoiceMessages')}</Text>
          </View>
        ) : (
          voiceMessages.map((item: any) => {
            const duration = item.duration || 0;
            const isPlaying = playingId === item.id;
            const heights = waveformHeights[item.id] || deterministicWaveform(item.id);
            const targetName = item.target_name || t('common.class');
            const subtitle = `إلى ${targetName} · ${formatRelative(item.created_at)}`;
            return (
              <Pressable
                key={item.id}
                onPress={() => handlePlayVoice(item)}
                onLongPress={() => setPendingDelete(item)}
                style={styles.voiceRow}
              >
                {/* Left circle play button — gradient brand idle, danger playing */}
                <View style={[styles.playCircle, isPlaying ? tokens.shadow.danger : tokens.shadow.brand]}>
                  <LinearGradient
                    colors={isPlaying ? tokens.gradient.danger : tokens.gradient.brand}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.playCircleGradient}
                  >
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#fff" />
                  </LinearGradient>
                </View>

                {/* Body — subtitle + 20-bar waveform */}
                <View style={styles.voiceBody}>
                  <Text style={styles.voiceSubtitle} numberOfLines={1}>{subtitle}</Text>
                  <View style={styles.waveform}>
                    {heights.map((h, i) => (
                      <View
                        key={i}
                        style={[
                          styles.waveBar,
                          {
                            height: h,
                            backgroundColor: isPlaying ? tokens.color.danger : tokens.color.brand500,
                            opacity: isPlaying ? 1 : 0.45,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Right duration mm:ss */}
                <Text style={styles.voiceDuration}>{formatTime(duration)}</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* FAB — opens the recorder sheet */}
      <FAB
        icon="mic"
        gradient="danger"
        accessibilityLabel={t('teacherVoice.recordVoiceMessage')}
        onPress={() => setRecorderOpen(true)}
      />

      {/* Recording sheet — recorder UI lives here. Audio.Recording / waveAnimations / timer all preserved. */}
      <SwipeableSheet
        visible={recorderOpen}
        onClose={() => {
          if (isRecording) return; // Don't dismiss mid-recording — user must tap stop first.
          setRecorderOpen(false);
        }}
        maxHeight={0.85}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>{t('teacherVoice.recordVoiceMessage')}</Text>

          {/* Timer */}
          <Text style={[styles.timerText, isRecording && styles.timerTextActive]}>
            {formatTime(recordSeconds)}
          </Text>

          {/* Waveform visualization while recording (intentional Math.random). */}
          {isRecording && (
            <View style={styles.waveformRecording}>
              {waveAnimations.map((anim, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.waveBarRecording,
                    { height: anim, backgroundColor: tokens.color.danger },
                  ]}
                />
              ))}
            </View>
          )}

          {/* Big mic button */}
          <TouchableOpacity
            style={styles.micBtn}
            onPress={toggleRecording}
            activeOpacity={0.8}
          >
            {isRecording && <View style={styles.micPulse} />}
            <LinearGradient
              colors={isRecording ? tokens.gradient.danger : tokens.gradient.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.micBtnInner}
            >
              <Ionicons name={isRecording ? 'stop' : 'mic'} size={36} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Status hint */}
          {recordingUri && !isRecording ? (
            <View style={styles.recordedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={tokens.color.success} />
              <Text style={styles.recordedBadgeText}>
                {t('teacherVoice.recorded', { time: formatTime(recordSeconds) })}
              </Text>
            </View>
          ) : (
            <Text style={styles.micHint}>
              {isRecording ? t('teacher.pressToStop') : t('teacher.pressToRecord')}
            </Text>
          )}

          {/* Target chips (sheet bottom) */}
          <Text style={styles.fieldLabel}>{t('teacherVoice.sendTo')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <FilterChip
              label={t('teacher.allStudents')}
              active={selectedTarget === 'all'}
              onPress={() => setSelectedTarget('all')}
            />
            {classes.map((cls: any) => (
              <FilterChip
                key={cls.id}
                label={cls.name || t('common.class')}
                active={selectedTarget === cls.id}
                onPress={() => setSelectedTarget(cls.id)}
              />
            ))}
          </ScrollView>

          <View style={styles.sheetSendWrap}>
            <PrimaryButton
              label={sending ? t('common.sending', { defaultValue: 'جاري الإرسال…' }) : t('common.send')}
              icon="send"
              fullWidth
              loading={sending}
              disabled={isRecording || !recordingUri}
              onPress={handleSend}
            />
          </View>
        </View>
      </SwipeableSheet>

      {/* Confirm delete sheet — destructive, calls existing api.deleteVoiceMessage */}
      <ConfirmSheet
        visible={!!pendingDelete}
        destructive
        title="حذف الرسالة الصوتية"
        message="هل تريد حذف هذه الرسالة؟ لن يعود الطلاب قادرين على الاستماع إليها."
        confirmLabel="حذف"
        onConfirm={confirmDeleteVoice}
        onClose={() => setPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },

  chipsBar: {
    backgroundColor: tokens.color.bg,
    paddingTop: tokens.spacing[3],
  },
  chipsRow: {
    paddingHorizontal: tokens.spacing[4],
    gap: tokens.spacing[2],
    flexDirection: 'row',
  },

  // Empty state
  centerEmpty: { alignItems: 'center', paddingTop: 60 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: tokens.spacing[3],
  },
  emptyTitle: { fontSize: tokens.font.size.lg, color: tokens.color.text2, fontWeight: tokens.font.weight.semi },

  // Voice list row
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[3],
    marginBottom: tokens.spacing[2],
    borderWidth: 1,
    borderColor: tokens.color.border2,
    gap: tokens.spacing[3],
    ...tokens.shadow.xs,
  },
  playCircle: {
    width: 48, height: 48, borderRadius: 24,
    overflow: 'hidden',
  },
  playCircleGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  voiceSubtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
    textAlign: 'right',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 26,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  voiceDuration: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
    fontVariant: ['tabular-nums'],
    minWidth: 44,
    textAlign: 'left',
  },

  // ── Recording sheet
  sheetContent: {
    paddingHorizontal: tokens.spacing[5],
    paddingBottom: tokens.spacing[5],
    paddingTop: tokens.spacing[3],
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'center',
    marginBottom: tokens.spacing[3],
  },
  timerText: {
    fontSize: 32,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text3,
    marginBottom: tokens.spacing[4],
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontVariant: ['tabular-nums'],
  },
  timerTextActive: {
    color: tokens.color.danger,
  },
  micBtn: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[3],
  },
  micPulse: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(220,38,38,0.15)',
  },
  micBtnInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micHint: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    fontWeight: tokens.font.weight.semi,
    marginBottom: tokens.spacing[4],
  },
  waveformRecording: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 40,
    marginBottom: tokens.spacing[3],
  },
  waveBarRecording: {
    width: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
  recordedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.color.successBg,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: tokens.spacing[4],
  },
  recordedBadgeText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.success,
  },
  fieldLabel: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[2],
    alignSelf: 'flex-end',
  },
  sheetSendWrap: {
    width: '100%',
    marginTop: tokens.spacing[4],
  },
});
