// supabase/functions/health-snapshot
// ──────────────────────────────────────────────────────────────────────
// Captures a snapshot of system metrics into system_health_snapshots.
// Triggered by pg_cron (or external scheduler) every 5 minutes.
// Authentication: secret header X-CRON-SECRET (set via Supabase secrets).
//
// Why an Edge Function and not pg_cron-only:
//   pg_cron can run SQL but can't easily call storage size or external
//   metrics. This function aggregates from multiple sources and writes
//   a single row. Today it's pure DB queries — keeps the door open for
//   adding storage/edge-function error metrics later without schema
//   changes (extra columns + extra fields in `extra` JSONB).

// @ts-ignore — Deno runtime import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore — Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-ignore — Deno globals
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-ignore — Deno globals
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// @ts-ignore — Deno globals
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

serve(async (req: Request) => {
  // Auth check — only allow our own cron + manual platform admin trigger.
  // CRON_SECRET is the cheap path; the manual path verifies the bearer.
  const headerSecret = req.headers.get('x-cron-secret') || '';
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';

  let allowed = false;
  if (CRON_SECRET && headerSecret === CRON_SECRET) {
    allowed = true;
  } else if (bearer) {
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userResp } = await userClient.auth.getUser();
    if (userResp?.user?.id) {
      const { data: enroll } = await userClient
        .from('enrollments')
        .select('role, institute_id')
        .eq('user_id', userResp.user.id)
        .eq('status', 'active')
        .is('institute_id', null)
        .eq('role', 'admin')
        .maybeSingle();
      if (enroll) allowed = true;
    }
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // Pull live metrics in parallel — each one is a small aggregate.
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

    const [
      active5mResp,
      notifs1hResp,
      dbSizeResp,
    ] = await Promise.all([
      admin.from('notifications')
        .select('sender_id', { count: 'exact', head: true })
        .gte('created_at', fiveMinAgo),
      admin.from('notifications')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo),
      // pg_database_size via raw SQL through PostgREST
      admin.rpc('get_system_health_now'),
    ]);

    const active_users_5m = active5mResp.count || 0;
    const notifications_sent_1h = notifs1hResp.count || 0;
    const dbSizeBytes = (dbSizeResp.data as any)?.db_size_bytes || 0;

    // Insert the snapshot. The errors_1h and storage_bytes fields stay 0/null
    // for now — they need integration with edge-function logs and storage.objects
    // metadata, which are best added incrementally so we don't block this
    // baseline cron.
    const { error: insertErr } = await admin
      .from('system_health_snapshots')
      .insert({
        active_users_5m,
        notifications_sent_1h,
        errors_1h: 0,
        db_size_bytes: dbSizeBytes,
        storage_bytes: null,
        extra: {
          snapshot_source: 'health-snapshot-edge-function',
        },
      });
    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500, headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      taken_at: new Date().toISOString(),
      active_users_5m,
      notifications_sent_1h,
      db_size_bytes: dbSizeBytes,
    }), { headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
});
