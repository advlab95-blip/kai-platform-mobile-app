import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { setHapticsEnabledCache } from '../utils/haptics';
import { setSoundsEnabledCache } from '../utils/sounds';

type InteractionSettings = {
  animationsEnabled: boolean;
  hapticsEnabled: boolean;
  soundsEnabled: boolean;
  notificationSoundEnabled: boolean;
};

type InteractionsContextType = {
  settings: InteractionSettings;
  updateSettings: (newSettings: Partial<InteractionSettings>) => Promise<void>;
  reduceMotion: boolean;
};

const DEFAULT_SETTINGS: InteractionSettings = {
  animationsEnabled: true,
  hapticsEnabled: true,
  soundsEnabled: false, // معطّل افتراضياً
  notificationSoundEnabled: true,
};

const STORAGE_KEY = '@interaction_settings';
const InteractionsContext = createContext<InteractionsContextType | null>(null);

export function InteractionsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<InteractionSettings>(DEFAULT_SETTINGS);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    loadSettings();
    checkReduceMotion();
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription?.remove();
  }, []);

  async function loadSettings() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const merged = stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
      setSettings(merged);
      // Prime the util caches so haptics/sounds modules don't hit AsyncStorage on every call.
      setHapticsEnabledCache(merged.hapticsEnabled);
      setSoundsEnabledCache(merged.soundsEnabled, merged.notificationSoundEnabled);
    } catch (e) { if (__DEV__) console.warn(e); }
  }

  async function checkReduceMotion() {
    try {
      const enabled = await AccessibilityInfo.isReduceMotionEnabled();
      setReduceMotion(enabled);
    } catch (e) { if (__DEV__) console.warn(e); }
  }

  async function updateSettings(newSettings: Partial<InteractionSettings>) {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    setHapticsEnabledCache(updated.hapticsEnabled);
    setSoundsEnabledCache(updated.soundsEnabled, updated.notificationSoundEnabled);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch (e) { if (__DEV__) console.warn(e); }
  }

  return (
    <InteractionsContext.Provider value={{ settings, updateSettings, reduceMotion }}>
      {children}
    </InteractionsContext.Provider>
  );
}

export function useInteractions() {
  const ctx = useContext(InteractionsContext);
  if (!ctx) throw new Error('useInteractions must be inside InteractionsProvider');
  return ctx;
}
