// platformAdminService — كل عمليات الـ Platform Admin بمكان واحد.
// تغطي: impersonation, subscriptions, broadcasts, system health,
// institute activity, support tickets, moderation, failed logins, changelog.
//
// ملاحظة أمنية: كل العمليات الحرجة (impersonation, send broadcast) تمر عبر
// SECURITY DEFINER RPCs مع تحقق role='admin' + institute_id IS NULL.
// أي محاولة من غير admin منصة → 'unauthorized'.

import { supabase } from './supabase';

// ───────────────────────── Impersonation ──────────────────────────

export interface ImpersonationSession {
  id: string;
  admin_id: string;
  target_user_id: string;
  target_institute_id: string | null;
  reason: string;
  started_at: string;
  ended_at: string | null;
  ended_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  // joined
  target_name?: string;
  target_institute_name?: string;
}

// Local key for the admin's pre-impersonation session — used to restore on end.
const IMP_PREV_SESSION_KEY = '@kai_impersonation_prev_session';

// Legacy: just records the audit row (no session swap). Kept for back-compat
// with callers that don't need the actual sign-in. Prefer impersonateUser().
export async function startImpersonation(targetUserId: string, reason: string) {
  const { data, error } = await supabase.rpc('start_impersonation', {
    p_target_user_id: targetUserId, p_reason: reason,
  });
  if (error) throw error;
  return data as { session_id: string; target_user_id: string; target_institute_id: string; started_at: string };
}

// Full impersonation flow:
//   1. Stash the admin's current session in AsyncStorage.
//   2. Call the impersonate Edge Function (which verifies admin + records
//      audit row via start_impersonation RPC + issues a session for target).
//   3. Install the returned session in the local supabase client.
// On end-impersonation, the stashed session is restored and the RPC closes
// the audit row.
export async function impersonateUser(targetUserId: string, reason: string): Promise<{
  impersonation_session_id: string;
}> {
  const SUPABASE_URL = (supabase as any).supabaseUrl
    || (supabase as any).restUrl?.replace(/\/rest\/v1$/, '')
    || '';
  if (!SUPABASE_URL) throw new Error('supabase_url_unresolved');

  const { data: currentSession } = await supabase.auth.getSession();
  if (!currentSession?.session) throw new Error('not_authenticated');

  // 1. Stash admin's session for later restore.
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(IMP_PREV_SESSION_KEY, JSON.stringify({
      access_token: currentSession.session.access_token,
      refresh_token: currentSession.session.refresh_token,
      stashed_at: new Date().toISOString(),
    }));
  } catch (e) {
    throw new Error('cannot_stash_admin_session');
  }

  // 2. Call Edge Function with admin's current JWT.
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/impersonate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${currentSession.session.access_token}`,
    },
    body: JSON.stringify({ target_user_id: targetUserId, reason }),
  });
  const json = await resp.json();
  if (!resp.ok || !json?.success) {
    // Roll back stash on failure so we don't leave a stale entry.
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem(IMP_PREV_SESSION_KEY);
    } catch {}
    throw new Error(json?.error || 'impersonation_failed');
  }

  // 3. Install target's session.
  const { error: setErr } = await supabase.auth.setSession({
    access_token: json.session.access_token,
    refresh_token: json.session.refresh_token,
  });
  if (setErr) throw setErr;

  return { impersonation_session_id: json.impersonation_session_id };
}

export async function endImpersonation(sessionId?: string) {
  // 1. Close audit row server-side (runs as the impersonated user — RPC
  //    uses auth.uid() of admin which is no longer the active session).
  //    We need to restore the admin session FIRST so the RPC sees admin.
  let prevAccess: string | null = null;
  let prevRefresh: string | null = null;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const stash = await AsyncStorage.getItem(IMP_PREV_SESSION_KEY);
    if (stash) {
      const parsed = JSON.parse(stash);
      prevAccess = parsed.access_token;
      prevRefresh = parsed.refresh_token;
    }
  } catch {}

  // 2. Restore admin session (if we had one stashed).
  if (prevAccess && prevRefresh) {
    await supabase.auth.setSession({
      access_token: prevAccess,
      refresh_token: prevRefresh,
    });
  }

  // 3. NOW close the audit row as admin (auth.uid() = admin again).
  const { error } = await supabase.rpc('end_impersonation',
    sessionId ? { p_session_id: sessionId } : {});
  if (error && !prevAccess) throw error;

  // 4. Clean up stash.
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(IMP_PREV_SESSION_KEY);
  } catch {}
}

// Quick check: is the current device in the middle of an impersonation
// session? Used by ImpersonationBanner to render or hide.
export async function hasStashedAdminSession(): Promise<boolean> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const stash = await AsyncStorage.getItem(IMP_PREV_SESSION_KEY);
    return !!stash;
  } catch {
    return false;
  }
}

export async function listImpersonations(limit = 50): Promise<ImpersonationSession[]> {
  const { data, error } = await supabase
    .from('impersonation_sessions')
    .select(`
      *,
      target:target_user_id ( full_name ),
      institute:target_institute_id ( name )
    `)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    target_name: r.target?.full_name,
    target_institute_name: r.institute?.name,
  }));
}

export async function getActiveImpersonation(): Promise<ImpersonationSession | null> {
  const { data } = await supabase
    .from('impersonation_sessions')
    .select(`*, target:target_user_id ( full_name ), institute:target_institute_id ( name )`)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as any),
    target_name: (data as any).target?.full_name,
    target_institute_name: (data as any).institute?.name,
  };
}

// ───────────────────────── Subscriptions ──────────────────────────

export type SubscriptionPlan = 'trial' | 'basic' | 'pro' | 'enterprise' | 'custom';
export type SubscriptionStatus = 'active' | 'past_due' | 'suspended' | 'cancelled' | 'expired';

export interface InstituteSubscription {
  id: string;
  institute_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  starts_at: string;
  expires_at: string | null;
  grace_until: string | null;
  monthly_price: number | null;
  currency: string;
  seats_limit: number | null;
  notes: string | null;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  next_payment_due: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  institute_name?: string;
  institute_type?: string;
}

export async function listCurrentSubscriptions(): Promise<InstituteSubscription[]> {
  // Join with institutes — view returns one row per institute
  const { data, error } = await supabase
    .from('institute_subscriptions_current')
    .select(`*, institute:institute_id ( name, type )`)
    .order('expires_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    institute_name: r.institute?.name,
    institute_type: r.institute?.type,
  }));
}

export async function getSubscriptionForInstitute(instituteId: string): Promise<InstituteSubscription | null> {
  const { data } = await supabase
    .from('institute_subscriptions_current')
    .select(`*, institute:institute_id ( name, type )`)
    .eq('institute_id', instituteId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as any),
    institute_name: (data as any).institute?.name,
    institute_type: (data as any).institute?.type,
  };
}

export interface CreateSubscriptionInput {
  institute_id: string;
  plan: SubscriptionPlan;
  status?: SubscriptionStatus;
  expires_at?: string | null;
  monthly_price?: number | null;
  currency?: string;
  seats_limit?: number | null;
  notes?: string;
}

export async function upsertSubscription(input: CreateSubscriptionInput): Promise<InstituteSubscription> {
  const { data, error } = await supabase
    .from('institute_subscriptions')
    .insert({
      institute_id: input.institute_id,
      plan: input.plan,
      status: input.status || 'active',
      expires_at: input.expires_at || null,
      monthly_price: input.monthly_price || null,
      currency: input.currency || 'IQD',
      seats_limit: input.seats_limit || null,
      notes: input.notes || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as InstituteSubscription;
}

export async function recordSubscriptionPayment(subscriptionId: string, amount: number) {
  const { error } = await supabase
    .from('institute_subscriptions')
    .update({
      last_payment_at: new Date().toISOString(),
      last_payment_amount: amount,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId);
  if (error) throw error;
}

// ───────────────────────── Broadcasts ──────────────────────────────

export type BroadcastSeverity = 'info' | 'warning' | 'critical' | 'success';
export type BroadcastTargetScope = 'all' | 'role' | 'institute' | 'institute_role';

export interface PlatformBroadcast {
  id: string;
  title: string;
  body: string;
  severity: BroadcastSeverity;
  target_scope: BroadcastTargetScope;
  target_role: string | null;
  target_institute_ids: string[];
  cta_label: string | null;
  cta_url: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  recipient_count: number;
  created_by: string;
  created_at: string;
}

export interface CreateBroadcastInput {
  title: string;
  body: string;
  severity?: BroadcastSeverity;
  target_scope: BroadcastTargetScope;
  target_role?: string | null;
  target_institute_ids?: string[];
  cta_label?: string | null;
  cta_url?: string | null;
  scheduled_for?: string | null;
}

export async function createBroadcast(input: CreateBroadcastInput): Promise<PlatformBroadcast> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user?.id) throw new Error('not_authenticated');
  const { data, error } = await supabase
    .from('platform_broadcasts')
    .insert({
      title: input.title,
      body: input.body,
      severity: input.severity || 'info',
      target_scope: input.target_scope,
      target_role: input.target_role || null,
      target_institute_ids: input.target_institute_ids || [],
      cta_label: input.cta_label || null,
      cta_url: input.cta_url || null,
      scheduled_for: input.scheduled_for || null,
      created_by: userData.user.id,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PlatformBroadcast;
}

export async function sendBroadcast(broadcastId: string): Promise<{ success: boolean; recipient_count: number }> {
  const { data, error } = await supabase.rpc('send_platform_broadcast', { p_broadcast_id: broadcastId });
  if (error) throw error;
  return data as any;
}

export async function listBroadcasts(limit = 50): Promise<PlatformBroadcast[]> {
  const { data, error } = await supabase
    .from('platform_broadcasts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as PlatformBroadcast[];
}

// ───────────────────────── System Health ──────────────────────────

export interface SystemHealthSnapshot {
  total_users: number;
  total_institutes: number;
  notifications_24h: number;
  active_users_24h: number;
  db_size_bytes: number;
  db_size_mb: number;
  taken_at: string;
}

export async function getSystemHealthNow(): Promise<SystemHealthSnapshot> {
  const { data, error } = await supabase.rpc('get_system_health_now');
  if (error) throw error;
  return data as SystemHealthSnapshot;
}

export async function getHealthHistory(hours = 24): Promise<any[]> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from('system_health_snapshots')
    .select('*')
    .gte('taken_at', since)
    .order('taken_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data || [];
}

// ───────────────────────── Institute Activity ──────────────────────

export interface InstituteActivity {
  institute_id: string;
  institute_name: string;
  institute_type: string;
  total_users: number;
  active_today: number;
  active_7d: number;
  active_30d: number;
  last_activity: string | null;
  notifications_30d: number;
  messages_30d: number;
  health_score: number;
}

export async function getInstituteActivity(): Promise<InstituteActivity[]> {
  const { data, error } = await supabase.rpc('get_institute_activity');
  if (error) throw error;
  return (data || []) as InstituteActivity[];
}

// ───────────────────────── Support Tickets ────────────────────────

export type TicketCategory = 'bug' | 'feature' | 'question' | 'billing' | 'other';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  user_id: string | null;
  institute_id: string | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  body: string;
  device_info: any;
  screenshots: string[] | null;
  admin_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  // joined
  user_name?: string;
  institute_name?: string;
}

export async function listTickets(filter?: { status?: TicketStatus; limit?: number }): Promise<SupportTicket[]> {
  let q = supabase
    .from('support_tickets')
    .select(`*, user:user_id ( full_name ), institute:institute_id ( name )`)
    .order('created_at', { ascending: false })
    .limit(filter?.limit || 100);
  if (filter?.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    user_name: r.user?.full_name,
    institute_name: r.institute?.name,
  }));
}

export async function updateTicket(
  ticketId: string,
  patch: Partial<Pick<SupportTicket, 'status' | 'priority' | 'admin_notes' | 'resolved_at' | 'resolved_by'>>,
) {
  const { error } = await supabase
    .from('support_tickets')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', ticketId);
  if (error) throw error;
}

export async function createTicket(input: {
  user_id: string;
  institute_id?: string | null;
  category: TicketCategory;
  priority?: TicketPriority;
  subject: string;
  body: string;
  device_info?: any;
  screenshots?: string[];
}): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: input.user_id,
      sender_id: input.user_id, // backward compat
      institute_id: input.institute_id || null,
      category: input.category,
      priority: input.priority || 'normal',
      subject: input.subject,
      body: input.body,
      message: input.body, // backward compat
      device_info: input.device_info || null,
      screenshots: input.screenshots || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SupportTicket;
}

// ───────────────────────── Moderation ─────────────────────────────

export interface ModerationReport {
  id: string;
  reporter_id: string;
  institute_id: string | null;
  content_type: string;
  content_id: string | null;
  content_snapshot: string | null;
  reason: string;
  reason_category: 'spam' | 'harassment' | 'inappropriate' | 'violence' | 'other';
  status: 'pending' | 'reviewing' | 'dismissed' | 'action_taken';
  action_taken: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  reporter_name?: string;
  institute_name?: string;
}

export async function listModerationReports(filter?: { status?: string; limit?: number }) {
  let q = supabase
    .from('moderation_reports')
    .select(`*, reporter:reporter_id ( full_name ), institute:institute_id ( name )`)
    .order('created_at', { ascending: false })
    .limit(filter?.limit || 100);
  if (filter?.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    reporter_name: r.reporter?.full_name,
    institute_name: r.institute?.name,
  })) as ModerationReport[];
}

export async function reviewModerationReport(
  reportId: string,
  action: 'dismissed' | 'action_taken',
  actionTaken?: string,
) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('moderation_reports')
    .update({
      status: action,
      action_taken: actionTaken || null,
      reviewed_by: userData?.user?.id || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reportId);
  if (error) throw error;
}

// ───────────────────────── Failed Logins ──────────────────────────

export interface FailedLoginAttempt {
  id: string;
  attempted_code: string;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  created_at: string;
}

export async function listFailedLogins(filter?: {
  ip?: string;
  hours?: number;
  limit?: number;
}): Promise<FailedLoginAttempt[]> {
  let q = supabase
    .from('failed_login_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filter?.limit || 200);
  if (filter?.ip) q = q.eq('ip_address', filter.ip);
  if (filter?.hours) {
    const since = new Date(Date.now() - filter.hours * 3600_000).toISOString();
    q = q.gte('created_at', since);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as FailedLoginAttempt[];
}

// Aggregation: top IPs and top codes attempted in last 24h
export async function getBruteForceSummary(hours = 24): Promise<{
  topIps: Array<{ ip: string; count: number }>;
  topCodes: Array<{ code: string; count: number }>;
  total: number;
}> {
  const attempts = await listFailedLogins({ hours, limit: 1000 });
  const ips: Record<string, number> = {};
  const codes: Record<string, number> = {};
  for (const a of attempts) {
    if (a.ip_address) ips[a.ip_address] = (ips[a.ip_address] || 0) + 1;
    codes[a.attempted_code] = (codes[a.attempted_code] || 0) + 1;
  }
  return {
    topIps: Object.entries(ips).map(([ip, count]) => ({ ip, count })).sort((a, b) => b.count - a.count).slice(0, 20),
    topCodes: Object.entries(codes).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 20),
    total: attempts.length,
  };
}

// ───────────────────────── Changelog ──────────────────────────────

export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  body: string;
  category: 'feature' | 'improvement' | 'fix' | 'security' | 'breaking';
  is_published: boolean;
  published_at: string | null;
  target_role: string | null;
  created_by: string | null;
  created_at: string;
}

export async function listChangelogEntries(opts?: { publishedOnly?: boolean }): Promise<ChangelogEntry[]> {
  let q = supabase
    .from('changelog_entries')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (opts?.publishedOnly) q = q.eq('is_published', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ChangelogEntry[];
}

export async function createChangelogEntry(input: {
  version: string;
  title: string;
  body: string;
  category: ChangelogEntry['category'];
  target_role?: string | null;
}): Promise<ChangelogEntry> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('changelog_entries')
    .insert({ ...input, created_by: userData?.user?.id })
    .select('*')
    .single();
  if (error) throw error;
  return data as ChangelogEntry;
}

export async function publishChangelogEntry(entryId: string) {
  const { error } = await supabase
    .from('changelog_entries')
    .update({ is_published: true, published_at: new Date().toISOString() })
    .eq('id', entryId);
  if (error) throw error;
}

export async function markChangelogSeen(entryIds: string[], userId: string) {
  if (entryIds.length === 0) return;
  await supabase.from('changelog_seen').upsert(
    entryIds.map((id) => ({ entry_id: id, user_id: userId })),
    { onConflict: 'user_id,entry_id' },
  );
}

// ───────────────────────── Bulk Feature Toggle ────────────────────
// Helper used by the bulk-flag UI: toggle a feature on/off for ALL institutes
// at once (no new table needed — it just iterates `institute_features`).

export async function bulkSetFeature(featureKey: string, enabled: boolean) {
  // The actual table is `feature_flags` (institute_id + feature_key composite),
  // not `institute_features` — schema check confirmed 2026-05-16.
  const { data: institutes } = await supabase.from('institutes').select('id').limit(1000);
  if (!institutes) return { updated: 0 };
  const { data: userData } = await supabase.auth.getUser();
  const enabledBy = userData?.user?.id || null;
  const nowIso = new Date().toISOString();
  const rows = (institutes as any[]).map((i) => ({
    institute_id: i.id,
    feature_key: featureKey,
    is_enabled: enabled,
    enabled_at: enabled ? nowIso : null,
    enabled_by: enabled ? enabledBy : null,
    updated_at: nowIso,
  }));
  const { error } = await supabase.from('feature_flags').upsert(rows, { onConflict: 'institute_id,feature_key' });
  if (error) throw error;
  return { updated: rows.length };
}
