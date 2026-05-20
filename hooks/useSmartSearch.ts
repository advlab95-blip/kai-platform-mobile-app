// useSmartSearch — Arabic-aware fuzzy search hook with debouncing + recent searches.
// Scoped per interface (admin/institute/teacher/student/parent/cafeteria/medical) so
// each role's recent queries stay isolated. Pure client-side filter — caller still
// applies institute_id filtering at the query layer.

import { useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDebouncedValue } from './useDebouncedValue';

// Arabic normalization: collapse alif variants, ta marbuta, ya, strip diacritics
// and tatweel so "أحمد" matches "احمد" and "علي" matches "على".
const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
export function normalizeArabic(input: string): string {
  if (!input) return '';
  return input
    .toString()
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

// Boolean Arabic-aware substring match. Use this in `.filter(...)` calls
// to upgrade naive `.includes()` checks: "أحمد" will now match "احمد".
export function searchMatch(haystack: string | null | undefined, needle: string): boolean {
  if (!needle || !needle.trim()) return true;
  if (!haystack) return false;
  return scoreMatch(haystack, needle) > 0;
}

// Score: 0 = no match, higher = better. Multi-token AND match (every token must be found).
export function scoreMatch(haystack: string, needle: string): number {
  const h = normalizeArabic(haystack);
  const n = normalizeArabic(needle);
  if (!n) return 1;
  if (!h) return 0;
  if (h === n) return 1000;
  if (h.startsWith(n)) return 500;
  if (h.includes(n)) return 200;
  // Multi-token: every token must appear somewhere
  const tokens = n.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    let score = 0;
    for (const tok of tokens) {
      if (!h.includes(tok)) return 0;
      score += h.startsWith(tok) ? 50 : 20;
    }
    return score;
  }
  return 0;
}

type Options<T> = {
  /** Items to filter. */
  items: T[];
  /** Function returning searchable string fields for an item. */
  getFields: (item: T) => Array<string | null | undefined>;
  /** Storage key for recent searches — must be unique per role + screen. */
  storageKey?: string;
  /** Debounce delay in ms. Default 250. */
  debounceMs?: number;
  /** Max recent queries to remember. Default 8. */
  recentLimit?: number;
};

export function useSmartSearch<T>({
  items,
  getFields,
  storageKey,
  debounceMs = 250,
  recentLimit = 8,
}: Options<T>) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const debounced = useDebouncedValue(query, debounceMs);

  // Load recent on mount
  useEffect(() => {
    if (!storageKey) return;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setRecent(parsed.slice(0, recentLimit));
        } catch {}
      })
      .catch(() => {});
  }, [storageKey, recentLimit]);

  // Persist a query into recent. Call on submit / chip-tap.
  const remember = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || !storageKey) return;
      setRecent((prev) => {
        const next = [trimmed, ...prev.filter((p) => p !== trimmed)].slice(0, recentLimit);
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [storageKey, recentLimit],
  );

  const clearRecent = useCallback(() => {
    setRecent([]);
    if (storageKey) AsyncStorage.removeItem(storageKey).catch(() => {});
  }, [storageKey]);

  // Filtered + scored
  const filtered = useMemo(() => {
    const q = debounced.trim();
    if (!q) return items;
    const scored: Array<{ item: T; score: number }> = [];
    for (const item of items) {
      const fields = getFields(item);
      let best = 0;
      for (const f of fields) {
        if (!f) continue;
        const s = scoreMatch(f, q);
        if (s > best) best = s;
      }
      if (best > 0) scored.push({ item, score: best });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [items, debounced, getFields]);

  return {
    query,
    setQuery,
    debouncedQuery: debounced,
    filtered,
    recent,
    remember,
    clearRecent,
    isSearching: query.trim().length > 0,
    hasResults: filtered.length > 0,
  };
}

export default useSmartSearch;
