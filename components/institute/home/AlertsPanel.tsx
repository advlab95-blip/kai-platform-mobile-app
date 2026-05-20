// AlertsPanel — collapsible "تنبيهات" list for the Institute admin home.
// Polls get_institute_alerts() every 90s. Renders NOTHING when there are
// no alerts (don't take up vertical space on a clean institute).
//
// Multi-tenant: the RPC verifies the caller is admin of the passed institute.
// Each alert may include an optional cta_route — tapping the row navigates
// there via expo-router. Silent on errors.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { tokens } from '../../../constants/theme';
import { haptics } from '../../../utils/haptics';
import FadeSlideIn from '../../animated/FadeSlideIn';
import {
  getAlerts,
  type InstituteAlert,
  type AlertSeverity,
} from '../../../services/instituteAdminService';

type Props = {
  instituteId: string;
};

const REFRESH_MS = 90_000;

// Enable LayoutAnimation on Android (no-op on iOS / Hermes already supports it).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function severityColors(s: AlertSeverity) {
  switch (s) {
    case 'critical':
      return { fg: tokens.semantic.danger, bg: tokens.semantic.dangerBg };
    case 'warning':
      return { fg: tokens.semantic.warning, bg: tokens.semantic.warningBg };
    case 'success':
      return { fg: tokens.semantic.success, bg: tokens.semantic.successBg };
    case 'info':
    default:
      return { fg: tokens.semantic.info, bg: tokens.semantic.infoBg };
  }
}

export default function AlertsPanel({ instituteId }: Props) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<InstituteAlert[]>([]);
  const [count, setCount] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer: any = null;

    const load = async () => {
      try {
        const res = await getAlerts(instituteId);
        if (!mounted.current) return;
        setAlerts(res.alerts || []);
        setCount(res.count || 0);
      } catch (err) {
        // Silent — log only.
        console.error('[AlertsPanel] load failed', err);
      }
    };

    load();
    timer = setInterval(load, REFRESH_MS);

    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
    };
  }, [instituteId]);

  // Spec: when count === 0 don't render at all.
  if (count === 0 || alerts.length === 0) return null;

  const toggle = () => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };

  const onAlertPress = (a: InstituteAlert) => {
    if (!a.cta_route) return;
    haptics.light();
    try {
      router.push(a.cta_route as any);
    } catch (err) {
      console.error('[AlertsPanel] navigation failed', err);
    }
  };

  return (
    <FadeSlideIn delay={0} translateFrom={10} style={styles.wrap}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={toggle}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={tokens.text[3]}
          />
        </View>
        <View style={styles.headerRight}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="notifications" size={14} color={tokens.semantic.warning} />
          </View>
          <Text style={styles.headerTitle}>تنبيهات ({count})</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.list}>
          {alerts.map((a, idx) => {
            const c = severityColors(a.severity);
            const tappable = !!a.cta_route;
            const Container: any = tappable ? TouchableOpacity : View;
            const containerProps = tappable
              ? { activeOpacity: 0.8, onPress: () => onAlertPress(a) }
              : {};
            return (
              <Container
                key={`${a.title}-${idx}`}
                style={[styles.alertRow, idx === 0 && styles.alertRowFirst]}
                {...containerProps}
              >
                <View style={[styles.alertIconWrap, { backgroundColor: c.bg }]}>
                  <Ionicons name={(a.icon as any) || 'alert-circle'} size={16} color={c.fg} />
                </View>
                <View style={styles.alertBody}>
                  <Text style={styles.alertTitle} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={styles.alertDetail} numberOfLines={1}>
                    {a.detail}
                  </Text>
                </View>
                {tappable && (
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={tokens.text[4]}
                    style={styles.alertArrow}
                  />
                )}
              </Container>
            );
          })}
        </View>
      )}
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    marginBottom: 12,
    overflow: 'hidden',
    ...tokens.shadow.xs,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  headerLeft: {
    // chevron toggle indicator
  },
  headerIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: tokens.semantic.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.text[1],
    textAlign: 'right',
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  alertRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.border[2],
  },
  alertRowFirst: {
    borderTopWidth: 0,
  },
  alertIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBody: {
    flex: 1,
    minWidth: 0,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.text[1],
    textAlign: 'right',
  },
  alertDetail: {
    fontSize: 11,
    color: tokens.text[3],
    textAlign: 'right',
    marginTop: 2,
  },
  alertArrow: {
    marginLeft: 2,
  },
});
