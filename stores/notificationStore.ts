import { create } from 'zustand';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import type { Notification } from '../types';
import { loadNotifPrefs, shouldDeliverNotification } from '../components/shared/NotificationPreferences';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  // Bucketed unread totals by notification.type → drives the per-card badges
  // on the Services hub. Empty object = nothing unread anywhere.
  unreadByType: Record<string, number>;
  isLoading: boolean;

  loadNotifications: (userId: string, role: string, instituteId?: string) => Promise<void>;
  // Server-truth refresh of just the badge counts — used after navigating to a
  // section (e.g. opening Announcements) so the corresponding badge clears
  // without a full notifications fetch.
  refreshBadges: (userId: string, role: string, instituteId?: string) => Promise<void>;
  // Marks every unread notification of the given type as read for this user.
  // Called when the user enters the section the badge points at.
  markTypeRead: (type: string, userId: string, role: string, instituteId?: string) => Promise<void>;
  addRealtimeNotification: (notif: Notification) => void;
  markAsRead: (notifId: string, userId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  deleteOne: (notifId: string, userId: string) => Promise<void>;
  deleteAll: (userId: string) => Promise<void>;
  subscribeToRealtime: (userId: string, role: string, instituteId?: string) => () => void;
}

const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  unreadByType: {},
  isLoading: false,

  loadNotifications: async (userId, role, instituteId?) => {
    set({ isLoading: true });
    try {
      // Fetch the page AND both badge counts in parallel. The page is what
      // the user sees when they open the panel; the counts drive the badges
      // — they must come from different sources, otherwise a busy user sees
      // "10" forever (pagination cap) when reality is hundreds.
      const [result, trueUnread, byType] = await Promise.all([
        api.getNotifications(userId, role, instituteId),
        api.getUnreadNotificationCount(userId, role, instituteId),
        api.getUnreadByType(userId, role, instituteId),
      ]);
      set({ notifications: result.data, unreadCount: trueUnread, unreadByType: byType });
    } catch (err) { console.error(err); } finally {
      set({ isLoading: false });
    }
  },

  refreshBadges: async (userId, role, instituteId?) => {
    try {
      const [trueUnread, byType] = await Promise.all([
        api.getUnreadNotificationCount(userId, role, instituteId),
        api.getUnreadByType(userId, role, instituteId),
      ]);
      set({ unreadCount: trueUnread, unreadByType: byType });
    } catch (err) { console.error(err); }
  },

  markTypeRead: async (type, userId, role, instituteId?) => {
    // Mark every unread of this type as read for this user. We don't bulk-
    // update the global is_read flag (broadcasts share rows), so we upsert
    // notification_reads for each matching id. The badge clears immediately
    // after the count refresh.
    try {
      const { supabase: sb } = await import('../services/supabase');
      const ids = get().notifications.filter((n) => n.type === type && !n.is_read).map((n) => n.id);
      if (ids.length > 0) {
        await sb.from('notification_reads').upsert(
          ids.map((id) => ({ notification_id: id, user_id: userId, read_at: new Date().toISOString(), hidden: false })),
          { onConflict: 'notification_id,user_id' },
        );
      }
      // Optimistic: drop the bucket so the badge clears immediately, then
      // re-sync against the server in case there were unread rows outside
      // the loaded page.
      set((state) => {
        const next = { ...state.unreadByType };
        const removed = next[type] || 0;
        delete next[type];
        return {
          unreadByType: next,
          unreadCount: Math.max(0, state.unreadCount - removed),
          notifications: state.notifications.map((n) =>
            n.type === type && !n.is_read ? { ...n, is_read: true } : n,
          ),
        };
      });
      // Authoritative refresh — covers paginated unread that wasn't in local state.
      get().refreshBadges(userId, role, instituteId);
    } catch (err) { console.error('[markTypeRead]', err); }
  },

  addRealtimeNotification: (notif) => {
    set((state) => ({
      // Cap at 200 instead of 50 so busy users don't silently lose notifications
      notifications: [notif, ...state.notifications].slice(0, 200),
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAsRead: async (notifId, userId) => {
    await api.markNotificationRead(notifId, userId);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notifId ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async (userId) => {
    const ids = get().notifications.filter(n => !n.is_read).map(n => n.id);
    await api.markAllNotificationsRead(userId, ids);
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
  },

  deleteOne: async (notifId, userId) => {
    await api.deleteNotification(notifId, userId);
    set((state) => {
      const target = state.notifications.find((n) => n.id === notifId);
      return {
        notifications: state.notifications.filter((n) => n.id !== notifId),
        unreadCount: target && !target.is_read
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      };
    });
  },

  deleteAll: async (userId) => {
    const ids = get().notifications.map(n => n.id);
    await api.deleteAllNotifications(userId, ids);
    set({ notifications: [], unreadCount: 0 });
  },

  subscribeToRealtime: (userId, role, instituteId?) => {
    // Multi-tenant safety: without a server-side institute_id filter, every
    // INSERT across ALL institutes is broadcast to every client and filtered
    // client-side. That's a cross-tenant fanout leak (O(N_total) instead of
    // O(N_institute)) AND a bandwidth blowout at 10K users. Refuse to subscribe
    // when the institute isn't resolved yet — PushNotificationHandler already
    // re-runs this effect once userInstituteId lands.
    if (!instituteId) {
      return () => { /* no-op unsubscribe */ };
    }

    const handle = async (payload: any) => {
      const notif = payload.new as any;
      if (!notif) return;
      // Defense-in-depth: RLS + server filter already enforce this. Keep the
      // client check so a misconfigured RLS policy can't leak across tenants.
      if (notif.institute_id && notif.institute_id !== instituteId) return;
      if (notif.sender_id === userId) return;
      // Role/recipient client-side gate: the server filter is now institute_id,
      // so we receive every notification for this institute. Drop rows that
      // aren't addressed to this user, their role, or 'all'.
      const recipientRole = notif.recipient_role;
      const isForMe =
        notif.recipient_id === userId ||
        (role && recipientRole === role) ||
        recipientRole === 'all';
      if (!isForMe) return;
      try {
        const prefs = await loadNotifPrefs(userId);
        if (!shouldDeliverNotification(prefs, notif.type)) return;
      } catch { /* fail open */ }
      get().addRealtimeNotification(notif);
    };

    // Single institute-scoped channel replaces the old 3-channel fanout. The
    // server filter limits traffic to this tenant only; the handler above
    // filters by recipient_id/role on-device (cheap, already in memory).
    const chan = supabase
      .channel(`notifs-institute-${instituteId}-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `institute_id=eq.${instituteId}`,
      }, handle)
      .subscribe();

    return () => {
      supabase.removeChannel(chan);
    };
  },
}));

export default useNotificationStore;
