// ImpersonationBanner — app-wide slim red banner shown whenever the current
// platform admin has an active impersonation session in flight. Kept small
// (~36pt) so it doesn't disrupt the host screen layout. Wiring into a layout
// is done elsewhere — this component is self-contained and only renders when
// `getActiveImpersonation()` resolves a non-null session.
//
// Note: the underlying RPC currently does NOT swap the auth session — the
// session is an audit record. The banner exists to remind the admin that
// every action they're taking is being logged under their own identity for
// support purposes, and to give them a one-tap way to terminate the session.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';
import {
  getActiveImpersonation,
  endImpersonation,
  type ImpersonationSession,
} from '../../services/platformAdminService';

function translateError(msg: string | undefined): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('unauthorized')) return 'غير مصرح';
  if (m.includes('already_impersonating')) return 'لديك جلسة نشطة بالفعل';
  if (m.includes('reason_required')) return 'السبب إلزامي (5 أحرف على الأقل)';
  return msg || 'حدث خطأ غير متوقع';
}

export default function ImpersonationBanner() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<ImpersonationSession | null>(null);
  const [ending, setEnding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await getActiveImpersonation();
      setSession(s);
    } catch {
      // Silent: banner just won't show. Errors are surfaced on the screen
      // that owns the impersonation flow.
    }
  }, []);

  useEffect(() => {
    refresh();
    // Light polling — banner is global and we want it to disappear shortly
    // after end is called from any screen. 15s is a sensible middle ground.
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleEnd = useCallback(async () => {
    if (!session || ending) return;
    haptics.warning();
    Alert.alert(
      'إنهاء الجلسة',
      'هل تريد إنهاء جلسة الانتحال الآن؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إنهاء',
          style: 'destructive',
          onPress: async () => {
            setEnding(true);
            try {
              await endImpersonation(session.id);
              haptics.success();
              setSession(null);
            } catch (err: any) {
              haptics.error();
              Alert.alert('خطأ', translateError(err?.message));
            } finally {
              setEnding(false);
            }
          },
        },
      ],
    );
  }, [session, ending]);

  if (!session) return null;

  const targetName = session.target_name || 'المستخدم المستهدف';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: tokens.color.danger }]}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={handleEnd}
          disabled={ending}
          style={styles.endBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="إنهاء جلسة الانتحال"
        >
          {ending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.endBtnText}>إنهاء</Text>
          )}
        </TouchableOpacity>
        <View style={styles.textWrap}>
          <Ionicons name="warning" size={14} color="#fff" />
          <Text style={styles.text} numberOfLines={1}>
            تنتحل هوية: {targetName}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Fixed pinning + safe-area is the parent layout's responsibility — this
    // component is positionless on purpose so it can be dropped into any
    // container (Stack header, app root view, etc.).
    width: '100%',
  },
  row: {
    height: 36,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 8,
  },
  textWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1,
  },
  endBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
});
