// Per-institute subscription management for the Platform Admin.
// Lists current subscriptions (one row per institute) with summary KPIs,
// status filter chips, and an edit sheet that supports plan/status/expiry/
// price/seats/notes plus a nested "record payment" sheet.
//
// All data flows through services/platformAdminService.ts — no direct
// table writes here. The service uses SECURITY DEFINER RPCs / RLS-guarded
// tables under the hood (admin-only).

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import {
  listCurrentSubscriptions,
  upsertSubscription,
  recordSubscriptionPayment,
  type InstituteSubscription,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '../../services/platformAdminService';

// ──────────────────────── Constants ────────────────────────
const PLANS: { key: SubscriptionPlan; label: string; color: string; bg: string }[] = [
  { key: 'trial',      label: 'تجريبي',  color: '#0284C7', bg: '#DBEAFE' },
  { key: 'basic',      label: 'أساسي',   color: '#0F766E', bg: '#CCFBF1' },
  { key: 'pro',        label: 'احترافي', color: '#7C3AED', bg: '#EDE9FE' },
  { key: 'enterprise', label: 'مؤسسي',   color: '#B45309', bg: '#FEF3C7' },
  { key: 'custom',     label: 'مخصص',    color: '#475569', bg: '#F1F5F9' },
];

const STATUSES: { key: SubscriptionStatus | 'all'; label: string }[] = [
  { key: 'all',       label: 'الكل' },
  { key: 'active',    label: 'نشط' },
  { key: 'past_due',  label: 'متأخر' },
  { key: 'suspended', label: 'موقوف' },
  { key: 'expired',   label: 'منتهي' },
];

const STATUS_COLORS: Record<SubscriptionStatus, { color: string; bg: string; label: string }> = {
  active:    { color: tokens.color.success, bg: tokens.color.successBg, label: 'نشط' },
  past_due:  { color: tokens.color.warning, bg: tokens.color.warningBg, label: 'متأخر' },
  suspended: { color: tokens.color.danger,  bg: tokens.color.dangerBg,  label: 'موقوف' },
  cancelled: { color: '#64748B',            bg: '#F1F5F9',              label: 'ملغى' },
  expired:   { color: tokens.color.danger,  bg: tokens.color.dangerBg,  label: 'منتهي' },
};

// ──────────────────────── Helpers ──────────────────────────
function planMeta(plan: SubscriptionPlan) {
  return PLANS.find((p) => p.key === plan) || PLANS[0];
}

// "ينتهي خلال N يوم" / "منتهي منذ N يوم" / "بدون انتهاء"
function humanizeExpiry(expiresAt: string | null): { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (!expiresAt) return { label: 'بدون انتهاء', tone: 'muted' };
  const now = Date.now();
  const end = new Date(expiresAt).getTime();
  const diffMs = end - now;
  const days = Math.round(diffMs / (24 * 3600 * 1000));
  if (days < 0) return { label: `منتهي منذ ${Math.abs(days)} يوم`, tone: 'bad' };
  if (days === 0) return { label: 'ينتهي اليوم', tone: 'bad' };
  if (days <= 7) return { label: `ينتهي خلال ${days} يوم`, tone: 'warn' };
  return { label: `ينتهي خلال ${days} يوم`, tone: 'ok' };
}

function fmtMoney(n: number | null, currency = 'IQD') {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('en-US')} ${currency}`;
}

// Date helpers — only YYYY-MM-DD strings cross our boundary so the DB
// timestamp is normalized to a date-only ISO.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

// ──────────────────────── Screen ───────────────────────────
export default function AdminSubscriptions() {
  const [rows, setRows] = useState<InstituteSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<SubscriptionStatus | 'all'>('all');

  // Edit sheet state
  const [editing, setEditing] = useState<InstituteSubscription | null>(null);
  const [editPlan, setEditPlan] = useState<SubscriptionPlan>('basic');
  const [editStatus, setEditStatus] = useState<SubscriptionStatus>('active');
  const [editExpires, setEditExpires] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editSeats, setEditSeats] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Payment sheet (nested) state
  const [payingFor, setPayingFor] = useState<InstituteSubscription | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listCurrentSubscriptions();
      setRows(data);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تحميل الاشتراكات');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // ───── Summary KPIs (computed once per `rows` change) ─────
  const kpis = useMemo(() => {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 3600 * 1000;
    const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
    let revenue = 0;
    let active = 0;
    let pastDue = 0;
    let expiringSoon = 0;
    for (const r of rows) {
      if (r.last_payment_at && r.last_payment_amount) {
        const t = new Date(r.last_payment_at).getTime();
        if (now - t <= THIRTY_DAYS) revenue += r.last_payment_amount;
      }
      if (r.status === 'active') active += 1;
      if (r.status === 'past_due') pastDue += 1;
      if (r.expires_at && r.status !== 'expired' && r.status !== 'cancelled') {
        const diff = new Date(r.expires_at).getTime() - now;
        if (diff > 0 && diff <= SEVEN_DAYS) expiringSoon += 1;
      }
    }
    return { revenue, active, pastDue, expiringSoon };
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  // ───── Sheet open / save handlers ─────
  const openEdit = (sub: InstituteSubscription) => {
    haptics.selection();
    setEditing(sub);
    setEditPlan(sub.plan);
    setEditStatus(sub.status);
    setEditExpires(toDateInput(sub.expires_at));
    setEditPrice(sub.monthly_price != null ? String(sub.monthly_price) : '');
    setEditSeats(sub.seats_limit != null ? String(sub.seats_limit) : '');
    setEditNotes(sub.notes || '');
  };

  const closeEdit = () => {
    setEditing(null);
    // Reset to keep memory clean — next open will populate again.
    setEditNotes('');
  };

  const handleSave = async () => {
    if (!editing) return;
    if (editExpires && !DATE_RE.test(editExpires)) {
      Alert.alert('خطأ', 'تنسيق تاريخ الانتهاء غير صحيح (YYYY-MM-DD)');
      return;
    }
    const priceNum = editPrice.trim() ? Number(editPrice) : null;
    if (priceNum != null && (isNaN(priceNum) || priceNum < 0)) {
      Alert.alert('خطأ', 'السعر الشهري غير صحيح');
      return;
    }
    const seatsNum = editSeats.trim() ? Number(editSeats) : null;
    if (seatsNum != null && (isNaN(seatsNum) || seatsNum < 0)) {
      Alert.alert('خطأ', 'عدد المقاعد غير صحيح');
      return;
    }
    setSaving(true);
    try {
      await upsertSubscription({
        institute_id: editing.institute_id,
        plan: editPlan,
        status: editStatus,
        expires_at: editExpires ? new Date(editExpires).toISOString() : null,
        monthly_price: priceNum,
        currency: editing.currency || 'IQD',
        seats_limit: seatsNum,
        notes: editNotes.trim() || undefined,
      });
      haptics.success();
      Alert.alert('تم الحفظ', 'تم تحديث الاشتراك');
      closeEdit();
      await load();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل حفظ الاشتراك');
    } finally {
      setSaving(false);
    }
  };

  // Open the nested payment sheet for the currently-edited subscription.
  // We DON'T close the edit sheet — when the payment sheet dismisses the
  // user lands back on the edit context (mirrors iOS modal-on-modal UX).
  const openPayment = () => {
    if (!editing) return;
    setPayingFor(editing);
    setPayAmount(editing.monthly_price != null ? String(editing.monthly_price) : '');
  };

  const handleRecordPayment = async () => {
    if (!payingFor) return;
    const amt = Number(payAmount);
    if (!payAmount.trim() || isNaN(amt) || amt <= 0) {
      Alert.alert('خطأ', 'أدخل مبلغ دفعة صحيح');
      return;
    }
    setPaying(true);
    try {
      await recordSubscriptionPayment(payingFor.id, amt);
      haptics.success();
      Alert.alert('تم', 'تم تسجيل الدفعة وتفعيل الاشتراك');
      setPayingFor(null);
      setPayAmount('');
      // Reflect new "active" status and last_payment in the edit sheet
      // by re-fetching, then re-syncing the edit form to the fresh row.
      await load();
      // Sync edit form to the now-active status
      setEditStatus('active');
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل تسجيل الدفعة');
    } finally {
      setPaying(false);
    }
  };

  // ──────────────────────── Render ────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="اشتراكات المؤسسات"
        subtitle="خطط، حالة، مدفوعات"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary KPIs */}
          <View style={styles.kpiRow}>
            <KpiCard
              icon="cash-outline"
              label="إيرادات 30 يوم"
              value={fmtMoney(kpis.revenue)}
              color={tokens.color.success}
              bg={tokens.color.successBg}
            />
            <KpiCard
              icon="checkmark-circle-outline"
              label="نشط"
              value={String(kpis.active)}
              color={tokens.color.info}
              bg={tokens.color.infoBg}
            />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard
              icon="warning-outline"
              label="متأخر"
              value={String(kpis.pastDue)}
              color={tokens.color.warning}
              bg={tokens.color.warningBg}
            />
            <KpiCard
              icon="time-outline"
              label="ينتهي خلال 7 أيام"
              value={String(kpis.expiringSoon)}
              color={tokens.color.danger}
              bg={tokens.color.dangerBg}
            />
          </View>

          {/* Status filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {STATUSES.map((s) => {
              const active = filter === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => { haptics.selection(); setFilter(s.key); }}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* List */}
          <View style={{ paddingHorizontal: 16 }}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 40 }} />
            ) : filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="business-outline" size={42} color={Colors.textMuted} />
                <Text style={styles.emptyText}>
                  {rows.length === 0 ? 'لا توجد مؤسسات بعد' : 'لا نتائج بهذا الفلتر'}
                </Text>
              </View>
            ) : (
              filtered.map((sub) => {
                const pm = planMeta(sub.plan);
                const sm = STATUS_COLORS[sub.status];
                const exp = humanizeExpiry(sub.expires_at);
                return (
                  <View key={sub.id} style={styles.card}>
                    {/* Header row: institute name + status badge */}
                    <View style={styles.cardHeaderRow}>
                      <View style={[styles.statusBadge, { backgroundColor: sm.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: sm.color }]}>
                          {sm.label}
                        </Text>
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {sub.institute_name || 'مؤسسة'}
                      </Text>
                    </View>

                    {/* Sub-row: plan badge + price */}
                    <View style={styles.cardSubRow}>
                      <Text style={styles.priceText}>
                        {fmtMoney(sub.monthly_price, sub.currency)} / شهر
                      </Text>
                      <View style={[styles.planBadge, { backgroundColor: pm.bg }]}>
                        <Text style={[styles.planBadgeText, { color: pm.color }]}>
                          {pm.label}
                        </Text>
                      </View>
                    </View>

                    {/* Expiry line */}
                    <View style={styles.expiryRow}>
                      <Text
                        style={[
                          styles.expiryText,
                          exp.tone === 'bad' && { color: tokens.color.danger },
                          exp.tone === 'warn' && { color: tokens.color.warning },
                          exp.tone === 'ok' && { color: tokens.color.success },
                          exp.tone === 'muted' && { color: Colors.textMuted },
                        ]}
                      >
                        {exp.label}
                      </Text>
                      <Ionicons
                        name="calendar-outline"
                        size={13}
                        color={Colors.textMuted}
                      />
                    </View>

                    {/* Edit button */}
                    <TouchableOpacity
                      onPress={() => openEdit(sub)}
                      style={styles.editBtn}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="create-outline" size={15} color={Colors.primary} />
                      <Text style={styles.editBtnText}>تعديل</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Edit sheet */}
      <SwipeableSheet visible={!!editing} onClose={closeEdit} maxHeight={0.9}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }}
        >
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {editing?.institute_name || 'تعديل الاشتراك'}
          </Text>

          <Text style={styles.fieldLabel}>الخطة</Text>
          <View style={styles.chipsRow}>
            {PLANS.map((p) => {
              const active = editPlan === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => { haptics.selection(); setEditPlan(p.key); }}
                  style={[
                    styles.chip,
                    active && { backgroundColor: p.bg, borderColor: p.color },
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && { color: p.color, fontWeight: '800' }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>الحالة</Text>
          <View style={styles.chipsRow}>
            {(['active', 'past_due', 'suspended', 'cancelled', 'expired'] as SubscriptionStatus[]).map((s) => {
              const active = editStatus === s;
              const sm = STATUS_COLORS[s];
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => { haptics.selection(); setEditStatus(s); }}
                  style={[
                    styles.chip,
                    active && { backgroundColor: sm.bg, borderColor: sm.color },
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && { color: sm.color, fontWeight: '800' }]}>
                    {sm.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>تاريخ الانتهاء (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={editExpires}
            onChangeText={setEditExpires}
            placeholder="2026-12-31"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="left"
          />

          <Text style={styles.fieldLabel}>السعر الشهري ({editing?.currency || 'IQD'})</Text>
          <TextInput
            style={styles.input}
            value={editPrice}
            onChangeText={setEditPrice}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
          />

          <Text style={styles.fieldLabel}>حد المقاعد</Text>
          <TextInput
            style={styles.input}
            value={editSeats}
            onChangeText={setEditSeats}
            keyboardType="numeric"
            placeholder="غير محدود"
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
          />

          <Text style={styles.fieldLabel}>ملاحظات</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={editNotes}
            onChangeText={setEditNotes}
            multiline
            placeholder="ملاحظات داخلية…"
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
            textAlignVertical="top"
          />

          {/* Last payment line */}
          {editing?.last_payment_at ? (
            <Text style={styles.lastPaymentLine}>
              آخر دفعة: {fmtMoney(editing.last_payment_amount, editing.currency)} —{' '}
              {new Date(editing.last_payment_at).toLocaleDateString('ar-IQ')}
            </Text>
          ) : null}

          {/* Actions */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: tokens.color.success }]}
            onPress={openPayment}
            activeOpacity={0.85}
          >
            <Ionicons name="cash-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>تسجيل دفعة</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>حفظ</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SwipeableSheet>

      {/* Nested payment sheet */}
      <SwipeableSheet visible={!!payingFor} onClose={() => setPayingFor(null)} maxHeight={0.5}>
        <View style={{ paddingHorizontal: 18 }}>
          <Text style={styles.sheetTitle}>تسجيل دفعة</Text>
          <Text style={styles.fieldLabel}>المبلغ ({payingFor?.currency || 'IQD'})</Text>
          <TextInput
            style={styles.input}
            value={payAmount}
            onChangeText={setPayAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
            autoFocus
          />
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: tokens.color.success, opacity: paying ? 0.6 : 1 }]}
            onPress={handleRecordPayment}
            disabled={paying}
            activeOpacity={0.85}
          >
            {paying ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>تأكيد الدفعة</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

// ──────────────────────── KpiCard ──────────────────────────
function KpiCard({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
    </View>
  );
}

// ──────────────────────── Styles ───────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // KPI grid
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  kpiCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: tokens.radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...tokens.shadow.xs,
  },
  kpiIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
  },
  kpiLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 2,
  },

  // Filter chips
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  filterChipTextActive: { color: '#fff' },

  // List card
  card: {
    backgroundColor: '#fff',
    borderRadius: tokens.radius.xl,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...tokens.shadow.xs,
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    marginStart: 8,
  },
  cardSubRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  planBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  expiryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  expiryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.color.brand50,
    borderRadius: tokens.radius.md,
    paddingVertical: 10,
  },
  editBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },

  // Empty state
  empty: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Sheets
  sheetTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 12,
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  textarea: {
    minHeight: 80,
  },
  lastPaymentLine: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 12,
    backgroundColor: tokens.color.successBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: tokens.radius.md,
    paddingVertical: 13,
    marginTop: 14,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
