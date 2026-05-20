// SubscriptionBanner — slim banner that warns the institute admin when the
// platform subscription is expiring soon (≤30 days) or already expired.
//
// Rendering rules (from spec):
//   • subscription is null  → render NOTHING
//   • expires_at is null    → render NOTHING
//   • expires_at > now+30d  → render NOTHING (no noise)
//   • expires_at ≤ now      → red "اشتراك المنصة منتهٍ" banner
//   • ≤3 days remaining     → critical color
//   • 4-30 days remaining   → warning color
//
// Pure informational for now — the "تواصل مع الدعم" hint is text, not a link.
//
// Multi-tenant: getSubscriptionForInstitute filters by institute_id and is
// served via the institute_subscriptions_current view (RLS-protected).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/theme';
import FadeSlideIn from '../../animated/FadeSlideIn';
import {
  getSubscriptionForInstitute,
  type InstituteSubscription,
} from '../../../services/platformAdminService';

type Props = {
  instituteId: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * MS_PER_DAY;

// Friendly plan labels (Arabic).
function planLabel(plan?: string | null): string {
  switch (plan) {
    case 'trial': return 'تجريبي';
    case 'basic': return 'أساسي';
    case 'pro': return 'احترافي';
    case 'enterprise': return 'مؤسسي';
    case 'custom': return 'مخصّص';
    default: return plan || '';
  }
}

export default function SubscriptionBanner({ instituteId }: Props) {
  const [sub, setSub] = useState<InstituteSubscription | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const s = await getSubscriptionForInstitute(instituteId);
        if (mounted.current) {
          setSub(s);
          setLoaded(true);
        }
      } catch (err) {
        console.error('[SubscriptionBanner] load failed', err);
        if (mounted.current) setLoaded(true);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [instituteId]);

  if (!loaded) return null;
  if (!sub || !sub.expires_at) return null;

  const expiresAt = new Date(sub.expires_at).getTime();
  const now = Date.now();
  const msLeft = expiresAt - now;

  // Plenty of runway — don't render.
  if (msLeft > THIRTY_DAYS_MS) return null;

  const isExpired = msLeft <= 0;
  // ceil so "10h left" still shows as "1 day" (not 0).
  const daysLeft = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));
  const isCritical = isExpired || daysLeft <= 3;

  const palette = isCritical
    ? { fg: tokens.semantic.danger, bg: tokens.semantic.dangerBg, border: '#FECACA' }
    : { fg: tokens.semantic.warning, bg: tokens.semantic.warningBg, border: '#FDE68A' };

  const mainText = isExpired
    ? 'اشتراك المنصة منتهٍ — قد تتوقف بعض الميزات'
    : `ينتهي خلال ${daysLeft} يوم`;

  return (
    <FadeSlideIn delay={0} translateFrom={10} style={[styles.wrap, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: '#FFFFFF' }]}>
        <Ionicons name="card" size={16} color={palette.fg} />
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          {!!sub.plan && (
            <View style={[styles.badge, { backgroundColor: '#FFFFFF', borderColor: palette.border }]}>
              <Text style={[styles.badgeText, { color: palette.fg }]}>{planLabel(sub.plan)}</Text>
            </View>
          )}
          <Text style={[styles.mainText, { color: palette.fg }]} numberOfLines={2}>
            {mainText}
          </Text>
        </View>
        {!isExpired && (
          <Text style={styles.cta} numberOfLines={1}>
            تواصل مع الدعم
          </Text>
        )}
      </View>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    marginBottom: 12,
    ...tokens.shadow.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  mainText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  cta: {
    fontSize: 10,
    color: tokens.text[3],
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },
});
