// شاشة الإدارة العامة (Platform Admin) — قائمة جداول الامتحانات الورقية لكل المؤسسات.
//
// مفصولة عن exams (الكوزات اللي يسوّيها الأستاذ بالتطبيق).
//
// السلوك:
// - الإدارة العامة تشوف جداول كل المؤسسات. RLS يطلع الـ drafts + published لمن له صلاحية.
// - يمكن الفلترة بالمؤسسة عبر شريط chips أعلى القائمة.
// - زر FAB يفتح builder لإنشاء جدول جديد (لازم اختيار مؤسسة هناك).
// - الضغط على بطاقة يفتح builder للتعديل/النشر.
//
// Multi-tenant: كل query يمر عبر services/examScheduleService.ts ويفلتر بـ institute_id.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, ScrollView, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import {
  getExamSchedules,
  deleteExamSchedule,
  type ExamSchedule,
} from '../../services/examScheduleService';
import { confirmAlert } from '../../utils/alerts';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';

// ────────────────── helpers ──────────────────
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '—';
  }
}

function statusMeta(status: ExamSchedule['status']) {
  switch (status) {
    case 'published':
      return { label: 'منشور', color: tokens.color.success, bg: tokens.color.successBg, icon: 'checkmark-circle' as const };
    case 'cancelled':
      return { label: 'ملغي', color: tokens.color.danger, bg: tokens.color.dangerBg, icon: 'close-circle' as const };
    default:
      return { label: 'مسودة', color: tokens.color.warning, bg: tokens.color.warningBg, icon: 'document-outline' as const };
  }
}

interface ScheduleWithInstitute extends ExamSchedule {
  institute_name?: string;
  institute_type?: 'institute' | 'school';
}

// ────────────────── component ──────────────────
export default function AdminExamSchedule() {
  const router = useRouter();
  const { institutes, loadInstitutes } = useDataStore();

  const [schedules, setSchedules] = useState<ScheduleWithInstitute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterInstId, setFilterInstId] = useState<string | null>(null);

  // Load institutes once. The platform admin owns no single institute, so we
  // fetch schedules per-institute and merge — RLS still protects each call.
  // This avoids a server-side join across tenants and keeps the service API stable.
  //
  // Note: we read `institutes` via getState() instead of taking it as a dep to
  // prevent a re-fetch loop (loadInstitutes mutates `institutes`, which would
  // change the useCallback ref and re-trigger the useEffect/useFocusEffect).
  const load = useCallback(async () => {
    try {
      const current = useDataStore.getState().institutes;
      if (!current || current.length === 0) {
        await loadInstitutes();
      }
      const list = useDataStore.getState().institutes || [];
      // Pull schedules per institute in parallel — no ad-hoc cross-tenant query.
      // Capped at 100 each by the service.
      const all = await Promise.all(
        list.map(async (inst: any) => {
          try {
            const rows = await getExamSchedules(inst.id);
            return rows.map((r) => ({ ...r, institute_name: inst.name, institute_type: inst.type })) as ScheduleWithInstitute[];
          } catch (e) {
            if (__DEV__) console.warn('[admin/exam-schedule] load failed for', inst.id, e);
            return [] as ScheduleWithInstitute[];
          }
        })
      );
      const flat = all.flat().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      setSchedules(flat);
    } catch (err: any) {
      console.error('load admin exam schedules', err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل الجداول');
    } finally {
      setLoading(false);
    }
  }, [loadInstitutes]);

  useEffect(() => { load(); }, [load]);

  // Re-load on focus (after creating/editing/publishing in the builder).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const filtered = useMemo(() => {
    if (!filterInstId) return schedules;
    return schedules.filter((s) => s.institute_id === filterInstId);
  }, [schedules, filterInstId]);

  const openNew = () => {
    haptics.light();
    router.push('/(admin)/exam-schedule-builder?id=NEW' as any);
  };

  const openEdit = (s: ExamSchedule) => {
    haptics.light();
    router.push(`/(admin)/exam-schedule-builder?id=${s.id}` as any);
  };

  const handleDelete = (s: ExamSchedule) => {
    confirmAlert(
      'حذف الجدول',
      `حذف "${s.name}"؟ سيتم حذف جميع البنود ولا يمكن التراجع.`,
      async () => {
        try {
          await deleteExamSchedule(s.id);
          setSchedules((prev) => prev.filter((x) => x.id !== s.id));
        } catch (err: any) {
          Alert.alert('خطأ', err?.message || 'فشل الحذف');
        }
      },
      true
    );
  };

  // Top filter chips — "الكل" + each institute. Using ScrollView (horizontal)
  // because count is small (typically <50) and we want full-width scroll feel.
  const renderFilterBar = () => {
    if (!institutes || institutes.length === 0) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterChip, !filterInstId && styles.filterChipActive]}
          onPress={() => { haptics.selection(); setFilterInstId(null); }}
          activeOpacity={0.85}
        >
          <Text style={[styles.filterChipText, !filterInstId && styles.filterChipTextActive]}>الكل ({schedules.length})</Text>
        </TouchableOpacity>
        {institutes.map((inst: any) => {
          const count = schedules.filter((s) => s.institute_id === inst.id).length;
          if (count === 0) return null;
          const active = filterInstId === inst.id;
          return (
            <TouchableOpacity
              key={inst.id}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => { haptics.selection(); setFilterInstId(active ? null : inst.id); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
                {inst.name} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="جدول الامتحانات"
        subtitle="إنشاء ونشر جداول الامتحانات الورقية لكل المؤسسات"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(47,47,186,0.30)"
      />

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      ) : schedules.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="calendar-outline" size={36} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>لا توجد جداول</Text>
          <Text style={styles.emptyHint}>اضغط "+" لإنشاء جدول امتحانات جديد لأي مؤسسة</Text>
        </View>
      ) : (
        <>
          {renderFilterBar()}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyHint}>لا توجد جداول لهذه المؤسسة</Text>
              </View>
            }
            renderItem={({ item: s, index }) => {
              const st = statusMeta(s.status);
              return (
                <FadeSlideIn delay={Math.min(index * 40, 400)} translateFrom={10}>
                  <TouchableOpacity
                    style={styles.card}
                    activeOpacity={0.85}
                    onPress={() => openEdit(s)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                        <Ionicons name={st.icon} size={11} color={st.color} />
                        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      <Text style={styles.title} numberOfLines={1}>{s.name}</Text>
                    </View>
                    {!!s.institute_name && (
                      <View style={styles.instituteRow}>
                        <Ionicons
                          name={s.institute_type === 'school' ? 'school-outline' : 'business-outline'}
                          size={12}
                          color={tokens.color.text2}
                        />
                        <Text style={styles.instituteText} numberOfLines={1}>{s.institute_name}</Text>
                      </View>
                    )}
                    {!!s.description && (
                      <Text style={styles.body} numberOfLines={2}>{s.description}</Text>
                    )}
                    <View style={styles.meta}>
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={12} color={tokens.color.text3} />
                        <Text style={styles.metaText}>
                          {fmtDate(s.period_start)} ← {fmtDate(s.period_end)}
                        </Text>
                      </View>
                      {s.published_at && (
                        <View style={styles.metaItem}>
                          <Ionicons name="cloud-upload-outline" size={12} color={tokens.color.success} />
                          <Text style={[styles.metaText, { color: tokens.color.success }]}>
                            نُشر {fmtDate(s.published_at)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => openEdit(s)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="create-outline" size={16} color={Colors.primary} />
                        <Text style={styles.actionText}>
                          {s.status === 'published' ? 'تعديل' : 'متابعة'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleDelete(s)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={16} color={tokens.color.danger} />
                        <Text style={[styles.actionText, { color: tokens.color.danger }]}>حذف</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </FadeSlideIn>
              );
            }}
          />
        </>
      )}

      <TouchableOpacity style={styles.fab} onPress={openNew} activeOpacity={0.9} accessibilityLabel="جدول جديد">
        <LinearGradient
          colors={tokens.gradient.brand}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },

  filterRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row-reverse',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    maxWidth: 220,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.text2,
  },
  filterChipTextActive: { color: '#fff' },

  card: {
    backgroundColor: tokens.color.surface,
    marginHorizontal: 14,
    marginVertical: 6,
    padding: 14,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusPill: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: tokens.color.text, textAlign: 'right' },

  instituteRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  instituteText: {
    fontSize: 12,
    color: tokens.color.text2,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },

  body: { fontSize: 12, color: tokens.color.text3, textAlign: 'right', marginBottom: 8, lineHeight: 18 },
  meta: { flexDirection: 'row-reverse', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: tokens.color.text3, fontWeight: '500' },

  actions: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: tokens.color.border, paddingTop: 8,
  },
  actionBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: tokens.radius.sm,
  },
  actionText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  fab: {
    position: 'absolute', bottom: 26, left: 20,
    width: 58, height: 58, borderRadius: 29,
    ...tokens.shadow.brand,
  },
  fabInner: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.color.text },
  emptyHint: { fontSize: 13, color: tokens.color.text3, fontWeight: '500', textAlign: 'center' },
});
