// supabase/functions/impersonate
// ─────────────────────────────────────────────────────────────────────────────────────
// Platform-admin-only impersonation gate. Body: { target_user_id, reason }.
// Verifies caller is a platform admin (enrollment role='admin' AND institute_id IS NULL),
// records the impersonation session via the start_impersonation RPC, and
// returns a fresh session (access_token + refresh_token) for the target user.
//
// Client usage:
//   const r = await fetch(`${SUPABASE_URL}/functions/v1/impersonate`, ...);
//   await supabase.auth.setSession({ access_token, refresh_token });
// The client is responsible for stashing the admin's prior session and
// restoring it via end-impersonation.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { 'content-type': 'application/json' },
    });
  }

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!bearer) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }

  // 1. Verify caller is a platform admin.
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: callerResp } = await userClient.auth.getUser();
  const callerId = callerResp?.user?.id;
  if (!callerId) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const { data: callerEnroll } = await userClient
    .from('enrollments')
    .select('role, institute_id')
    .eq('user_id', callerId)
    .eq('role', 'admin')
    .is('institute_id', null)
    .eq('status', 'active')
    .maybeSingle();
  if (!callerEnroll) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
  }

  // 2. Parse + validate body.
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const target_user_id = body?.target_user_id;
  const reason = (body?.reason || '').toString().trim();
  if (!target_user_id) {
    return new Response(JSON.stringify({ error: 'target_user_id_required' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }
  if (reason.length < 5) {
    return new Response(JSON.stringify({ error: 'reason_required' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  // 3. Use the start_impersonation RPC (runs under caller's JWT — enforces
  //    the active-session-uniqueness check via RLS and writes audit row).
  const { data: startResp, error: startErr } = await userClient.rpc('start_impersonation', {
    p_target_user_id: target_user_id, p_reason: reason,
  });
  if (startErr) {
    return new Response(JSON.stringify({ error: startErr.message }), {
      status: 409, headers: { 'content-type': 'application/json' },
    });
  }

  // 4. Generate a session for the target user. We use the magic-link admin
  //    helper because it lets us bypass the password; the email is
  //    deterministic (auth.users.email derived from code).
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: targetAuthUser } = await adminClient.auth.admin.getUserById(target_user_id);
  const targetEmail = targetAuthUser?.user?.email;
  if (!targetEmail) {
    return new Response(JSON.stringify({ error: 'target_email_unknown' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink', email: targetEmail,
  });
  if (linkErr || !linkData) {
    return new Response(JSON.stringify({ error: linkErr?.message || 'link_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  // 5. Exchange the OTP hash for a session. The verifyOtp endpoint returns
  //    {access_token, refresh_token} the client can install via setSession.
  const hashed_token = (linkData as any)?.properties?.hashed_token;
  if (!hashed_token) {
    return new Response(JSON.stringify({ error: 'no_hashed_token' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
  const { data: sessData, error: sessErr } = await adminClient.auth.verifyOtp({
    type: 'magiclink', token_hash: hashed_token,
  });
  if (sessErr || !sessData?.session) {
    return new Response(JSON.stringify({ error: sessErr?.message || 'otp_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    session: {
      access_token: sessData.session.access_token,
      refresh_token: sessData.session.refresh_token,
      expires_at: sessData.session.expires_at,
    },
    target_user_id,
    impersonation_session_id: (startResp as any)?.session_id,
  }), { headers: { 'content-type': 'application/json' } });
});
