// Institute · Bus Routes (الحافلات)
// Foundation CRUD for school transport lines. Driver phone is tap-to-call.
// We best-effort count assigned students per route from `bus_route_students`,
// but the screen renders fine even if that table doesn't exist yet.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, TextInput, ScrollView, Alert, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SectionLabel from '../../components/institute/SectionLabel';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { listBusRoutes, upsertBusRoute, type BusRoute } from '../../services/instituteAdminService';
import { supabase } from '../../services/supabase';

type FormState = {
  id?: string;
  name: string;
  driver_name: string;
  driver_phone: string;
  plate_no: string;
  capacity: string;       // numeric, kept as string for input
  pickup_time: string;    // HH:MM
  dropoff_time: string;   // HH:MM
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: '', driver_name: '', driver_phone: '', plate_no: '',
  capacity: '', pickup_time: '', dropoff_time: '', notes: '',
};

// Validate a partial HH:MM string. Accepts empty, "7", "07", "07:", "07:3", "07:30".
// Strict pattern only enforced at save time.
const TIME_FULL = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// Best-effort count of students assigned to each route. Single round-trip:
// fetches all rows from bus_route_students for the given route ids. If the
// table doesn't exist or RLS blocks, we silently return {} and the UI hides
// the count badge. No throw.
async function fetchRouteCounts(routeIds: string[]): Promise<Record<string, number>> {
  if (routeIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('bus_route_students')
      .select('route_id')
      .in('route_id', routeIds);
    if (error || !data) return {};
    const counts: Record<string, number> = {};
    for (const r of data as any[]) {
      const id = r.route_id as string;
      counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

export default function InstituteBusRoutes() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await listBusRoutes(userInstituteId);
      setRoutes(list);
      const c = await fetchRouteCounts(list.map(r => r.id));
      setCounts(c);
    } catch (err: any) {
      if (__DEV__) console.error('[bus-routes] load', err);
      Alert.alert('خطأ', err?.message || 'تعذّر تحميل الخطوط');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const openNew = () => {
    haptics.light();
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (r: BusRoute) => {
    haptics.light();
    setForm({
      id: r.id,
      name: r.name || '',
      driver_name: r.driver_name || '',
      driver_phone: r.driver_phone || '',
      plate_no: r.plate_no || '',
      capacity: r.capacity != null ? String(r.capacity) : '',
      // pickup_time / dropoff_time are stored as time strings in DB ("HH:MM:SS" or "HH:MM").
      // Trim seconds for the input.
      pickup_time: (r.pickup_time || '').slice(0, 5),
      dropoff_time: (r.dropoff_time || '').slice(0, 5),
      notes: r.notes || '',
    });
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (saving) return;
    setSheetOpen(false);
    setForm(EMPTY_FORM);
  };

  const callDriver = (phone: string) => {
    if (!phone) return;
    haptics.light();
    const cleaned = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleaned}`).catch(() => {
      Alert.alert('تعذّر الاتصال', 'لم نتمكن من فتح تطبيق الاتصال');
    });
  };

  const handleSave = async () => {
    if (!userInstituteId) return;
    const name = form.name.trim();
    if (!name) {
      Alert.alert('ناقص', 'اسم الخط مطلوب');
      return;
    }
    // Time validation (only if provided — both fields are optional).
    if (form.pickup_time && !TIME_FULL.test(form.pickup_time)) {
      Alert.alert('وقت غير صحيح', 'وقت الذهاب: استخدم صيغة HH:MM');
      return;
    }
    if (form.dropoff_time && !TIME_FULL.test(form.dropoff_time)) {
      Alert.alert('وقت غير صحيح', 'وقت العودة: استخدم صيغة HH:MM');
      return;
    }
    const capacityNum = form.capacity.trim() ? parseInt(form.capacity, 10) : null;
    setSaving(true);
    try {
      const saved = await upsertBusRoute({
        id: form.id,
        institute_id: userInstituteId,
        name,
        driver_name: form.driver_name.trim() || null,
        driver_phone: form.driver_phone.trim() || null,
        plate_no: form.plate_no.trim() || null,
        capacity: capacityNum != null && Number.isFinite(capacityNum) ? capacityNum : null,
        pickup_time: form.pickup_time || null,
        dropoff_time: form.dropoff_time || null,
        notes: form.notes.trim() || null,
      });
      setRoutes(prev => {
        const idx = prev.findIndex(r => r.id === saved.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [saved, ...prev];
      });
      haptics.success();
      closeSheet();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'تعذّر حفظ الخط');
    } finally {
      setSaving(false);
    }
  };

  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  }, [routes]);

  if (!userInstituteId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.brand[500]} />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الحافلات"
        subtitle="خطوط النقل المدرسي"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(250,204,21,0.30)"
      />

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : (
        <>
          <KeyboardAwareScroll
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
            }
          >
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <SectionLabel
                title={`الخطوط (${sortedRoutes.length})`}
                icon="bus-outline"
              />
            </View>

            {sortedRoutes.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="bus-outline" size={36} color={tokens.brand[500]} />
                </View>
                <Text style={styles.emptyTitle}>لا توجد خطوط</Text>
                <Text style={styles.emptyHint}>أضف أول خط نقل</Text>
              </View>
            ) : (
              sortedRoutes.map((r, i) => {
                const assigned = counts[r.id] ?? null;
                const capacity = r.capacity ?? null;
                return (
                  <FadeSlideIn key={r.id} delay={Math.min(i * 30, 300)} translateFrom={8}>
                    <TouchableOpacity
                      style={styles.routeCard}
                      activeOpacity={0.7}
                      onPress={() => openEdit(r)}
                    >
                      {/* Header */}
                      <View style={styles.cardHeader}>
                        {r.plate_no ? (
                          <View style={styles.plateBadge}>
                            <Text style={styles.plateText}>{r.plate_no}</Text>
                          </View>
                        ) : <View />}
                        <View style={styles.headerRight}>
                          <Text style={styles.routeName} numberOfLines={1}>{r.name}</Text>
                          <Ionicons name="bus" size={20} color={tokens.brand[500]} />
                        </View>
                      </View>

                      {/* Driver row */}
                      {r.driver_name || r.driver_phone ? (
                        <View style={styles.driverRow}>
                          {r.driver_phone ? (
                            <TouchableOpacity
                              style={styles.callBtn}
                              onPress={() => callDriver(r.driver_phone!)}
                              activeOpacity={0.7}
                              accessibilityLabel={`اتصال بـ ${r.driver_name || 'السائق'}`}
                            >
                              <Ionicons name="call" size={14} color={tokens.semantic.success} />
                              <Text style={styles.callText}>{r.driver_phone}</Text>
                            </TouchableOpacity>
                          ) : <View />}
                          <View style={styles.driverNameWrap}>
                            <Text style={styles.driverName} numberOfLines={1}>
                              {r.driver_name || 'بدون سائق'}
                            </Text>
                            <Ionicons name="person-circle-outline" size={16} color={tokens.text[3]} />
                          </View>
                        </View>
                      ) : null}

                      {/* Footer chips */}
                      <View style={styles.cardFooter}>
                        {r.pickup_time || r.dropoff_time ? (
                          <View style={styles.metaChip}>
                            <Ionicons name="time-outline" size={12} color={tokens.text[2]} />
                            <Text style={styles.metaText}>
                              {(r.pickup_time || '—').slice(0, 5)} → {(r.dropoff_time || '—').slice(0, 5)}
                            </Text>
                          </View>
                        ) : null}
                        {capacity != null ? (
                          <View style={[styles.metaChip, { backgroundColor: tokens.semantic.infoBg }]}>
                            <Ionicons name="people-outline" size={12} color={tokens.semantic.info} />
                            <Text style={[styles.metaText, { color: tokens.semantic.info }]}>
                              السعة {capacity}
                            </Text>
                          </View>
                        ) : null}
                        {assigned != null ? (
                          <View style={[styles.metaChip, { backgroundColor: tokens.brand[100] }]}>
                            <Ionicons name="checkmark-circle-outline" size={12} color={tokens.brand[500]} />
                            <Text style={[styles.metaText, { color: tokens.brand[500] }]}>
                              {assigned} طالب
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  </FadeSlideIn>
                );
              })
            )}
          </KeyboardAwareScroll>

          <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openNew}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.fabText}>خط جديد</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ═══ Add / Edit sheet ═══ */}
      <SwipeableSheet
        visible={sheetOpen}
        onClose={closeSheet}
        maxHeight={0.92}
        minHeight={0.6}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={closeSheet} accessibilityLabel="إغلاق">
              <Ionicons name="close" size={24} color={tokens.text[1]} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>
              {form.id ? 'تعديل الخط' : 'خط جديد'}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLabel}>اسم الخط *</Text>
            <TextInput
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="مثال: خط الكرادة"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>اسم السائق</Text>
            <TextInput
              value={form.driver_name}
              onChangeText={v => setForm(f => ({ ...f, driver_name: v }))}
              placeholder="الاسم الكامل"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>هاتف السائق</Text>
            <TextInput
              value={form.driver_phone}
              onChangeText={v => setForm(f => ({ ...f, driver_phone: v.replace(/[^0-9+]/g, '') }))}
              placeholder="07XXXXXXXXX"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
              keyboardType="phone-pad"
              maxLength={15}
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>رقم اللوحة</Text>
            <TextInput
              value={form.plate_no}
              onChangeText={v => setForm(f => ({ ...f, plate_no: v }))}
              placeholder="مثال: بغداد 12345"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>السعة (عدد المقاعد)</Text>
            <TextInput
              value={form.capacity}
              onChangeText={v => setForm(f => ({ ...f, capacity: v.replace(/[^0-9]/g, '') }))}
              placeholder="مثال: 30"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
              keyboardType="number-pad"
            />

            <View style={styles.row2}>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>وقت الذهاب</Text>
                <TextInput
                  value={form.pickup_time}
                  onChangeText={v => setForm(f => ({ ...f, pickup_time: v }))}
                  placeholder="07:00"
                  placeholderTextColor={tokens.text[4]}
                  style={styles.textField}
                  textAlign="right"
                  maxLength={5}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>وقت العودة</Text>
                <TextInput
                  value={form.dropoff_time}
                  onChangeText={v => setForm(f => ({ ...f, dropoff_time: v }))}
                  placeholder="13:30"
                  placeholderTextColor={tokens.text[4]}
                  style={styles.textField}
                  textAlign="right"
                  maxLength={5}
                />
              </View>
            </View>
            <Text style={styles.hint}>صيغة الوقت: HH:MM (مثال: 07:30)</Text>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>ملاحظات</Text>
            <TextInput
              value={form.notes}
              onChangeText={v => setForm(f => ({ ...f, notes: v }))}
              placeholder="ملاحظات إضافية..."
              placeholderTextColor={tokens.text[4]}
              style={[styles.textField, styles.textArea]}
              textAlign="right"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>
                      {form.id ? 'حفظ التعديلات' : 'إضافة الخط'}
                    </Text>
                  </>
                )
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 13, color: tokens.text[3], fontWeight: '500' },

  // Card
  routeCard: {
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: tokens.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1 },
  routeName: { fontSize: 15, fontWeight: '800', color: tokens.text[1], textAlign: 'right', flex: 1 },
  plateBadge: {
    backgroundColor: tokens.brand[100],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.brand[500],
  },
  plateText: { fontSize: 11, fontWeight: '800', color: tokens.brand[500], letterSpacing: 0.5 },

  driverRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: tokens.surface.surface2,
    borderRadius: tokens.radius.sm,
    marginBottom: 8,
  },
  driverNameWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flex: 1 },
  driverName: { fontSize: 12, fontWeight: '700', color: tokens.text[2], textAlign: 'right' },
  callBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: tokens.semantic.successBg,
  },
  callText: { fontSize: 11, fontWeight: '700', color: tokens.semantic.success },

  cardFooter: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  metaChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: tokens.surface.surface2,
  },
  metaText: { fontSize: 10, fontWeight: '700', color: tokens.text[2] },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 50, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.brand[500],
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: tokens.radius.xl,
    ...tokens.shadow.md,
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Sheet
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border[2],
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: tokens.text[1] },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: tokens.text[2], textAlign: 'right', marginBottom: 6 },

  textField: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[1],
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: tokens.text[1],
  },
  textArea: { minHeight: 80, paddingTop: 10 },

  row2: { flexDirection: 'row-reverse', gap: 10, marginTop: 14 },
  col: { flex: 1 },

  hint: { fontSize: 10, color: tokens.text[4], textAlign: 'right', marginTop: 4 },

  saveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.brand[500],
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
