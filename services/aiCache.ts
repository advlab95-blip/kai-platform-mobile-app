/**
 * AI Response Cache — Saves 50-80% of AI API costs
 * - Caches AI responses by content hash
 * - Same question about same PDF = instant cached response
 * - TTL: 24 hours (configurable)
 * - Max 500 cached entries per user
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@ai_cache';
const MAX_ENTRIES = 500;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  response: string;
  timestamp: number;
  tokens?: number;
}

function hashKey(prompt: string): string {
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `ai_${Math.abs(hash).toString(36)}`;
}

async function getCache(): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveCache(cache: Record<string, CacheEntry>) {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

export const AICache = {
  /** Check if response is cached */
  async get(prompt: string): Promise<string | null> {
    const cache = await getCache();
    const key = hashKey(prompt);
    const entry = cache[key];
    if (!entry) return null;
    // Check TTL
    if (Date.now() - entry.timestamp > TTL_MS) {
      delete cache[key];
      await saveCache(cache);
      return null;
    }
    return entry.response;
  },

  /** Cache a response */
  async set(prompt: string, response: string, tokens?: number) {
    const cache = await getCache();
    const key = hashKey(prompt);
    cache[key] = { response, timestamp: Date.now(), tokens };

    // Enforce max entries (remove oldest)
    const entries = Object.entries(cache);
    if (entries.length > MAX_ENTRIES) {
      entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
      const toRemove = entries.slice(0, entries.length - MAX_ENTRIES);
      for (const [k] of toRemove) delete cache[k];
    }

    await saveCache(cache);
  },

  /** Get cache stats */
  async getStats(): Promise<{ entries: number; savedTokens: number }> {
    const cache = await getCache();
    const entries = Object.values(cache);
    const savedTokens = entries.reduce((sum, e) => sum + (e.tokens || 0), 0);
    return { entries: entries.length, savedTokens };
  },

  /** Clear all AI cache */
  async clear() {
    await AsyncStorage.removeItem(CACHE_KEY);
  },
};
