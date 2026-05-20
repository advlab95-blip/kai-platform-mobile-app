// Shared CORS allowlist — replaces wildcards across Edge Functions.
//
// The mobile app is the primary caller; web preview is for staging only.
// Wildcards `*` allow any browser origin to invoke an authenticated endpoint
// with a stolen JWT (CSRF-like attack vector). Allowlist below is explicit.

const ALLOWED_ORIGINS = new Set<string>([
  // Mobile app (Expo Go / dev builds use null/empty origin)
  'https://kaiplatform.app',
  'https://www.kaiplatform.app',
  'https://kai-platform.app',
  'https://www.kai-platform.app',
  // Local development (Expo web preview, only when needed)
  'http://localhost:8081',
  'http://localhost:8088',
  'http://localhost:19006',
  'http://localhost:3000',
]);

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  // Native mobile clients send no Origin header (or 'null'); for them we return
  // the canonical domain (no need to reflect, native bypasses CORS anyway).
  // For browsers, only mirror back known-good origins.
  let allow: string;
  if (ALLOWED_ORIGINS.has(origin)) {
    allow = origin; // mirror only whitelisted browser origins
  } else {
    allow = 'https://kaiplatform.app'; // safe default — covers null/empty/unknown
  }

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
