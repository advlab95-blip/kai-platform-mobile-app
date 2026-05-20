import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useAdminStore from './adminStore';

// Supabase Realtime Presence — tracks who is currently online without polling.
// Zero DB writes: the server keeps an in-memory roster that clears automatically
// when a client disconnects (tab closed, app backgrounded past timeout, network drop).
//
// Two channels per signed-in user:
//   - `online:platform`        — every authenticated user joins. Platform admin reads this total.
//   - `online:institute:<id>`  — only users belonging to that institute join. For per-institute dashboards.
//
// Keying by user_id dedupes multiple tabs/devices for the same user into a single "online" slot.

export type OnlineUserMeta = {
  user_id: string;
  role: string;
  institute_id: string | null;
  online_at: string;
};

interface PresenceState {
  platformCount: number;
  instituteCount: number;
  /** Flat list of online presences (deduped by user_id). Drives the online-users sheet. */
  onlineUsers: OnlineUserMeta[];
  _platformChan: RealtimeChannel | null;
  _instituteChan: RealtimeChannel | null;

  joinPresence: (userId: string, instituteId: string | null, role: string) => void;
  leavePresence: () => void;
}

const usePresenceStore = create<PresenceState>((set, get) => ({
  platformCount: 0,
  instituteCount: 0,
  onlineUsers: [],
  _platformChan: null,
  _instituteChan: null,

  joinPresence: (userId, instituteId, role) => {
    if (!userId) return;

    // Tear down any previous channels (account switch, re-login) so we never end up
    // with duplicate trackers fighting for the same presence key.
    get().leavePresence();

    const platChan = supabase.channel('online:platform', {
      config: { presence: { key: userId } },
    });
    platChan
      .on('presence', { event: 'sync' }, () => {
        const state = platChan.presenceState();
        const count = Object.keys(state).length;
        // Flatten the presence map into a deduped list (one row per user_id)
        // so the admin online-users sheet can render a real list, not just a count.
        const flat: OnlineUserMeta[] = [];
        const seen = new Set<string>();
        for (const key of Object.keys(state)) {
          const presences = (state as any)[key] as OnlineUserMeta[];
          if (!Array.isArray(presences) || presences.length === 0) continue;
          const meta = presences[0];
          if (!meta?.user_id || seen.has(meta.user_id)) continue;
          seen.add(meta.user_id);
          flat.push(meta);
        }
        set({ platformCount: count, onlineUsers: flat });
        // Bridge into adminStore so existing UI reading `onlineCount` keeps working
        // without every screen having to subscribe to presenceStore directly.
        useAdminStore.setState({ onlineCount: count });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await platChan.track({
            user_id: userId,
            role,
            institute_id: instituteId,
            online_at: new Date().toISOString(),
          });
        }
      });

    let instChan: RealtimeChannel | null = null;
    if (instituteId) {
      instChan = supabase.channel(`online:institute:${instituteId}`, {
        config: { presence: { key: userId } },
      });
      instChan
        .on('presence', { event: 'sync' }, () => {
          const s = instChan!.presenceState();
          set({ instituteCount: Object.keys(s).length });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await instChan!.track({
              user_id: userId,
              role,
              online_at: new Date().toISOString(),
            });
          }
        });
    }

    set({ _platformChan: platChan, _instituteChan: instChan });
  },

  leavePresence: () => {
    const { _platformChan, _instituteChan } = get();
    if (_platformChan) supabase.removeChannel(_platformChan);
    if (_instituteChan) supabase.removeChannel(_instituteChan);
    set({
      _platformChan: null,
      _instituteChan: null,
      platformCount: 0,
      instituteCount: 0,
      onlineUsers: [],
    });
  },
}));

export default usePresenceStore;
