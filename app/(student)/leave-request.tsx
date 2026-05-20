// StudentLeaveRequest — student submits a leave / excuse request the institute
// admin can approve. Mirrors the teacher flow (subject = self, requester_role
// = student). Pending requests can be cancelled by the student.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SectionLabel from '../../components/institute/SectionLabel';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { timeAgo } from '../../utils/helpers';
import { supabase } from '../../services/supabase';

type Tab = 'new' | 'mine';
type LeaveType = 'early_leave' | 'sick_day' | 'multi_day' | 'personal';
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type MyRow = {
  id: string;
  type: LeaveType;
  status: LeaveStatus;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  reason: string | null;
  review_notes: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<LeaveType, string> = {
  early_leave: 'استئذان مبكر',
  sick_day:    'إجازة مرضية',
  multi_day:   'إجازة متعددة الأيام',
  personal:    'ظرف شخصي',
};
const TYPE_ICONS: Record<LeaveType, keyof typeof Ionicons.glyphMap> = {
  early_leave: 'log-out-outline',
  sick_day:    'medkit-outline',
  multi_day:   'calendar-outline',
  personal:    'person-outline',
};
const STATUS_STYLE: Record<LeaveStatus, { bg: string; fg: string; label: string }> = {
  pending:   { bg: tokens.semantic.warningBg, fg: tokens.semantic.warning, label: 'قيد المراجعة' },
  approved:  { bg: tokens.semantic.successBg, fg: tokens.semantic.success, label: 'موافق عليه' },
  rejected:  { bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger,  label: 'مرفوض' },
  cancelled: { bg: tokens.surface.surface2,   fg: tokens.text[3],          label: 'ملغي' },
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StudentLeaveRequest() {
  const { userId, userName } = useAuthStore();
  const { userInstituteId } = useDataStore();

  const [tab, setTab] = useState<Tab>('new');
  const [type, setType] = useState<LeaveType>('sick_day');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [requests, setRequests] = useState<MyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const needsEndDate = type === 'multi_day';
  const needsStartTime = type === 'early_leave';

  const loadMine = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, type, status, start_date, end_date, start_time, reason, review_notes, created_at')
        .eq('requested_by', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setRequests((data || []) as MyRow[]);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (tab === 'mine' && requests.length === 0 && !loading) loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const onRefreshMine = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadMine(); } finally { setRefreshing(false); }
  }, [loadMine]);

  const resetForm = () => {
    setType('sick_day'); setStartDate(todayStr()); setEndDate('');
    setStartTime(''); setReason('');
  };

  const handleSubmit = async () => {
    if (!userId || !userInstituteId) {
      Alert.alert('خطأ', 'تعذّر تحديد المؤسسة'); return;
    }
    if (!DATE_PATTERN.test(startDate)) {
      Alert.alert('تنبيه', 'صيغة التاريخ غير صحيحة (YYYY-MM-DD)'); return;
    }
    if (needsEndDate && (!endDate || !DATE_PATTERN.test(endDate))) {
      Alert.alert('تنبيه', 'تاريخ النهاية مطلوب'); return;
    }
    if (needsEndDate && endDate < startDate) {
      Alert.alert('تنبيه', 'النهاية لا يمكن أن تسبق البداية'); return;
    }
    if (needsStartTime && !startTime.trim()) {
      Alert.alert('تنبيه', 'وقت الاستئذان مطلوب (مثال: 11:30)'); return;
    }
    if (!reason.trim()) {
      Alert.alert('تنبيه', 'يرجى ذكر السبب'); return;
    }

    setSubmitting(true);
    haptics.medium();
    try {
      const { error } = await supabase.from('leave_requests').insert({
        institute_id: userInstituteId,
        requested_by: userId,
        requester_role: 'student',
        subject_id: userId,
        subject_type: 'student',
        subject_name: userName || 'طالب',
        type,
        start_date: startDate,
        end_date: needsEndDate ? endDate : startDate,
        start_time: needsStartTime ? startTime.trim() : null,
        reason: reason.trim(),
        status: 'pending',
      });
      if (error) throw error;
      haptics.success();
      Alert.alert('تم الإرسال', 'الإدارة ستراجع طلبك وسيصلك القرار', [
        { text: 'حسناً', onPress: () => { resetForm(); setTab('mine'); loadMine(); } },
      ]);
    } catch (err: any) {
      haptics.error();
      Alert.alert('فشل الإرسال', err?.message || 'تعذّر إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = (req: MyRow) => {
    Alert.alert('إلغاء الطلب', `إلغاء طلب "${TYPE_LABELS[req.type]}"؟`, [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'إلغاء',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('leave_requests')
              .update({ status: 'cancelled' })
              .eq('id', req.id)
              .eq('requested_by', userId || '');
            if (error) throw error;
            haptics.success();
            loadMine();
          } catch (err: any) {
            const msg = err?.message?.includes('policy')
              ? 'لا يمكن الإلغاء بعد المراجعة'
              : (err?.message || 'فشل الإلغاء');
            Alert.alert('خطأ', msg);
          }
        },
      },
    ]);
  };

  const sortedRequests = useMemo(
    () => requests.slice().sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }),
    [requests],
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="طلب استئذان"
        subtitle="قدّم طلب وتابع حالته"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(245, 158, 11, 0.30)"
        fallbackRoute="/(student)/services"
      />

      <View style={styles.tabsRow}>
        <TouchableOpacity onPress={() => { haptics.selection(); setTab('new'); }}
          style={[styles.tab, tab === 'new' && styles.tabActive]} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={16} color={tab === 'new' ? '#fff' : tokens.text[2]} />
          <Text style={[styles.tabText, tab === 'new' && styles.tabTextActive]}>طلب جديد</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptics.selection(); setTab('mine'); }}
          style={[styles.tab, tab === 'mine' && styles.tabActive]} activeOpacity={0.85}>
          <Ionicons name="list-outline" size={16} color={tab === 'mine' ? '#fff' : tokens.text[2]} />
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>طلباتي</Text>
        </TouchableOpacity>
      </View>

      {tab === 'new' ? (
        <KeyboardAwareScroll style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 14 }}>
            <View>
              <SectionLabel title="نوع الطلب" icon="pricetag-outline" />
              <View style={styles.typeGrid}>
                {(Object.keys(TYPE_LABELS) as LeaveType[]).map((k) => {
                  const active = type === k;
                  return (
                    <TouchableOpacity key={k}
                      onPress={() => { haptics.selection(); setType(k); }}
                      style={[styles.typeCard, active && styles.typeCardActive]}
                      activeOpacity={0.85}>
                      <Ionicons name={TYPE_ICONS[k]} size={20}
                        color={active ? '#fff' : tokens.brand[500]} />
                      <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>
                        {TYPE_LABELS[k]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <SectionLabel
                title={needsEndDate ? 'البداية + النهاية' : 'تاريخ الاستئذان'}
                icon="calendar-outline" />
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.dateLabel}>من</Text>
                  <TextInput value={startDate} onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD" placeholderTextColor={tokens.text[4]}
                    style={styles.dateInput} autoCapitalize="none" autoCorrect={false} />
                </View>
                {needsEndDate && (
                  <View style={styles.dateField}>
                    <Text style={styles.dateLabel}>إلى</Text>
                    <TextInput value={endDate} onChangeText={setEndDate}
                      placeholder="YYYY-MM-DD" placeholderTextColor={tokens.text[4]}
                      style={styles.dateInput} autoCapitalize="none" autoCorrect={false} />
                  </View>
                )}
              </View>
            </View>

            {needsStartTime && (
              <View>
                <SectionLabel title="وقت الاستئذان" icon="time-outline" />
                <TextInput value={startTime} onChangeText={setStartTime}
                  placeholder="مثال: 11:30" placeholderTextColor={tokens.text[4]}
                  style={[styles.dateInput, { marginHorizontal: 16 }]}
                  autoCapitalize="none" autoCorrect={false} />
              </View>
            )}

            <View>
              <SectionLabel title="السبب" icon="document-text-outline" />
              <TextInput value={reason} onChangeText={setReason}
                placeholder="اشرح السبب باختصار..."
                placeholderTextColor={tokens.text[4]}
                style={styles.reasonInput} multiline
                textAlignVertical="top" textAlign="right" />
            </View>

            <TouchableOpacity onPress={handleSubmit} disabled={submitting}
              style={[styles.submitBtn, submitting && styles.btnDisabled]}
              activeOpacity={0.85}>
              {submitting ? <ActivityIndicator color="#fff" />
                : <Ionicons name="send" size={18} color="#fff" />}
              <Text style={styles.submitBtnText}>
                {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScroll>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing}
            onRefresh={onRefreshMine} tintColor={tokens.brand[500]} />}>
          {loading && requests.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <SkeletonList count={4} cardHeight={88} />
            </View>
          ) : sortedRequests.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="file-tray-outline" size={36} color={tokens.brand[500]} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد طلبات بعد</Text>
              <Text style={styles.emptyHint}>قدّم أول طلب من تبويب "طلب جديد"</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
              {sortedRequests.map((req, idx) => {
                const st = STATUS_STYLE[req.status];
                const dateLabel = req.end_date && req.end_date !== req.start_date
                  ? `${req.start_date} → ${req.end_date}` : req.start_date;
                const canCancel = req.status === 'pending';
                return (
                  <FadeSlideIn key={req.id} delay={idx * 40} translateFrom={10}>
                    <View style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
                          <Text style={[styles.statusText, { color: st.fg }]}>{st.label}</Text>
                        </View>
                        <View style={styles.typeRow}>
                          <Ionicons name={TYPE_ICONS[req.type]} size={16} color={tokens.brand[500]} />
                          <Text style={styles.cardType}>{TYPE_LABELS[req.type]}</Text>
                        </View>
                      </View>
                      <Text style={styles.cardDate}>
                        {dateLabel}{req.start_time ? ` • ${req.start_time}` : ''}
                      </Text>
                      {req.reason ? (
                        <Text style={styles.cardReason} numberOfLines={3}>{req.reason}</Text>
                      ) : null}
                      {req.review_notes ? (
                        <View style={styles.reviewBox}>
                          <Ionicons name="chatbubble-ellipses-outline" size={14} color={tokens.text[3]} />
                          <Text style={styles.reviewText} numberOfLines={3}>{req.review_notes}</Text>
                        </View>
                      ) : null}
                      <View style={styles.cardFooter}>
                        <Text style={styles.cardTime}>{timeAgo(req.created_at)}</Text>
                        {canCancel && (
                          <TouchableOpacity onPress={() => handleCancel(req)}
                            style={styles.cancelBtn} activeOpacity={0.8}>
                            <Text style={styles.cancelBtnText}>إلغاء</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </FadeSlideIn>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  tabsRow: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tab: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: tokens.radius.md, backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2] },
  tabActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  tabText: { fontSize: 13, fontWeight: '700', color: tokens.text[2] },
  tabTextActive: { color: '#fff' },
  typeGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  typeCard: { flexBasis: '48%', flexGrow: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 14, borderRadius: tokens.radius.md, backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2] },
  typeCardActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  typeLabel: { fontSize: 12, fontWeight: '700', color: tokens.text[1], textAlign: 'right', flexShrink: 1 },
  typeLabelActive: { color: '#fff' },
  dateRow: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 16 },
  dateField: { flex: 1 },
  dateLabel: { fontSize: 12, fontWeight: '600', color: tokens.text[3], marginBottom: 6, textAlign: 'right' },
  dateInput: { backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2], borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: 14, color: tokens.text[1], textAlign: 'right' },
  reasonInput: { marginHorizontal: 16, backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2], borderRadius: tokens.radius.md, padding: 12, fontSize: 14, color: tokens.text[1], minHeight: 100, textAlign: 'right' },
  submitBtn: { marginTop: 6, marginHorizontal: 16, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: tokens.radius.md, backgroundColor: tokens.brand[500], ...tokens.shadow.md },
  btnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  card: { backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.lg, borderWidth: 1, borderColor: tokens.border[2], padding: 14, gap: 8, ...tokens.shadow.xs },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  typeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  cardType: { fontSize: 14, fontWeight: '800', color: tokens.text[1] },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDate: { fontSize: 13, color: tokens.text[2], fontWeight: '600', textAlign: 'right' },
  cardReason: { fontSize: 13, color: tokens.text[2], textAlign: 'right', lineHeight: 19 },
  reviewBox: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, backgroundColor: tokens.surface.surface2, borderRadius: tokens.radius.sm, padding: 10 },
  reviewText: { flex: 1, fontSize: 12, color: tokens.text[2], textAlign: 'right', lineHeight: 17 },
  cardFooter: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  cardTime: { fontSize: 11, color: tokens.text[4] },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: tokens.semantic.dangerBg },
  cancelBtnText: { fontSize: 12, fontWeight: '700', color: tokens.semantic.danger },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 80, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
