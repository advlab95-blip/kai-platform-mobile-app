// Shared rate-limit helper for all Edge Functions.
//
// Usage (inside an Edge Function):
//   import { enforceRateLimit } from '../_shared/rateLimit.ts';
//   const allowed = await enforceRateLimit(svc, 'send_push', callerId, 5, 60);
//   if (!allowed) return json(429, { error: 'too_many_requests' });
//
// Backed by public.check_rate_limit(bucket, identifier, max, window_seconds)
// which atomically counts inside a rolling window. Service-role only.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function enforceRateLimit(
  svc: SupabaseClient,
  bucket: string,
  identifier: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!identifier) return false;
  try {
    const { data, error } = await svc.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_identifier: identifier,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      // Fail-closed on rate-limit errors. Prevents an attacker who can cause
      // RPC failures (e.g. by exhausting connections) from also bypassing
      // the rate limit.
      console.error('[rateLimit]', bucket, identifier, error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error('[rateLimit] threw', bucket, identifier, e);
    return false;
  }
}
