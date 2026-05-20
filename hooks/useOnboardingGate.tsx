// useOnboardingGate — decides whether the institute admin needs the first-run
// wizard. Two gates combined:
//   1. AsyncStorage flag `@onboarding_completed_<instituteId>` — once set, never
//      shown again on this device (admin can re-trigger manually elsewhere).
//   2. "Fresh institute" signal — even if the flag is missing (new device,
//      fresh install) we suppress the wizard for institutes that already have
//      classes + enrollments. Avoids hassling experienced admins.
//
// Lightweight: runs once on mount, two count-only Supabase queries, errors
// silently fall back to "don't show" (better to skip than to harass).

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useDataStore from '../stores/dataStore';
import { supabase } from '../services/supabase';
import { onboardingCompletedKey } from '../components/institute/onboarding/OnboardingWizard';

type GateResult = {
  /** True only after we've confirmed both gates allow the wizard. */
  shouldShow: boolean;
  /** Still figuring it out — host can show nothing meanwhile. */
  loading: boolean;
  /** Persist the dismissal flag + flip shouldShow off. */
  dismiss: () => Promise<void>;
};

export default function useOnboardingGate(): GateResult {
  const { institutes } = useDataStore();
  const institute = institutes[0];
  const instituteId = institute?.id;

  const [shouldShow, setShouldShow] = useState(false);
  const [loading, setLoading] = useState(true);
  // Guard against the effect re-running for the same institute on every store
  // update. Without this we'd re-query Supabase whenever any field on the
  // institute object changes (e.g., name edited elsewhere).
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!instituteId) {
      // No institute yet — keep loading so caller doesn't flash the wizard
      // before institute detection completes. Will re-run when it arrives.
      setLoading(true);
      setShouldShow(false);
      return;
    }
    if (checkedFor.current === instituteId) return;
    checkedFor.current = instituteId;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // ── Gate 1: per-device dismissal flag ────────────────────
        const flag = await AsyncStorage.getItem(onboardingCompletedKey(instituteId));
        if (flag === '1') {
          if (!cancelled) setShouldShow(false);
          return;
        }

        // ── Gate 2: institute "freshness" via head-count queries ─
        // Both are head:true so Supabase returns the count without any rows —
        // cheap on bandwidth even for large institutes.
        const [classesRes, enrollRes] = await Promise.all([
          supabase
            .from('classes')
            .select('id', { count: 'exact', head: true })
            .eq('institute_id', instituteId),
          supabase
            .from('enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('institute_id', instituteId),
        ]);

        const classCount = classesRes.count || 0;
        const enrollCount = enrollRes.count || 0;
        // Admins enrol themselves on institute creation, so 1 enrollment is
        // expected even on a brand-new institute. Anything beyond 1 means real
        // members exist → not a fresh institute.
        const isFresh = classCount === 0 && enrollCount <= 1;

        if (!cancelled) setShouldShow(isFresh);
      } catch {
        // Silent — failing closed (don't show) is the safer default; a missed
        // wizard isn't a regression, but blocking the admin with a broken modal is.
        if (!cancelled) setShouldShow(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [instituteId]);

  const dismiss = useCallback(async () => {
    if (!instituteId) return;
    try {
      await AsyncStorage.setItem(onboardingCompletedKey(instituteId), '1');
    } catch {
      /* silent — worst case the wizard reappears once on next launch */
    }
    setShouldShow(false);
  }, [instituteId]);

  return { shouldShow, loading, dismiss };
}
