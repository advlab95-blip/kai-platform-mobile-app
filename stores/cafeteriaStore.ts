import { create } from 'zustand';
import { Alert } from 'react-native';
import { api } from '../services/api';
import { supabase } from '../services/supabase';

interface CafeteriaState {
  items: any[];
  orders: any[];
  isLoading: boolean;

  loadItems: (instituteId: string) => Promise<void>;
  addItem: (
    name: string,
    price: number,
    instituteId: string,
    extras?: { category?: string | null; image_url?: string | null },
  ) => Promise<void>;
  toggleAvailability: (itemId: string, available: boolean, instituteId?: string) => Promise<void>;
  deleteItem: (itemId: string, instituteId?: string) => Promise<void>;
  loadOrders: (instituteId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: string, instituteId: string) => Promise<void>;
  /**
   * Subscribe to realtime INSERT/UPDATE/DELETE on cafeteria_items for THIS
   * institute only. Server-side filter (filter: institute_id=eq.<id>) keeps
   * cross-tenant rows off the wire — never client-side filtering. Returns an
   * unsubscribe function for the caller's useEffect cleanup. No-op when
   * instituteId is missing so we never open an unfiltered channel.
   */
  subscribeToItems: (instituteId: string) => () => void;
}

const useCafeteriaStore = create<CafeteriaState>((set, get) => ({
  items: [],
  orders: [],
  isLoading: false,

  loadItems: async (instituteId) => {
    try {
      const data = await api.getCafeteriaItems(instituteId);
      set({ items: data });
    } catch (err: any) {
      // Surface to user — silent console.error was hiding network/RLS failures
      Alert.alert('خطأ', err?.message || 'فشل في تحميل قائمة المنتجات');
    }
  },

  addItem: async (name, price, instituteId, extras) => {
    await api.addCafeteriaItem(name, price, instituteId, extras);
    await get().loadItems(instituteId);
  },

  toggleAvailability: async (itemId, available, instituteId?) => {
    // Optimistic update so the Switch flips immediately; revert on error
    const prev = get().items;
    set((state) => ({ items: state.items.map((i) => (i.id === itemId ? { ...i, available } : i)) }));
    try {
      // API requires instituteId for multi-tenant isolation; callers pass it from store state.
      await api.updateCafeteriaItem(itemId, { available }, instituteId || '');
    } catch (err) {
      // Revert on failure
      set({ items: prev });
      throw err;
    }
  },

  deleteItem: async (itemId, instituteId?) => {
    await api.deleteCafeteriaItem(itemId, instituteId || '');
    set((state) => ({ items: state.items.filter((i) => i.id !== itemId) }));
  },

  loadOrders: async (instituteId) => {
    try {
      const data = await api.getCafeteriaOrders(instituteId);
      set({ orders: data });
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل في تحميل الطلبات');
    }
  },

  updateOrderStatus: async (orderId, status, instituteId) => {
    await api.updateCafeteriaOrderStatus(orderId, status, instituteId);
    await get().loadOrders(instituteId);
  },

  subscribeToItems: (instituteId) => {
    // Multi-tenant safety: refuse to open an unfiltered channel. Without the
    // server filter every INSERT across ALL institutes would broadcast to
    // every cafeteria client (cross-tenant fanout + bandwidth blowout).
    if (!instituteId) return () => { /* no-op */ };

    const apply = (payload: any) => {
      const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
      const row: any = payload.new ?? payload.old;
      if (!row) return;
      // Defense-in-depth: even with the server filter, drop rows that don't
      // match this institute. Protects against a future RLS mis-config.
      const rowInstitute = (payload.new?.institute_id ?? payload.old?.institute_id);
      if (rowInstitute && rowInstitute !== instituteId) return;

      set((state) => {
        if (eventType === 'INSERT') {
          // Skip duplicates — the local addItem optimistic refresh may have
          // already loaded this row.
          if (state.items.some((i) => i.id === row.id)) return state;
          return { items: [row, ...state.items] };
        }
        if (eventType === 'UPDATE') {
          return {
            items: state.items.map((i) => (i.id === row.id ? { ...i, ...row } : i)),
          };
        }
        if (eventType === 'DELETE') {
          const oldId = payload.old?.id;
          if (!oldId) return state;
          return { items: state.items.filter((i) => i.id !== oldId) };
        }
        return state;
      });
    };

    const chan = supabase
      .channel(`cafeteria-items-${instituteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cafeteria_items',
          filter: `institute_id=eq.${instituteId}`,
        },
        apply,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chan);
    };
  },
}));

export default useCafeteriaStore;
