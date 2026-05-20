// Supabase Edge Function: attendance-device
// Receives fingerprint/biometric scans from physical devices
// URL: POST https://<project>.supabase.co/functions/v1/attendance-device
//
// Headers:
//   x-api-key: <device api key>
//   Content-Type: application/json
//
// Body:
//   { "student_code": "KAI-ABC123", "scan_type": "in" }
//
// Response:
//   { "success": true, "student_name": "أحمد", "duplicate": false }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { safeError } from '../_shared/safeError.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

// Per-device rate limit. Hardware fingerprint scanners typically push 1-2
// scans/sec at peak (entry rush); 60/min gives plenty of headroom while
// ensuring a leaked apiKey can't burn cost via flood.
const DEVICE_RATE_MAX = 60;
const DEVICE_RATE_WIN = 60;

// x-api-key header is required for device-to-device CORS preflight.
function buildDeviceCorsHeaders(req: Request): Record<string, string> {
  const base = buildCorsHeaders(req);
  return {
    ...base,
    'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type, x-client-info, apikey',
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildDeviceCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed', code: 'invalid_input' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Extract API key from header
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'مفتاح API مطلوب (x-api-key header)', code: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (apiKey.length > 128) {
      return new Response(
        JSON.stringify({ success: false, error: 'مفتاح API غير صالح', code: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse body
    // SECURITY NOTE — institute_id is NOT accepted from the request body.
    // The `process_device_scan` RPC looks up the device by `p_api_key` and
    // reads its registered `institute_id` from the `devices` table server-side.
    // Accepting institute_id from the caller here would let any device claim
    // it belongs to any institute by simply sending a different UUID in the body.
    const body = await req.json();
    const studentCode = body.student_code || body.studentCode || body.code;
    const scanType = body.scan_type || body.scanType || 'in';
    const rawData = body.raw_data || body.rawData || null;
    // Explicitly ignore any institute_id the caller might send — the RPC owns it.

    if (!studentCode || typeof studentCode !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'رمز الطالب مطلوب (student_code)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (studentCode.length > 64) {
      return new Response(
        JSON.stringify({ success: false, error: 'رمز الطالب طويل جداً' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (scanType !== 'in' && scanType !== 'out') {
      return new Response(
        JSON.stringify({ success: false, error: 'نوع المسح غير صالح', code: 'invalid_input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Call Supabase RPC with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Per-device rate limit. We hash the apiKey briefly so the rate-limit
    // table doesn't store the device key in plaintext as the identifier.
    // (Hash is via the rate_limits table; identifier here is fine since RLS
    // blocks all client access to that table.)
    const allowed = await enforceRateLimit(
      supabase, 'attendance-device', apiKey, DEVICE_RATE_MAX, DEVICE_RATE_WIN,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify(safeError(new Error('rate_limited'), 'attendance-device:rate', 'rate_limited')),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase.rpc('process_device_scan', {
      p_api_key: apiKey,
      p_student_code: studentCode.toUpperCase(),
      p_scan_type: scanType,
      p_raw_data: rawData,
    });

    if (error) {
      // SECURITY FIX: don't leak the raw RPC error message to the device.
      // Could include DB schema hints, RLS rule details, or internal paths.
      // The device only needs a generic Arabic message; full error logged via safeError.
      return new Response(
        JSON.stringify(safeError(error, 'attendance-device:rpc', 'internal')),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Return result
    const statusCode = data?.success ? 200 : 400;
    return new Response(
      JSON.stringify(data),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify(safeError(err, 'attendance-device:handler', 'internal')),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
