// DashboardKPIs — primary KPI grid for the Institute admin home.
// 2-column, 8 cards: students, teachers, classes, attendance%, absences,
// upcoming exams, pending leaves, monthly revenue.
//
// Data: prefers `stats` from the parent (shared useInstituteDashboardStats
// hook → one RPC for the whole home). If `stats` is omitted it falls back to
// its own fetch so the component still works standalone elsewhere.
//
// Interaction: each KPI may take an `onPress` so the admin can drill down to
// the relevant management screen (replaces the legacy StatsStrip behavior).
//
// Multi-tenant: the RPC verifies the caller is admin of the institute.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/theme';
import { haptics } from '../../../utils/haptics';
import FadeSlideIn from '../../animated/FadeSlideIn';
import {
  getDashboardStats,
  type DashboardStats,
} from '../../../services/instituteAdminService';

export type KpiKey =
  | 'students'
  | 'teachers'
  | 'classes'
  | 'attendance'
  | 'absent'
  | 'exams'
  | 'leaves'
  | 'revenue';

type Props = {
  instituteId: string;
  /** Provided by parent (shared hook) — when present the component skips its own fetch. */
  stats?: DashboardStats | null;
  /** Optional per-KPI tap handlers (drill-down). Missing keys render as non-tappable. */
  onKpiPress?: Partial<Record<KpiKey, () => void>>;
};

type KPI = {
  key: KpiKey;
  label: string;
  value: string | number;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  bg: string;
  color: string;
};

// 60s — only used when no parent stats are passed in. The shared hook ticks at
// the same interval, so behavior is identical either way.
const REFRESH_MS = 60_000;

export default function DashboardKPIs({ instituteId, stats: statsProp, onKpiPress }: Props) {
  const [internalStats, setInternalStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const standalone = statsProp === undefined;

  useEffect(() => {
    mounted.current = true;
    if (!standalone) {
      setLoading(false);
      return;
    }

    let timer: any = null;
    const load = async () => {
      try {
        const data = await getDashboardStats(instituteId);
        if (mounted.current) {
          setInternalStats(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('[DashboardKPIs] load failed', err);
        if (mounted.current) setLoading(false);
      }
    };
    load();
    timer = setInterval(load, REFRESH_MS);
    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
    };
  }, [instituteId, standalone]);

  const stats = standalone ? internalStats : statsProp;

  if (loading && !stats) {
    return (
      <View style={styles.grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.card, styles.skeleton]} />
        ))}
      </View>
    );
  }

  // Silent on persistent error — keeps the home clean.
  if (!stats) return null;

  const attRate = Math.round(Number(stats.attendance_rate) || 0);
  const attColor =
    attRate >= 85
      ? tokens.semantic.success
      : attRate >= 60
        ? tokens.semantic.warning
        : tokens.semantic.danger;
  const attBg =
    attRate >= 85
      ? tokens.semantic.successBg
      : attRate >= 60
        ? tokens.semantic.warningBg
        : tokens.semantic.dangerBg;

  const revenueLabel = `${Number(stats.revenue_month || 0).toLocaleString('ar-IQ')} د.ع`;

  const kpis: KPI[] = [
    {
      key: 'students',
      label: 'الطلاب',
      value: stats.total_students ?? 0,
      icon: 'people',
      bg: tokens.semantic.infoBg,
      color: tokens.semantic.info,
    },
    {
      key: 'teachers',
      label: 'الأساتذة',
      value: stats.total_teachers ?? 0,
      icon: 'school',
      bg: tokens.semantic.purpleBg,
      color: tokens.semantic.purple,
    },
    {
      key: 'classes',
      label: 'الصفوف',
      value: stats.total_classes ?? 0,
      icon: 'grid',
      bg: tokens.semantic.tealBg,
      color: tokens.semantic.teal,
    },
    {
      key: 'attendance',
      label: 'الحضور اليوم',
      value: `${attRate}%`,
      icon: 'checkmark-circle',
      bg: attBg,
      color: attColor,
    },
    {
      key: 'absent',
      label: 'غياب اليوم',
      value: stats.absent_today ?? 0,
      icon: 'alert-circle',
      bg: tokens.semantic.warningBg,
      color: tokens.semantic.warning,
    },
    {
      key: 'exams',
      label: 'امتحانات هذا الأسبوع',
      value: stats.upcoming_exams_week ?? 0,
      icon: 'document-text',
      bg: tokens.semantic.infoBg,
      color: tokens.semantic.info,
    },
    {
      key: 'leaves',
      label: 'طلبات إجازة معلَّقة',
      value: stats.leave_requests_pending ?? 0,
      icon: 'time',
      bg: tokens.semantic.warningBg,
      color: tokens.semantic.warning,
    },
    {
      key: 'revenue',
      label: 'إيرادات الشهر',
      value: revenueLabel,
      icon: 'cash',
      bg: tokens.semantic.successBg,
      color: tokens.semantic.success,
    },
  ];

  return (
    <View style={styles.grid}>
      {kpis.map((k, idx) => {
        const press = onKpiPress?.[k.key];
        const Card: any = press ? TouchableOpacity : View;
        const cardProps = press
          ? {
              activeOpacity: 0.85,
              onPress: () => {
                haptics.light();
                press();
              },
              accessibilityRole: 'button' as const,
              accessibilityLabel: `${k.label} ${k.value}`,
            }
          : {};
        return (
          <FadeSlideIn key={k.key} delay={idx * 40} translateFrom={10} style={styles.cellWrap}>
            <Card style={styles.card} {...cardProps}>
              <View style={styles.topRow}>
                <Text style={styles.label} numberOfLines={1}>
                  {k.label}
                </Text>
                <View style={[styles.iconWrap, { backgroundColor: k.bg }]}>
                  <Ionicons name={k.icon} size={14} color={k.color} />
                </View>
              </View>
              <Text
                style={styles.value}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                allowFontScaling={false}
              >
                {k.value}
              </Text>
            </Card>
          </FadeSlideIn>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  cellWrap: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  card: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    minHeight: 84,
    ...tokens.shadow.xs,
  },
  skeleton: {
    backgroundColor: tokens.border[2],
    borderColor: tokens.border[2],
    minHeight: 84,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    color: tokens.text[3],
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    paddingLeft: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
    letterSpacing: -0.5,
    lineHeight: 24,
  },
});
