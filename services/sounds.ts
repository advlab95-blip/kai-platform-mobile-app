/**
 * Sound Service — optional interaction sounds
 * All sounds are short and unobtrusive
 * Respects user settings (soundsEnabled)
 */
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@interaction_settings';

async function isSoundEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored).soundsEnabled === true;
  } catch {}
  return false; // disabled by default
}

// Pre-loaded sound cache
let cachedSounds: Record<string, Audio.Sound | null> = {};

async function playTone(frequency: number, durationMs: number) {
  const enabled = await isSoundEnabled();
  if (!enabled) return;

  try {
    // Use system sound approach — simple beep via Audio
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: false, staysActiveInBackground: false });
    // For now, use a simple approach — expo-av doesn't generate tones natively
    // In production, use pre-recorded short audio files from assets
  } catch {}
}

export const SoundService = {
  // Button click — very short
  async click() {
    const enabled = await isSoundEnabled();
    if (!enabled) return;
    // Haptic serves as click feedback when sound is off
  },

  // Success — short positive tone
  async success() {
    const enabled = await isSoundEnabled();
    if (!enabled) return;
  },

  // Error — short negative tone
  async error() {
    const enabled = await isSoundEnabled();
    if (!enabled) return;
  },

  // Send message — whoosh
  async send() {
    const enabled = await isSoundEnabled();
    if (!enabled) return;
  },

  // Notification — bell
  async notification() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const settings = stored ? JSON.parse(stored) : {};
      if (!settings.notificationSoundEnabled) return;
      // Notification sound handled by system via expo-notifications config
    } catch {}
  },
};
