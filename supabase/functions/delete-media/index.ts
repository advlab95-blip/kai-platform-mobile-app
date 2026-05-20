// Supabase Edge Function: delete-media
//
// Server-side delete for Bunny CDN Storage paths and Bunny Stream videos.
// Client used to call Bunny DELETE directly with the master key, which meant
// an attacker who decompiled the app could wipe any institute's files.
//
// Gate:
//   * Storage delete — remote path must start with the caller's institute_id/.
//     This matches how upload-media prefixes all paths, so the caller can only
//     delete files that originated from their own tenant.
//   * Video delete — check `video_ownership` table: the video's institute_id
//     must match the caller's.
//
// Invocation:
//   POST /functions/v1/delete-media
//   Headers: Authorization: Bearer <user_jwt>
//   Body: { type: 'storage', path: string } OR { type: 'stream', videoId: string }

// CORS allowlist + safeError + rate-limit shared via _shared/.
import { buildCorsHeaders } from '../_shared/cors.ts';
import { safeError } from '../_shared/safeError.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 100 deletes/min/user. Far above any legitimate UI flow; prevents a
// compromised JWT from enumerating + wiping content.
const USER_DEL_MAX = 100;
const USER_DEL_WIN = 60;

async function resolveUserFromJWT(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
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

// Resolve caller's institute and role. Checks three sources in order so we
// don't lock out legacy users (users.institute_id = null) or platform admins:
//   1. users.institute_id + users.role
//   2. enrollments (first active row with institute_id)
//   3. enrollments with institute_id IS NULL + role='admin' → platform admin
//      (synthetic tenant id 'platform' so they can manage their own uploads)
async function getUserInstituteAndRole(userId: string): Promise<{ institute_id: string | null; role: string | null }> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  // 1) users table
  const usersRes = await fetch(
    `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=institute_id,role&limit=1`,
    { headers: authHeaders },
  );
  let users_institute: string | null = null;
  let users_role: string | null = null;
  if (usersRes.ok) {
    const rows = await usersRes.json();
    users_institute = typeof rows?.[0]?.institute_id === 'string' ? rows[0].institute_id : null;
    users_role = typeof rows?.[0]?.role === 'string' ? rows[0].role : null;
    if (users_institute) return { institute_id: users_institute, role: users_role };
    if (users_role === 'admin') return { institute_id: 'platform', role: 'admin' };
  }

  // 2) enrollments (active + institute_id not null)
  const enrRes = await fetch(
    `${supabaseUrl}/rest/v1/enrollments?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&institute_id=not.is.null&select=institute_id,role&limit=1`,
    { headers: authHeaders },
  );
  if (enrRes.ok) {
    const rows = await enrRes.json();
    const id = rows?.[0]?.institute_id;
    if (typeof id === 'string' && id) {
      return { institute_id: id, role: rows?.[0]?.role ?? users_role };
    }
  }

  // 3) platform admin via enrollments
  const platformRes = await fetch(
    `${supabaseUrl}/rest/v1/enrollments?user_id=eq.${encodeURIComponent(userId)}&role=eq.admin&institute_id=is.null&status=eq.active&select=id&limit=1`,
    { headers: authHeaders },
  );
  if (platformRes.ok) {
    const rows = await platformRes.json();
    if (Array.isArray(rows) && rows.length > 0) {
      return { institute_id: 'platform', role: 'admin' };
    }
  }

  return { institute_id: null, role: users_role };
}

async function videoOwnerInstitute(videoId: string): Promise<string | null> {
  const url = `${Deno.env.get('SUPABASE_URL')!}/rest/v1/video_ownership?video_id=eq.${encodeURIComponent(videoId)}&select=institute_id&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.institute_id ?? null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed', code: 'invalid_input' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = await resolveUserFromJWT(req.headers.get('Authorization'));
  if (!userId) {
    return new Response(JSON.stringify(safeError(new Error('unauthorized'), 'delete-media:auth', 'unauthorized')), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Per-user delete rate limit before any DB / Bunny call.
  {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const svc = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const allowed = await enforceRateLimit(
      svc, 'delete-media:user', userId, USER_DEL_MAX, USER_DEL_WIN,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify(safeError(new Error('rate_limited'), { scope: 'delete-media:user', callerId: userId }, 'rate_limited')),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  const { institute_id, role } = await getUserInstituteAndRole(userId);
  if (!institute_id) {
    return new Response(JSON.stringify({ error: 'no_institute', code: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Only content-producing roles should be issuing deletes. Students can't
  // trigger deletion of anything via the app anyway, but a defense-in-depth
  // role gate here protects against future regressions.
  const allowedRoles = new Set(['teacher', 'admin', 'institute', 'platform_admin']);
  if (!role || !allowedRoles.has(role)) {
    return new Response(JSON.stringify({ error: 'role_not_allowed', code: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { type?: string; path?: string; videoId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (body.type === 'storage') {
    const rawPath = String(body.path || '');
    // SECURITY FIX — URL-decode BEFORE traversal check.
    // The old code checked `path.includes('..')` on the raw string, so an
    // attacker could bypass it by sending `%2e%2e` (URL-encoded ".."), which
    // passes the raw check but decodes to ".." at the filesystem/CDN layer.
    // We decode first so the subsequent checks operate on the actual path.
    let path: string;
    try {
      path = decodeURIComponent(rawPath);
    } catch {
      return new Response(JSON.stringify({ error: 'bad_path' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (
      !path ||
      path.includes('..') ||
      path.includes('./') ||
      path.startsWith('/') ||
      path.includes('\0')
    ) {
      return new Response(JSON.stringify({ error: 'bad_path' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Enforce tenant prefix. Caller can only delete paths under their own
    // institute root. Legacy paths created before upload-media was introduced
    // may not have this prefix — those are unreachable here by design.
    if (!path.startsWith(`${institute_id}/`)) {
      return new Response(JSON.stringify({ error: 'cross_institute_forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const zone = Deno.env.get('BUNNY_STORAGE_ZONE');
    const password = Deno.env.get('BUNNY_STORAGE_PASSWORD');
    if (!zone || !password) {
      return new Response(JSON.stringify({ error: 'storage_not_configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const delRes = await fetch(`https://storage.bunnycdn.com/${zone}/${path}`, {
      method: 'DELETE',
      headers: { AccessKey: password },
    });
    // Bunny returns 404 if already missing — treat as success.
    if (!delRes.ok && delRes.status !== 404) {
      return new Response(JSON.stringify({ error: 'delete_failed', status: delRes.status }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (body.type === 'stream') {
    const videoId = String(body.videoId || '');
    if (!videoId || videoId.startsWith('local_')) {
      return new Response(JSON.stringify({ error: 'bad_video_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const owner = await videoOwnerInstitute(videoId);
    // If no ownership row, we can't verify — refuse rather than guess. Legacy
    // videos predating upload-video have no ownership entry; admin cleanup
    // scripts should run with the service role, not this endpoint.
    if (!owner || owner !== institute_id) {
      return new Response(JSON.stringify({ error: 'cross_institute_forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const libraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID');
    const apiKey = Deno.env.get('BUNNY_STREAM_API_KEY');
    if (!libraryId || !apiKey) {
      return new Response(JSON.stringify({ error: 'stream_not_configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const delRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
      method: 'DELETE',
      headers: { AccessKey: apiKey },
    });
    if (!delRes.ok && delRes.status !== 404) {
      return new Response(JSON.stringify({ error: 'delete_failed', status: delRes.status }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Clean ownership row.
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')!}/rest/v1/video_ownership?video_id=eq.${encodeURIComponent(videoId)}`, {
        method: 'DELETE',
        headers: {
          apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        },
      });
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'bad_type' }), {
    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
