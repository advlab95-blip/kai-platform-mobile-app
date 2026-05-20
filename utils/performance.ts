/**
 * Performance utilities for smooth UX
 * - Debounced search
 * - FlatList optimization props
 * - Haptic feedback
 */

import { useRef, useCallback, useState } from 'react';
import { Platform } from 'react-native';

// ── Debounced Search Hook ──
export function useDebouncedSearch(delay = 300) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, delay);
  }, [delay]);

  return { query, debouncedQuery, setQuery: handleChange };
}

// ── FlatList Performance Props ──
export const FLATLIST_PERF = {
  removeClippedSubviews: Platform.OS !== 'web',
  maxToRenderPerBatch: 10,
  windowSize: 7,
  initialNumToRender: 8,
  updateCellsBatchingPeriod: 50,
} as const;

// ── Haptic Feedback ──
let Haptics: any = null;
try {
  Haptics = require('expo-haptics');
} catch {}

export function hapticLight() {
  try { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
}

export function hapticMedium() {
  try { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
}

export function hapticSuccess() {
  try { Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
}

export function hapticError() {
  try { Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
}

export function hapticSelection() {
  try { Haptics?.selectionAsync(); } catch {}
}
