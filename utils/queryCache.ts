/**
 * Simple TTL cache for expensive/repetitive queries.
 *
 * Use case: dashboard stats, institute counts, feature flags — data that:
 *   1. Costs multiple table scans per call, AND
 *   2. Doesn't change second-to-second, AND
 *   3. Is requested repeatedly on re-mount / tab switch.
 *
 * At 10K users, caching a 300ms stats query for 30s drops that query's DB
 * traffic by ~100x without any user-visible staleness.
 *
 * NOT a replacement for React Query — this is for service-layer calls that
 * don't go through a component's `useQuery`. Keep keys namespaced to avoid
 * collisions across unrelated queries.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<any>>();
const MAX_ENTRIES = 500;

function evictIfFull() {
  if (store.size < MAX_ENTRIES) return;
  // Drop oldest quarter when full — Map preserves insertion order.
  const drop = Math.floor(MAX_ENTRIES / 4);
  let i = 0;
  for (const k of store.keys()) {
    store.delete(k);
    if (++i >= drop) break;
  }
}

/** Get a cached value or compute + cache it. ttlMs defaults to 30s. */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000
): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.value as T;
  }
  const value = await fetcher();
  evictIfFull();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Invalidate a specific key or pattern (prefix). Use after writes. */
export function invalidate(keyOrPrefix: string): void {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(keyOrPrefix)) store.delete(k);
  }
}

/** Nuclear option — clear everything. Use on logout / tenant switch. */
export function clearAll(): void {
  store.clear();
}
