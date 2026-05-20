import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Sound files are loaded lazily on first use. Wrapped in try/catch so a missing
// MP3 (e.g. user hasn't added the files yet) fails silent instead of crashing
// every button press.
type SoundName = 'click' | 'success' | 'error' | 'whoosh' | 'notification';

const SOUND_FILES: Partial<Record<SoundName, any>> = (() => {
  const out: Partial<Record<SoundName, any>> = {};
  try { out.click = require('../assets/sounds/click.mp3'); } catch {}
  try { out.success = require('../assets/sounds/success.mp3'); } catch {}
  try { out.error = require('../assets/sounds/error.mp3'); } catch {}
  try { out.whoosh = require('../assets/sounds/whoosh.mp3'); } catch {}
  try { out.notification = require('../assets/sounds/notification.mp3'); } catch {}
  return out;
})();

const loaded: Map<SoundName, Audio.Sound> = new Map();

// In-memory cache — updated by InteractionsContext to avoid AsyncStorage reads
// in hot paths (every button press).
let cachedGeneral: boolean | null = null;
let cachedNotif: boolean | null = null;

const STORAGE_KEY = '@interaction_settings';

export function setSoundsEnabledCache(general: boolean, notif: boolean) {
  cachedGeneral = general;
  cachedNotif = notif;
}

async function isEnabled(isNotif = false): Promise<boolean> {
  const cached = isNotif ? cachedNotif : cachedGeneral;
  if (cached !== null) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (isNotif) {
        cachedNotif = p.notificationSoundEnabled !== false;
        return cachedNotif!;
      }
      cachedGeneral = p.soundsEnabled === true;
      return cachedGeneral!;
    }
  } catch {}
  // Defaults: notification sounds on, general click sounds off.
  return isNotif;
}

export const sounds = {
  play: async (name: SoundName, isNotif = false) => {
    if (!(await isEnabled(isNotif))) return;
    const file = SOUND_FILES[name];
    if (!file) return; // MP3 not bundled — silent fail
    try {
      if (!loaded.has(name)) {
        const { sound } = await Audio.Sound.createAsync(file, { volume: 0.5 });
        loaded.set(name, sound);
      }
      const s = loaded.get(name);
      if (s) {
        await s.setPositionAsync(0);
        await s.playAsync();
      }
    } catch { /* silent */ }
  },
  click: () => sounds.play('click'),
  success: () => sounds.play('success'),
  error: () => sounds.play('error'),
  whoosh: () => sounds.play('whoosh'),
  notification: () => sounds.play('notification', true),

  // Free all preloaded Audio.Sound instances. Call on logout or when the app
  // is about to unmount to avoid native memory leaks across long sessions.
  unloadAll: async () => {
    for (const s of loaded.values()) {
      try { await s.unloadAsync(); } catch {}
    }
    loaded.clear();
  },
};
