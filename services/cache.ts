import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'kai_cache_';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Get cached data. Returns null if expired or not found.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > entry.ttl) {
      // Expired — remove it
      AsyncStorage.removeItem(CACHE_PREFIX + key).catch(() => {});
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Set cached data with TTL (default 5 minutes).
 */
export async function setCache<T>(key: string, data: T, ttl = DEFAULT_TTL): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch { /* silent */ }
}

/**
 * Clear specific cache key.
 */
export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch { /* silent */ }
}

/**
 * Clear all KAI cache.
 */
export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
  } catch { /* silent */ }
}

/**
 * Cached API call wrapper — returns cache first, fetches in background.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = DEFAULT_TTL,
  onUpdate?: (data: T) => void,
): Promise<T> {
  // Try cache first
  const cached = await getCached<T>(key);
  if (cached !== null) {
    // Refresh in background
    fetcher().then(fresh => {
      setCache(key, fresh, ttl);
      if (onUpdate) onUpdate(fresh);
    }).catch(() => {});
    return cached;
  }
  // No cache — fetch and cache
  const data = await fetcher();
  await setCache(key, data, ttl);
  return data;
}
