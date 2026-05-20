// AdminTenantComparison — side-by-side per-institute KPIs the platform admin
// uses to spot tenants that need attention (low engagement, high failure
// rates, falling-behind subscriptions). Pulls from get_platform_institutes_summary
// which already returns aggregate per-tenant stats — no new RPC needed.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { supabase } from '../../services/supabase';

type Tenant = {
  id: string;
  name: string;
  city: string | null;
  type: string | null;
  total_users: number;
  total_students: number;
  total_teachers: number;
  total_classes: number;
  active_subscription: string | null;
  subscription_expires_at: string | null;
  last_activity_at: string | null;
};

type SortKey = 'students' | 'users' | 'classes' | 'activity';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'students', label: 'الطلاب' },
  { key: 'users',    label: 'المستخدمين' },
  { key: 'classes',  label: 'الصفوف' },
  { key: 'activity', label: 'آخر نشاط' },
];

function fmtNum(n: number): string {
  return Number(n || 0).toLocaleString('ar-IQ');
}

export default function AdminTenantComparison() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortKey>('students');

  const load = useCallback(async () => {
    try {
      // The RPC returns a JSONB array of tenant rows enriched with stats.
      const { data, error } = await supabase.rpc('get_platform_institutes_summary');
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      setTenants(rows.map((r: any) => ({
        id: r.id,
        name: r.name || 'مؤسسة',
        city: r.city || null,
        type: r.type || null,
        total_users: Number(r.total_users || 0),
        total_students: Number(r.total_students || 0),
        total_teachers: Number(r.total_teachers || 0),
        total_classes: Number(r.total_classes || 0),
        active_subscription: r.active_subscription || null,
        subscription_expires_at: r.subscription_expires_at || null,
        last_activity_at: r.last_activity_at || null,
      })));
    } catch (err) {
      if (__DEV__) console.error('[admin/tenant-comparison] load', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const sorted = useMemo(() => {
    const arr = tenants.slice();
    switch (sort) {
      case 'students': arr.sort((a, b) => b.total_students - a.total_students); break;
      case 'users':    arr.sort((a, b) => b.total_users - a.total_users); break;
      case 'classes':  arr.sort((a, b) => b.total_classes - a.total_classes); break;
      case 'activity':
        arr.sort((a, b) => {
          const at = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const bt = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return bt - at;
        });
        break;
    }
    return arr;
  }, [tenants, sort]);

  const totals = useMemo(() => {
    const t = { tenants: tenants.length, students: 0, teachers: 0, classes: 0 };
    for (const x of tenants) {
      t.students += x.total_students;
      t.teachers += x.total_teachers;
      t.classes += x.total_classes;
    }
    return t;
  }, [tenants]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="مقارنة المؤسسات"
        subtitle={`${totals.tenants} مؤسسة`}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(124,58,237,0.30)"
        fallbackRoute="/(admin)/services"
      />

      {/* Platform-wide totals */}
      <View style={styles.totals}>
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{fmtNum(totals.students)}</Text>
          <Text style={styles.totalLabel}>طالب</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{fmtNum(totals.teachers)}</Text>
          <Text style={styles.totalLabel}>أستاذ</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{fmtNum(totals.classes)}</Text>
          <Text style={styles.totalLabel}>صف</Text>
        </View>
      </View>

      {/* Sort chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}>
        {SORT_OPTIONS.map((o) => {
          const active = sort === o.key;
          return (
            <TouchableOpacity key={o.key}
              onPress={() => { haptics.selection(); setSort(o.key); }}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.85}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                ترتيب: {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={5} cardHeight={120} />
          </View>
        ) : sorted.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="business-outline" size={36} color={tokens.brand[500]} />
            <Text style={styles.emptyTitle}>لا توجد مؤسسات</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {sorted.map((t, idx) => {
              const expiresSoon = t.subscription_expires_at
                && new Date(t.subscription_expires_at).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
              const noActivity30d = t.last_activity_at
                && Date.now() - new Date(t.last_activity_at).getTime() > 30 * 24 * 60 * 60 * 1000;
              return (
                <FadeSlideIn key={t.id} delay={Math.min(idx * 25, 300)} translateFrom={6}>
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tenantName} numberOfLines={1}>{t.name}</Text>
                        <Text style={styles.tenantMeta}>
                          {t.city || '—'}
                          {t.type ? ` • ${t.type === 'school' ? 'مدرسة' : 'معهد'}` : ''}
                          {t.active_subscription ? ` • ${t.active_subscription}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.kpisRow}>
                      <Kpi label="طلاب" value={t.total_students} icon="people" color={tokens.semantic.info} />
                      <Kpi label="أساتذة" value={t.total_teachers} icon="school" color={tokens.semantic.purple} />
                      <Kpi label="صفوف" value={t.total_classes} icon="grid" color={tokens.semantic.teal} />
                    </View>

                    {(expiresSoon || noActivity30d) && (
                      <View style={styles.flagsRow}>
                        {expiresSoon && (
                          <View style={[styles.flag, { backgroundColor: tokens.semantic.warningBg }]}>
                            <Ionicons name="warning" size={11} color={tokens.semantic.warning} />
                            <Text style={[styles.flagText, { color: tokens.semantic.warning }]}>
                              ينتهي خلال 30 يوم
                            </Text>
                          </View>
                        )}
                        {noActivity30d && (
                          <View style={[styles.flag, { backgroundColor: tokens.semantic.dangerBg }]}>
                            <Ionicons name="alert-circle" size={11} color={tokens.semantic.danger} />
                            <Text style={[styles.flagText, { color: tokens.semantic.danger }]}>
                              خامل +30 يوم
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </FadeSlideIn>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ label, value, icon, color }: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={12} color={color} />
      </View>
      <Text style={styles.kpiValue}>{fmtNum(value)}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  totals: {
    flexDirection: 'row-reverse',
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2],
    paddingVertical: 12,
    ...tokens.shadow.xs,
  },
  totalItem: { flex: 1, alignItems: 'center' },
  totalValue: { fontSize: 18, fontWeight: '900', color: tokens.text[1] },
  totalLabel: { fontSize: 10, color: tokens.text[3], marginTop: 4 },
  divider: { width: 1, marginVertical: 8, backgroundColor: tokens.border[2] },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row-reverse' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2] },
  chipActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2], padding: 14, gap: 10,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  rankBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 14, fontWeight: '900', color: tokens.brand[500] },
  tenantName: { fontSize: 14, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  tenantMeta: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 2 },
  kpisRow: { flexDirection: 'row-reverse', gap: 8 },
  kpi: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: tokens.surface.surface2, borderRadius: tokens.radius.md,
    padding: 10,
  },
  kpiIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 16, fontWeight: '900', color: tokens.text[1] },
  kpiLabel: { fontSize: 10, color: tokens.text[3] },
  flagsRow: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' },
  flag: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  flagText: { fontSize: 10, fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 14, color: tokens.text[3] },
});
