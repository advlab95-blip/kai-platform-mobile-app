// ParentPermissionSlips — parent's pending + completed consent forms (trips,
// events, fee approvals). One row per (slip × child) so a slip targeting
// multiple children of the same parent shows separate decisions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  getMyPermissionSlips, respondToPermissionSlip,
  type PermissionSlip, type MyPermissionSlipResponse,
} from '../../services/parentService';

type Row = {
  slip: PermissionSlip;
  student_id: string;
  student_name: string | null;
  response: MyPermissionSlipResponse | null;
};

const RESPONSE_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  approved: { label: 'موافق',  bg: tokens.semantic.successBg, fg: tokens.semantic.success },
  declined: { label: 'مرفوض',  bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger },
};

function fmtIQ(n: number | null | undefined): string {
  return Math.round(Number(n || 0)).toLocaleString('ar-IQ');
}

export default function ParentPermissionSlipsScreen() {
  const { userId } = useAuthStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getMyPermissionSlips(userId);
      setRows(data);
    } catch (err) {
      if (__DEV__) console.error('[parent/permission-slips] load', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const handleRespond = (r: Row, response: 'approved' | 'declined') => {
    const childLabel = r.student_name || 'الطالب';
    const verb = response === 'approved' ? 'الموافقة' : 'الرفض';
    Alert.alert(
      `تأكيد ${verb}`,
      `هل تريد ${verb} على "${r.slip.title}" لـ${childLabel}؟ لن يمكن التعديل بعد الإرسال إلا بطلب من الإدارة.`,
      [
        { text: 'تراجع', style: 'cancel' },
        {
          text: verb,
          style: response === 'declined' ? 'destructive' : 'default',
          onPress: async () => {
            const key = `${r.slip.id}:${r.student_id}`;
            setBusyKey(key);
            haptics.medium();
            try {
              await respondToPermissionSlip({
                slip_id: r.slip.id,
                student_id: r.student_id,
                response,
              });
              setRows((prev) => prev.map((x) =>
                x.slip.id === r.slip.id && x.student_id === r.student_id
                  ? { ...x, response: { slip_id: r.slip.id, student_id: r.student_id, response, responded_at: new Date().toISOString() } }
                  : x
              ));
              haptics.success();
            } catch (err: any) {
              haptics.error();
              Alert.alert('خطأ', err?.message || 'فشل الإرسال');
            } finally {
              setBusyKey(null);
            }
          },
        },
      ],
    );
  };

  const { pending, decided } = useMemo(() => {
    const p: Row[] = []; const d: Row[] = [];
    for (const r of rows) {
      if (r.response?.response) d.push(r);
      else p.push(r);
    }
    return { pending: p, decided: d };
  }, [rows]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="إذونات الخروج"
        subtitle="موافقتك على الرحلات والأنشطة"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(245,158,11,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={3} cardHeight={160} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد إذونات</Text>
            <Text style={styles.emptyHint}>
              ستظهر إذونات الرحلات والأنشطة هنا عند إصدارها
            </Text>
          </View>
        ) : (
          <View style={{ paddingTop: 8 }}>
            {pending.length > 0 && <Group title="بانتظار قرارك" data={pending} busyKey={busyKey} onRespond={handleRespond} />}
            {decided.length > 0 && <Group title="مكتمل" data={decided} busyKey={null} onRespond={() => {}} muted />}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({
  title, data, busyKey, onRespond, muted,
}: {
  title: string;
  data: Row[];
  busyKey: string | null;
  onRespond: (r: Row, response: 'approved' | 'declined') => void;
  muted?: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 10 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {data.map((r, idx) => {
        const isOverdue = new Date(r.slip.deadline).getTime() < Date.now();
        const rsp = r.response?.response;
        const rspStyle = rsp ? RESPONSE_STYLE[rsp] : null;
        const key = `${r.slip.id}:${r.student_id}`;
        return (
          <FadeSlideIn key={key} delay={idx * 30} translateFrom={6}>
            <View style={[styles.card, muted && { opacity: 0.7 }]}>
              <View style={styles.cardHeader}>
                {rspStyle ? (
                  <View style={[styles.chip, { backgroundColor: rspStyle.bg }]}>
                    <Text style={[styles.chipText, { color: rspStyle.fg }]}>{rspStyle.label}</Text>
                  </View>
                ) : isOverdue ? (
                  <View style={[styles.chip, { backgroundColor: tokens.semantic.dangerBg }]}>
                    <Text style={[styles.chipText, { color: tokens.semantic.danger }]}>انتهى الموعد</Text>
                  </View>
                ) : (
                  <View style={[styles.chip, { backgroundColor: tokens.semantic.warningBg }]}>
                    <Text style={[styles.chipText, { color: tokens.semantic.warning }]}>بانتظار قرارك</Text>
                  </View>
                )}
                <View style={styles.childBadge}>
                  <Ionicons name="person" size={11} color={tokens.text[3]} />
                  <Text style={styles.childText} numberOfLines={1}>
                    {r.student_name || 'الطالب'}
                  </Text>
                </View>
              </View>

              <Text style={styles.titleText} numberOfLines={2}>{r.slip.title}</Text>
              {r.slip.description ? (
                <Text style={styles.descText} numberOfLines={4}>{r.slip.description}</Text>
              ) : null}

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={12} color={tokens.text[3]} />
                  <Text style={styles.metaText}>{formatDate(r.slip.event_date)}</Text>
                </View>
                {r.slip.location ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={12} color={tokens.text[3]} />
                    <Text style={styles.metaText} numberOfLines={1}>{r.slip.location}</Text>
                  </View>
                ) : null}
                {r.slip.fee_amount && r.slip.fee_amount > 0 ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="cash-outline" size={12} color={tokens.semantic.warning} />
                    <Text style={[styles.metaText, { color: tokens.semantic.warning, fontWeight: '800' }]}>
                      {fmtIQ(r.slip.fee_amount)} د.ع
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.deadlineText}>
                آخر موعد للرد: {formatDateTime(r.slip.deadline)}
              </Text>

              {!muted && !isOverdue && (
                <View style={styles.responseRow}>
                  <TouchableOpacity
                    onPress={() => onRespond(r, 'declined')}
                    disabled={busyKey === key}
                    style={[styles.responseBtn, styles.declineBtn]}
                    activeOpacity={0.85}
                  >
                    {busyKey === key
                      ? <ActivityIndicator size="small" color={tokens.semantic.danger} />
                      : <Text style={styles.declineBtnText}>رفض</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onRespond(r, 'approved')}
                    disabled={busyKey === key}
                    style={[styles.responseBtn, styles.approveBtn]}
                    activeOpacity={0.85}
                  >
                    {busyKey === key
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.approveBtnText}>موافق</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </FadeSlideIn>
        );
      })}
    </View>
  );
}

function formatDate(ymd: string): string {
  try { return new Date(ymd).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ymd; }
}
function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-IQ', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: tokens.text[1], textAlign: 'right', marginTop: 8, marginBottom: 4 },
  card: {
    backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2], padding: 14, gap: 8,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '700' },
  childBadge: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: tokens.surface.surface2,
  },
  childText: { fontSize: 11, color: tokens.text[2], fontWeight: '700' },
  titleText: { fontSize: 15, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  descText: { fontSize: 12, color: tokens.text[2], lineHeight: 18, textAlign: 'right' },
  metaRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: tokens.text[3] },
  deadlineText: { fontSize: 11, color: tokens.text[4], textAlign: 'right', fontStyle: 'italic' },
  responseRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 4 },
  responseBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: tokens.radius.md },
  approveBtn: { backgroundColor: tokens.semantic.success },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  declineBtn: {
    backgroundColor: tokens.semantic.dangerBg,
    borderWidth: 1, borderColor: tokens.semantic.danger + '40',
  },
  declineBtnText: { color: tokens.semantic.danger, fontSize: 13, fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
