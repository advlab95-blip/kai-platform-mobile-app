// StudentMyFees — read-only view of the student's tuition fees and payments
// history. Powered by RLS-protected reads from student_fees + fee_payments.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SectionLabel from '../../components/institute/SectionLabel';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  getMyFees, getMyPayments,
  type MyFeeRow, type MyPaymentRow,
} from '../../services/studentService';

function fmtIQ(n: number | null | undefined): string {
  const v = Math.round(Number(n || 0));
  return v.toLocaleString('ar-IQ');
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  paid:           { bg: tokens.semantic.successBg, fg: tokens.semantic.success, label: 'مكتمل' },
  partial:        { bg: tokens.semantic.warningBg, fg: tokens.semantic.warning, label: 'مدفوع جزئياً' },
  unpaid:         { bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger,  label: 'غير مدفوع' },
  overdue:        { bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger,  label: 'متأخر' },
  cancelled:      { bg: tokens.surface.surface2,   fg: tokens.text[3],          label: 'ملغي' },
};

export default function StudentMyFees() {
  const { userId } = useAuthStore();
  const [fees, setFees] = useState<MyFeeRow[]>([]);
  const [payments, setPayments] = useState<MyPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const fs = await getMyFees(userId);
      setFees(fs);
      if (fs.length > 0) {
        const ps = await getMyPayments(fs.map((f) => f.id));
        setPayments(ps);
      } else {
        setPayments([]);
      }
    } catch (err) {
      if (__DEV__) console.error('[my-fees] load', err);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const totals = useMemo(() => {
    const t = { final: 0, paid: 0, remaining: 0 };
    for (const f of fees) {
      t.final += Number(f.final_amount || 0);
      t.paid += Number(f.paid_amount || 0);
      t.remaining += Number(f.remaining_amount || 0);
    }
    return t;
  }, [fees]);

  const paymentsByFee = useMemo(() => {
    const m = new Map<string, MyPaymentRow[]>();
    for (const p of payments) {
      if (!p.student_fee_id) continue;
      const arr = m.get(p.student_fee_id) || [];
      arr.push(p);
      m.set(p.student_fee_id, arr);
    }
    return m;
  }, [payments]);

  const openReceipt = async (url: string | null) => {
    if (!url) return;
    haptics.light();
    try { await Linking.openURL(url); } catch { /* silent */ }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="رسومي وأقساطي"
        subtitle="ما دفعته وما تبقّى"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(245,158,11,0.30)"
        fallbackRoute="/(student)/services"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={3} cardHeight={120} />
          </View>
        ) : fees.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="wallet-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد رسوم</Text>
            <Text style={styles.emptyHint}>لم تُسجّل عليك أي رسوم بعد</Text>
          </View>
        ) : (
          <>
            {/* Totals strip */}
            <View style={styles.totals}>
              <View style={styles.totalItem}>
                <Text style={styles.totalValue}>{fmtIQ(totals.final)}</Text>
                <Text style={styles.totalLabel}>الإجمالي</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.totalItem}>
                <Text style={[styles.totalValue, { color: tokens.semantic.success }]}>
                  {fmtIQ(totals.paid)}
                </Text>
                <Text style={styles.totalLabel}>المدفوع</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.totalItem}>
                <Text style={[styles.totalValue, { color: tokens.semantic.danger }]}>
                  {fmtIQ(totals.remaining)}
                </Text>
                <Text style={styles.totalLabel}>المتبقي (د.ع)</Text>
              </View>
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <SectionLabel title="الرسوم" icon="document-text" />
            </View>

            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              {fees.map((f, idx) => {
                const st = STATUS_STYLE[f.status] || STATUS_STYLE.unpaid;
                const feePayments = paymentsByFee.get(f.id) || [];
                return (
                  <FadeSlideIn key={f.id} delay={idx * 40} translateFrom={10}>
                    <View style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View style={[styles.chip, { backgroundColor: st.bg }]}>
                          <Text style={[styles.chipText, { color: st.fg }]}>{st.label}</Text>
                        </View>
                        <Text style={styles.yearText}>
                          {f.academic_year || 'العام الحالي'}
                        </Text>
                      </View>

                      <View style={styles.amountRow}>
                        <View style={styles.amountItem}>
                          <Text style={styles.amountLabel}>الإجمالي</Text>
                          <Text style={styles.amountValue}>{fmtIQ(f.final_amount)}</Text>
                        </View>
                        <View style={styles.amountItem}>
                          <Text style={styles.amountLabel}>المدفوع</Text>
                          <Text style={[styles.amountValue, { color: tokens.semantic.success }]}>
                            {fmtIQ(f.paid_amount)}
                          </Text>
                        </View>
                        <View style={styles.amountItem}>
                          <Text style={styles.amountLabel}>المتبقي</Text>
                          <Text style={[styles.amountValue, { color: tokens.semantic.danger }]}>
                            {fmtIQ(f.remaining_amount)}
                          </Text>
                        </View>
                      </View>

                      {f.discount > 0 && (
                        <View style={styles.discountRow}>
                          <Ionicons name="pricetag-outline" size={12} color={tokens.semantic.success} />
                          <Text style={styles.discountText}>
                            خصم: {fmtIQ(f.discount)} د.ع
                          </Text>
                        </View>
                      )}

                      {feePayments.length > 0 && (
                        <View style={styles.paymentsBox}>
                          <Text style={styles.paymentsHeader}>
                            الدفعات ({feePayments.length})
                          </Text>
                          {feePayments.slice(0, 6).map((p) => (
                            <View key={p.id} style={styles.paymentRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.paymentDate}>
                                  {new Date(p.payment_date).toLocaleDateString('ar-IQ')}
                                </Text>
                                {p.receipt_number ? (
                                  <Text style={styles.paymentMeta}>
                                    إيصال: {p.receipt_number}
                                    {p.payment_method ? ` • ${p.payment_method}` : ''}
                                  </Text>
                                ) : null}
                              </View>
                              <Text style={styles.paymentAmount}>
                                {fmtIQ(p.amount)}
                              </Text>
                              {p.receipt_pdf_url ? (
                                <TouchableOpacity
                                  onPress={() => openReceipt(p.receipt_pdf_url)}
                                  style={styles.receiptBtn}
                                  activeOpacity={0.85}
                                >
                                  <Ionicons name="download-outline" size={14} color={tokens.brand[500]} />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ))}
                          {feePayments.length > 6 && (
                            <Text style={styles.moreNote}>
                              + {feePayments.length - 6} دفعات إضافية
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </FadeSlideIn>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  totals: {
    flexDirection: 'row-reverse',
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingVertical: 14,
    ...tokens.shadow.xs,
  },
  totalItem: { flex: 1, alignItems: 'center' },
  totalValue: { fontSize: 18, fontWeight: '900', color: tokens.text[1] },
  totalLabel: { fontSize: 10, color: tokens.text[3], marginTop: 4 },
  divider: { width: 1, marginVertical: 8, backgroundColor: tokens.border[2] },
  card: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    padding: 14,
    gap: 10,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '700' },
  yearText: { fontSize: 12, fontWeight: '800', color: tokens.text[1] },
  amountRow: { flexDirection: 'row-reverse', gap: 8 },
  amountItem: { flex: 1, backgroundColor: tokens.surface.surface2, borderRadius: tokens.radius.md, padding: 10, alignItems: 'center' },
  amountLabel: { fontSize: 10, color: tokens.text[3] },
  amountValue: { fontSize: 14, fontWeight: '900', color: tokens.text[1], marginTop: 4 },
  discountRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  discountText: { fontSize: 11, color: tokens.semantic.success, fontWeight: '700' },
  paymentsBox: {
    borderTopWidth: 1,
    borderTopColor: tokens.border[2],
    paddingTop: 10,
    gap: 8,
  },
  paymentsHeader: { fontSize: 12, fontWeight: '800', color: tokens.text[2], textAlign: 'right' },
  paymentRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  paymentDate: { fontSize: 12, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },
  paymentMeta: { fontSize: 10, color: tokens.text[3], marginTop: 2, textAlign: 'right' },
  paymentAmount: { fontSize: 13, fontWeight: '900', color: tokens.semantic.success, minWidth: 70, textAlign: 'left' },
  receiptBtn: {
    width: 28, height: 28, borderRadius: 9, backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  moreNote: { fontSize: 11, color: tokens.text[3], textAlign: 'center', paddingTop: 4 },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 80, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
