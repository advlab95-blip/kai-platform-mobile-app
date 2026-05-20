/**
 * VoiceMessageBubble — play/pause control for a voice message inside a chat
 * bubble. Owns the expo-av Sound lifecycle and a global "currently playing"
 * coordination via a shared singleton ref so a new tap stops the previous one.
 *
 * Renders nothing of its own beyond the play button + waveform + duration —
 * the parent bubble decides background colour, alignment, and bubble radius.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { tokens } from '../../constants/designTokens';

// Module-scoped singleton: only one voice message plays at a time across the
// app. When a new bubble starts, it asks the previous one (via callback) to
// stop. Avoids an external store for a one-purpose coordination point.
let currentStop: (() => Promise<void>) | null = null;

type Props = {
  audioUrl: string;
  duration?: number | null;
  /** White-on-coloured (own bubble) vs default text colour (other bubble). */
  variant?: 'me' | 'other';
  /** Tint colour for the play button — defaults match each variant. */
  accentColor?: string;
};

export default function VoiceMessageBubble({ audioUrl, duration, variant = 'other', accentColor }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop + free on unmount.
  useEffect(() => {
    return () => {
      void unloadSelf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unloadSelf = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = '';
        webAudioRef.current = null;
      }
    } catch {}
    setIsPlaying(false);
    if (currentStop === unloadSelf) currentStop = null;
  }, []);

  const play = useCallback(async () => {
    if (!audioUrl) { Alert.alert('خطأ', 'لا يوجد تسجيل'); return; }
    // Stop any other voice currently playing.
    if (currentStop && currentStop !== unloadSelf) {
      await currentStop().catch(() => {});
    }
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        const audio = new window.Audio(audioUrl);
        audio.addEventListener('ended', () => { setIsPlaying(false); webAudioRef.current = null; if (currentStop === unloadSelf) currentStop = null; });
        audio.addEventListener('error', () => { setIsPlaying(false); webAudioRef.current = null; if (currentStop === unloadSelf) currentStop = null; });
        webAudioRef.current = audio;
        currentStop = unloadSelf;
        setIsPlaying(true);
        await audio.play();
      } else {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlaying(false);
              sound.unloadAsync().catch(() => {});
              soundRef.current = null;
              if (currentStop === unloadSelf) currentStop = null;
            }
          },
        );
        soundRef.current = sound;
        currentStop = unloadSelf;
        setIsPlaying(true);
      }
    } catch (err: any) {
      console.error('[voice-bubble] play failed', err);
      Alert.alert('خطأ', err?.message || 'فشل التشغيل');
      setIsPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [audioUrl, unloadSelf]);

  const pause = useCallback(async () => {
    await unloadSelf();
  }, [unloadSelf]);

  const isMe = variant === 'me';
  const tint = accentColor || (isMe ? '#fff' : tokens.color.brand500);
  const barColor = isMe ? 'rgba(255,255,255,0.7)' : tokens.color.brand500;
  const timeColor = isMe ? 'rgba(255,255,255,0.85)' : tokens.color.text3;

  const formatted = (() => {
    const s = Math.max(0, Math.floor(duration || 0));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  })();

  return (
    <View style={s.row}>
      <TouchableOpacity
        onPress={isPlaying ? pause : play}
        style={[s.playBtn, { borderColor: tint }, isMe && s.playBtnMe]}
        accessibilityLabel={isPlaying ? 'إيقاف' : 'تشغيل'}
      >
        {loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color={tint} />
        )}
      </TouchableOpacity>
      <View style={s.bars}>
        {Array.from({ length: 18 }).map((_, i) => (
          <View key={i} style={[s.bar, { backgroundColor: barColor, height: 4 + ((i * 13) % 14) }]} />
        ))}
      </View>
      <Text style={[s.time, { color: timeColor }]}>{formatted}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  playBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  playBtnMe: { backgroundColor: 'rgba(255,255,255,0.08)' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 22 },
  bar: { width: 2.5, borderRadius: 1.5 },
  time: { fontSize: 11, fontWeight: '600', minWidth: 36, textAlign: 'left' },
});
