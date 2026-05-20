import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import useAuthStore from './authStore';

interface PlatformStats {
  institutes: number;
  teachers: number;
  students: number;
  parents: number;
  // totalUsers counts ALL non-admin roles (teacher, student, parent, institute_admin,
  // cafeteria, medical) — used by home/users-tab subtitle so it matches per-institute
  // user lists. Previously the subtitle summed only teachers+students+parents which
  // under-counted institute_admin/cafeteria/medical staff and looked inconsistent
  // with each institution's "N مستخدم" badge.
  totalUsers: number;
}

interface SystemSettings {
  maintenance: boolean;
  smsAlerts: boolean;
  autoBackup: boolean;
}

interface Ticket {
  id: string;
  sender_id: string;
  sender_name: string;
  subject: string;
  message: string;
  status: string;
  reply: string | null;
  created_at: string;
}

interface AccountLogEntry {
  id: string;
  created_user_id: string;
  created_user_name: string;
  created_user_role: string;
  institute_id: string;
  institute_name: string;
  created_at: string;
}

interface PricingEntry {
  id: string;
  institute_id: string;
  role: string;
  price_per_account: number;
  max_accounts: number;
  currency: string;
}

interface AdminState {
  onlineCount: number;
  platformStats: PlatformStats;
  tickets: Ticket[];
  accountLog: AccountLogEntry[];
  pricing: PricingEntry[];
  pricingData: any;
  systemSettings: SystemSettings;
  isLoading: boolean;

  loadOnlineCount: () => Promise<void>;
  loadPlatformStats: () => Promise<void>;
  subscribeToPlatformStats: () => () => void;
  loadTickets: () => Promise<void>;
  loadAccountLog: (instituteId?: string) => Promise<void>;
  loadPricing: () => Promise<void>;
  loadSystemSettings: () => Promise<void>;
  toggleSetting: (key: keyof SystemSettings) => Promise<void>;
  replyToTicket: (ticketId: string, reply: string) => Promise<void>;
}

const useAdminStore = create<AdminState>((set, get) => ({
  onlineCount: 0,
  platformStats: { institutes: 0, teachers: 0, students: 0, parents: 0, totalUsers: 0 },
  tickets: [],
  accountLog: [],
  pricing: [],
  pricingData: null,
  systemSettings: { maintenance: false, smsAlerts: false, autoBackup: false },
  isLoading: false,

  loadOnlineCount: async () => {
    // onlineCount is now maintained live by presenceStore via Supabase Realtime Presence
    // (zero DB writes, auto-cleanup on disconnect). This function is a no-op kept for
    // backward compatibility with existing call sites (admin dashboard refresh handlers).
    // The value in state is updated in real time whenever a user joins/leaves.
  },

  loadPlatformStats: async () => {
    try {
      // pageSize: 5000 to widen the per-role buckets beyond the default 200; the
      // API hard-caps at 500 internally so the network payload stays bounded.
      // totalUsers reads result.total (count from the DB) so the headline figure
      // stays correct even after the platform exceeds the page size.
      const result = await api.getAllUsersWithDetails({ pageSize: 5000 });
      const users = result.users || [];
      const institutes = result.institutes || [];
      set({
        platformStats: {
          institutes: institutes.length,
          teachers: users.filter((u: any) => u.role === 'teacher').length,
          students: users.filter((u: any) => u.role === 'student').length,
          parents: users.filter((u: any) => u.role === 'parent').length,
          totalUsers: result.total ?? users.filter((u: any) => u.role !== 'admin').length,
        },
      });
    } catch (err) { console.error(err); }
  },

  // Realtime: debounced refresh whenever users or institutes change at the DB level.
  // Platform admin sees counts update as institutes are created/deleted or user roles
  // change, without needing to pull-to-refresh. The debounce absorbs bursts (e.g. a
  // bulk import inserting 100 rows sends one refresh, not 100).
  //
  // Unique channel name per call — supabase.channel(name) returns the same cached
  // object if name repeats, and adding `.on()` to an already-subscribed channel
  // throws "tried to add callbacks after subscribe()". This killed admin home on
  // remount (HMR, strict double-invoke, re-navigation).
  subscribeToPlatformStats: () => {
    // Hard gate: this channel listens to UNFILTERED users/institutes/enrollments
    // changes — only platform admins are allowed to subscribe. RLS would also
    // block the change events for non-admins, but we refuse early so an
    // accidentally-mounted admin screen on a wrong role doesn't open a noisy
    // useless channel.
    const role = useAuthStore.getState().role;
    if (role !== 'admin') {
      if (__DEV__) console.warn('[adminStore] subscribeToPlatformStats blocked — role:', role);
      return () => {};
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        get().loadPlatformStats();
        timer = null;
      }, 750);
    };

    const chan: RealtimeChannel = supabase
      .channel(`platform-stats-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'institutes' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(chan);
    };
  },

  loadTickets: async () => {
    try {
      const result = await api.getTickets();
      set({ tickets: result });
    } catch (err) { console.error(err); }
  },

  loadAccountLog: async (instituteId?: string) => {
    try {
      const result = await api.getAccountLog(instituteId) as any;
      set({ accountLog: result.logs || [] });
    } catch (err) { console.error(err); }
  },

  loadPricing: async () => {
    try {
      const result = await api.getInstitutePricing();
      set({ pricing: result.pricing || [], pricingData: result });
    } catch (err) { console.error(err); }
  },

  loadSystemSettings: async () => {
    try {
      const result = await api.getSystemSettings();
      set({
        systemSettings: {
          maintenance: result.maintenance ?? false,
          smsAlerts: result.sms_alerts ?? result.smsAlerts ?? false,
          autoBackup: result.auto_backup ?? result.autoBackup ?? false,
        },
      });
    } catch (err) { console.error(err); }
  },

  toggleSetting: async (key) => {
    const current = get().systemSettings;
    const updated = { ...current, [key]: !current[key] };
    set({ systemSettings: updated });
    try {
      await api.toggleSystemSetting(updated);
    } catch {
      // revert on failure
      set({ systemSettings: current });
    }
  },

  replyToTicket: async (ticketId, reply) => {
    try {
      await api.replyToTicket(ticketId, reply);
      set((state) => ({
        tickets: state.tickets.map((t) =>
          t.id === ticketId ? { ...t, reply, status: 'replied' } : t
        ),
      }));
    } catch (err) { console.error(err); }
  },
}));

export default useAdminStore;
