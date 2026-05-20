import { Platform } from 'react-native';
import { router } from 'expo-router';
import useAuthStore from '../stores/authStore';
import useFeatureFlagsStore from '../stores/featureFlagsStore';

/**
 * Unified logout flow used by every role's settings/home screens.
 *
 * Why navigate BEFORE awaiting cleanup:
 * The previous order (await cleanup → navigate) blocked the user inside the
 * post-modal teardown window for up to 3s while supabase.signOut + push
 * token removal finished. During that window, expo-router's navigation
 * dispatched from inside a closing Modal could be silently dropped, leaving
 * the user stuck on the role's tabs (e.g. /(student)/content) instead of
 * the gate. Navigating first, then cleaning up in the background, makes the
 * navigation atomic with the state wipe and removes the race entirely.
 *
 * Flag-leak safety: feature flags are reset SYNCHRONOUSLY before navigation
 * so a freshly logged-in tenant cannot inherit the previous user's flags
 * even if the rest of cleanup is still in flight.
 */
export async function performLogout() {
  // 1) Sync flag reset — must happen before navigation to prevent cross-tenant flag leak.
  try { useFeatureFlagsStore.getState().reset(); } catch { /* ignore */ }

  // 2) Kick off async cleanup (supabase.signOut + cache + push token + per-role stores).
  //    logout() captures userId itself before wiping state, so the push-token row
  //    for the previous user is removed correctly. Pre-wiping here would null out
  //    that capture and leave the previous user's push token in the DB.
  //    Fire-and-forget — navigation must not wait on it. Errors are swallowed; the
  //    state wipe + navigation are what matters from a UX standpoint.
  const cleanupPromise = (useAuthStore.getState().logout?.() ?? Promise.resolve())
    .catch(() => { /* swallow — logout() already logs internally in dev */ });

  if (Platform.OS === 'web') {
    try {
      Object.keys(window.localStorage || {}).forEach(k => {
        if (k.startsWith('sb-') || k === 'kai-role') {
          try { window.localStorage.removeItem(k); } catch {}
        }
      });
    } catch {}
    try { window.location.replace('/'); } catch {
      try { window.location.href = '/'; } catch {}
    }
    return;
  }

  // 4) Navigate immediately. Pop any modals first so router.replace lands on a
  //    clean stack and isn't intercepted by a closing Modal host.
  try { (router as any).dismissAll?.(); } catch { /* dismissAll may not exist on older expo-router */ }
  try { router.replace('/'); } catch {}

  // 5) Defensive re-navigation — multiple bursts because expo-router inside a
  //    Tabs layout sometimes drops the first replace while the Tabs layer is
  //    still unmounting. Empirically a 50/250/600ms cascade catches every
  //    timing window we've seen, including the admin-home case where the
  //    user's name updated but the screen stayed on the dashboard.
  const fire = () => { try { router.replace('/'); } catch {} };
  setTimeout(fire, 50);
  setTimeout(fire, 250);
  setTimeout(fire, 600);

  try {
    await cleanupPromise;
    setTimeout(fire, 1200); // last-chance retry after async cleanup settles
  } catch { /* already swallowed */ }
}
