import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import useAuthStore from '../stores/authStore';
import useDataStore from '../stores/dataStore';

/**
 * Shape returned by `api.getActivePopup`. Kept narrow on purpose — the popup UI
 * only needs the four user-facing fields plus the id (for dismissal tracking).
 */
export interface PopupAnnouncement {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

// Per-device "seen this session" key — prevents the popup from re-flashing every
// time the app foregrounds within the same session even before the user gets a
// chance to tap dismiss. Cleared on cold launch only.
const SESSION_SEEN_KEY = 'popup_announcement_session_seen_v1';

async function loadSessionSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function markSessionSeen(id: string) {
  try {
    const seen = await loadSessionSeen();
    if (!seen.includes(id)) {
      // Cap list to last 50 entries so AsyncStorage doesn't grow unbounded.
      const next = [...seen, id].slice(-50);
      await AsyncStorage.setItem(SESSION_SEEN_KEY, JSON.stringify(next));
    }
  } catch {
    /* silent — sticky-seen is a UX nicety, not a correctness requirement */
  }
}

/**
 * Drives the quick-announcement popup. Returns the currently-shown popup
 * (or null), plus a dismiss callback that writes both to AsyncStorage
 * (per-session UX) and the DB (permanent, per-user).
 *
 * Triggers a fetch:
 *   1. Once on mount after auth + institute are resolved
 *   2. On every app foreground transition (throttled to once / 60s)
 *
 * Pure: every state change is local; no global store side effects.
 */
export function useQuickAnnouncementPopup() {
  const { userId, role, isInitialized } = useAuthStore();
  const userInstituteId = useDataStore((s) => s.userInstituteId);

  const [popup, setPopup] = useState<PopupAnnouncement | null>(null);
  const [visible, setVisible] = useState(false);
  // Throttle key — prevents the foreground listener from spamming the DB when
  // a user toggles between apps quickly. Mirrors AdOverlay's 60s window.
  const lastCheckRef = useRef<number>(0);
  // Guards against the popup re-mounting (state flip) firing back-to-back
  // queries while the modal is animating out.
  const isFetchingRef = useRef(false);

  const checkForPopup = useCallback(
    async (force = false) => {
      if (!isInitialized) return;
      if (!userId || !role) return;
      // Platform admin has no institute; we still want them to see global popups,
      // so pass null through. Other roles require a resolved institute.
      const isPlatformAdmin = (role as string) === 'admin' || (role as string) === 'platform_admin';
      if (!isPlatformAdmin && !userInstituteId) return;

      if (!force && Date.now() - lastCheckRef.current < 60_000) return;
      if (isFetchingRef.current) return;
      lastCheckRef.current = Date.now();
      isFetchingRef.current = true;

      try {
        const seen = await loadSessionSeen();
        const next = await api.getActivePopup(userId, userInstituteId || null, seen);
        if (!next) return;
        // Mark immediately so a quick second foreground event doesn't re-show
        // before the user has dismissed. handleDismiss writes the permanent
        // DB row separately.
        await markSessionSeen(next.id);
        setPopup(next);
        setVisible(true);
      } catch (err) {
        if (__DEV__) console.warn('[useQuickAnnouncementPopup] check failed:', err);
        // Silent on prod — popup is a best-effort feature, never block on it.
      } finally {
        isFetchingRef.current = false;
      }
    },
    [isInitialized, userId, role, userInstituteId],
  );

  // First fetch after auth + institute are resolved.
  useEffect(() => {
    if (!isInitialized || !userId || !role) return;
    const isPlatformAdmin = (role as string) === 'admin' || (role as string) === 'platform_admin';
    if (!isPlatformAdmin && !userInstituteId) return;
    checkForPopup(true);
  }, [isInitialized, userId, role, userInstituteId, checkForPopup]);

  // Foreground listener — re-checks when the user brings the app forward, so
  // a popup created by the admin while the user was elsewhere can still find
  // them on their next focus. Throttled inside checkForPopup.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkForPopup();
    });
    return () => sub.remove();
  }, [checkForPopup]);

  const handleDismiss = useCallback(async () => {
    const current = popup;
    setVisible(false);
    // Small delay before clearing the popup so the modal animation completes.
    setTimeout(() => setPopup(null), 250);
    if (!current || !userId) return;
    try {
      await api.dismissPopup(userId, current.id);
    } catch (err) {
      if (__DEV__) console.warn('[useQuickAnnouncementPopup] dismiss failed:', err);
      // Session-seen already prevents a re-show this session, so a failed DB
      // write only means the user might see it again on their next cold launch.
    }
  }, [popup, userId]);

  return { popup, visible, dismiss: handleDismiss };
}
