import * as Haptics from 'expo-haptics';
import { useInteractions } from '../contexts/InteractionsContext';

export function useHaptics() {
  const { settings } = useInteractions();

  const run = async (fn: () => Promise<void>) => {
    if (!settings.hapticsEnabled) return;
    try { await fn(); } catch {}
  };

  return {
    light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
    medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
    heavy: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
    success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
    warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
    error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
    selection: () => run(() => Haptics.selectionAsync()),
  };
}
