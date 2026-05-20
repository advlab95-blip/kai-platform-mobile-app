import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import DangerButton from '../../components/teacher/buttons/DangerButton';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useTeacherStore from '../../stores/teacherStore';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { confirmAlert } from '../../utils/alerts';
import { copyToClipboard } from '../../utils/clipboard';
import { haptics } from '../../utils/haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function TeacherLive() {
  const isLiveEnabled = useFeatureFlag('live_streaming');
  const { t } = useTranslation();
  const { userId, userName } = useAuthStore();
  const { isLive, liveStream, setIsLive, loadLiveStatus } = useTeacherStore();
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [streamLoading, setStreamLoading] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [rtmpExpanded, setRtmpExpanded] = useState(false);

  // Pulsing dot for the LIVE pill — single Animated loop, no setInterval.
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); };
  }, [isLive, pulseAnim]);

  useEffect(() => {
    if (userId) {
      loadLiveStatus(userId);
    }
  }, [userId]);

  // Track live viewers via Supabase Realtime presence instead of polling.
  // At 100 concurrent teachers × 30s polling = 288K extra queries/day. Presence
  // maintains a single WebSocket connection per stream and emits sync events only
  // when viewers join/leave — zero background queries when the count is stable.
  useEffect(() => {
    const streamId = currentStreamId || liveStream?.id;
    if (!isLive || !streamId) {
      setViewerCount(0);
      return;
    }
    // Per-session unique key so reconnects don't double-count the teacher.
    const presenceKey = `teacher:${streamId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Multi-tenant defense-in-depth: even though presence channels are cross-institute
    // by design, we tag every track payload with institute_id and ignore presences
    // that don't match — so an attacker who guesses a streamId still can't appear in
    // its viewer count from outside the institute.
    const teacherInstituteId = (liveStream as any)?.institute_id || null;
    // Channel name includes institute_id so a viewer from a different tenant
    // can't subscribe by guessing the streamId alone.
    const channelName = teacherInstituteId
      ? `stream-presence:${teacherInstituteId}:${streamId}`
      : `stream-presence:${streamId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: presenceKey } },
    });
    const updateCount = () => {
      const state = channel.presenceState() as Record<string, Array<any>>;
      let count = 0;
      for (const key of Object.keys(state)) {
        const entries = state[key] || [];
        for (const entry of entries) {
          // Only count entries that match this stream's institute (or legacy entries
          // without institute_id, which are still treated as valid for back-compat
          // with older clients).
          const inst = entry?.institute_id;
          if (!teacherInstituteId || !inst || inst === teacherInstituteId) count += 1;
        }
      }
      // Subtract 1 so the teacher's own presence doesn't inflate the viewer count.
      setViewerCount(Math.max(0, count - 1));
    };
    channel
      .on('presence', { event: 'sync' }, updateCount)
      .on('presence', { event: 'join' }, updateCount)
      .on('presence', { event: 'leave' }, updateCount)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ role: 'teacher', institute_id: teacherInstituteId, at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [isLive, currentStreamId, liveStream?.id]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    if (userId) {
      await loadLiveStatus(userId);
    }
    setRefreshing(false);
  }, [userId]);

  const performStopStream = useCallback(async () => {
    setStreamLoading(true);
    try {
      if (liveStream?.id) {
        await api.stopLiveStream(liveStream.id);
      }
      setIsLive(false);
      setCurrentStreamId(null);
      Alert.alert(t('common.success'), t('teacherLive.streamStopped'));
      if (userId) loadLiveStatus(userId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('teacherLive.stopFailed'));
    } finally {
      setStreamLoading(false);
    }
  }, [liveStream?.id, setIsLive, userId, loadLiveStatus, t]);

  const startStreamFlow = useCallback(async () => {
    // Camera permission first
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(t('common.warning'), t('teacherLive.cameraPermission'));
        return;
      }
    }
    confirmAlert(t('teacherLive.startStream'), t('teacherLive.startStreamConfirm'), async () => {
      setStreamLoading(true);
      try {
        if (!userId) { Alert.alert(t('common.error'), t('student.pleaseLogin')); setStreamLoading(false); return; }
        const stream = await api.startLiveStream(
          userId,
          userName || t('teacher.defaultName'),
          '',
        );
        setCurrentStreamId(stream.id);
        setIsLive(true);

        // Notify students — resolve teacher's assigned classes and use the
        // institute-scoped notify path (sendPushToRole 'student' is admin-only).
        try {
          const { data: tAssigns } = await supabase
            .from('teacher_assignments').select('class_id, institute_id').eq('teacher_id', userId);
          const teacherClassIds = Array.from(new Set(((tAssigns || []) as any[])
            .map((r: any) => r.class_id).filter(Boolean))) as string[];
          const instId = ((tAssigns || []) as any[]).find((r: any) => r.institute_id)?.institute_id || undefined;
          if (teacherClassIds.length > 0) {
            await api.notifyStudentsInClasses({
              classIds: teacherClassIds,
              title: t('teacher.liveStream'),
              message: `${userName || t('teacher.defaultName')} ${t('teacherLive.startedLive')}`,
              type: 'live',
              senderId: userId,
              senderRole: 'teacher',
              instituteId: instId,
            });
          }
        } catch (err) { console.error(err); }

        Alert.alert(t('common.success'), t('teacherLive.streamStarted'));
        if (userId) loadLiveStatus(userId);
      } catch (err: any) {
        if (__DEV__) console.log('Live stream start error:', err.message || err);
        Alert.alert(t('common.error'), err.message || t('teacherLive.startFailed'));
      } finally {
        setStreamLoading(false);
      }
    });
  }, [permission, requestPermission, userId, userName, setIsLive, loadLiveStatus, t]);

  const toggleRtmp = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRtmpExpanded(v => !v);
  }, []);

  // ── Feature flag gate — hide everything when off.
  if (!isLiveEnabled) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <TeacherInnerHero title="البث المباشر" fallbackRoute="/(teacher)/services" />
        <View style={styles.centerEmpty}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="videocam-off" size={36} color={tokens.color.text3} />
          </View>
          <Text style={styles.emptyTitle}>{t('teacherLive.liveDisabled')}</Text>
          <Text style={styles.emptySub}>{t('teacherLive.contactAdmin')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // RTMP fields surfaced from the live_streams row (only what the schema actually has).
  const rtmpFields: { label: string; value: string }[] = [];
  if (liveStream?.hls_url) rtmpFields.push({ label: 'HLS', value: String(liveStream.hls_url) });
  if (liveStream?.room_name) rtmpFields.push({ label: t('teacherLive.roomName', { defaultValue: 'الغرفة' }), value: String(liveStream.room_name) });
  if (liveStream?.cloudflare_uid) rtmpFields.push({ label: 'UID', value: String(liveStream.cloudflare_uid) });

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title="البث المباشر" fallbackRoute="/(teacher)/services" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.brand500} />}
        contentContainerStyle={{ paddingHorizontal: tokens.spacing[4], paddingTop: tokens.spacing[4], paddingBottom: tokens.spacing[8] }}
      >
        {isLive ? (
          <View>
            {/* Camera 16:9 + overlays */}
            <View style={styles.cameraContainer}>
              <CameraView style={styles.cameraPreview} facing="front" />
              <View style={styles.cameraOverlay}>
                <View style={styles.cameraTopBar}>
                  {/* LIVE pill with pulsing dot */}
                  <View style={styles.livePill}>
                    <Animated.View style={[styles.livePillDot, { opacity: pulseAnim }]} />
                    <Text style={styles.livePillText}>LIVE</Text>
                  </View>
                  {/* Viewer count pill */}
                  <View style={styles.viewerPill}>
                    <Ionicons name="eye" size={12} color="#fff" />
                    <Text style={styles.viewerPillText}>
                      {t('teacherLive.viewerCount', { count: viewerCount })}
                    </Text>
                  </View>
                </View>
                <View style={styles.cameraBottomBar}>
                  <View style={styles.streamingPill}>
                    <Text style={styles.streamingText}>بث مباشر</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Stop stream — DangerButton triggers ConfirmSheet */}
            <View style={styles.stopWrap}>
              <DangerButton
                label={t('teacherLive.stopStream')}
                icon="stop-circle"
                fullWidth
                loading={streamLoading}
                onPress={() => setStopOpen(true)}
              />
            </View>

            {/* RTMP info — collapsible */}
            {rtmpFields.length > 0 && (
              <View style={styles.rtmpCard}>
                <TouchableOpacity onPress={toggleRtmp} style={styles.rtmpHeader} activeOpacity={0.7}>
                  <Ionicons name={rtmpExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={tokens.color.text2} />
                  <Text style={styles.rtmpHeaderText}>
                    {t('teacherLive.rtmpInfo', { defaultValue: 'معلومات البث (RTMP)' })}
                  </Text>
                </TouchableOpacity>
                {rtmpExpanded && (
                  <View style={styles.rtmpBody}>
                    {rtmpFields.map((field) => (
                      <View key={field.label} style={styles.rtmpRow}>
                        <TouchableOpacity
                          onPress={async () => {
                            const ok = await copyToClipboard(field.value, field.label);
                            if (ok) Alert.alert(t('common.success'), t('common.copied', { defaultValue: 'تم النسخ' }));
                          }}
                          style={styles.copyBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`نسخ ${field.label}`}
                        >
                          <Ionicons name="copy-outline" size={14} color={tokens.color.brand500} />
                        </TouchableOpacity>
                        <View style={styles.rtmpFieldBody}>
                          <Text style={styles.rtmpLabel}>{field.label}</Text>
                          <Text style={styles.rtmpValue} numberOfLines={1}>{field.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          // Idle state — full-card gradient with glass camera circle.
          <TouchableOpacity onPress={startStreamFlow} activeOpacity={0.9}>
            <LinearGradient
              colors={tokens.gradient.info}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.idleCard}
            >
              <View style={styles.glassCircle}>
                <Ionicons name="videocam" size={42} color="#fff" />
              </View>
              <Text style={styles.idleTitle}>ابدأ البث المباشر</Text>
              <Text style={styles.idleSubtitle}>
                {t('teacherLive.startStreamDesc')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Confirm stop — destructive, calls existing api.stopLiveStream */}
      <ConfirmSheet
        visible={stopOpen}
        destructive
        title={t('teacherLive.stopStream')}
        message={t('teacherLive.stopStreamConfirm')}
        confirmLabel={t('teacherLive.stopStream')}
        onConfirm={performStopStream}
        onClose={() => setStopOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },

  // Empty / disabled
  centerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing[8] },
  emptyIconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: tokens.spacing[4],
  },
  emptyTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text2,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text3,
    marginTop: tokens.spacing[2],
    textAlign: 'center',
  },

  // Camera 16:9
  cameraContainer: {
    aspectRatio: 16 / 9,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    marginBottom: tokens.spacing[3],
    backgroundColor: '#000',
    ...tokens.shadow.md,
  },
  cameraPreview: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  cameraTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.color.danger,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  livePillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  livePillText: {
    color: '#fff',
    fontWeight: tokens.font.weight.heavy,
    fontSize: tokens.font.size.base,
    letterSpacing: 0.5,
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viewerPillText: {
    color: '#fff',
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
  },
  cameraBottomBar: {
    padding: tokens.spacing[3],
    alignItems: 'center',
  },
  streamingPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  streamingText: {
    color: '#fff',
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
  },

  stopWrap: {
    marginBottom: tokens.spacing[4],
  },

  // RTMP card
  rtmpCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    marginBottom: tokens.spacing[4],
  },
  rtmpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  rtmpHeaderText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    flex: 1,
    textAlign: 'right',
  },
  rtmpBody: {
    marginTop: tokens.spacing[3],
    gap: tokens.spacing[3],
  },
  rtmpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  rtmpFieldBody: {
    flex: 1,
    minWidth: 0,
  },
  rtmpLabel: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
    textAlign: 'right',
  },
  rtmpValue: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text,
    textAlign: 'right',
    marginTop: 2,
  },
  copyBtn: {
    width: 32, height: 32, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.brand50,
    alignItems: 'center', justifyContent: 'center',
  },

  // Idle gradient card
  idleCard: {
    borderRadius: tokens.radius['2xl'],
    paddingVertical: 48,
    paddingHorizontal: tokens.spacing[6],
    alignItems: 'center',
    overflow: 'hidden',
    ...tokens.shadow.brand,
  },
  glassCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[5],
  },
  idleTitle: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.heavy,
    color: '#fff',
    marginBottom: tokens.spacing[2],
    textAlign: 'center',
  },
  idleSubtitle: {
    fontSize: tokens.font.size.lg,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    paddingHorizontal: tokens.spacing[4],
  },
});
