/**
 * offlineQueue
 * ---------------------------------------------------------------
 * Singleton offline action queue persisted to AsyncStorage.
 * Used to retry mutations (e.g. assignment submissions) when the
 * device regains connectivity.
 *
 * Scope (intentionally narrow for this pass):
 *   - Only assignment submissions are wired in this pass.
 *   - Other kinds (attendance, grading, …) can register executors
 *     later without touching this file.
 *
 * Storage key: kai:offline_queue:v1
 *
 * Design notes:
 *   - Cap of 50 items, oldest dropped first if exceeded.
 *   - Re-entrancy guard via `flushing` boolean — overlapping flush
 *     calls are no-ops on the second caller.
 *   - Auto-flush on NetInfo `isConnected` rising edge.
 *   - Idempotency relies on caller-supplied `id`.
 *   - Degrades gracefully if AsyncStorage / NetInfo aren't available
 *     at runtime (in-memory queue, no auto-flush).
 */

export type QueueItem = {
  id: string;
  kind: 'assignment_submission' | 'attendance' | string;
  payload: any;
  createdAt: number;
};

const STORAGE_KEY = 'kai:offline_queue:v1';
const MAX_ITEMS = 50;

// ---- Lazy/optional native module loading ---------------------------------
// We don't want a hard crash if these aren't bundled in some build.
let AsyncStorage: any = null;
let NetInfo: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  NetInfo = null;
}

// ---- Internal state -------------------------------------------------------
let memoryQueue: QueueItem[] = [];
let loaded = false;
let flushing = false;
let lastConnected: boolean | null = null;
const executors = new Map<string, (item: QueueItem) => Promise<boolean>>();

async function loadFromStorage(): Promise<void> {
  if (loaded) return;
  loaded = true;
  if (!AsyncStorage) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) memoryQueue = parsed;
    }
  } catch {
    // corrupt / unavailable — start fresh
    memoryQueue = [];
  }
}

async function persist(): Promise<void> {
  if (!AsyncStorage) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memoryQueue));
  } catch {
    // best-effort; ignore write failures
  }
}

// ---- Public API -----------------------------------------------------------

async function enqueue(item: QueueItem): Promise<void> {
  await loadFromStorage();
  // de-dup by id (prevent double-tap from queueing twice)
  const exists = memoryQueue.some(q => q.id === item.id);
  if (exists) return;
  memoryQueue.push(item);
  // cap: drop oldest first
  if (memoryQueue.length > MAX_ITEMS) {
    memoryQueue.splice(0, memoryQueue.length - MAX_ITEMS);
  }
  await persist();
}

async function peek(): Promise<QueueItem[]> {
  await loadFromStorage();
  return memoryQueue.slice();
}

async function clear(): Promise<void> {
  memoryQueue = [];
  await persist();
}

/**
 * flush
 * Iterates over all queued items, calling either the supplied executor
 * (legacy/explicit form) or the registered per-kind executor.
 * Removes items whose executor returns true.
 */
async function flush(
  executor?: (item: QueueItem) => Promise<boolean>
): Promise<{ ok: number; failed: number }> {
  if (flushing) return { ok: 0, failed: 0 };
  flushing = true;
  let ok = 0;
  let failed = 0;
  try {
    await loadFromStorage();
    if (memoryQueue.length === 0) return { ok: 0, failed: 0 };

    const remaining: QueueItem[] = [];
    for (const item of memoryQueue) {
      const fn = executor ?? executors.get(item.kind);
      if (!fn) {
        // no executor registered for this kind → keep it for later
        remaining.push(item);
        continue;
      }
      try {
        const success = await fn(item);
        if (success) {
          ok++;
        } else {
          failed++;
          remaining.push(item);
        }
      } catch {
        failed++;
        remaining.push(item);
      }
    }
    memoryQueue = remaining;
    await persist();
    return { ok, failed };
  } finally {
    flushing = false;
  }
}

function registerExecutor(
  kind: string,
  fn: (item: QueueItem) => Promise<boolean>
): void {
  executors.set(kind, fn);
}

function unregisterExecutor(kind: string): void {
  executors.delete(kind);
}

// ---- NetInfo auto-flush ---------------------------------------------------
// Subscribe once at module init. On rising edge of `isConnected`,
// kick off a flush (no-op if queue empty or another flush in flight).
if (NetInfo && typeof NetInfo.addEventListener === 'function') {
  try {
    NetInfo.addEventListener((state: any) => {
      const isConnected = !!state?.isConnected;
      if (lastConnected === false && isConnected) {
        // rising edge: offline → online
        flush().catch(() => {});
      }
      lastConnected = isConnected;
    });
  } catch {
    // ignore — degrade gracefully
  }
}

// Kick off initial load so peek() / banner can read it immediately.
loadFromStorage().catch(() => {});

export const offlineQueue = {
  enqueue,
  flush,
  peek,
  clear,
  registerExecutor,
  unregisterExecutor,
};

export default offlineQueue;
