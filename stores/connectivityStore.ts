import { create } from 'zustand';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { processSyncQueue } from '../services/syncManager';
import {
  cacheUser, getCachedUser, clearCachedUser,
  cacheTimetable, getCachedTimetable,
  cacheNotifications, getCachedNotifications,
  cacheAnnouncements, getCachedAnnouncements,
  addToSyncQueue, getSyncQueue,
  pruneCache,
} from '../services/offlineStorage';

export type ConnectionStrength = 'fast' | 'slow' | 'offline';

interface ConnectivityState {
  isConnected: boolean;
  connectionStrength: ConnectionStrength;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncResult: { synced: number; failed: number } | null;

  // Connection monitoring
  startMonitoring: () => () => void;
  // Called by api wrapper to classify recent request latency
  reportRequestLatency: (ms: number) => void;

  // Cache operations (write-through: cache when saving online data)
  cacheUserData: (user: { userId: string; userName: string; role: string }) => Promise<void>;
  cacheTimetableData: (data: any[]) => Promise<void>;
  cacheNotificationsData: (data: any[]) => Promise<void>;
  cacheAnnouncementsData: (data: any[]) => Promise<void>;

  // Read cached data (when offline)
  getCachedUserData: () => Promise<{ userId: string; userName: string; role: string } | null>;
  getCachedTimetableData: () => Promise<any[]>;
  getCachedNotificationsData: () => Promise<any[]>;
  getCachedAnnouncementsData: () => Promise<any[]>;

  // Queue operations for offline
  queueOperation: (type: 'attendance' | 'message' | 'justification' | 'task_submit', payload: any) => Promise<void>;
  loadPendingCount: () => Promise<void>;

  // Sync
  syncNow: () => Promise<void>;
  clearOnLogout: (prevInstituteId?: string) => Promise<void>;
}

interface LatencySample { ms: number; at: number; }

// Time-aware rolling window. Stale samples (>60s old) are ignored so past slowness doesn't
// linger. Entering 'slow' requires sustained slowness; exiting requires sustained fastness.
const LATENCY_WINDOW_SIZE = 8;
const LATENCY_TTL_MS = 60_000;
const SLOW_ENTER_MS = 3000;   // Hysteresis: enter slow at >3s
const SLOW_EXIT_MS = 1500;    // Hysteresis: exit slow only when median < 1.5s

function classifyStrength(
  isConnected: boolean,
  samples: LatencySample[],
  effectiveType: string | null,
  prev: ConnectionStrength,
): ConnectionStrength {
  if (!isConnected) return 'offline';
  // NetInfo hint — 2g/3g on cellular is slow in practice (HSPA fallback, slow-2g)
  if (effectiveType === '2g' || effectiveType === 'slow-2g' || effectiveType === '3g') {
    return 'slow';
  }

  const now = Date.now();
  const fresh = samples.filter((s) => now - s.at <= LATENCY_TTL_MS);
  if (fresh.length < 3) return prev === 'offline' ? 'fast' : prev;

  // Median is robust to a single stalled outlier on either side.
  const sorted = [...fresh].map((s) => s.ms).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  if (prev === 'slow') {
    return median < SLOW_EXIT_MS ? 'fast' : 'slow';
  }
  return median > SLOW_ENTER_MS ? 'slow' : 'fast';
}

const useConnectivityStore = create<ConnectivityState>((set, get) => {
  let recentLatencies: LatencySample[] = [];
  let lastEffectiveType: string | null = null;

  const recomputeStrength = (isConnected: boolean) => {
    const prev = get().connectionStrength;
    const strength = classifyStrength(isConnected, recentLatencies, lastEffectiveType, prev);
    if (strength !== prev) {
      set({ connectionStrength: strength });
    }
  };

  return {
  isConnected: true,
  connectionStrength: 'fast',
  pendingCount: 0,
  isSyncing: false,
  lastSyncResult: null,

  startMonitoring: () => {
    // Load initial pending count (fire-and-forget, safe — only sets state)
    get().loadPendingCount().catch(() => {});

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOffline = !get().isConnected;
      const isNowOnline = !!state.isConnected;
      lastEffectiveType = (state.details as any)?.cellularGeneration ?? (state.details as any)?.effectiveType ?? null;

      set({ isConnected: isNowOnline });
      recomputeStrength(isNowOnline);

      // Auto-sync when coming back online
      if (wasOffline && isNowOnline) {
        get().syncNow();
      }
    });

    return unsubscribe;
  },

  reportRequestLatency: (ms) => {
    if (ms < 0 || !Number.isFinite(ms)) return;
    recentLatencies = [
      ...recentLatencies.slice(-(LATENCY_WINDOW_SIZE - 1)),
      { ms, at: Date.now() },
    ];
    recomputeStrength(get().isConnected);
  },

  // ── Cache write-through ──
  cacheUserData: async (user) => {
    await cacheUser(user);
  },

  cacheTimetableData: async (data) => {
    await cacheTimetable(data);
  },

  cacheNotificationsData: async (data) => {
    await cacheNotifications(data);
  },

  cacheAnnouncementsData: async (data) => {
    await cacheAnnouncements(data);
  },

  // ── Read from cache ──
  getCachedUserData: async () => {
    return getCachedUser();
  },

  getCachedTimetableData: async () => {
    return (await getCachedTimetable()) || [];
  },

  getCachedNotificationsData: async () => {
    return (await getCachedNotifications()) || [];
  },

  getCachedAnnouncementsData: async () => {
    return (await getCachedAnnouncements()) || [];
  },

  // ── Queue operations ──
  queueOperation: async (type, payload) => {
    await addToSyncQueue({ type, payload });
    const queue = await getSyncQueue();
    set({ pendingCount: queue.length });
  },

  loadPendingCount: async () => {
    const queue = await getSyncQueue();
    set({ pendingCount: queue.length });
  },

  // ── Sync ──
  syncNow: async () => {
    if (get().isSyncing || !get().isConnected) return;
    set({ isSyncing: true });
    try {
      const result = await processSyncQueue();
      set({ lastSyncResult: result, pendingCount: 0 });
      // Reload pending count (some might have failed)
      await get().loadPendingCount();
    } catch (err) { console.error(err); } finally {
      set({ isSyncing: false });
    }
  },

  clearOnLogout: async (prevInstituteId?: string) => {
    await clearCachedUser();
    // Wipe every persistent query snapshot for the institute the user is
    // leaving so the next account on this device cannot paint from the
    // previous tenant's cached data. Also sweep anything expired.
    try {
      if (prevInstituteId) await pruneCache({ instituteId: prevInstituteId });
      await pruneCache();
    } catch { /* non-fatal — cache pruning is best-effort */ }
    recentLatencies = [];
    lastEffectiveType = null;
    set({ pendingCount: 0, lastSyncResult: null, connectionStrength: 'fast' });
  },
  };
});

export default useConnectivityStore;
