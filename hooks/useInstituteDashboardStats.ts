// useInstituteDashboardStats — single source of truth for the institute home
// dashboard's stats. One RPC call (get_institute_dashboard_stats) shared
// between DashboardKPIs (KPI grid) and InstituteDashboardPanel (charts), so
// the admin's first paint pays for one round-trip instead of two.
//
// Multi-tenant: the RPC itself filters by p_institute_id and verifies the
// caller is admin of that institute (see services/instituteAdminService.ts).
// Polls every 60s so background updates land without manual refresh, and
// stops cleanly on unmount.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDashboardStats,
  type DashboardStats,
} from '../services/instituteAdminService';

const REFRESH_MS = 60_000;

export interface UseInstituteDashboardStats {
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useInstituteDashboardStats(
  instituteId: string | null | undefined,
): UseInstituteDashboardStats {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchOnce = useCallback(async () => {
    if (!instituteId) return;
    try {
      const data = await getDashboardStats(instituteId);
      if (!mounted.current) return;
      setStats(data);
      setError(null);
    } catch (err: any) {
      console.error('[useInstituteDashboardStats] load failed', err);
      if (mounted.current) {
        setError(err?.message || 'فشل تحميل الإحصائيات');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [instituteId]);

  useEffect(() => {
    mounted.current = true;
    if (!instituteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchOnce();
    const timer = setInterval(fetchOnce, REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [instituteId, fetchOnce]);

  return { stats, loading, error, refresh: fetchOnce };
}
