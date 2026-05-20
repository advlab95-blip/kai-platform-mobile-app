/**
 * VoiceMessageInput — recording widget that fits inside any chat input bar.
 *
 * Lifecycle:
 *   idle → recording (mic pressed) → preview (stop) → uploading (send) → idle
 *
 * The component owns the entire recording lifecycle (permission, timer,
 * web/native split, cleanup) and only emits a single `onSend({audioUrl, duration})`
 * after Bunny upload succeeds. The parent decides what to do with the URL.
 *
 * `disabled` lets parent screens lock voice when text-write is locked
 * (e.g. teacher disabled student writes in a class chat).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { tokens } from '../../constants/designTokens';
import { bunnyStorage } from '../../services/bunny';
import { haptics } from '../../utils/haptics';

type Props = {
  /** Caller institute (used in folder path; tenant prefix added server-side). */
  instituteId?: string | null;
  /** Caller user id (used in folder path). */
  userId?: string | null;
  /** Disable mic completely — e.g. when chat is write-locked. */
  disabled?: boolean;
  /** Tint colour for the active mic button (matches role accent). */
  accentColor?: string;
  /** Fired after upload + back-end save succeed. */
  onSend: (payload: { audioUrl: string; duration: number }) => Promise<void> | void;
};

export default function VoiceMessageInput({
  instituteId, userId, disabled, accentColor, onSend,
}: Props) {
  const tint = accentColor || tokens.color.brand500;

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Web fallbacks — RN doesn't have MediaRecorder, but expo-av's web shim
  // covers most cases. We still keep a manual MediaRecorder path for Safari/PWA
  // resilience, mirroring app/(institute)/voice.tsx.
  const webMediaRecorderRef = useRef<any>(null);
  const webMediaStreamRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);

  const waveAnimations = useMemo(
    () => Array.from({ length: 8 }, () => new Animated.Value(4)),
    [],
  );

  // Recording timer — stops at 5 min hard cap (300s) to avoid runaway uploads.
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 299) { stopRecording(); return 300; }
          return s + 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // Animated waveform bars while recording.
  useEffect(() => {
    if (!isRecording) {
      waveAnimations.forEach((a) =>
        Animated.timing(a, { toValue: 4, duration: 200, useNativeDriver: false }).start(),
      );
      return;
    }
    const animations = waveAnimations.map((anim) => {
      const animate = () => {
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 6 + Math.random() * 18,
            duration: 150 + Math.random() * 200,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 3 + Math.random() * 8,
            duration: 150 + Math.random() * 200,
            useNativeDriver: false,
          }),
        ]).start(() => {
          if (recordingRef.current || webMediaRecorderRef.current) animate();
        });
      };
      animate();
      return anim;
    });
    return () => animations.forEach((a) => a.stopAnimation());
  }, [isRecording, waveAnimations]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
      try { webMediaStreamRef.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
      if (recordedUri && recordedUri.startsWith('blob:')) {
        try { URL.revokeObjectURL(recordedUri); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    if (disabled || uploading) return;
    try {
      if (Platform.OS === 'web') {
        if (!(navigator as any).mediaDevices?.getUserMedia) {
          Alert.alert('خطأ', 'المتصفح لا يدعم التسجيل الصوتي');
          return;
        }
        if (typeof (window as any).MediaRecorder === 'undefined') {
          Alert.alert('خطأ', 'المتصفح لا يدعم MediaRecorder');
          return;
        }
        const stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });
        webMediaStreamRef.current = stream;
        webChunksRef.current = [];
        const mr = new (window as any).MediaRecorder(stream);
        mr.ondataavailable = (e: any) => { if (e.data?.size > 0) webChunksRef.current.push(e.data); };
        mr.start();
        webMediaRecorderRef.current = mr;
        setRecordedUri(null);
        setIsRecording(true);
        setRecordSeconds(0);
        return;
      }
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الميكروفون', 'يرجى السماح باستخدام الميكروفون');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setRecordedUri(null);
      setIsRecording(true);
      setRecordSeconds(0);
      haptics.light();
    } catch (err: any) {
      console.error('[voice-input] start failed', err);
      Alert.alert('خطأ', err?.message || 'فشل بدء التسجيل');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    try {
      if (Platform.OS === 'web') {
        const mr = webMediaRecorderRef.current;
        if (mr) {
          await new Promise<void>((resolve) => {
            mr.onstop = () => resolve();
            mr.stop();
          });
          const blob = new Blob(webChunksRef.current, { type: 'audio/webm' });
          const uri = URL.createObjectURL(blob);
          setRecordedUri((prev) => {
            if (prev && prev.startsWith('blob:')) {
              try { URL.revokeObjectURL(prev); } catch {}
            }
            return uri;
          });
        }
        try { webMediaStreamRef.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
        webMediaStreamRef.current = null;
        webMediaRecorderRef.current = null;
        return;
      }
      const rec = recordingRef.current;
      if (rec) {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        setRecordedUri(uri || null);
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordingRef.current = null;
    } catch (err: any) {
      console.warn('[voice-input] stop failed', err?.message);
      Alert.alert('خطأ', 'فشل إيقاف التسجيل');
    }
  };

  const cancel = () => {
    if (recordedUri && recordedUri.startsWith('blob:')) {
      try { URL.revokeObjectURL(recordedUri); } catch {}
    }
    setRecordedUri(null);
    setRecordSeconds(0);
  };

  const sendRecording = async () => {
    if (!recordedUri || recordSeconds < 1) return;
    setUploading(true);
    try {
      const remotePath = `voice/${instituteId || 'unknown'}/${userId || 'unknown'}/${Date.now()}.m4a`;
      const audioUrl = await bunnyStorage.uploadFile(recordedUri, remotePath);
      await onSend({ audioUrl, duration: recordSeconds });
      if (recordedUri.startsWith('blob:')) {
        try { URL.revokeObjectURL(recordedUri); } catch {}
      }
      setRecordedUri(null);
      setRecordSeconds(0);
      haptics.success();
    } catch (err: any) {
      console.error('[voice-input] send failed', err);
      Alert.alert('خطأ', err?.message || 'فشل الإرسال');
    } finally {
      setUploading(false);
    }
  };

  // ── Preview state: show waveform + delete + send ──────────────────────────
  if (recordedUri) {
    return (
      <View style={s.previewWrap}>
        <TouchableOpacity onPress={cancel} disabled={uploading} style={s.deleteBtn} accessibilityLabel="حذف التسجيل">
          <Ionicons name="trash-outline" size={18} color={tokens.color.danger} />
        </TouchableOpacity>
        <View style={s.previewBars}>
          {Array.from({ length: 14 }).map((_, i) => (
            <View key={i} style={[s.previewBar, { backgroundColor: tint, height: 4 + ((i * 7) % 16) }]} />
          ))}
        </View>
        <Text style={s.previewTime}>{formatDuration(recordSeconds)}</Text>
        <TouchableOpacity
          onPress={sendRecording}
          disabled={uploading}
          style={[s.sendBtn, { backgroundColor: tint }, uploading && { opacity: 0.6 }]}
          accessibilityLabel="إرسال التسجيل"
        >
          {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    );
  }

  // ── Recording state: show waveform + timer + stop ─────────────────────────
  if (isRecording) {
    return (
      <View style={s.recordingWrap}>
        <TouchableOpacity onPress={stopRecording} style={[s.stopBtn, { backgroundColor: tokens.color.danger }]} accessibilityLabel="إيقاف التسجيل">
          <Ionicons name="stop" size={18} color="#fff" />
        </TouchableOpacity>
        <View style={s.recordingBars}>
          {waveAnimations.map((anim, i) => (
            <Animated.View key={i} style={[s.bar, { height: anim, backgroundColor: tokens.color.danger }]} />
          ))}
        </View>
        <Text style={s.recordingTime}>{formatDuration(recordSeconds)}</Text>
      </View>
    );
  }

  // ── Idle state: just the mic button (sits inside the parent input bar) ────
  return (
    <TouchableOpacity
      onPress={startRecording}
      disabled={disabled}
      style={[s.micBtn, disabled && { opacity: 0.4 }]}
      accessibilityLabel="تسجيل رسالة صوتية"
    >
      <Ionicons name="mic" size={20} color={tint} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  micBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface2,
  },
  recordingWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.pill,
  },
  stopBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  recordingBars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 },
  bar: { width: 3, borderRadius: 2 },
  recordingTime: { fontSize: 13, fontWeight: '700', color: tokens.color.danger, minWidth: 44, textAlign: 'center' },

  previewWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.pill,
  },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface,
  },
  previewBars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 },
  previewBar: { width: 3, borderRadius: 2 },
  previewTime: { fontSize: 12, fontWeight: '700', color: tokens.color.text2, minWidth: 40, textAlign: 'center' },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});
