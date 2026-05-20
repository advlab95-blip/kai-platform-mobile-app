// Supabase Edge Function: upload-video
//
// Server-side proxy for Bunny Stream video uploads. Replaces the client-side
// flow that shipped `BUNNY_STREAM_API_KEY` to every build — any user could
// decompile the APK and gain full read/write/delete on every tenant's videos.
//
// This function holds the Stream API key server-side and:
//   1. Creates the video entry on Bunny (POST /library/{lib}/videos).
//   2. Uploads the file bytes to Bunny (PUT /library/{lib}/videos/{guid}).
//   3. Records ownership in `video_ownership` so we can clean up / audit.
//
// Tradeoff: proxying the whole file doubles bandwidth and is bounded by the
// edge-function body limit (~100 MB). For typical short teacher content this
// is fine. If the platform later needs GB-scale uploads, swap to TUS signed
// uploads — the signature path was prototyped earlier and can be restored.
//
// Invocation:
//   POST /functions/v1/upload-video
//   Headers: Authorization: Bearer <user_jwt>
//   Body (multipart/form-data):
//     file:  binary blob (required)
//     title: string (required)
//
// Returns: { videoId: string }  or  { error: string }

// CORS allowlist + safeError + rate-limit shared via _shared/.
import { buildCorsHeaders } from '../_shared/cors.ts';
import { safeError } from '../_shared/safeError.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Per-teacher daily video upload cap. Bunny Stream library slots are the
// expensive resource; 20 videos/day is far above any legitimate teacher
// workflow but keeps a stolen JWT from churning a library.
const TEACHER_DAILY_MAX = 20;
const TEACHER_DAILY_WIN = 86_400;

const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500 MB cap — protects Stream bill

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
//      (synthetic tenant id 'platform' for video title prefix + ownership log)
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

// TODO: idempotency — support Idempotency-Key header; hash (userId+key) and
// cache the (videoId, url) response for 24 h so retried uploads don't create
// duplicate Bunny Stream entries and orphan library slots.

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
    return new Response(JSON.stringify(safeError(new Error('unauthorized'), 'upload-video:auth', 'unauthorized')), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { institute_id, role } = await getUserInstituteAndRole(userId);
  if (!institute_id) {
    return new Response(JSON.stringify({ error: 'no_institute', code: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Students shouldn't be consuming Stream library slots. Gate strictly.
  const uploaderRoles = new Set(['teacher', 'admin', 'institute', 'platform_admin']);
  if (!role || !uploaderRoles.has(role)) {
    return new Response(JSON.stringify({ error: 'role_not_allowed', code: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Per-teacher daily upload cap. Bunny Stream library is the bottleneck.
  {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const svc = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const allowed = await enforceRateLimit(
      svc, 'upload-video:user_day', userId, TEACHER_DAILY_MAX, TEACHER_DAILY_WIN,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify(safeError(new Error('rate_limited'), { scope: 'upload-video:user', callerId: userId }, 'rate_limited')),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_form' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const fileField = form.get('file');
  const title = String(form.get('title') || '').trim().slice(0, 200);

  if (!(fileField instanceof File) && !(fileField instanceof Blob)) {
    return new Response(JSON.stringify({ error: 'missing_file' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!title) {
    return new Response(JSON.stringify({ error: 'missing_title' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const size = (fileField as any).size ?? 0;
  if (size > MAX_VIDEO_SIZE) {
    return new Response(JSON.stringify({ error: 'too_large', max: MAX_VIDEO_SIZE }), {
      status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const libraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID');
  const apiKey = Deno.env.get('BUNNY_STREAM_API_KEY');
  if (!libraryId || !apiKey) {
    return new Response(JSON.stringify({ error: 'stream_not_configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 1) Create video entry — reserves GUID.
  const createRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: `[${institute_id}] ${title}` }),
  });
  if (!createRes.ok) {
    return new Response(JSON.stringify({ error: 'create_failed', status: createRes.status }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const created = await createRes.json();
  const videoId: string | undefined = created?.guid;
  if (!videoId) {
    return new Response(JSON.stringify({ error: 'create_failed_no_guid' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2) Upload bytes.
  const upRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
    method: 'PUT',
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/octet-stream',
    },
    body: fileField as Blob,
  });
  if (!upRes.ok) {
    // Best-effort cleanup so we don't leave orphan video entries.
    try {
      await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
        method: 'DELETE',
        headers: { AccessKey: apiKey },
      });
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: 'upload_failed', status: upRes.status }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 3) Best-effort ownership log (table added in the SQL side).
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')!}/rest/v1/video_ownership`, {
      method: 'POST',
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        video_id: videoId,
        institute_id,
        uploaded_by: userId,
      }),
    });
  } catch { /* non-critical */ }

  return new Response(JSON.stringify({ videoId }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
