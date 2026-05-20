// system-health.tsx — Platform admin live system health dashboard.
// Pulls `get_system_health_now` RPC every 60s and renders KPI cards.
// Auto-refresh is paused when component unmounts to avoid orphaned timers.

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import {
  getSystemHealthNow,
  type SystemHealthSnapshot,
} from '../../services/platformAdminService';

// ── humanize helper ───────────────────────────────────────────────
// Returns Arabic relative time: "منذ N دقيقة/ساعة/يوم". Inline by design
// (per spec) so the screen is self-contained and easy to reason about.
function humanizeAr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'الآن';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `منذ ${min.toLocaleString('ar-IQ')} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr.toLocaleString('ar-IQ')} ساعة`;
  const day = Math.floor(hr / 24);
  return `منذ ${day.toLocaleString('ar-IQ')} يوم`;
}

const AUTO_REFRESH_MS = 60_000;

type CardSpec = {
  key: keyof SystemHealthSnapshot | 'taken_at_h';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  tintBg: string;
  suffix?: string;
};

const PRIMARY_CARDS: CardSpec[] = [
  { key: 'total_users',       label: 'إجمالي المستخدمين', icon: 'people',         tint: tokens.color.info,    tintBg: tokens.color.infoBg },
  { key: 'total_institutes',  label: 'إجمالي المؤسسات',   icon: 'business',       tint: tokens.color.purple,  tintBg: tokens.color.purpleBg },
  { key: 'active_users_24h',  label: 'مستخدمون نشطون (٢٤س)', icon: 'flash',       tint: tokens.color.success, tintBg: tokens.color.successBg },
  { key: 'db_size_mb',        label: 'حجم قاعدة البيانات', icon: 'server',         tint: tokens.color.warning, tintBg: tokens.color.warningBg, suffix: ' MB' },
];

const SECONDARY_CARDS: CardSpec[] = [
  { key: 'notifications_24h', label: 'إشعارات (٢٤س)', icon: 'notifications', tint: tokens.color.pink,  tintBg: tokens.color.pinkBg },
  { key: 'taken_at_h',        label: 'آخر تحديث',      icon: 'time',          tint: tokens.color.teal,  tintBg: tokens.color.tealBg },
];

export default function AdminSystemHealth() {
  const [snapshot, setSnapshot] = useState<SystemHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const data = await getSystemHealthNow();
      if (mountedRef.current) setSnapshot(data);
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message || 'تعذّر جلب بيانات النظام');
      }
    } finally {
      if (mountedRef.current && showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load(true);
    const id = setInterval(() => load(false), AUTO_REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }, [load]);

  const formatCardValue = (spec: CardSpec): string => {
    if (!snapshot) return '—';
    if (spec.key === 'taken_at_h') return humanizeAr(snapshot.taken_at);
    const raw = (snapshot as any)[spec.key] as number | undefined;
    if (raw == null) return '—';
    return `${Number(raw).toLocaleString('ar-IQ')}${spec.suffix || ''}`;
  };

  const renderKpiCard = (spec: CardSpec) => (
    <View key={String(spec.key)} style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, { backgroundColor: spec.tintBg }]}>
        <Ionicons name={spec.icon} size={18} color={spec.tint} />
      </View>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {formatCardValue(spec)}
      </Text>
      <Text style={styles.kpiLabel} numberOfLines={2}>
        {spec.label}
      </Text>
    </View>
  );

  const renderSkeletonCard = (i: number) => (
    <View key={`sk_${i}`} style={[styles.kpiCard, styles.kpiCardSkeleton]}>
      <View style={[styles.kpiIconWrap, { backgroundColor: '#F1F5F9' }]} />
      <View style={styles.skeletonLineLg} />
      <View style={styles.skeletonLineSm} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="صحة النظام"
        subtitle="إحصائيات لحظية"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Refresh pill */}
        <View style={styles.refreshRow}>
          <TouchableOpacity
            style={styles.refreshPill}
            onPress={() => load(true)}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading && !snapshot ? (
              <ActivityIndicator size="small" color={tokens.color.brand500} />
            ) : (
              <Ionicons name="refresh" size={14} color={tokens.color.brand500} />
            )}
            <Text style={styles.refreshPillText}>تحديث</Text>
          </TouchableOpacity>
          {snapshot && !loading ? (
            <Text style={styles.refreshHint}>تحديث تلقائي كل دقيقة</Text>
          ) : null}
        </View>

        {/* Error banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <View style={styles.errorBannerLeft}>
              <TouchableOpacity
                onPress={() => load(true)}
                style={styles.errorRetryBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.errorRetryText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.errorBannerRight}>
              <Ionicons name="alert-circle" size={18} color={tokens.color.danger} />
              <Text style={styles.errorBannerText} numberOfLines={2}>
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Primary KPI grid (2 cols × 2 rows) */}
        <View style={styles.kpiGrid}>
          {loading && !snapshot
            ? [0, 1, 2, 3].map(renderSkeletonCard)
            : PRIMARY_CARDS.map(renderKpiCard)}
        </View>

        {/* Secondary row (2 cards) */}
        <View style={styles.kpiGrid}>
          {loading && !snapshot
            ? [4, 5].map(renderSkeletonCard)
            : SECONDARY_CARDS.map(renderKpiCard)}
        </View>

        {loading && !snapshot ? (
          <ActivityIndicator
            color={tokens.color.brand500}
            size="large"
            style={{ marginTop: 24 }}
          />
        ) : null}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  refreshRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  refreshPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.color.brand100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  refreshPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.color.brand500,
  },
  refreshHint: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  errorBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.color.dangerBg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 8,
  },
  errorBannerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  errorBannerLeft: {},
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.danger,
    textAlign: 'right',
  },
  errorRetryBtn: {
    backgroundColor: tokens.color.danger,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  errorRetryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  kpiGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  kpiCard: {
    flexBasis: '48.5%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: tokens.radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 110,
    gap: 8,
    ...tokens.shadow.xs,
  },
  kpiCardSkeleton: {
    opacity: 0.6,
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  skeletonLineLg: {
    width: '60%',
    height: 18,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    alignSelf: 'flex-end',
  },
  skeletonLineSm: {
    width: '45%',
    height: 10,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    alignSelf: 'flex-end',
  },
});
