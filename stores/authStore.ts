import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';
import type { RoleId } from '../types';

// Guards against stacked alerts when multiple expired-token events fire in the
// same tick (Supabase can emit SIGNED_OUT + failed refresh together).
let sessionExpiredAlertShown = false;

// Module-level handle on the onAuthStateChange subscription. initialize() can
// be re-invoked on dev Fast Refresh or React StrictMode double-effect, which
// previously stacked listeners and fired the "session expired" alert N times.
// Keeping a single handle lets us unsubscribe before re-subscribing.
let authSubscription: { unsubscribe: () => void } | null = null;

/**
 * Surface an expiry UI to the user and redirect them back to the sign-in screen.
 * Called from two paths: (1) initialize() when getSession returns an error
 * (refresh token invalid/revoked) and (2) onAuthStateChange('SIGNED_OUT') when
 * auto-refresh fails. Both paths must flush the Zustand state via logout()
 * before the Alert's OK handler, otherwise the AuthGuard won't redirect.
 */
function showSessionExpiredAndRedirect(logout: () => Promise<void>) {
  if (sessionExpiredAlertShown) return;
  sessionExpiredAlertShown = true;
  Alert.alert(
    'انتهت الجلسة',
    'انتهت الجلسة، يرجى إعادة تسجيل الدخول',
    [{
      text: 'موافق',
      onPress: async () => {
        try { await logout(); } catch { /* logout already swallows its own errors */ }
        try {
          // Lazy import keeps the store tree-shakable from non-RN entry points
          // (tests, scripts) that don't have expo-router loaded.
          const { router } = await import('expo-router');
          // This project's sign-in entry is the root '/' role selector — there
          // is no /(auth) group. AuthGuard in app/_layout.tsx also falls back
          // to '/' when userId is null, so this is the canonical redirect.
          router.replace('/');
        } catch {
          // Fallback: AuthGuard in app/_layout.tsx watches userId and redirects
          // to '/' when null, so even if expo-router import fails the user still
          // lands on the login flow.
        } finally {
          sessionExpiredAlertShown = false;
        }
      },
    }],
    { cancelable: false },
  );
}

interface AuthState {
  userId: string | null;
  userName: string;
  role: RoleId | null;
  isLoading: boolean;
  isInitialized: boolean;
  authError: string;

  login: (code: string, role: RoleId) => Promise<boolean>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  setAuthError: (msg: string) => void;
}

async function secureSet(key: string, value: string) {
  if (Platform.OS === 'web') localStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

async function secureGet(key: string) {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureDelete(key: string) {
  if (Platform.OS === 'web') localStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

// Cap any hanging network call at `ms` so a weak connection can't freeze the
// splash screen forever. Throws 'timeout' on expiry; the caller's catch path
// then falls through to the offline-cached-user branch.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms),
    ),
  ]);
}

const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  userName: '',
  role: null,
  isLoading: false,
  isInitialized: false,
  authError: '',

  initialize: async () => {
    // Subscribe to auth state changes so expired tokens trigger a proper logout (flushes stores + UI).
    // If a previous subscription exists (dev Fast Refresh / StrictMode re-invoke), drop it first so
    // we never stack listeners — otherwise one SIGNED_OUT event fires the alert N times.
    if (authSubscription) {
      try { authSubscription.unsubscribe(); } catch { /* ignore */ }
      authSubscription = null;
    }
    const { data: authListener } = supabase.auth.onAuthStateChange((event, _session) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // Guard against recursion: our own logout() calls signOut() which fires SIGNED_OUT.
        // If _loggingOut is set, the user already initiated logout — don't re-enter.
        if (event === 'SIGNED_OUT' && get().userId && !(get() as any)._loggingOut) {
          // Auto-refresh failed (expired/revoked refresh token). Show the user a
          // clear "session expired" message + redirect rather than silently
          // wiping state — otherwise they see a blank screen with no context.
          showSessionExpiredAndRedirect(() => get().logout());
        }
      }
    });
    authSubscription = authListener?.subscription || null;
    try {
      const { data: { session }, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        8000,
        'getSession',
      );
      // If refresh token is invalid, surface it to the user and redirect to login
      // instead of silently proceeding to an anonymous state. Previously this
      // just flipped isInitialized=true and the AuthGuard bounced them to '/'
      // with no explanation — users thought the app crashed.
      if (sessionError) {
        await supabase.auth.signOut().catch((e) => { if (__DEV__) console.warn('[authStore]', e); });
        set({ isInitialized: true });
        showSessionExpiredAndRedirect(() => get().logout());
        return;
      }
      if (session?.user) {
        // getUserProfile now throws on real errors — wrap so initialize() still succeeds on network issues
        let profile: any = null;
        let profileFetchFailed = false;
        try {
          profile = await withTimeout(
            api.getUserProfile(session.user.id),
            8000,
            'getUserProfile',
          );
        } catch { profileFetchFailed = true; /* allow offline fallback below */ }
        // Security: if the fetch succeeded but returned null, this is an orphan
        // auth.users row (public.users was deleted). Sign them out — we can't
        // trust SecureStore's cached role (client-tamperable, especially on web
        // where it's localStorage). Only honor the cache when the fetch outright
        // failed (network), not when it returned "no row".
        if (!profile && !profileFetchFailed) {
          await supabase.auth.signOut().catch((e) => { if (__DEV__) console.warn('[authStore]', e); });
          await secureDelete('kai-role').catch((e) => { if (__DEV__) console.warn('[authStore]', e); });
          set({ isInitialized: true });
          return;
        }
        // Check if account is frozen
        if (profile?.is_frozen) {
          await supabase.auth.signOut().catch((e) => { if (__DEV__) console.warn('[authStore]', e); });
          await secureDelete('kai-role').catch((e) => { if (__DEV__) console.warn('[authStore]', e); });
          set({ isInitialized: true, authError: 'حسابك مجمّد. تواصل مع إدارة المعهد' });
          return;
        }
        // Trust the server-returned profile.role as the canonical source. The
        // SecureStore-cached role is kept as an offline fallback only. On web,
        // SecureStore falls back to localStorage, which is readable/writable
        // via DevTools — preferring savedRole over profile.role here would let
        // an attacker set `kai-role=admin` and reload into the admin segment.
        // AuthGuard's route-match check provides a second layer, but the
        // store itself must stop trusting client-tamperable storage.
        const savedRole = await secureGet('kai-role');
        const effectiveRole: RoleId | null = profile?.role
          ? (profile.role as RoleId)
          : ((savedRole as RoleId) || null);
        // If the cached role disagrees with the server, overwrite it so the
        // next offline-init picks up the right value.
        if (profile?.role && savedRole && savedRole !== profile.role) {
          await secureSet('kai-role', profile.role).catch((e) => { if (__DEV__) console.warn('[authStore]', e); });
        }
        const userData = {
          userId: session.user.id,
          userName: profile?.full_name || '',
          role: effectiveRole,
        };
        set({ ...userData, isInitialized: true });
        // Cache for offline
        const { cacheUser } = await import('../services/offlineStorage');
        await cacheUser(userData);
      } else {
        // Try offline cached user
        const { getCachedUser } = await import('../services/offlineStorage');
        const cached = await getCachedUser();
        if (cached) {
          set({ userId: cached.userId, userName: cached.userName, role: cached.role as RoleId, isInitialized: true });
        } else {
          set({ isInitialized: true });
        }
      }
    } catch {
      // Try offline cached user
      try {
        const { getCachedUser } = await import('../services/offlineStorage');
        const cached = await getCachedUser();
        if (cached) {
          set({ userId: cached.userId, userName: cached.userName, role: cached.role as RoleId, isInitialized: true });
        } else {
          set({ isInitialized: true });
        }
      } catch {
        set({ isInitialized: true });
      }
    }
  },

  login: async (code, role) => {
    set({ isLoading: true, authError: '' });
    try {
      // Rate limiting — 5 attempts per 5 minutes
      const now = Date.now();
      const attempts = (get() as any)._loginAttempts || [];
      const recentAttempts = attempts.filter((t: number) => now - t < 300000);
      if (recentAttempts.length >= 5) {
        set({ authError: 'محاولات كثيرة — انتظر 5 دقائق', isLoading: false });
        return false;
      }
      (set as any)({ _loginAttempts: [...recentAttempts, now] });

      const safeCode = code.trim().toUpperCase();
      if (safeCode.length < 4) {
        set({ authError: 'الرمز قصير جداً', isLoading: false });
        return false;
      }

      // Brute-force pre-check: cheap RPC that counts recent failed attempts
      // by IP and by code, returns a soft lock decision. The local
      // _loginAttempts gate above protects this device; this one protects
      // the platform from distributed attacks against a single code.
      try {
        const { data: bf } = await supabase.rpc('check_brute_force', {
          p_ip: null, p_code: safeCode,
        });
        const lock = bf as any;
        if (lock?.is_locked) {
          const mins = Math.ceil((lock.retry_after_seconds || 60) / 60);
          set({
            authError: `محاولات كثيرة على هذا الرمز — انتظر ${mins} دقيقة`,
            isLoading: false,
          });
          return false;
        }
      } catch { /* RPC unavailable → fail open to not block legitimate logins */ }

      // Login directly with Supabase Auth (no backend needed)
      const email = `${safeCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@kaiplatform.app`;
      const password = safeCode;

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        const isWrongCode = signInError.message?.includes('Invalid login credentials');
        // Log every failure (best-effort, ignore errors). Reason helps when
        // an admin reviews the failed-logins screen to distinguish bad code
        // from upstream Supabase failures.
        if (isWrongCode) {
          supabase.rpc('log_failed_login', {
            p_attempted_code: safeCode,
            p_ip: null,
            p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            p_reason: 'wrong_code',
          }).then(() => {}, () => {});
        }
        if (isWrongCode) {
          set({ authError: 'الرمز غير صحيح', isLoading: false });
        } else if (signInError.message?.includes('fetch') || signInError.message?.includes('network') || signInError.message?.includes('Failed')) {
          set({ authError: 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة وحاول مرة أخرى', isLoading: false });
        } else {
          set({ authError: 'خطأ في تسجيل الدخول — حاول مرة أخرى', isLoading: false });
        }
        return false;
      }

      const userId = signInData.user?.id;
      if (!userId) {
        set({ authError: 'خطأ في تسجيل الدخول', isLoading: false });
        return false;
      }

      // Verify role matches. getUserProfile now throws on real errors (was silently returning null)
      let profile: any = null;
      try {
        profile = await api.getUserProfile(userId);
      } catch (e: any) {
        // Real error (network/RLS) — don't sign out user, let them retry
        set({ authError: 'تعذّر التحقق من الحساب — تأكد من الاتصال', isLoading: false });
        return false;
      }
      // Security: reject orphan auth users (auth.users row exists but public.users
      // was deleted). Previously `if (profile && ...)` skipped the role check when
      // profile was null, letting any orphan log in as ANY requested role.
      if (!profile) {
        await supabase.auth.signOut();
        set({ authError: 'الرمز غير صحيح', isLoading: false });
        return false;
      }
      if (profile.role !== role) {
        await supabase.auth.signOut();
        set({ authError: 'الرمز غير صحيح أو البوابة خاطئة', isLoading: false });
        return false;
      }

      // Platform-admin gate: `role === 'admin'` in users table is also used by
      // institute-level admins. A true platform admin must have an enrollments
      // row with institute_id=NULL. Enforce this so a local admin can't sneak
      // through the secret platform-admin login.
      if (role === 'admin') {
        const { data: platformEnrollment, error: enrollErr } = await supabase
          .from('enrollments')
          .select('id')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .is('institute_id', null)
          .eq('status', 'active')
          .maybeSingle();
        if (enrollErr || !platformEnrollment) {
          await supabase.auth.signOut();
          set({ authError: 'هذا الحساب غير مصرّح له بدخول بوابة الإدارة العامة', isLoading: false });
          return false;
        }
      }

      // Block frozen accounts
      if (profile?.is_frozen) {
        await supabase.auth.signOut();
        set({ authError: 'حسابك مجمّد. تواصل مع إدارة المعهد', isLoading: false });
        return false;
      }

      await secureSet('kai-role', role);

      // Cache for offline
      const userData = { userId, userName: profile?.full_name || '', role };
      try {
        const { cacheUser } = await import('../services/offlineStorage');
        await cacheUser(userData);
      } catch (err) { console.error(err); }

      set({
        userId,
        userName: profile?.full_name || '',
        role,
        isLoading: false,
      });
      return true;
    } catch (err: any) {
      set({
        authError: err.message || 'خطأ في الاتصال بالخادم',
        isLoading: false,
      });
      return false;
    }
  },

  logout: async () => {
    (set as any)({ _loggingOut: true });
    const currentUserId = get().userId;

    // Clear local auth state SYNCHRONOUSLY — before any await — so AuthGuard
    // sees role=null at the moment performLogout fires router.replace('/').
    // Otherwise the dynamic import below yields, performLogout navigates with
    // role still set, and AuthGuard's "authed user on gate" effect bounces
    // the user back to their role group instead of staying on the login gate.
    set({ userId: null, userName: '', role: null, authError: '' });

    // Wrap any promise so it resolves within `ms` instead of hanging forever.
    // Supabase signOut + SecureStore + push token removal all hit the network;
    // on a flaky connection they can block the entire logout flow, leaving the
    // user stuck on a loading spinner.
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | void> =>
      Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]) as Promise<T | void>;

    // Capture institute_id before any store is wiped — clearOnLogout needs it
    // to sweep the persisted query snapshots keyed under this tenant.
    let prevInstituteId: string | undefined;
    try {
      const { default: useDataStore } = await import('./dataStore');
      prevInstituteId = useDataStore.getState().userInstituteId || undefined;
    } catch (e) { if (__DEV__) console.warn('[authStore]', e); }

    // Network-bound ops run in parallel with a 3s ceiling each.
    // Push token removal MUST be awaited (not fire-and-forget) — otherwise a
    // user on a shared device who logs out and another user logs in could
    // receive the previous user's push notifications, since the new login
    // would register a new token while the old token row still points to the
    // previous user_id. 3s ceiling keeps logout snappy on flaky networks.
    await Promise.allSettled([
      withTimeout(supabase.auth.signOut(), 3000).catch((e) => { if (__DEV__) console.warn('[authStore]', e); }),
      withTimeout(secureDelete('kai-role'), 2000).catch((e) => { if (__DEV__) console.warn('[authStore]', e); }),
      (async () => {
        try {
          const { clearAllCache } = await import('../services/cache');
          await withTimeout(clearAllCache(), 2000);
        } catch (e) { if (__DEV__) console.warn('[authStore]', e); }
      })(),
      (async () => {
        try {
          const { clearCachedUser } = await import('../services/offlineStorage');
          await withTimeout(clearCachedUser(), 2000);
        } catch (e) { if (__DEV__) console.warn('[authStore]', e); }
      })(),
      (async () => {
        if (!currentUserId) return;
        try {
          const { removePushToken, setBadgeCount } = await import('../services/pushNotifications');
          await withTimeout(removePushToken(currentUserId), 3000);
          await setBadgeCount(0);
        } catch (e) { if (__DEV__) console.warn('[authStore]', e); }
      })(),
    ]);

    // React Query cache clear is synchronous once imported
    try {
      const { queryClient } = await import('../providers/QueryProvider');
      queryClient.cancelQueries();
      queryClient.clear();
    } catch (e) { if (__DEV__) console.warn('[authStore]', e); }

    // Wipe per-role stores in parallel — none of them touch the network
    await Promise.allSettled([
      (async () => {
        const { default: useStudentStore } = await import('./studentStore');
        (useStudentStore.getState() as any).reset?.() ?? useStudentStore.setState({
          attendanceRecords: [], justifications: [], aiLessons: [], exams: [],
          studentClasses: [], studentSubjects: [], classId: null, selectedClassId: null,
          weeklyTimetable: [], videos: [], materials: [], galleries: [],
          tasks: [], liveStreams: [], voiceMessages: [], manualGrades: [],
          unreadVoiceCount: 0, lastVoiceSeenAt: null,
          currentStudentId: null, selectedSubjectId: null,
        } as any);
      })(),
      (async () => {
        const { default: useTeacherStore } = await import('./teacherStore');
        useTeacherStore.setState({ videos: [], videoTotal: 0, exams: [], galleries: [], materials: [], students: [], classes: [], voiceMessages: [], selectedClass: null, selectedClassId: null, subjects: [], selectedSubject: null, teacherAssignments: [], targets: [], selectedTarget: null, selectedTargets: [], isLive: false, liveStream: null });
      })(),
      (async () => {
        const { default: useParentStore } = await import('./parentStore');
        useParentStore.setState({ children: [], selectedChildId: null, childAttendance: { percentage: 0, present: 0, absent: 0, total: 0 }, childAttendanceRecords: [], childPayments: [], childMedical: null, conversations: [] });
      })(),
      (async () => {
        const { default: useAdminStore } = await import('./adminStore');
        useAdminStore.setState({ pricing: [], pricingData: {}, accountLog: [] });
      })(),
      (async () => {
        const { default: useDataStore } = await import('./dataStore');
        useDataStore.setState({ institutes: [], userInstituteId: null, announcements: [] } as any);
      })(),
      (async () => {
        const { default: useConnectivityStore } = await import('./connectivityStore');
        await useConnectivityStore.getState().clearOnLogout?.(prevInstituteId);
      })(),
      (async () => {
        const { default: useNotificationStore } = await import('./notificationStore');
        useNotificationStore.setState({ notifications: [], unreadCount: 0, isLoading: false } as any);
      })(),
      (async () => {
        const { default: useFeatureFlagsStore } = await import('./featureFlagsStore');
        useFeatureFlagsStore.setState({ myFlags: [], allFlags: [], catalog: [], catalogLoaded: false } as any);
      })(),
      (async () => {
        const { default: useMedicalStore } = await import('./medicalStore');
        useMedicalStore.setState({
          selectedStudent: null, medicalRecord: null,
          stats: { totalStudents: 0, withRecords: 0 },
          searchResults: [], allRecords: [], allStudents: [],
          isLoading: false,
        } as any);
      })(),
      (async () => {
        const { default: useCafeteriaStore } = await import('./cafeteriaStore');
        useCafeteriaStore.setState({
          items: [], orders: [], stats: { todayOrders: 0, totalRevenue: 0 },
          isLoading: false,
        } as any);
      })(),
      (async () => {
        // Presence channels stay subscribed unless explicitly torn down. Without
        // this, on a shared device the next user inherits the previous user's
        // realtime presence subscription (running under their stale auth token)
        // and the `onlineUsers` list leaks across accounts.
        try {
          const { default: usePresenceStore } = await import('./presenceStore');
          usePresenceStore.getState().leavePresence?.();
        } catch (e) { if (__DEV__) console.warn('[authStore] presence cleanup', e); }
      })(),
    ]);

    // Clear the re-entry guard so a subsequent login → logout cycle works
    (set as any)({ _loggingOut: false });
  },

  setAuthError: (msg) => set({ authError: msg }),
}));

export default useAuthStore;
