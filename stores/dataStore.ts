import { create } from 'zustand';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import {
  cacheTimetable, getCachedTimetable,
  cacheAnnouncements, getCachedAnnouncements,
  cacheNotifications,
} from '../services/offlineStorage';
import useConnectivityStore from './connectivityStore';
import type { Institute, Announcement, Timetable, AcademicYear } from '../types';

interface DataState {
  institutes: Institute[];
  announcements: Announcement[];
  dismissedAnnouncementIds: string[];
  timetable: Timetable[];
  userInstituteId: string | null;
  currentAcademicYear: AcademicYear | null;
  isFetching: boolean;
  isOfflineData: boolean;

  loadInstitutes: () => Promise<void>;
  loadAnnouncements: (role: string) => Promise<void>;
  loadDismissedAnnouncements: (userId: string) => Promise<void>;
  dismissAnnouncement: (userId: string, announcementId: string) => Promise<void>;
  loadTimetable: () => Promise<void>;
  detectInstitute: (userId: string) => Promise<void>;
  loadCurrentAcademicYear: (instituteId: string) => Promise<void>;
  loadRoleData: (role: string, userId: string) => Promise<void>;
}

const useDataStore = create<DataState>((set, get) => ({
  institutes: [],
  announcements: [],
  dismissedAnnouncementIds: [],
  timetable: [],
  userInstituteId: null,
  currentAcademicYear: null,
  isFetching: false,
  isOfflineData: false,

  loadInstitutes: async () => {
    const data = await api.getInstitutes();
    set({ institutes: data });
  },

  loadAnnouncements: async (role) => {
    try {
      const instituteId = get().userInstituteId || undefined;
      // Only the platform super-admin sees announcements across all institutes.
      // (Legacy `admin` alias is an institute-level admin — maps to '(institute)'
      // in ROLE_GROUP — so it must receive scoped announcements like any tenant.)
      const result = await api.getAnnouncements(role === 'platform_admin' ? 'all' : role, instituteId);
      set({ announcements: result.data, isOfflineData: false });
      // Cache for offline
      await cacheAnnouncements(result.data);
    } catch {
      // Fallback to cached data
      const cached = await getCachedAnnouncements();
      if (cached?.length) {
        set({ announcements: cached, isOfflineData: true });
      }
    }
  },

  loadDismissedAnnouncements: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('announcement_dismissals')
        .select('announcement_id')
        .eq('user_id', userId);
      if (error) throw error;
      set({ dismissedAnnouncementIds: (data || []).map(r => r.announcement_id as string) });
    } catch {
      // Silent — feature degrades gracefully if the call fails
    }
  },

  dismissAnnouncement: async (userId, announcementId) => {
    const instituteId = get().userInstituteId;
    if (!instituteId) return;
    // Optimistic local removal so the card disappears immediately.
    const prev = get().dismissedAnnouncementIds;
    set({ dismissedAnnouncementIds: [...prev, announcementId] });
    try {
      const { error } = await supabase
        .from('announcement_dismissals')
        .insert({ user_id: userId, announcement_id: announcementId, institute_id: instituteId });
      if (error && error.code !== '23505') throw error; // 23505 = already dismissed (idempotent)
    } catch (err) {
      console.error('dismissAnnouncement failed:', err);
      // Roll back on real failure so the user can retry.
      set({ dismissedAnnouncementIds: prev });
      throw err;
    }
  },

  loadTimetable: async () => {
    try {
      const instituteId = get().userInstituteId || undefined;
      const data = await api.getTimetable(instituteId);
      set({ timetable: data, isOfflineData: false });
      // Cache for offline
      await cacheTimetable(data);
    } catch {
      // Fallback to cached data
      const cached = await getCachedTimetable();
      if (cached?.length) {
        set({ timetable: cached, isOfflineData: true });
      }
    }
  },

  detectInstitute: async (userId) => {
    try {
      // Prefer the most recently activated enrollment. Filtering by status
      // 'active' prevents the user from being routed back to a previous
      // institute they were unenrolled from. Sorting by created_at desc
      // breaks ties deterministically (multi-institute users land on the
      // newest membership).
      const { data: enrollments, error: enrErr } = await supabase
        .from('enrollments')
        .select('institute_id, created_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
      if (__DEV__) console.log('[detectInstitute] enrollments count:', enrollments?.length, 'error:', enrErr?.message);
      if (enrollments?.length && enrollments[0].institute_id) {
        set({ userInstituteId: enrollments[0].institute_id });
        if (__DEV__) console.log('[detectInstitute] SET instituteId');
        return;
      }
    } catch (err) { console.error('[detectInstitute] error:', err); }
    try {
      // Fallback: check if user is admin of an institute
      const { data: insts } = await supabase
        .from('institutes')
        .select('id')
        .eq('admin_id', userId)
        .limit(1);
      if (insts?.length && insts[0].id) {
        set({ userInstituteId: insts[0].id });
        return;
      }
    } catch (err) { console.error(err); }
    try {
      // Third fallback: read users.institute_id column — legacy/denormalized field
      // kept in sync via triggers. Rescues institute admins whose enrollments row
      // was never backfilled (pre-migration accounts) so they don't end up stuck
      // on the loading screen forever.
      const { data: user } = await supabase
        .from('users')
        .select('institute_id')
        .eq('id', userId)
        .maybeSingle();
      if (user?.institute_id) {
        set({ userInstituteId: user.institute_id });
        return;
      }
    } catch (err) { console.error(err); }
    set({ userInstituteId: null });
  },

  loadCurrentAcademicYear: async (instituteId) => {
    try {
      const year = await api.getCurrentAcademicYear(instituteId);
      set({ currentAcademicYear: year });
    } catch { /* silent */ }
  },

  loadRoleData: async (role, userId) => {
    set({ isFetching: true });
    const isOnline = useConnectivityStore.getState().isConnected;

    try {
      if (isOnline) {
        const { detectInstitute, loadInstitutes, loadAnnouncements, loadTimetable } = get();
        // Detect institute first so announcements/timetable can filter by it.
        // Only platform_admin skips detection (they span all tenants). Legacy
        // 'admin' role is an institute admin and needs its institute detected.
        if (role !== 'platform_admin') {
          await detectInstitute(userId);
        }
        await Promise.all([
          loadInstitutes(),
          loadAnnouncements(role),
          get().loadDismissedAnnouncements(userId),
        ]);
        if (['teacher', 'student', 'institute'].includes(role)) {
          await loadTimetable();
        }
        // Load current academic year for institute role
        if (role === 'institute') {
          const instId = get().userInstituteId;
          if (instId) await get().loadCurrentAcademicYear(instId);
        }
        // Load feature flags + catalog for all roles (catalog drives Services Hub)
        {
          const instId = get().userInstituteId;
          const { default: useFeatureFlagsStore } = await import('./featureFlagsStore');
          // Catalog is global (what features exist) — needed to render Services Hub
          await useFeatureFlagsStore.getState().loadCatalog();
          // Per-institute flags drive which features are enabled for the current user.
          // Only platform_admin has no single institute; legacy 'admin' role is tied to one.
          if (role !== 'platform_admin' && instId) {
            await useFeatureFlagsStore.getState().loadMyFlags(instId);
          }
        }
      } else {
        // Load from cache when offline
        const [cachedTimetable, cachedAnnouncements] = await Promise.all([
          getCachedTimetable(),
          getCachedAnnouncements(),
        ]);
        set({
          timetable: cachedTimetable || [],
          announcements: cachedAnnouncements || [],
          isOfflineData: true,
        });
      }
    } catch (e) {
      console.error('loadRoleData error:', e);
      // Try cache as last resort
      const [cachedTimetable, cachedAnnouncements] = await Promise.all([
        getCachedTimetable(),
        getCachedAnnouncements(),
      ]);
      if (cachedTimetable?.length || cachedAnnouncements?.length) {
        set({
          timetable: cachedTimetable || [],
          announcements: cachedAnnouncements || [],
          isOfflineData: true,
        });
      }
    } finally {
      set({ isFetching: false });
    }
  },
}));

export default useDataStore;
