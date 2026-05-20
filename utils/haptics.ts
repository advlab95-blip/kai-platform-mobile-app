import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory cache so we don't hit AsyncStorage on every button press. The
// InteractionsContext updates this via `setHapticsEnabledCache` whenever the
// user toggles the setting, keeping the two in sync without extra reads.
let cachedEnabled: boolean | null = null;
let pending: Promise<boolean> | null = null;

const STORAGE_KEY = '@interaction_settings';

async function isEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  if (pending) return pending;
  pending = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        cachedEnabled = parsed.hapticsEnabled !== false;
        return cachedEnabled!;
      }
    } catch {}
    cachedEnabled = true;
    return true;
  })();
  const result = await pending;
  pending = null;
  return result;
}

// Called by InteractionsContext.updateSettings so the cache stays fresh without
// each haptic call having to re-read AsyncStorage.
export function setHapticsEnabledCache(value: boolean) {
  cachedEnabled = value;
}

export const haptics = {
  light: async () => {
    if (await isEnabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: async () => {
    if (await isEnabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy: async () => {
    if (await isEnabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  success: async () => {
    if (await isEnabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error: async () => {
    if (await isEnabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
  warning: async () => {
    if (await isEnabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  selection: async () => {
    if (await isEnabled()) Haptics.selectionAsync().catch(() => {});
  },
};
