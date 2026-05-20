import React, { useEffect, useRef, useState } from 'react';
import { View, Text, I18nManager, Platform, AppState, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../stores/authStore';
import useDataStore from '../stores/dataStore';
import useNotificationStore from '../stores/notificationStore';
import useFeatureFlagsStore from '../stores/featureFlagsStore';
import usePresenceStore from '../stores/presenceStore';
import useConnectivityStore from '../stores/connectivityStore';
import OfflineBanner from '../components/shared/OfflineBanner';
import ErrorBoundary from '../components/shared/ErrorBoundary';
import AdOverlay from '../components/shared/AdOverlay';
import QuickAnnouncementPopup from '../components/shared/QuickAnnouncementPopup';
import { InteractionsProvider } from '../contexts/InteractionsContext';
import { initInteractions } from '../utils/initInteractions';

// Run once at module evaluation — installs tone-aware haptics on Alert.alert globally.
initInteractions();
import { ThemeProvider } from '../contexts/ThemeContext';
import { QueryProvider } from '../providers/QueryProvider';
import '../i18n';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { invalidate as invalidateCache } from '../utils/queryCache';
import { performLogout } from '../utils/logout';
import {
  registerForPushNotifications,
  removePushToken,
  setBadgeCount,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from '../services/pushNotifications';

// Force RTL for Arabic. On native, forceRTL only takes effect after an app reload — we trigger one
// on first launch so users aren't stuck with LTR layout.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  if (Platform.OS !== 'web') {
    // Fire-and-forget; dynamic import avoids crashing on web which doesn't ship expo-updates
    import('expo-updates')
      .then((m) => m?.reloadAsync?.())
      .catch(() => { /* silent — user can manually restart */ });
  }
}

// Maps each role to the route group it's allowed to occupy. A role not present
// here (or an authed user whose stored role doesn't match their current
// segment) is redirected to the correct group. Prevents deep-link crossover
// where, e.g., a student lands on `/(admin)/users` and the screen renders
// because the layout only checked "logged in" — RLS would still block the
// queries, but relying solely on RLS is thin defense-in-depth. The guard
// below closes the client side.
const ROLE_GROUP: Record<string, string> = {
  platform_admin: '(admin)',
  admin: '(admin)',
  institute: '(institute)',
  teacher: '(teacher)',
  student: '(student)',
  parent: '(parent)',
  cafeteria: '(cafeteria)',
  medical: '(medical)',
};

const PROTECTED_GROUPS = new Set([
  '(admin)', '(teacher)', '(student)', '(parent)',
  '(institute)', '(cafeteria)', '(medical)',
]);

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { role, isInitialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  const currentGroup = segments[0] as string | undefined;
  const inAuthGroup = !!currentGroup && PROTECTED_GROUPS.has(currentGroup);

  // Not logged in but inside a protected screen → go to gate
  useEffect(() => {
    if (isInitialized && !role && inAuthGroup) {
      if (Platform.OS === 'web') {
        window.location.href = '/';
      } else {
        router.replace('/');
      }
    }
  }, [role, isInitialized, inAuthGroup]);

  // Authed user landed on login or root gate → bounce to their role home
  useEffect(() => {
    if (!isInitialized || !role) return;
    const first = (segments[0] as unknown) as string | undefined;
    const onLoginOrGate = !first || first === 'login' || first === 'index';
    if (onLoginOrGate) {
      const target = ROLE_GROUP[role];
      if (target) {
        try { router.replace(`/${target}` as any); } catch {}
      }
    }
  }, [role, isInitialized, segments]);

  // Role-mismatch guard: authed user inside a protected group that doesn't
  // match their role → bounce to their correct group. Blocks deep-link
  // crossover (student pasting /(admin)/users, teacher entering (medical), …).
  // platform_admin is the only role that may traverse all groups; they map to
  // '(admin)' in ROLE_GROUP but we also let them into any group to keep the
  // super-admin UX (which inspects every tenant) working.
  useEffect(() => {
    if (!isInitialized || !role || !inAuthGroup || !currentGroup) return;
    // `role` is typed RoleId which doesn't include platform_admin, but the
    // backend does issue that role. Widen via string compare.
    // 'admin' = platform super-admin in this codebase (per CLAUDE.md memory:
    // "Platform admins MUST have enrollments row with institute_id=NULL, role='admin'").
    // Both must be allowed to cross into /(institute) etc. so the super-admin UX
    // (inspect tenants, manage classes per institute, etc.) works.
    if ((role as string) === 'platform_admin' || (role as string) === 'admin') return;
    const allowedGroup = ROLE_GROUP[role];
    if (!allowedGroup) {
      // Unknown role → treat as unauthenticated.
      if (Platform.OS === 'web') window.location.href = '/';
      else router.replace('/');
      return;
    }
    if (currentGroup !== allowedGroup) {
      try { router.replace(`/${allowedGroup}` as any); } catch {}
    }
  }, [role, isInitialized, currentGroup, inAuthGroup]);

  if (!isInitialized) return <>{children}</>;

  return <>{children}</>;
}

// Runs detectInstitute() for ALL roles as soon as user is logged in. Previously this was only
// called from institute/* screens — teachers/students/parents ended up with userInstituteId=null
// which broke every feature that needs multi-tenant scoping (exam create, push, etc.).
function InstituteDetector() {
  const { userId, role } = useAuthStore();
  const { userInstituteId, detectInstitute } = useDataStore();
  useEffect(() => {
    // Admin doesn't have an institute; skip
    if (!userId || !role || role === 'admin') return;
    if (userInstituteId) return;
    detectInstitute(userId).catch(err => console.warn('[InstituteDetector] failed:', err?.message));
  }, [userId, role, userInstituteId]);
  return null;
}

function PushNotificationHandler() {
  const { userId, role } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { addRealtimeNotification, unreadCount, subscribeToRealtime, loadNotifications } =
    useNotificationStore();
  const router = useRouter();
  const pushRegistered = useRef(false);

  // Register push token when user logs in (and institute is resolved for multi-tenant scoping)
  useEffect(() => {
    if (!userId || !role) return;
    // Only register once we know the institute — prevents null institute_id on push_tokens
    // which breaks per-institute push delivery (getTokensForTarget filters by institute_id).
    if (!userInstituteId) return;
    if (pushRegistered.current) return;
    pushRegistered.current = true;

    (async () => {
      await registerForPushNotifications(userId, role, userInstituteId);
      await loadNotifications(userId, role, userInstituteId);
    })();

    // Subscribe to Supabase Realtime for in-app notifications — scoped to this institute
    const unsubscribe = subscribeToRealtime(userId, role, userInstituteId);

    // Realtime feature-flag sync: admin toggles propagate to every user of this
    // institute without requiring navigation or app restart.
    const { subscribeToFlags, loadMyFlags } = useFeatureFlagsStore.getState();
    if (role !== 'admin') {
      loadMyFlags(userInstituteId);
    }
    const unsubscribeFlags = subscribeToFlags(userInstituteId);

    // Presence: joins platform + (if applicable) institute channels. Replaces the dead
    // `active_sessions` heartbeat table — no DB writes, auto-cleanup on disconnect.
    usePresenceStore.getState().joinPresence(
      userId,
      role === 'admin' ? null : userInstituteId,
      role,
    );

    return () => {
      unsubscribe();
      unsubscribeFlags();
      usePresenceStore.getState().leavePresence();
      pushRegistered.current = false;
    };
  }, [userId, role, userInstituteId]);

  // Update badge count when unread changes
  useEffect(() => {
    setBadgeCount(unreadCount);
  }, [unreadCount]);

  // Clear badge when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userId && role) {
        loadNotifications(userId, role);
      }
    });
    return () => subscription.remove();
  }, [userId, role]);

  // Handle foreground notifications (show in-app)
  useEffect(() => {
    const receivedSub = addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      // The notification is already shown by the system
      // We add it to in-app store too
      if (data && userId) {
        addRealtimeNotification({
          id: notification.request.identifier,
          title: notification.request.content.title || '',
          message: notification.request.content.body || '',
          sender_role: 'system',
          sender_id: '',
          sender_name: '',
          recipient_role: role || '',
          recipient_id: userId,
          type: (data.type as string) || 'push',
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    });

    // Route a notification's data payload to the right screen for the current role.
    // Extracted so it can be reused by the cold-start path (getLastNotificationResponseAsync).
    const routeFromData = (data: any) => {
      if (!data || !role) return;
      switch (data.type) {
        case 'absence':
        case 'attendance':
          if (role === 'parent') router.push('/(parent)/attendance' as any);
          else if (role === 'student') router.push('/(student)/index' as any);
          break;
        case 'announcement':
          break;
        case 'message':
          if (role === 'parent') router.push('/(parent)/chat' as any);
          else if (role === 'teacher') router.push('/(teacher)/chat' as any);
          else if (role === 'student') router.push('/(student)/class-chat' as any);
          break;
        case 'exam':
          if (role === 'student') router.push('/(student)/exams' as any);
          else if (role === 'teacher') router.push('/(teacher)/exams' as any);
          else if (role === 'parent') router.push('/(parent)/academic' as any);
          break;
        case 'medical':
          if (role === 'parent') router.push('/(parent)/medical' as any);
          else if (role === 'medical') router.push('/(medical)/records' as any);
          break;
        case 'ai_lesson':
          if (role === 'student') router.push('/(student)/ai' as any);
          break;
        case 'gallery':
        case 'video':
        case 'material':
          if (role === 'student') router.push('/(student)/content' as any);
          break;
        case 'assignment':
        case 'task':
        case 'homework': {
          const id = (data as any)?.assignmentId || (data as any)?.taskId;
          if (role === 'student') {
            if (id) router.push({ pathname: '/(student)/assignments', params: { openAssignmentId: id } } as any);
            else router.push('/(student)/assignments' as any);
          } else if (role === 'teacher') router.push('/(teacher)/assignments' as any);
          break;
        }
        case 'grade':
        case 'grades':
          if (role === 'parent') router.push('/(parent)/grades' as any);
          else if (role === 'student') router.push('/(student)/reports' as any);
          break;
        case 'fee':
        case 'payment':
        case 'fees':
          if (role === 'parent') router.push('/(parent)/finance' as any);
          break;
        case 'voice':
          // Voice is now embedded in chat threads; route legacy voice
          // notifications to the role's chat screen instead.
          if (role === 'student') router.push('/(student)/content?tab=voice' as any);
          else if (role === 'teacher') router.push('/(teacher)/voice' as any);
          else if (role === 'institute' || role === 'admin') router.push('/(institute)/chat' as any);
          break;
        case 'class_chat':
        case 'classChat':
          if (role === 'teacher') router.push('/(teacher)/class-chat' as any);
          else if (role === 'student') router.push('/(student)/class-chat' as any);
          break;
        case 'order':
        case 'cafeteria_order':
          if (role === 'cafeteria') router.push('/(cafeteria)/orders' as any);
          break;
        case 'live':
        case 'stream':
          if (role === 'student') router.push('/(student)/content' as any);
          else if (role === 'teacher') router.push('/(teacher)/live' as any);
          break;
        case 'schedule':
          if (role === 'student') router.push('/(student)/schedule' as any);
          else if (role === 'teacher') router.push('/(teacher)/schedule' as any);
          else if (role === 'parent') router.push('/(parent)/schedule' as any);
          break;
      }
    };

    const responseSub = addNotificationResponseListener((response) => {
      routeFromData(response.notification.request.content.data);
    });

    // Cold-start path: if the user opened the app by tapping a notification,
    // expo-notifications stores that interaction so we can route to it on first
    // mount. Without this, only background-tap routing works — cold launches
    // dropped the user on home regardless of what they tapped.
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last?.notification?.request?.content?.data) {
          // Tiny delay so the navigator is mounted before we push.
          setTimeout(() => routeFromData(last.notification.request.content.data), 250);
        }
      } catch { /* expo-notifications unavailable on web — silent */ }
    })();

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [userId, role]);

  return null;
}

function ConnectivityMonitor() {
  const startMonitoring = useConnectivityStore((s) => s.startMonitoring);

  useEffect(() => {
    const unsubscribe = startMonitoring();
    return unsubscribe;
  }, []);

  return null;
}

function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const { role, isInitialized, logout } = useAuthStore();
  const [isMaintenance, setIsMaintenance] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;
    // One fetch on mount, then a realtime channel. Polling every 60s scales to
    // 600K requests/hour at 10K users — realtime replaces that with a single
    // long-lived connection + push on change only.
    let cancelled = false;
    (async () => {
      try {
        const settings = await api.getSystemSettings();
        if (!cancelled) setIsMaintenance(!!settings.maintenance);
      } catch {
        if (!cancelled) setIsMaintenance(false);
      }
    })();

    // Server-filtered: only the maintenance row is broadcast — every other
    // system_settings change is dropped at the server so 10K clients don't all
    // wake up on unrelated toggles.
    const channel = supabase
      .channel('system-settings-maintenance')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'system_settings',
        filter: 'key=eq.maintenance',
      }, (payload) => {
        const row = (payload.new || payload.old) as any;
        setIsMaintenance(!!(row?.value === true || row?.value === 'true' || row?.value?.enabled === true));
        // Bust the TTL cache so the next getSystemSettings() read reflects the new value
        invalidateCache('system_settings:global');
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [isInitialized]);

  // Show maintenance screen for non-admin users
  if (isMaintenance && role && role !== 'admin') {
    return (
      <SafeAreaView style={maintenanceStyles.container}>
        <View style={maintenanceStyles.content}>
          <Text style={maintenanceStyles.icon}>&#9881;</Text>
          <Text style={maintenanceStyles.title}>المنصة في وضع الصيانة</Text>
          <Text style={maintenanceStyles.subtitle}>نعمل على تحسين المنصة. يرجى المحاولة لاحقاً.</Text>
          <TouchableOpacity
            style={maintenanceStyles.logoutBtn}
            onPress={() => performLogout()}
          >
            <Text style={maintenanceStyles.logoutText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const maintenanceStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 40 },
  icon: { fontSize: 64, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '900', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 30, lineHeight: 22 },
  logoutBtn: { backgroundColor: '#EF4444', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
  logoutText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
    <QueryProvider>
    <ThemeProvider>
    <InteractionsProvider>
    <SafeAreaProvider>
      {/* Translucent so the gradient hero paints under the status bar on
          Android — without this you get a solid dark band above the SafeArea
          on every screen because the OS draws its own #020024 background. */}
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <ConnectivityMonitor />
      <InstituteDetector />
      <PushNotificationHandler />
      <View style={{ flex: 1 }}>
        <OfflineBanner />
        <MaintenanceGuard>
        <AuthGuard>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_left',
              contentStyle: { backgroundColor: '#F8FAFC' },
            }}
          >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="login" options={{ presentation: 'modal' }} />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="(teacher)" />
          <Stack.Screen name="(student)" />
          <Stack.Screen name="(parent)" />
          <Stack.Screen name="(institute)" />
          <Stack.Screen name="(cafeteria)" />
          <Stack.Screen name="(medical)" />
          </Stack>
          {/* Full-screen quick-announcement overlay — appears once per ad on
              foreground/launch for any authenticated role. Sticky-dismissed in
              AsyncStorage so a user only sees each ad once. */}
          <AdOverlay />
          {/* Centered text popup for admin "quick announcements" — distinct
              from AdOverlay (which surfaces admin_ads with image/CTA). Reads
              from `announcements` where is_popup=true, dismissals persisted
              in DB so reinstalling doesn't resurrect old popups. */}
          <QuickAnnouncementPopup />
        </AuthGuard>
        </MaintenanceGuard>
      </View>
    </SafeAreaProvider>
    </InteractionsProvider>
    </ThemeProvider>
    </QueryProvider>
    </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
