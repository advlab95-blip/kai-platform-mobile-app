// Supabase Edge Function: AI Proxy with Server-Side Cache + Per-Institute Role-Based Limits
// Provider: OpenRouter (default) → google/gemini-2.0-flash-001
// Supports text prompts and PDF input (via OpenAI-compatible file content)
//
// URL: POST https://<project>.supabase.co/functions/v1/ai-proxy
// Body: { "prompt": "...", "feature": "chat|summary|quiz|study_guide|mindmap", "pdfUrl"?: "..." }
// Auth: userId is resolved from the incoming Bearer JWT via /auth/v1/user (NOT trusted from body).

import { buildCorsHeaders } from '../_shared/cors.ts';
import { safeError } from '../_shared/safeError.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Hard global cap regardless of feature/role/institute. Catches abuse where
// a stolen JWT bursts hundreds of requests in seconds, before per-feature
// daily counters update. 60/min is well above legitimate use.
const GLOBAL_USER_RATE_MAX = 60;
const GLOBAL_USER_RATE_WINDOW_S = 60;

// Primary + fallback chain. Model names on OpenRouter change over time — if the primary
// returns a 4xx/5xx we silently try the next. Keeps the feature alive if one deprecates.
const OPENROUTER_MODELS = [
  'google/gemini-2.0-flash-001',
  'google/gemini-flash-1.5',
  'google/gemini-pro-1.5',
];

// Gemini Flash 2.0 pricing (USD per 1M tokens) — used for cost tracking in ai_requests_log
const PRICE_INPUT_PER_1M = 0.10;
const PRICE_OUTPUT_PER_1M = 0.40;
const USD_TO_IQD = 1500;

// Features subject to role-based daily limits. Anything else falls back to the legacy 50/day global cap.
const ROLE_LIMITED_FEATURES = new Set(['chat', 'summary', 'quiz', 'study_guide', 'mindmap']);

// Client features → admin-configured bucket. Keeps the 5-feature admin UX stable while
// accepting legacy/alias names from various screens.
const FEATURE_ALIAS: Record<string, string> = {
  // student surfaces
  chatbot: 'chat',
  pdf_chat: 'chat',
  explain: 'chat',
  // teacher surfaces (each teacher sub-tool maps to the closest standard bucket)
  lessons: 'study_guide',
  lesson_plan: 'study_guide',
  summarize: 'summary',
  activities: 'quiz',
  translate: 'chat',
  report: 'summary',
  // coarse fallback when a client still passes the generic 'tools' string
  tools: 'summary',
};

// Whitelist of buckets that the admin can actually configure. After normalization,
// anything outside this set is rejected from role-based limiting and falls through
// to the legacy global cap — this also guards the value before it's interpolated
// into PostgREST query strings (prevents `?feature=eq.foo&bar` injection).
const ALLOWED_BUCKETS = new Set(['chat', 'summary', 'quiz', 'study_guide', 'mindmap']);

function normalizeFeature(raw: string): string {
  const mapped = FEATURE_ALIAS[raw] || raw;
  return ALLOWED_BUCKETS.has(mapped) ? mapped : 'general';
}

// SHA-256 + namespace keeps the cache key collision-free and prevents a caller from
// reading another tenant's cached response by crafting a prompt. Namespace includes
// feature + institute so e.g. a generated exam answer key cached for institute A is
// never served to institute B.
async function hashPrompt(prompt: string, feature: string, instituteId: string | null): Promise<string> {
  const ns = `${instituteId || 'anon'}::${feature}::`;
  const data = new TextEncoder().encode(ns + prompt);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// In-memory JWT→userId cache. Edge runtime keeps hot instances warm, so the same
// token hitting the function within TTL skips the /auth/v1/user round-trip.
// At 10K users this cuts >90% of auth hops. Key = token (NOT userId — a revoked
// token must re-validate). Size cap prevents unbounded growth on instance.
const JWT_TTL_MS = 60_000;
const JWT_CACHE_MAX = 2000;
const jwtCache = new Map<string, { userId: string | null; expiresAt: number }>();

function jwtCacheGet(token: string): string | null | undefined {
  const hit = jwtCache.get(token);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) { jwtCache.delete(token); return undefined; }
  return hit.userId;
}

function jwtCacheSet(token: string, userId: string | null) {
  if (jwtCache.size >= JWT_CACHE_MAX) {
    // simple eviction: drop oldest quarter
    const drop = Math.floor(JWT_CACHE_MAX / 4);
    let i = 0;
    for (const k of jwtCache.keys()) { jwtCache.delete(k); if (++i >= drop) break; }
  }
  jwtCache.set(token, { userId, expiresAt: Date.now() + JWT_TTL_MS });
}

// Resolve the authenticated user id from the incoming Bearer token. Returns null when
// the token is missing/invalid — caller rejects with 401.
async function resolveUserFromJWT(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const cached = jwtCacheGet(token);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')!}/auth/v1/user`, {
      headers: {
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) { jwtCacheSet(token, null); return null; }
    const data = await res.json();
    const userId = typeof data?.id === 'string' ? data.id : null;
    jwtCacheSet(token, userId);
    return userId;
  } catch {
    return null;
  }
}

// Cache for resolveUserContext — role+institute change rarely. 60s TTL.
const CTX_TTL_MS = 60_000;
const CTX_CACHE_MAX = 2000;
const ctxCache = new Map<string, { ctx: { role: string | null; instituteId: string | null }; expiresAt: number }>();

function ctxCacheGet(userId: string) {
  const hit = ctxCache.get(userId);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) { ctxCache.delete(userId); return undefined; }
  return hit.ctx;
}

function ctxCacheSet(userId: string, ctx: { role: string | null; instituteId: string | null }) {
  if (ctxCache.size >= CTX_CACHE_MAX) {
    const drop = Math.floor(CTX_CACHE_MAX / 4);
    let i = 0;
    for (const k of ctxCache.keys()) { ctxCache.delete(k); if (++i >= drop) break; }
  }
  ctxCache.set(userId, { ctx, expiresAt: Date.now() + CTX_TTL_MS });
}

async function sbRest(path: string, opts: RequestInit = {}): Promise<Response> {
  const url = `${Deno.env.get('SUPABASE_URL')!}/rest/v1${path}`;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return fetch(url, {
    ...opts,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

// Resolve the user's role + institute_id from DB. Users → enrollments (institute_id lives there).
// Cached to skip 2 round-trips on every AI call (role/institute change rarely).
//
// Fallback order (prevents null-role / null-institute edge cases):
//   1. users.role for the base role
//   2. enrollments (active, institute_id not null) — real tenant context
//   3. enrollments with institute_id IS NULL + role='admin' → platform admin
//      (instituteId stays null so we correctly skip ai_requests_log insert,
//       since that table has FK to institutes and won't accept a synthetic id)
async function resolveUserContext(userId: string): Promise<{ role: string | null; instituteId: string | null }> {
  const cached = ctxCacheGet(userId);
  if (cached) return cached;
  try {
    const uid = encodeURIComponent(userId);

    // Read role from users — base identity.
    const uRes = await sbRest(`/users?id=eq.${uid}&select=role,institute_id&limit=1`);
    let role: string | null = null;
    let usersInstitute: string | null = null;
    if (uRes.ok) {
      const urows = await uRes.json();
      role = urows[0]?.role || null;
      usersInstitute = urows[0]?.institute_id || null;
    }

    // Prefer users.institute_id when present (fast path).
    let instituteId: string | null = usersInstitute;

    // Fall back to an active enrollment with a real institute_id.
    if (!instituteId) {
      const eRes = await sbRest(
        `/enrollments?user_id=eq.${uid}&status=eq.active&institute_id=not.is.null&select=institute_id,role&limit=1`
      );
      if (eRes.ok) {
        const erows = await eRes.json();
        if (erows[0]?.institute_id) {
          instituteId = erows[0].institute_id;
          if (!role && erows[0]?.role) role = erows[0].role;
        }
      }
    }

    // Platform admin: enrollments row with institute_id NULL + role='admin'.
    // Keep instituteId null so logging skips cleanly (FK would otherwise fail).
    if (!instituteId && !role) {
      const pRes = await sbRest(
        `/enrollments?user_id=eq.${uid}&role=eq.admin&institute_id=is.null&status=eq.active&select=role&limit=1`
      );
      if (pRes.ok) {
        const prows = await pRes.json();
        if (Array.isArray(prows) && prows.length > 0) role = 'admin';
      }
    }

    const ctx = { role, instituteId };
    ctxCacheSet(userId, ctx);
    return ctx;
  } catch {
    return { role: null, instituteId: null };
  }
}

// Look up the daily limit for this (institute, role, feature). Returns null if not configured.
async function getRoleLimit(instituteId: string, role: string, feature: string): Promise<number | null> {
  try {
    const res = await sbRest(
      `/institute_ai_role_limits?institute_id=eq.${encodeURIComponent(instituteId)}&role=eq.${encodeURIComponent(role)}&feature=eq.${encodeURIComponent(feature)}&select=daily_limit&limit=1`
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return typeof rows[0]?.daily_limit === 'number' ? rows[0].daily_limit : null;
  } catch {
    return null;
  }
}

// Count today's requests for this user + feature combination.
async function countTodayUsage(userId: string, feature: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const res = await sbRest(
    `/ai_usage_log?user_id=eq.${encodeURIComponent(userId)}&feature=eq.${encodeURIComponent(feature)}&created_at=gte.${today}T00:00:00&select=id`,
    { headers: { 'Prefer': 'count=exact' } }
  );
  const contentRange = res.headers.get('content-range') || '';
  return Number(contentRange.split('/')[1] || '0');
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const startedAt = Date.now();

  try {
    const body = await req.json();
    const { prompt, pdfUrl } = body;
    const rawFeature: string = body.feature || 'general';
    // Normalize client feature name → admin-configured bucket (chat/summary/quiz/study_guide/mindmap)
    const feature = normalizeFeature(rawFeature);
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt مطلوب' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    // Cap prompt to ~50KB to prevent cost/DoS abuse
    if (prompt.length > 50000) {
      return new Response(JSON.stringify({ error: 'طول الطلب كبير جداً (حد 50000 حرف)' }), {
        status: 413, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    // SECURITY FIX — full SSRF guard for pdfUrl.
    //
    // Previous check: a regex that only tested for "https://" prefix. That still
    // allowed fetching:
    //   • Private RFC-1918 ranges (10.*, 172.16-31.*, 192.168.*)
    //   • Loopback / link-local (127.*, 169.254.*, ::1)
    //   • Unique-local IPv6 (fc00::/7)
    //   • Any non-allowlisted public host (open redirect to attacker infra)
    //
    // Exploit: attacker uploads a prompt with pdfUrl="https://10.0.0.1:9200/"
    // → edge function fetches the internal Elasticsearch / metadata endpoint and
    //   returns its body inside the AI response, leaking internal secrets.
    //
    // Fix: (a) HTTPS-only, (b) hostname allowlist, (c) block all private ranges
    // by inspecting the parsed hostname, (d) 10 s timeout + 18 MB hard cap.
    if (pdfUrl != null) {
      if (typeof pdfUrl !== 'string') {
        return new Response(JSON.stringify({ error: 'رابط PDF غير صالح' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      let parsedPdfUrl: URL;
      try {
        parsedPdfUrl = new URL(pdfUrl);
      } catch {
        return new Response(JSON.stringify({ error: 'رابط PDF غير صالح — URL لا يمكن تحليله' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // (a) HTTPS only — reject http://, ftp://, file://, data:, etc.
      if (parsedPdfUrl.protocol !== 'https:') {
        return new Response(JSON.stringify({ error: 'رابط PDF غير صالح — يجب HTTPS' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // (b) Allowlist of trusted PDF hostnames. Add CDN domains as needed.
      // This is the strongest SSRF defence — even if IP-blocking were bypassed
      // via DNS rebinding, the hostname would still fail this check.
      const PDF_HOST_ALLOWLIST = new Set([
        'storage.bunnycdn.com',
        // Supabase storage public URL hostname for this project
        // e.g. xxxxxxxxxxxx.supabase.co — accept any *.supabase.co subdomain
      ]);
      const pdfHostname = parsedPdfUrl.hostname.toLowerCase();
      const hostAllowed =
        PDF_HOST_ALLOWLIST.has(pdfHostname) ||
        pdfHostname.endsWith('.supabase.co') ||
        pdfHostname.endsWith('.bunnycdn.com') ||
        pdfHostname.endsWith('.b-cdn.net');

      if (!hostAllowed) {
        return new Response(JSON.stringify({ error: 'رابط PDF غير مسموح به — المضيف خارج القائمة البيضاء' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // (c) Block private / loopback / link-local IP ranges.
      // Covers IPv4 and common IPv6 private ranges. We check the hostname
      // string; if it parses as an IP address we apply range checks.
      // Note: DNS rebinding can bypass IP checks if the DNS resolution happens
      // AFTER this check — the allowlist above is the primary defence.
      //
      // Patterns covered:
      //   127.x        — loopback
      //   10.x         — RFC-1918 class A
      //   172.16-31.x  — RFC-1918 class B
      //   192.168.x    — RFC-1918 class C
      //   169.254.x    — link-local
      //   0.0.0.0      — unspecified
      //   ::1          — IPv6 loopback
      //   fc/fd prefix — IPv6 unique-local (fc00::/7)
      //   fe80:        — IPv6 link-local
      const PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/i;
      if (PRIVATE_IP_RE.test(pdfHostname)) {
        return new Response(JSON.stringify({ error: 'رابط PDF غير مسموح به — عنوان IP خاص' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    // Auth: resolve userId from JWT (NEVER trust body.userId — it would let any authenticated
    // user exhaust another user's quota or forge usage logs against a victim).
    const userId = await resolveUserFromJWT(req.headers.get('Authorization'));
    if (!userId) {
      return new Response(JSON.stringify({ error: 'غير مخوّل — سجّل الدخول من جديد', code: 'unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Hard global rate limit per-user (60/min). Sits in front of the daily/feature
    // counters as a burst guard — a stolen token can't fire 1000 requests in 10s.
    {
      const url = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const svc = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const allowed = await enforceRateLimit(
        svc, 'ai-proxy:user', userId, GLOBAL_USER_RATE_MAX, GLOBAL_USER_RATE_WINDOW_S,
      );
      if (!allowed) {
        return new Response(
          JSON.stringify(safeError(new Error('rate_limited'), { scope: 'ai-proxy:user', callerId: userId }, 'rate_limited')),
          { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Resolve role + institute first — cache key is namespaced by institute so we can't
    // mix cached responses across tenants.
    const ctx = await resolveUserContext(userId);
    const userRole = ctx.role;
    const userInstituteId = ctx.instituteId;

    // 1. Check server-side cache (skip when PDF is attached). Key = sha256(institute::feature::prompt).
    const cacheKey = await hashPrompt(prompt, feature, userInstituteId);
    if (!pdfUrl) {
      const cacheRes = await sbRest(`/ai_content_cache?content_hash=eq.${encodeURIComponent(cacheKey)}&select=extracted_text&limit=1`);
      if (cacheRes.ok) {
        const rows = await cacheRes.json();
        if (rows[0]?.extracted_text) {
          return new Response(JSON.stringify({ response: rows[0].extracted_text, cached: true }), {
            headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 2. Rate limit — per-institute × per-role × per-feature (with legacy 50/day fallback)
    {

      const featureIsLimited = ROLE_LIMITED_FEATURES.has(feature);

      if (featureIsLimited && userInstituteId && userRole && (userRole === 'student' || userRole === 'teacher')) {
        // Role-based limit for one of the 5 configured AI features
        const limit = await getRoleLimit(userInstituteId, userRole, feature);
        const effectiveLimit = limit ?? (userRole === 'teacher' ? 15 : 10);
        const count = await countTodayUsage(userId, feature);
        if (count >= effectiveLimit) {
          return new Response(JSON.stringify({
            error: `تجاوزت حد الاستخدام اليومي (${effectiveLimit} طلب لميزة ${feature})`,
            limit: effectiveLimit,
            used: count,
          }), {
            status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
      } else {
        // Legacy global cap (50/day) for non-configured features or when role/institute unknown
        const today = new Date().toISOString().split('T')[0];
        const countRes = await sbRest(
          `/ai_usage_log?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${today}T00:00:00&select=id`,
          { headers: { 'Prefer': 'count=exact' } }
        );
        const contentRange = countRes.headers.get('content-range') || '';
        const count = Number(contentRange.split('/')[1] || '0');
        if (count >= 50) {
          return new Response(JSON.stringify({ error: 'حد الاستخدام اليومي (50 طلب)' }), {
            status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 3. Call OpenRouter
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: 'مفتاح AI غير مضاف بالسيرفر' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const contentParts: any[] = [{ type: 'text', text: prompt }];

    if (pdfUrl) {
      try {
        // (d) Timeout + max response size enforcement.
        // Without an AbortController the edge function would block indefinitely
        // on a slow/stalled server controlled by an attacker (DoS / cost abuse).
        // We also stream-check size rather than trusting Content-Length, since a
        // server could lie about it and send an unbounded body.
        const PDF_MAX_BYTES = 18 * 1024 * 1024; // 18 MB
        const PDF_FETCH_TIMEOUT_MS = 10_000;     // 10 s

        const abortCtrl = new AbortController();
        const pdfTimer = setTimeout(() => abortCtrl.abort(), PDF_FETCH_TIMEOUT_MS);

        const pdfRes = await fetch(pdfUrl, { signal: abortCtrl.signal }).finally(() => clearTimeout(pdfTimer));
        if (!pdfRes.ok) throw new Error('PDF fetch failed');

        // Check declared size first (fast path) — then cap actual bytes read.
        const contentLength = Number(pdfRes.headers.get('content-length') || 0);
        if (contentLength > PDF_MAX_BYTES) {
          return new Response(JSON.stringify({ error: 'حجم الـ PDF أكبر من 18 ميجا. قسّمه لأجزاء.' }), {
            status: 413, headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }

        // Stream and accumulate, aborting if total exceeds cap.
        const reader = pdfRes.body?.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > PDF_MAX_BYTES) {
              reader.cancel();
              return new Response(JSON.stringify({ error: 'حجم الـ PDF أكبر من 18 ميجا. قسّمه لأجزاء.' }), {
                status: 413, headers: { ...cors, 'Content-Type': 'application/json' },
              });
            }
            chunks.push(value);
          }
        }
        const buf = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.byteLength; }
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < buf.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
        }
        const pdfB64 = btoa(binary);
        // OpenRouter Gemini route does NOT understand `type: 'file'`. Per the
        // OpenRouter docs, PDFs are delivered to Gemini via `type: 'image_url'`
        // with a `data:application/pdf;base64,...` data URL. The older "file"
        // shape only works for Anthropic/Claude. Sending the wrong shape made
        // every Gemini model fail (400 from upstream → 502 to client).
        // See: https://openrouter.ai/docs/features/multimodal/pdfs
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:application/pdf;base64,${pdfB64}`,
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'فشل قراءة ملف الـ PDF' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    let aiRes: Response | null = null;
    let lastErrText = '';
    let usedModel = '';
    // When the user attached a PDF, opt-in to OpenRouter's pdf-text plugin so the
    // file content is parsed server-side (free) before being passed to Gemini.
    // Without this, large PDFs sometimes silently fail upstream — plugin guarantees
    // the model sees the extracted text alongside our image_url fallback.
    const openRouterBody: Record<string, unknown> = {
      messages: [{ role: 'user', content: contentParts }],
    };
    if (pdfUrl) {
      openRouterBody.plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
    }
    for (const model of OPENROUTER_MODELS) {
      try {
        const attempt = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://kai-mobile.app',
            'X-Title': 'KAI Mobile',
          },
          body: JSON.stringify({
            model,
            ...openRouterBody,
          }),
        });
        if (attempt.ok) {
          aiRes = attempt;
          usedModel = model;
          break;
        }
        lastErrText = `${model}: ${attempt.status} — ${(await attempt.text()).slice(0, 200)}`;
      } catch (e: any) {
        lastErrText = `${model}: ${e?.message || 'network'}`;
      }
    }

    if (!aiRes) {
      // Server-side error logging only — never leak provider details to client.
      console.error('[ai-proxy] all models failed:', lastErrText, 'pdfAttached:', !!pdfUrl);
      // For PDF flow, hint the most common cause so the teacher knows what to retry.
      const friendly = pdfUrl
        ? 'فشل تحليل ملف الـ PDF عبر AI. حاول بملف أصغر (أقل من 10 ميجا) أو بعدد صفحات أقل.'
        : 'فشل الاتصال بمزوّد AI. حاول بعد دقائق.';
      return new Response(JSON.stringify({ error: friendly }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const data = await aiRes.json();
    const response: string = data?.choices?.[0]?.message?.content || '';
    const usage = data?.usage || {};
    const inputTokens = Number(usage.prompt_tokens || 0);
    const outputTokens = Number(usage.completion_tokens || 0);
    const inputCost = (inputTokens / 1_000_000) * PRICE_INPUT_PER_1M;
    const outputCost = (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_1M;
    const totalCostUsd = inputCost + outputCost;
    const totalCostIqd = totalCostUsd * USD_TO_IQD;
    const durationMs = Date.now() - startedAt;

    // 4. Cache the response (skip for PDF calls)
    if (!pdfUrl && response) {
      await sbRest('/ai_content_cache', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          content_id: crypto.randomUUID(),
          content_type: feature,
          content_hash: cacheKey,
          extracted_text: response,
        }),
      });
    }

    // 5. Log usage for rate limiting (institute_id is NOT NULL in schema — skip if unknown)
    if (userId && userInstituteId) {
      await sbRest('/ai_usage_log', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          institute_id: userInstituteId,
          feature,
          tokens_used: inputTokens + outputTokens,
          cost_usd: totalCostUsd,
        }),
      });
    }

    // 6. Log detailed request for reports (ai_requests_log — used by admin monthly report)
    if (userId && userInstituteId) {
      await sbRest('/ai_requests_log', {
        method: 'POST',
        body: JSON.stringify({
          institute_id: userInstituteId,
          user_id: userId,
          user_role: userRole || 'unknown',
          feature,
          model_used: usedModel,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          input_cost_usd: inputCost,
          output_cost_usd: outputCost,
          total_cost_usd: totalCostUsd,
          total_cost_iqd: totalCostIqd,
          used_cache: false,
          duration_ms: durationMs,
          status: 'success',
        }),
      });
    }

    return new Response(JSON.stringify({ response, cached: false }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    // Generic Arabic message to client; full error logged server-side.
    return new Response(
      JSON.stringify(safeError(err, 'ai-proxy:handler', 'internal')),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
