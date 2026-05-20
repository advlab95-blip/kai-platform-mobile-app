import { supabase } from './supabase';
import { withRetry } from './api';
import type { RoleId } from '../types';

export type SearchCategory =
  | 'student'
  | 'teacher'
  | 'subject'
  | 'assignment'
  | 'exam';

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string | null;
  route: string;
  icon: string;
  created_at: string;
  rank?: number;
}

/**
 * Role-aware global search. Server-side RPC enforces institute scoping and
 * per-role result filtering — the client only needs to pass the query.
 * Results come back pre-sorted by relevance per category.
 */
export async function globalSearch(
  query: string,
  role: RoleId,
  instituteId: string | null,
  userId: string,
  limit = 20,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || !userId) return [];
  // Platform admin (role==='admin') is allowed to pass instituteId=null to
  // search across every institute. All other roles MUST scope to one institute.
  if (role !== 'admin' && !instituteId) return [];

  // Keep attempts/delay tight here — search is user-typed and perceived latency
  // matters more than resilience. 2 attempts at 300ms base covers a single
  // network blip without making the spinner linger.
  try {
    const data = await withRetry(
      async () => {
        const { data, error } = await supabase.rpc('global_search', {
          p_query: trimmed,
          p_role: role,
          p_institute_id: instituteId,
          p_user_id: userId,
          p_limit: limit,
        });
        if (error) throw error;
        return data;
      },
      { maxAttempts: 2, baseDelayMs: 300 },
    );
    if (!Array.isArray(data)) return [];
    // RPC returns JSONB array; each element already matches SearchResult shape.
    return data as SearchResult[];
  } catch (err: any) {
    console.error('globalSearch error:', err?.message || err);
    return [];
  }
}
