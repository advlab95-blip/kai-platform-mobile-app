// Supabase Edge Function: send-push
//
// Centralized push delivery. Replaces the client-side `sendExpoPush` path for
// all programmatic (trigger-initiated or feature-initiated) pushes, so:
//   1. The `push_tokens` table is never read from the client (privacy + RLS).
//   2. Every push is logged to `notifications` for the center UI.
//   3. Institute opt-outs are respected in one place.
//
// Invocation:
//   POST /functions/v1/send-push
//   Headers: Authorization: Bearer <user_jwt OR service_role>
//   Body: {
//     user_ids: string[],      // required — recipients
//     title: string,           // required
//     body: string,            // required
//     type: string,            // e.g. attendance, grade, announcement, message
//     category?: 'academic'|'financial'|'admin'|'urgent'|'social',
//     institute_id?: string,   // if omitted, inferred from first recipient
//     data?: Record<string, unknown>,
//   }
//
// Auth model:
//   Callers are one of:
//     (a) a postgres trigger using the service role key (trusted, bypasses gate)
//     (b) an authenticated user invoking from the client. Gate: caller must
//         share an institute with the resolved institute_id. Prevents cross-
//         institute spam.
//
// Returns: { sent: number, failed: number, skipped_reason?: string }

// CORS allowlist + safeError + rate limit are now shared across all Edge
// Functions via _shared/. See cors.ts / safeError.ts / rateLimit.ts.
import { buildCorsHeaders } from '../_shared/cors.ts';
import { safeError } from '../_shared/safeError.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Per-user push rate limit. 5/minute is well above legitimate UI-driven sends
// (a single broadcast counts as 1 invocation regardless of recipient count).
const USER_RATE_MAX = 5;
const USER_RATE_WINDOW_S = 60;

// Per-institute daily fanout cap. 10K/day at 50-byte payloads ≈ 500KB/day —
// keeps Expo Push within free tier for normal use, blocks cost runaway.
const INST_DAILY_MAX = 10_000;
const INST_DAILY_WINDOW_S = 86_400;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

interface SendPushBody {
  user_ids: string[];
  title: string;
  body: string;
  type: string;
  category?: string;
  institute_id?: string;
  data?: Record<string, unknown>;
}

async function sbRest(path: string, opts: RequestInit = {}): Promise<Response> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return fetch(`${Deno.env.get('SUPABASE_URL')!}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}

async function resolveUserFromJWT(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  // If the caller supplied the service role key, skip auth check — trusted trigger.
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return 'service_role';
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')!}/auth/v1/user`, {
      headers: {
        apikey: Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.id === 'string' ? data.id : null;
  } catch {
    return null;
  }
}

// Pull the institute id for a given user (first active enrollment).
async function getUserInstituteId(userId: string): Promise<string | null> {
  const res = await sbRest(
    `/enrollments?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=institute_id&limit=1`,
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.institute_id ?? null;
}

// UUID v4 pattern — all IDs in this project are Postgres gen_random_uuid().
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Bulk-fetch institute ids for a batch of users. Returns a Set of all distinct
// institute_ids the recipients belong to. Used to enforce that EVERY recipient
// shares the caller's institute — not just user_ids[0].
//
// SECURITY FIX: Only UUID-validated strings are passed to the PostgREST `.in()`
// filter. Previously any string from `body.user_ids` was interpolated directly
// into the query string, enabling PostgREST injection via crafted IDs such as
// `"x"),("status=eq.active` that could widen the filter and exfiltrate tokens
// across all institutes.
async function getRecipientsInstitutes(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  // Strip any value that is not a well-formed UUID before building the filter.
  const safeIds = userIds.filter(isValidUUID);
  if (safeIds.length === 0) return new Set();
  // PostgREST in() syntax: each element is double-quoted to match text/uuid cast.
  const inList = safeIds.map((u) => `"${u}"`).join(',');
  const res = await sbRest(
    `/enrollments?user_id=in.(${inList})&status=eq.active&select=user_id,institute_id`,
  );
  if (!res.ok) return new Set();
  const rows = await res.json();
  const set = new Set<string>();
  for (const r of rows) {
    if (r?.institute_id) set.add(r.institute_id);
  }
  return set;
}

// Is `type` enabled for `institute_id` according to notification settings?
//
// SECURITY FIX: this used to fail-open. If the RPC ever 5xx'd (e.g. transient
// PostgREST hiccup), a "muted" notification type would still be delivered.
// Worse: on a misconfigured admin-disabled type, an attacker who could cause
// RPC errors could push notifications anyway. Now fail-closed: any RPC error
// suppresses the push (the notification is still logged to the center, so the
// user isn't completely silenced).
async function typeEnabledForInstitute(instituteId: string, type: string): Promise<boolean> {
  const res = await sbRest(
    `/rpc/notification_type_enabled`,
    {
      method: 'POST',
      body: JSON.stringify({ p_institute_id: instituteId, p_type: type }),
    },
  );
  if (!res.ok) {
    console.error('[send-push] type-enabled check failed', instituteId, type, res.status);
    return false;
  }
  const v = await res.json();
  return v === true;
}

// Fetch push tokens for a batch of user IDs.
// SECURITY FIX: Same UUID validation as getRecipientsInstitutes — only
// well-formed UUIDs reach the PostgREST filter string.
async function fetchTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const safeIds = userIds.filter(isValidUUID);
  if (safeIds.length === 0) return [];
  // PostgREST `in` operator
  const inList = safeIds.map((u) => `"${u}"`).join(',');
  const res = await sbRest(`/push_tokens?user_id=in.(${inList})&select=token`);
  if (!res.ok) return [];
  const rows = await res.json();
  return rows
    .map((r: any) => r.token)
    .filter((t: string) => typeof t === 'string' && t.startsWith('ExponentPushToken'));
}

async function logNotifications(
  userIds: string[],
  body: SendPushBody,
  instituteId: string | null,
) {
  const rows = userIds.map((uid) => ({
    recipient_id: uid,
    recipient_role: null, // individual send — role not relevant
    sender_role: 'system',
    sender_name: 'نظام',
    title: body.title,
    message: body.body,
    type: body.type,
    category: body.category ?? null,
    is_read: false,
    institute_id: instituteId,
  }));
  await sbRest('/notifications', { method: 'POST', body: JSON.stringify(rows) });
}

async function pushToExpo(tokens: string[], body: SendPushBody): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const chunk = tokens.slice(i, i + BATCH).map((to) => ({
      to,
      sound: 'default',
      title: body.title,
      body: body.body,
      data: body.data ?? {},
      priority: 'high',
      channelId: 'default',
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
      else failed += chunk.length;
    } catch {
      failed += chunk.length;
    }
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed', code: 'invalid_input' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const callerId = await resolveUserFromJWT(req.headers.get('Authorization'));
  if (!callerId) {
    return new Response(JSON.stringify(safeError(new Error('unauthorized'), 'send-push:auth', 'unauthorized')), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build a service client up-front for rate-limit RPC calls.
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const svc = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Per-user invocation limit (skip for trusted service-role callers).
  if (callerId !== 'service_role') {
    const allowed = await enforceRateLimit(
      svc, 'send-push:user', callerId, USER_RATE_MAX, USER_RATE_WINDOW_S,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify(safeError(new Error('rate_limited'), { scope: 'send-push:user', callerId }, 'rate_limited')),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  try {
    let body: SendPushBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'bad_json', code: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!Array.isArray(body.user_ids) || body.user_ids.length === 0
        || !body.title || !body.body || !body.type) {
      return new Response(JSON.stringify({ error: 'missing_fields', code: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cap recipients to 1000 per call — prevents runaway cost.
    // SECURITY FIX: reject any element that is not a valid UUID before the Set
    // dedup so non-UUID strings can never reach the PostgREST query path.
    const userIds = Array.from(new Set(body.user_ids.filter(isValidUUID))).slice(0, 1000);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ error: 'no_valid_user_ids', code: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Gate: derive caller's institute from server (never trust body for non-service
    // callers) and verify EVERY recipient belongs to that same institute. The old
    // code only checked userIds[0], which a malicious caller could satisfy by
    // placing one in-tenant id first and appending out-of-tenant ids after it.
    let instituteId: string | null;
    if (callerId === 'service_role') {
      // Trusted server-to-server call (e.g. postgres trigger). Trust body fields.
      instituteId = body.institute_id || await getUserInstituteId(userIds[0]);
    } else {
      const callerInstitute = await getUserInstituteId(callerId);
      if (!callerInstitute) {
        return new Response(JSON.stringify({ error: 'caller_has_no_institute', code: 'forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const recipInstitutes = await getRecipientsInstitutes(userIds);
      // Any recipient outside the caller's institute → reject the whole batch.
      // (recipients with no enrollment row are ignored — they just won't receive.)
      for (const ri of recipInstitutes) {
        if (ri !== callerInstitute) {
          return new Response(JSON.stringify({ error: 'cross_institute_forbidden', code: 'forbidden' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      instituteId = callerInstitute;
    }

    // Per-institute daily fanout cap. Counts each invocation as 1 — even
    // service-role callers (triggers) so a runaway trigger can't blow up cost.
    if (instituteId) {
      const allowed = await enforceRateLimit(
        svc, 'send-push:institute', instituteId, INST_DAILY_MAX, INST_DAILY_WINDOW_S,
      );
      if (!allowed) {
        return new Response(
          JSON.stringify(safeError(new Error('rate_limited'), { scope: 'send-push:institute', callerId: instituteId }, 'rate_limited')),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Institute opt-out check (default ON).
    if (instituteId) {
      const enabled = await typeEnabledForInstitute(instituteId, body.type);
      if (!enabled) {
        // Still log it so the user sees it in the center; just skip push.
        await logNotifications(userIds, body, instituteId);
        return new Response(JSON.stringify({ sent: 0, failed: 0, skipped_reason: 'institute_opted_out' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Persist to notifications FIRST so the center shows it even if push fails.
    await logNotifications(userIds, body, instituteId);

    const tokens = await fetchTokens(userIds);
    const result = tokens.length === 0
      ? { sent: 0, failed: 0 }
      : await pushToExpo(tokens, body);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify(safeError(e, { scope: 'send-push:handler', callerId }, 'internal')),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
