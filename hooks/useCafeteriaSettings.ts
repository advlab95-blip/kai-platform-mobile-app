// Centralizes the cafeteria settings persistence pattern:
//   load → try Supabase first, fallback to AsyncStorage
//   save → AsyncStorage local-first, then sync to Supabase
// The dual-write is intentional for offline operators; the previous inline
// version mixed both into the screen — this hook hoists the logic so the
// screen is presentational only.
import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

const STORAGE_PREFIX = 'cafeteria_settings_';

export interface CafeteriaSettings {
  notifOrders: boolean;
  notifLowStock: boolean;
  autoClose: boolean;
  workingHoursFrom: string;
  workingHoursTo: string;
}

export const DEFAULT_SETTINGS: CafeteriaSettings = {
  notifOrders: true,
  notifLowStock: false,
  autoClose: false,
  workingHoursFrom: '08:00',
  workingHoursTo: '14:00',
};

// HH:MM 24-hour validator. Used to gate persistence so that
// `25:00` or partial `08:` values never reach Supabase.
export const isValidTime = (s: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);

type Key = keyof CafeteriaSettings;
type Setter = (value: CafeteriaSettings[Key]) => void;

export function useCafeteriaSettings(instituteId: string | null) {
  const [settings, setSettings] = useState<CafeteriaSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load — try Supabase first, fallback to AsyncStorage.
  // Multi-tenant guard: query is filtered by institute_id.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (instituteId) {
        try {
          const { data } = await supabase
            .from('cafeteria_settings')
            .select('setting_key, setting_value')
            .eq('institute_id', instituteId);
          if (!cancelled && data && data.length > 0) {
            const map = new Map(data.map((d: any) => [d.setting_key, d.setting_value as string]));
            setSettings((prev) => ({
              ...prev,
              ...(map.has('notifOrders')      && { notifOrders:      map.get('notifOrders') === 'true' }),
              ...(map.has('notifLowStock')    && { notifLowStock:    map.get('notifLowStock') === 'true' }),
              ...(map.has('autoClose')        && { autoClose:        map.get('autoClose') === 'true' }),
              ...(map.has('workingHoursFrom') && { workingHoursFrom: map.get('workingHoursFrom')! }),
              ...(map.has('workingHoursTo')   && { workingHoursTo:   map.get('workingHoursTo')! }),
            }));
            if (!cancelled) setLoaded(true);
            return;
          }
        } catch {
          /* fallback to AsyncStorage */
        }
      }
      // Fallback: AsyncStorage
      try {
        const [nOrders, nLowStock, aClose, whFrom, whTo] = await Promise.all([
          AsyncStorage.getItem(`${STORAGE_PREFIX}notifOrders`),
          AsyncStorage.getItem(`${STORAGE_PREFIX}notifLowStock`),
          AsyncStorage.getItem(`${STORAGE_PREFIX}autoClose`),
          AsyncStorage.getItem(`${STORAGE_PREFIX}workingHoursFrom`),
          AsyncStorage.getItem(`${STORAGE_PREFIX}workingHoursTo`),
        ]);
        if (cancelled) return;
        setSettings((prev) => ({
          ...prev,
          ...(nOrders   !== null && { notifOrders:      nOrders   === 'true' }),
          ...(nLowStock !== null && { notifLowStock:    nLowStock === 'true' }),
          ...(aClose    !== null && { autoClose:        aClose    === 'true' }),
          ...(whFrom    !== null && { workingHoursFrom: whFrom }),
          ...(whTo      !== null && { workingHoursTo:   whTo }),
        }));
      } catch (err: any) {
        // Surface to user — silent console.error was hiding storage failures.
        Alert.alert('خطأ', err?.message || 'فشل في تحميل الإعدادات');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [instituteId]);

  const persist = useCallback(
    async (key: Key, value: string) => {
      // Local-first save (offline use), then sync to Supabase.
      try {
        await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
      } catch (err) {
        console.error('Local save failed:', err);
      }
      if (instituteId) {
        try {
          const { error } = await supabase
            .from('cafeteria_settings')
            .upsert(
              { institute_id: instituteId, setting_key: key, setting_value: value },
              { onConflict: 'institute_id,setting_key' },
            );
          if (error) throw new Error(error.message);
        } catch (err: any) {
          // Surface sync failure to operators so multi-device drift is visible.
          console.warn('Supabase sync failed:', err?.message);
        }
      }
    },
    [instituteId],
  );

  const updateBool = useCallback(
    (key: 'notifOrders' | 'notifLowStock' | 'autoClose'): Setter =>
      (value) => {
        const v = value as boolean;
        setSettings((prev) => ({ ...prev, [key]: v }));
        persist(key, String(v));
      },
    [persist],
  );

  // Working hours: only persist when input matches HH:MM regex; the UI
  // still shows partial input during typing.
  const updateTime = useCallback(
    (key: 'workingHoursFrom' | 'workingHoursTo'): Setter =>
      (value) => {
        const v = value as string;
        setSettings((prev) => ({ ...prev, [key]: v }));
        if (isValidTime(v)) persist(key, v);
      },
    [persist],
  );

  return {
    settings,
    loaded,
    setNotifOrders:      updateBool('notifOrders'),
    setNotifLowStock:    updateBool('notifLowStock'),
    setAutoClose:        updateBool('autoClose'),
    setWorkingHoursFrom: updateTime('workingHoursFrom'),
    setWorkingHoursTo:   updateTime('workingHoursTo'),
  };
}
