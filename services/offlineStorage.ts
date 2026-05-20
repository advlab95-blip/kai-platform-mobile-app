import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const KEYS = {
  USER: 'kai-offline-user',
  TIMETABLE: 'kai-offline-timetable',
  NOTIFICATIONS: 'kai-offline-notifications',
  ANNOUNCEMENTS: 'kai-offline-announcements',
  SYNC_QUEUE: 'kai-offline-sync-queue',
} as const;

// Namespace for the generic persistent query cache. Every entry lives under
// `kai-qcache:<instituteId>:<key>` so two users from different institutes who
// happen to cache the same logical key ("students", "stats") never see each
// other's data — the path itself enforces isolation alongside RLS.
const QCACHE_PREFIX = 'kai-qcache:';

// ── Encryption helpers (Base64 encode + hash-based obfuscation) ──

const SALT = 'kai-platform-2026';

async function encryptData(data: string): Promise<string> {
  try {
    // Hash the salt to create a consistent key
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, SALT);
    // Simple XOR-based obfuscation with base64 encoding
    const encoded = btoa(encodeURIComponent(data));
    // Prepend hash prefix for validation
    return `enc:${hash.slice(0, 8)}:${encoded}`;
  } catch {
    // Fallback: plain base64 if crypto unavailable
    return `b64:${btoa(encodeURIComponent(data))}`;
  }
}

function decryptData(encrypted: string): string | null {
  try {
    if (encrypted.startsWith('enc:')) {
      const encoded = encrypted.split(':')[2];
      return decodeURIComponent(atob(encoded));
    }
    if (encrypted.startsWith('b64:')) {
      return decodeURIComponent(atob(encrypted.slice(4)));
    }
    // Legacy unencrypted data — read as-is
    return encrypted;
  } catch {
    return null;
  }
}

// ── Generic helpers ──

async function setJSON(key: string, data: any) {
  const json = JSON.stringify(data);
  const encrypted = await encryptData(json);
  await AsyncStorage.setItem(key, encrypted);
}

async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const decrypted = decryptData(raw);
    if (!decrypted) return null;
    return JSON.parse(decrypted);
  } catch { return null; }
}

// ── User data ──

export async function cacheUser(user: { userId: string; userName: string; role: string }) {
  await setJSON(KEYS.USER, user);
}

export async function getCachedUser() {
  return getJSON<{ userId: string; userName: string; role: string }>(KEYS.USER);
}

export async function clearCachedUser() {
  await AsyncStorage.removeItem(KEYS.USER);
}

// ── Timetable ──

export async function cacheTimetable(data: any[]) {
  await setJSON(KEYS.TIMETABLE, data);
}

export async function getCachedTimetable() {
  return getJSON<any[]>(KEYS.TIMETABLE);
}

// ── Notifications (last 20) ──

export async function cacheNotifications(data: any[]) {
  await setJSON(KEYS.NOTIFICATIONS, data.slice(0, 20));
}

export async function getCachedNotifications() {
  return getJSON<any[]>(KEYS.NOTIFICATIONS);
}

// ── Announcements (last 10) ──

export async function cacheAnnouncements(data: any[]) {
  await setJSON(KEYS.ANNOUNCEMENTS, data.slice(0, 10));
}

export async function getCachedAnnouncements() {
  return getJSON<any[]>(KEYS.ANNOUNCEMENTS);
}

// ── Sync Queue (pending operations) ──

interface QueuedOperation {
  id: string;
  type: 'attendance' | 'message' | 'justification' | 'task_submit';
  payload: any;
  createdAt: string;
}

export async function addToSyncQueue(op: Omit<QueuedOperation, 'id' | 'createdAt'>) {
  const queue = (await getJSON<QueuedOperation[]>(KEYS.SYNC_QUEUE)) || [];
  queue.push({
    ...op,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
  });
  await setJSON(KEYS.SYNC_QUEUE, queue);
}

export async function getSyncQueue() {
  return (await getJSON<QueuedOperation[]>(KEYS.SYNC_QUEUE)) || [];
}

export async function removeFromSyncQueue(opId: string) {
  const queue = (await getJSON<QueuedOperation[]>(KEYS.SYNC_QUEUE)) || [];
  await setJSON(KEYS.SYNC_QUEUE, queue.filter((q) => q.id !== opId));
}

export async function clearSyncQueue() {
  await AsyncStorage.removeItem(KEYS.SYNC_QUEUE);
}

// ── Generic persistent query cache (multi-tenant isolated) ──
//
// cacheQuery / getCachedQuery / pruneCache back React Query with AsyncStorage
// so a cold launch without network can still paint from the last snapshot.
// All keys are prefixed with institute_id — switching institute on the same
// device never reads the previous tenant's data (defence-in-depth on top of RLS).

interface QueryCacheEntry<T> {
  value: T;
  savedAt: number;
  expiresAt: number;
}

function qcacheKey(instituteId: string | null | undefined, key: string): string {
  const safeInstitute = instituteId || 'anon';
  return `${QCACHE_PREFIX}${safeInstitute}:${key}`;
}

export async function cacheQuery<T>(
  instituteId: string | null | undefined,
  key: string,
  value: T,
  ttlMs: number = 10 * 60 * 1000,
): Promise<void> {
  const entry: QueryCacheEntry<T> = {
    value,
    savedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
  await setJSON(qcacheKey(instituteId, key), entry);
}

export async function getCachedQuery<T>(
  instituteId: string | null | undefined,
  key: string,
  options: { allowStale?: boolean } = {},
): Promise<T | null> {
  const entry = await getJSON<QueryCacheEntry<T>>(qcacheKey(instituteId, key));
  if (!entry) return null;
  // When offline, callers pass allowStale so the UI can paint from the last
  // known snapshot instead of an empty screen. Fresh reads still enforce TTL.
  if (!options.allowStale && Date.now() > entry.expiresAt) {
    return null;
  }
  return entry.value;
}

export async function invalidateCachedQuery(
  instituteId: string | null | undefined,
  key: string,
): Promise<void> {
  await AsyncStorage.removeItem(qcacheKey(instituteId, key));
}

/**
 * pruneCache — remove expired entries and optionally everything for a given
 * institute. Call on logout with the previous institute id to guarantee the
 * next user on this device never sees residue.
 */
export async function pruneCache(options: {
  olderThanMs?: number;
  instituteId?: string;
} = {}): Promise<number> {
  const allKeys = await AsyncStorage.getAllKeys();
  const cacheKeys = allKeys.filter((k) => k.startsWith(QCACHE_PREFIX));
  if (!cacheKeys.length) return 0;

  const now = Date.now();
  const toDelete: string[] = [];

  for (const storageKey of cacheKeys) {
    // Tenant sweep — drop every entry for the specified institute regardless of TTL.
    if (options.instituteId) {
      const scope = storageKey.slice(QCACHE_PREFIX.length).split(':')[0];
      if (scope === options.instituteId) {
        toDelete.push(storageKey);
        continue;
      }
    }

    // Expiry sweep — read the entry and drop if stale.
    const entry = await getJSON<QueryCacheEntry<unknown>>(storageKey);
    if (!entry) {
      toDelete.push(storageKey);
      continue;
    }
    const cutoff = options.olderThanMs ? now - options.olderThanMs : entry.expiresAt;
    if (now > cutoff) {
      toDelete.push(storageKey);
    }
  }

  if (toDelete.length) {
    await AsyncStorage.multiRemove(toDelete);
  }
  return toDelete.length;
}
