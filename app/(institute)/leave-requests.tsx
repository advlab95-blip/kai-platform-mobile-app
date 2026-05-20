// InstituteLeaveRequests — institute admin review pane.
//
// Scoped to the caller's own institute (NOT a platform-admin picker). Approve
// or reject pending leave requests. The actual side-effects (notify parent +
// student, insert excused attendance rows for the leave date range) live in
// services/api.ts → approveLeaveRequest, mirroring the platform-admin screen
// at app/(admin)/leave-requests.tsx. Keeping the logic in one place avoids
// drift between the two callers.
//
// Multi-tenant: api.getLeaveRequests/approveLeaveRequest take an explicit
// instituteId and the underlying queries filter by it. RLS on leave_requests
// (defined in 20260413_leave_requests.sql) only lets institute admins read/
// write rows of their own institute, so this screen cannot leak across
// tenants even if the local userInstituteId were wrong.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens as dtokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { confirmAlert } from '../../utils/alerts';
import { haptics } from '../../utils/haptics';

type LeaveRequest = {
  id: string;
  institute_id: string;
  requested_by: string;
  requester_role: string;
  subject_id: string;
  subject_type: string;
  subject_name: string;
  type: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  reason: string;
  attachment_url: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

type FilterKey = 'pending' | 'approved' | 'rejected' | 'all';

export default function InstituteLeaveRequests() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const isEnabled = useFeatureFlag('leave_requests');

  const TYPE_LABELS: Record<string, string> = {
    early_leave: t('admin.earlyLeave', { defaultValue: 'انصراف مبكر' }),
    sick_day:    t('admin.sickDay',    { defaultValue: 'مرض' }),
    multi_day:   t('admin.multiDay',   { defaultValue: 'إجازة متعددة' }),
    personal:    t('admin.personal',   { defaultValue: 'ظرف شخصي' }),
  };

  const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    pending:   { bg: '#FEF3C7', text: '#B45309', label: t('admin.pendingReview', { defaultValue: 'قيد المراجعة' }) },
    approved:  { bg: '#DCFCE7', text: '#059669', label: t('admin.approved',     { defaultValue: 'موافق عليه' }) },
    rejected:  { bg: '#FEE2E2', text: '#DC2626', label: t('admin.rejected',     { defaultValue: 'مرفوض' }) },
    cancelled: { bg: '#F1F5F9', text: '#64748B', label: t('admin.cancelled',    { defaultValue: 'ملغي' }) },
  };

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [filter, setFilter] = useState<FilterKey>('pending');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!userInstituteId) return;
    setLoading(true);
    try {
      const data = await api.getLeaveRequests(
        userInstituteId,
        filter !== 'all' ? filter : undefined,
      );
      setRequests(data as LeaveRequest[]);
    } catch (err: any) {
      if (__DEV__) console.error('[institute leave-requests] load', err);
      Alert.alert(t('common.error', { defaultValue: 'خطأ' }), err?.message || 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId, filter, t]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  const handleApprove = (req: LeaveRequest) => {
    if (!userId) return;
    confirmAlert(
      t('common.approve', { defaultValue: 'موافقة' }),
      `${t('common.approve', { defaultValue: 'موافقة' })} ${req.subject_name}؟`,
      async () => {
        setBusyId(req.id);
        try {
          await api.approveLeaveRequest(req.id, userId);
          api.logAdminAction({
            actorId: userId,
            actorRole: 'institute',
            action: 'approve_leave_request',
            targetType: 'leave_request',
            targetId: req.id,
            targetName: req.subject_name,
            instituteId: req.institute_id,
            metadata: { type: req.type, start_date: req.start_date, end_date: req.end_date || null },
          }).catch(() => { /* audit log is best-effort */ });
          haptics.success();
          await loadData();
        } catch (e: any) {
          Alert.alert(t('common.error', { defaultValue: 'خطأ' }), e?.message || 'فشل');
        } finally {
          setBusyId(null);
        }
      },
    );
  };

  const handleReject = (req: LeaveRequest) => {
    if (!userId) return;
    confirmAlert(
      t('common.reject', { defaultValue: 'رفض' }),
      `${t('common.reject', { defaultValue: 'رفض' })} ${req.subject_name}؟`,
      async () => {
        setBusyId(req.id);
        try {
          await api.rejectLeaveRequest(
            req.id,
            userId,
            t('admin.rejectedByAdmin', { defaultValue: 'رفض من قبل الإدارة' }),
          );
          api.logAdminAction({
            actorId: userId,
            actorRole: 'institute',
            action: 'reject_leave_request',
            targetType: 'leave_request',
            targetId: req.id,
            targetName: req.subject_name,
            instituteId: req.institute_id,
            metadata: { type: req.type, start_date: req.start_date, end_date: req.end_date || null },
          }).catch(() => { /* audit log is best-effort */ });
          haptics.success();
          await loadData();
        } catch (e: any) {
          Alert.alert(t('common.error', { defaultValue: 'خطأ' }), e?.message || 'فشل');
        } finally {
          setBusyId(null);
        }
      },
      true,
    );
  };

  // Feature flag gate: if the institute admin disabled this feature for itself
  // (shouldn't happen in practice; admin enables it), show a clean empty.
  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title={t('admin.leaveRequests', { defaultValue: 'طلبات الإجازة' })}
          gradient={dtokens.gradient.brand}
          glowAccent="rgba(59,130,246,0.30)"
          fallbackRoute="/(institute)/services"
        />
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <Ionicons name="lock-closed-outline" size={48} color="#E2E8F0" />
          <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>
            الميزة غير مفعّلة لمؤسستك
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.leaveRequests', { defaultValue: 'طلبات الإجازة' })}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        fallbackRoute="/(institute)/services"
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <View style={{ paddingHorizontal: 16 }}>
          {/* Filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginVertical: 12, flexGrow: 0 }}
          >
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { k: 'pending',  l: t('admin.pendingReview', { defaultValue: 'قيد المراجعة' }) },
                { k: 'approved', l: t('admin.approved',      { defaultValue: 'تمت الموافقة' }) },
                { k: 'rejected', l: t('admin.rejected',      { defaultValue: 'مرفوض' }) },
                { k: 'all',      l: t('common.all',          { defaultValue: 'الكل' }) },
              ] as { k: FilterKey; l: string }[]).map((f) => (
                <TouchableOpacity
                  key={f.k}
                  style={[s.chip, filter === f.k && s.chipActive]}
                  onPress={() => { haptics.selection(); setFilter(f.k); }}
                >
                  <Text style={[s.chipText, filter === f.k && s.chipTextActive]}>{f.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingTop: 30 }} />
          ) : requests.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Ionicons name="checkmark-done" size={48} color="#E2E8F0" />
              <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>
                {t('admin.noRequests', { defaultValue: 'لا توجد طلبات' })}
              </Text>
            </View>
          ) : (
            requests.map((req) => {
              const st = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
              const isBusy = busyId === req.id;
              const dateLabel = req.end_date && req.end_date !== req.start_date
                ? `${req.start_date} ← ${req.end_date}` : req.start_date;
              return (
                <View key={req.id} style={s.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={[s.badge, { backgroundColor: st.bg }]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: st.text }}>{st.label}</Text>
                    </View>
                    <Text style={s.cardName}>{req.subject_name}</Text>
                  </View>

                  <Text style={s.cardType}>
                    {TYPE_LABELS[req.type] || req.type} — {dateLabel}
                  </Text>
                  <Text style={s.cardReason}>{req.reason}</Text>

                  {req.attachment_url ? (
                    <TouchableOpacity
                      style={s.attachmentBtn}
                      onPress={() => req.attachment_url && Linking.openURL(req.attachment_url)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="attach" size={14} color={Colors.primary} />
                      <Text style={s.attachmentText}>عرض المرفق</Text>
                    </TouchableOpacity>
                  ) : null}

                  {req.status === 'pending' && (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: '#FEE2E2', opacity: isBusy ? 0.5 : 1 }]}
                        onPress={() => handleReject(req)}
                        disabled={isBusy}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>
                            {t('common.reject', { defaultValue: 'رفض' })}
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: '#DCFCE7', opacity: isBusy ? 0.5 : 1 }]}
                        onPress={() => handleApprove(req)}
                        disabled={isBusy}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#059669" />
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>
                            {t('common.approve', { defaultValue: 'موافقة' })}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {req.review_notes ? (
                    <Text style={s.cardNotes}>
                      {t('admin.reviewNote', { defaultValue: 'ملاحظة الإدارة' })}: {req.review_notes}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  cardName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  cardType: { fontSize: 12, color: Colors.primary, textAlign: 'right', marginTop: 4 },
  cardReason: { fontSize: 13, color: Colors.textSecondary, textAlign: 'right', marginTop: 4, lineHeight: 22 },
  cardNotes: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 6, fontStyle: 'italic' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  attachmentBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 4, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, backgroundColor: '#EEF2FF',
  },
  attachmentText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
});
