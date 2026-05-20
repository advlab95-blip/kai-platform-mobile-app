// Platform admin · Failed Login Attempts (Brute-Force Watch)
// ────────────────────────────────────────────────────────────────────
// Aggregates the last 24h of failed logins into "Top IPs" and "Top Codes"
// rankings so the admin can spot brute-force fishing attempts at a glance.
// Drilling into a row opens a SwipeableSheet with the raw attempt rows
// for that IP (or code).
//
// Data: services/platformAdminService.ts → getBruteForceSummary /
// listFailedLogins.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import {
  getBruteForceSummary,
  listFailedLogins,
  type FailedLoginAttempt,
} from '../../services/platformAdminService';

type Tab = 'ip' | 'code';

type Summary = {
  topIps: Array<{ ip: string; count: number }>;
  topCodes: Array<{ code: string; count: number }>;
  total: number;
};

function relativeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

export default function AdminFailedLogins() {
  const [tab, setTab] = useState<Tab>('ip');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drill-down state — single sheet reused for both IP and code drills.
  const [drillTitle, setDrillTitle] = useState('');
  const [drillRows, setDrillRows] = useState<FailedLoginAttempt[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await getBruteForceSummary(24);
      setSummary(s);
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل البيانات');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Drill: fetch raw rows for a given IP. listFailedLogins doesn't support
  // filtering by `attempted_code`, so when the admin drills on a code we fall
  // back to fetching the full 24h window and filtering client-side. With the
  // 1000-row cap from getBruteForceSummary this stays cheap.
  const openDrillByIp = async (ip: string, count: number) => {
    haptics.selection();
    setDrillTitle(`${ip} · ${count} محاولة`);
    setDrillRows(null);
    setDrillLoading(true);
    try {
      const rows = await listFailedLogins({ ip, hours: 24, limit: 200 });
      setDrillRows(rows);
    } catch (e: any) {
      setDrillRows([]);
    } finally {
      setDrillLoading(false);
    }
  };

  const openDrillByCode = async (code: string, count: number) => {
    haptics.selection();
    setDrillTitle(`${code} · ${count} محاولة`);
    setDrillRows(null);
    setDrillLoading(true);
    try {
      const all = await listFailedLogins({ hours: 24, limit: 1000 });
      setDrillRows(all.filter((a) => a.attempted_code === code).slice(0, 200));
    } catch (e: any) {
      setDrillRows([]);
    } finally {
      setDrillLoading(false);
    }
  };

  const closeDrill = () => { setDrillRows(null); setDrillTitle(''); };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="محاولات الدخول الفاشلة"
        subtitle="كشف الهجمات والاختراق"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── Summary cards ── */}
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 40 }} />
        ) : error ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="warning" size={40} color={Colors.error} />
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <SummaryCard
                icon="alert-circle"
                tone="error"
                value={summary?.total ?? 0}
                label="إجمالي المحاولات (24س)"
              />
              <SummaryCard
                icon="globe"
                tone="warn"
                value={summary?.topIps.length ?? 0}
                label="عناوين IP فريدة"
              />
              <SummaryCard
                icon="key"
                tone="info"
                value={summary?.topCodes.length ?? 0}
                label="رموز مختلفة"
              />
            </View>

            {/* ── Tab switcher ── */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabBtn, tab === 'ip' && styles.tabBtnActive]}
                onPress={() => { haptics.selection(); setTab('ip'); }}
              >
                <Text style={[styles.tabText, tab === 'ip' && styles.tabTextActive]}>حسب IP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, tab === 'code' && styles.tabBtnActive]}
                onPress={() => { haptics.selection(); setTab('code'); }}
              >
                <Text style={[styles.tabText, tab === 'code' && styles.tabTextActive]}>حسب الكود</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              {tab === 'ip' ? (
                summary && summary.topIps.length > 0 ? (
                  summary.topIps.map((row, idx) => (
                    <RankRow
                      key={`ip-${row.ip}-${idx}`}
                      rank={idx + 1}
                      primary={row.ip}
                      count={row.count}
                      onPress={() => openDrillByIp(row.ip, row.count)}
                    />
                  ))
                ) : (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="shield-checkmark" size={40} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>لا توجد محاولات فاشلة</Text>
                  </View>
                )
              ) : (
                summary && summary.topCodes.length > 0 ? (
                  summary.topCodes.map((row, idx) => (
                    <RankRow
                      key={`code-${row.code}-${idx}`}
                      rank={idx + 1}
                      primary={row.code}
                      count={row.count}
                      onPress={() => openDrillByCode(row.code, row.count)}
                    />
                  ))
                ) : (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="shield-checkmark" size={40} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>لا توجد محاولات فاشلة</Text>
                  </View>
                )
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ────────── Drill-down sheet ────────── */}
      <SwipeableSheet visible={!!drillTitle} onClose={closeDrill} maxHeight={0.85}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{drillTitle}</Text>
          <Text style={styles.sheetSubtitle}>المحاولات الخام (آخر 24 ساعة)</Text>
        </View>
        {drillLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.drillContent}
          >
            {!drillRows || drillRows.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد محاولات</Text>
            ) : (
              drillRows.map((row) => (
                <View key={row.id} style={styles.drillRow}>
                  <Text style={styles.drillAge}>{relativeAgo(row.created_at)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drillCode} numberOfLines={1}>{row.attempted_code}</Text>
                    <Text style={styles.drillMeta} numberOfLines={1}>
                      {row.ip_address || '—'}{row.reason ? ` · ${row.reason}` : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </SwipeableSheet>
    </SafeAreaView>
  );
}

// ───────────────────────── Subcomponents ──────────────────────────

function SummaryCard({
  icon, value, label, tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  tone: 'error' | 'warn' | 'info';
}) {
  const toneColors = {
    error: { bg: '#FEE2E2', fg: '#DC2626' },
    warn:  { bg: '#FEF3C7', fg: '#B45309' },
    info:  { bg: '#DBEAFE', fg: '#1E40AF' },
  } as const;
  const c = toneColors[tone];
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIconWrap, { backgroundColor: c.bg }]}>
        <Ionicons name={icon} size={18} color={c.fg} />
      </View>
      <Text style={styles.summaryValue}>{value.toLocaleString('ar-IQ')}</Text>
      <Text style={styles.summaryLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function RankRow({
  rank, primary, count, onPress,
}: {
  rank: number;
  primary: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <View style={styles.rankRow}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rankPrimary} numberOfLines={1}>{primary}</Text>
        <Text style={styles.rankCount}>{count} محاولة</Text>
      </View>
      <TouchableOpacity style={styles.rankBtn} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.rankBtnText}>عرض المحاولات</Text>
        <Ionicons name="chevron-back" size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  emptyWrap: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  // Summary
  summaryRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 6,
  },
  summaryIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryValue: { fontSize: 18, fontWeight: '900', color: Colors.text },
  summaryLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },

  content: { paddingHorizontal: 16, paddingTop: 14 },

  // Rank rows
  rankRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rankBadge: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontWeight: '900', color: Colors.primary },
  rankPrimary: { fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  rankCount: { fontSize: 10, color: Colors.textMuted, textAlign: 'right' },
  rankBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  rankBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  // Sheet
  sheetHeader: { paddingHorizontal: 18, paddingBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  sheetSubtitle: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  drillContent: { paddingHorizontal: 18, paddingBottom: 30 },
  drillRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  drillAge: { fontSize: 9, color: Colors.textMuted, width: 70, textAlign: 'left' },
  drillCode: { fontSize: 12, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  drillMeta: { fontSize: 10, color: Colors.textMuted, textAlign: 'right' },
});
