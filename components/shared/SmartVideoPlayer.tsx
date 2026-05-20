import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { isVideoCached, downloadVideo, getLocalVideoPath, updateLastAccessed } from '../../services/videoCache';
import { bunnyService } from '../../services/bunny';
import { api } from '../../services/api';

interface SmartVideoPlayerProps {
  videoId: string;
  bunnyVideoId?: string;
  title: string;
  version?: number;
  studentId?: string;
  instituteId?: string;
  onClose?: () => void;
}

export default function SmartVideoPlayer({
  videoId, bunnyVideoId, title, version = 1,
  studentId, instituteId, onClose,
}: SmartVideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading');
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [watchStart, setWatchStart] = useState(0);
  const [totalWatched, setTotalWatched] = useState(0);
  const autoCacheTriggered = useRef(false);

  useEffect(() => {
    loadVideo();
    setWatchStart(Date.now());
    return () => logWatch();
  }, [videoId]);

  const loadVideo = async () => {
    try {
      // Check cache first
      if (await isVideoCached(videoId, version)) {
        const localPath = getLocalVideoPath(videoId, version);
        setVideoUri(localPath);
        setIsLocal(true);
        setIsCached(true);
        setStatus('playing');
        await updateLastAccessed(videoId);
        return;
      }

      // Stream from Bunny
      if (bunnyVideoId && !bunnyVideoId.startsWith('local_')) {
        const url = bunnyService.getPlayUrl(bunnyVideoId);
        setVideoUri(url);
        setIsLocal(false);
        setIsCached(false);
        setStatus('playing');
        // Background auto-cache on WiFi so re-watches don't hit Bunny again
        triggerAutoCache(url);
        return;
      }

      setStatus('error');
    } catch (err) {
      console.error('[SmartPlayer]:', err);
      setStatus('error');
    }
  };

  // Auto-cache in background on WiFi. First view still streams from Bunny,
  // but the parallel download means views 2..N are served from disk (0 bandwidth).
  // Skipped on cellular to not burn student data, and on web (no FileSystem).
  const triggerAutoCache = async (remoteUrl: string) => {
    if (Platform.OS === 'web') return;
    if (autoCacheTriggered.current) return;
    if (!bunnyVideoId || bunnyVideoId.startsWith('local_')) return;
    try {
      const net = await NetInfo.fetch();
      if (net.type !== 'wifi' || net.isConnected !== true) return;
    } catch { return; }
    autoCacheTriggered.current = true;
    try {
      await downloadVideo(videoId, remoteUrl, version, title);
      setIsCached(true);
      // Keep current streaming source playing; next mount will pick up cache.
    } catch {
      // silent — user still has streaming view
      autoCacheTriggered.current = false;
    }
  };

  const handleDownload = async () => {
    if (!bunnyVideoId || bunnyVideoId.startsWith('local_')) return;
    setIsDownloading(true);
    try {
      const url = bunnyService.getPlayUrl(bunnyVideoId);
      await downloadVideo(videoId, url, version, title, (p) => setDownloadProgress(p));
      setIsCached(true);
      // Switch to local playback
      setVideoUri(getLocalVideoPath(videoId, version));
      setIsLocal(true);
      Alert.alert('تم', 'تم تحميل الفيديو — يمكن مشاهدته بدون إنترنت');
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل التحميل');
    }
    setIsDownloading(false);
  };

  const logWatch = () => {
    if (!studentId || !videoId) return;
    const duration = Math.round((Date.now() - watchStart) / 1000);
    if (duration < 3) return; // Ignore very short views
    api.logVideoWatch(studentId, videoId, duration, duration > 60, isLocal ? 'cache' : 'stream', instituteId).catch(() => {});
  };

  const onPlaybackStatusUpdate = (s: AVPlaybackStatus) => {
    if (s.isLoaded) {
      setTotalWatched(Math.round((s.positionMillis || 0) / 1000));
    }
  };

  if (status === 'error') {
    return (
      <View style={s.container}>
        <View style={s.errorBox}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text style={s.errorText}>الفيديو غير متوفر</Text>
          {onClose && (
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeBtnText}>إغلاق</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* Download button */}
          {!isCached && bunnyVideoId && !bunnyVideoId.startsWith('local_') && (
            <TouchableOpacity onPress={handleDownload} disabled={isDownloading} style={s.headerBtn}>
              {isDownloading ? (
                <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{Math.round(downloadProgress * 100)}%</Text>
              ) : (
                <Ionicons name="download-outline" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          )}
          {isCached && (
            <View style={[s.headerBtn, { backgroundColor: '#059669' }]}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
            </View>
          )}
          {onClose && (
            <TouchableOpacity onPress={() => { logWatch(); onClose(); }} style={s.headerBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
      </View>

      {/* Video */}
      {status === 'loading' ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.loadingText}>جاري التحميل...</Text>
        </View>
      ) : videoUri ? (
        Platform.OS === 'web' && bunnyVideoId && !bunnyVideoId.startsWith('local_') ? (
          // Web: Bunny embed iframe (direct MP4 may be CORS-blocked or wrong quality path)
          <View style={s.video}>
            {React.createElement('iframe' as any, {
              src: bunnyService.getEmbedUrl(bunnyVideoId),
              style: { width: '100%', height: '100%', border: 0 },
              allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture',
              allowFullScreen: true,
            })}
          </View>
        ) : (
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={s.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            onError={(err) => { console.error('[Video error]:', err); setStatus('error'); }}
          />
        )
      ) : null}

      {/* Source indicator */}
      <View style={s.sourceBar}>
        <Ionicons name={isLocal ? 'phone-portrait' : 'cloud'} size={12} color={isLocal ? '#059669' : '#64748B'} />
        <Text style={[s.sourceText, isLocal && { color: '#059669' }]}>
          {isLocal ? 'تشغيل من الجهاز' : 'تشغيل من الإنترنت'}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.7)' },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff', textAlign: 'right', marginLeft: 10 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  video: { flex: 1 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 14 },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 16, color: '#EF4444', fontWeight: '700' },
  closeBtn: { backgroundColor: '#1E293B', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, marginTop: 8 },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sourceBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.7)' },
  sourceText: { fontSize: 10, color: '#64748B', fontWeight: '600' },
});
