// Supabase Edge Function: upload-media
//
// Server-side proxy for Bunny CDN Storage uploads. Replaces the client-side
// direct-upload path so:
//   1. `BUNNY_STORAGE_PASSWORD` never ships to the client — previously the
//      storage key was embedded in every mobile build via EXPO_PUBLIC_*,
//      letting any user decompile the app and gain full read/write on all
//      tenants' files. This function holds the key server-side.
//   2. Every uploaded path is prefixed with the caller's `institute_id`, so a
//      user from institute A can't overwrite institute B's files.
//   3. Only whitelisted folders are accepted — arbitrary path traversal blocked.
//
// Invocation:
//   POST /functions/v1/upload-media
//   Headers: Authorization: Bearer <user_jwt>
//   Body (multipart/form-data):
//     file:   binary blob (required)
//     folder: one of ALLOWED_FOLDERS (required)
//     ext:    file extension without dot (e.g. "jpg", "pdf") — required
//
// Returns: { url: string, path: string }  or  { error: string }

// CORS allowlist + safeError + rate-limit shared via _shared/.
import { buildCorsHeaders } from '../_shared/cors.ts';
import { safeError } from '../_shared/safeError.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Per-user upload rate limit. 30/min covers gallery batch uploads + voice
// notes; 500/day caps total churn so a compromised JWT can't burn through
// our Bunny storage egress budget.
const USER_RATE_PER_MIN_MAX = 30;
const USER_RATE_PER_MIN_WIN = 60;
const USER_RATE_PER_DAY_MAX = 500;
const USER_RATE_PER_DAY_WIN = 86_400;

// Folders callable code is allowed to upload into. Anything else → 400. The
// caller's institute_id is prepended so two institutes sharing a folder name
// (e.g. "avatars") still live in separate tenant roots.
const ALLOWED_FOLDERS = new Set([
  'avatars',
  'logos',
  'stamps',
  'signatures',
  'voice',
  'materials/covers',
  'materials/files',
  'galleries',
  'tasks',
  'pdf',
  'certificates',
  'events',
  'behavior',
  'library',
  'ads',
  'announcements',
  'cafeteria',
  'class-chat',
]);

// 100 MB hard cap per upload to protect against bill blow-up. Voice messages
// and PDFs are under 10 MB in practice; this leaves headroom for larger PDFs.
const MAX_SIZE = 100 * 1024 * 1024;

// Extensions we accept. Whitelisting by extension is weak (anyone can rename)
// but Bunny stores and serves the Content-Type we pass; a .jpg named blob
// served as octet-stream won't execute in a browser. Still, trim obvious
// dangerous types to avoid being an abuse relay.
const ALLOWED_EXT = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic',
  'pdf', 'txt',
  'mp3', 'm4a', 'wav', 'aac', 'ogg',
  'mp4', 'mov', 'webm',
]);

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

// Source of truth for the caller's institute. We check two sources in order:
//   1. `users.institute_id` — canonical column set at creation/transfer.
//   2. `enrollments` — the per-user-per-institute link table; source of truth
//      for role/institute (a user can be enrolled in multiple institutes).
//
// The fallback matters because:
//   - Some legacy users have users.institute_id = null but a valid enrollments row.
//   - Platform admins have users.role='admin' and users.institute_id=null — they
//     get a synthetic `platform` tenant for their uploads (avatar, logo, etc.)
//     so they don't hit the "no_institute" 403.
async function getUserInstituteId(userId: string): Promise<string | null> {
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
  if (usersRes.ok) {
    const rows = await usersRes.json();
    const row = rows?.[0];
    if (typeof row?.institute_id === 'string' && row.institute_id) {
      return row.institute_id;
    }
    // Platform admin: users.role='admin' AND institute_id is null — allow uploads
    // into a shared `platform` bucket instead of blocking them outright.
    if (row?.role === 'admin') return 'platform';
  }

  // 2) enrollments fallback — pick the first active row with an institute
  const enrRes = await fetch(
    `${supabaseUrl}/rest/v1/enrollments?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&institute_id=not.is.null&select=institute_id,role&limit=1`,
    { headers: authHeaders },
  );
  if (enrRes.ok) {
    const rows = await enrRes.json();
    const id = rows?.[0]?.institute_id;
    if (typeof id === 'string' && id) return id;
  }

  // 3) platform admin via enrollments (institute_id=NULL, role=admin)
  const platformRes = await fetch(
    `${supabaseUrl}/rest/v1/enrollments?user_id=eq.${encodeURIComponent(userId)}&role=eq.admin&institute_id=is.null&status=eq.active&select=id&limit=1`,
    { headers: authHeaders },
  );
  if (platformRes.ok) {
    const rows = await platformRes.json();
    if (Array.isArray(rows) && rows.length > 0) return 'platform';
  }

  return null;
}

function sanitizeExt(ext: string): string | null {
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  if (!clean) return null;
  return ALLOWED_EXT.has(clean) ? clean : null;
}

// TODO: idempotency — support Idempotency-Key header; hash (userId+key) and
// cache the response for 24 h so retried uploads don't create duplicate files.

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
    return new Response(JSON.stringify(safeError(new Error('unauthorized'), 'upload-media:auth', 'unauthorized')), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Rate limit before doing any expensive work. Check minute-window first,
  // then daily. If either is exceeded, refuse early.
  {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const svc = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const minOk = await enforceRateLimit(svc, 'upload-media:user_min', userId, USER_RATE_PER_MIN_MAX, USER_RATE_PER_MIN_WIN);
    const dayOk = await enforceRateLimit(svc, 'upload-media:user_day', userId, USER_RATE_PER_DAY_MAX, USER_RATE_PER_DAY_WIN);
    if (!minOk || !dayOk) {
      return new Response(
        JSON.stringify(safeError(new Error('rate_limited'), { scope: 'upload-media:user', callerId: userId }, 'rate_limited')),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  const instituteId = await getUserInstituteId(userId);
  if (!instituteId) {
    return new Response(JSON.stringify({ error: 'no_institute', code: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
  const folder = String(form.get('folder') || '');
  const extRaw = String(form.get('ext') || '');

  if (!(fileField instanceof File) && !(fileField instanceof Blob)) {
    return new Response(JSON.stringify({ error: 'missing_file' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // SECURITY FIX — path traversal via URL-encoded input.
  // The `folder` value comes from untrusted form data. An attacker could send
  // `folder=avatars%2F..%2F..%2Fother_institute` which, after URL-decoding,
  // contains ".." and escapes the intended tenant root. We decode first, then
  // reject any traversal sequence before checking the allowlist.
  //
  // Rejected patterns: ".." (parent dir), leading slash (absolute path),
  // null byte (path confusion in some runtimes), "." (current dir reference).
  const folderDecoded = decodeURIComponent(folder);
  if (
    folderDecoded.includes('..') ||
    folderDecoded.includes('./') ||
    folderDecoded.startsWith('/') ||
    folderDecoded.includes('\0')
  ) {
    return new Response(JSON.stringify({ error: 'bad_folder_path' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!ALLOWED_FOLDERS.has(folderDecoded)) {
    return new Response(JSON.stringify({ error: 'folder_not_allowed' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const ext = sanitizeExt(extRaw);
  if (!ext) {
    return new Response(JSON.stringify({ error: 'ext_not_allowed' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const size = (fileField as any).size ?? 0;
  if (size > MAX_SIZE) {
    return new Response(JSON.stringify({ error: 'too_large', max: MAX_SIZE }), {
      status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Normalize Bunny secrets — they were saved at one point with a leading
  // space + a truncated trailing character ("kaiplatformfile" instead of
  // "kaiplatformfiles", "kaiplatformfiles.b-cdn.ne" instead of ".net"),
  // which made every upload land on a non-existent zone and 404 from the CDN.
  // Defensive normalization here keeps uploads working regardless of how the
  // values were typed/pasted into the dashboard.
  const rawZone = Deno.env.get('BUNNY_STORAGE_ZONE');
  const password = Deno.env.get('BUNNY_STORAGE_PASSWORD');
  const rawCdn = Deno.env.get('BUNNY_STORAGE_CDN');
  if (!rawZone || !password || !rawCdn) {
    return new Response(JSON.stringify({ error: 'storage_not_configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  let zone = rawZone.trim();
  let cdn = rawCdn.trim();
  // Project-specific repair: known-good zone name + CDN host. We only fix the
  // exact-known broken values to avoid silently masking a future legitimate
  // rename to a different zone.
  if (zone === 'kaiplatformfile') zone = 'kaiplatformfiles';
  if (cdn === 'kaiplatformfiles.b-cdn.ne') cdn = 'kaiplatformfiles.b-cdn.net';

  // SECURITY FIX: Math.random() produces ~51 bits of entropy and is not
  // cryptographically random — two concurrent uploads could collide, and a
  // bruteforce attacker could predict filenames to probe for private content.
  // crypto.randomUUID() uses the CSPRNG and gives 122 bits of collision-free
  // entropy, making enumeration effectively impossible.
  const fileName = `${Date.now()}_${crypto.randomUUID()}.${ext}`;
  // Enforce tenant root: ALWAYS prefix with the server-resolved institute_id.
  // The client has no say in this — it cannot bypass the prefix by controlling
  // the folder value (the allowlist above rejects any traversal attempt).
  const remotePath = `${instituteId}/${folderDecoded}/${fileName}`;

  const upRes = await fetch(`https://storage.bunnycdn.com/${zone}/${remotePath}`, {
    method: 'PUT',
    headers: {
      AccessKey: password,
      'Content-Type': 'application/octet-stream',
    },
    body: fileField as Blob,
  });

  if (!upRes.ok) {
    return new Response(JSON.stringify({
      error: 'upload_failed',
      status: upRes.status,
    }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    url: `https://${cdn}/${remotePath}`,
    path: remotePath,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
