import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { confirmAlert } from '../../utils/alerts';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';

export default function AdminLeaveRequests() {
  const { t } = useTranslation();

  const TYPE_LABELS: Record<string, string> = { early_leave: t('admin.earlyLeave'), sick_day: t('admin.sickDay'), multi_day: t('admin.multiDay'), personal: t('admin.personal') };
  const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: '#FEF3C7', text: '#B45309', label: t('admin.pendingReview') },
    approved: { bg: '#DCFCE7', text: '#059669', label: t('admin.approved') },
    rejected: { bg: '#FEE2E2', text: '#DC2626', label: t('admin.rejected') },
    cancelled: { bg: '#F1F5F9', text: '#64748B', label: t('admin.cancelled') },
  };
  const { userId } = useAuthStore();
  const { institutes } = useDataStore();
  const isEnabled = useFeatureFlag('leave_requests');
  const [selectedInst, setSelectedInst] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (instId: string) => {
    setLoading(true);
    try { const data = await api.getLeaveRequests(instId, filter !== 'all' ? filter : undefined); setRequests(data); }
    catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { if (selectedInst) loadData(selectedInst); }, [selectedInst, filter]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { if (selectedInst) await loadData(selectedInst); } finally { setRefreshing(false); }
  }, [selectedInst, filter]);

  const handleApprove = (req: any) => {
    confirmAlert(t('common.approve'), `${t('common.approve')} ${req.subject_name}?`, async () => {
      try {
        await api.approveLeaveRequest(req.id, userId || '');
        api.logAdminAction({
          actorId: userId || '',
          actorRole: 'admin',
          action: 'approve_leave_request',
          targetType: 'leave_request',
          targetId: req.id,
          targetName: req.subject_name,
          instituteId: req.institute_id || selectedInst || undefined,
          metadata: { type: req.type, start_date: req.start_date, end_date: req.end_date || null },
        }).catch(() => {});
        loadData(selectedInst);
      } catch (e: any) { Alert.alert(t('common.error'), e.message); }
    });
  };

  const handleReject = (req: any) => {
    confirmAlert(t('common.reject'), `${t('common.reject')} ${req.subject_name}?`, async () => {
      try {
        await api.rejectLeaveRequest(req.id, userId || '', t('admin.rejectedByAdmin'));
        api.logAdminAction({
          actorId: userId || '',
          actorRole: 'admin',
          action: 'reject_leave_request',
          targetType: 'leave_request',
          targetId: req.id,
          targetName: req.subject_name,
          instituteId: req.institute_id || selectedInst || undefined,
          metadata: { type: req.type, start_date: req.start_date, end_date: req.end_date || null },
        }).catch(() => {});
        loadData(selectedInst);
      } catch (e: any) { Alert.alert(t('common.error'), e.message); }
    }, true);
  };

  // Admin always has access — they manage features for institutions

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.leaveRequests')}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingBottom: 30 }}>

        {!selectedInst ? (
          <View style={{ paddingHorizontal: 16 }}>
            {institutes.map(inst => (
              <TouchableOpacity key={inst.id} style={s.instCard} onPress={() => setSelectedInst(inst.id)}>
                <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' }}>{inst.name}</Text>
                <Ionicons name="exit-outline" size={20} color="#F59E0B" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity onPress={() => setSelectedInst('')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.primary }}>{institutes.find(i => i.id === selectedInst)?.name}</Text>
              <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
            </TouchableOpacity>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, flexGrow: 0 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[{ k: 'pending', l: t('admin.pendingReview') }, { k: 'approved', l: t('admin.approved') }, { k: 'rejected', l: t('admin.rejected') }, { k: 'all', l: t('common.all') }].map(f => (
                  <TouchableOpacity key={f.k} style={[s.chip, filter === f.k && s.chipActive]} onPress={() => setFilter(f.k)}>
                    <Text style={[s.chipText, filter === f.k && s.chipTextActive]}>{f.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {loading ? <ActivityIndicator color={Colors.primary} style={{ paddingTop: 30 }} /> : requests.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 40 }}><Ionicons name="checkmark-done" size={48} color="#E2E8F0" /><Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>{t('admin.noRequests')}</Text></View>
            ) : requests.map(req => {
              const st = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
              return (
                <View key={req.id} style={s.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={[s.badge, { backgroundColor: st.bg }]}><Text style={{ fontSize: 10, fontWeight: '700', color: st.text }}>{st.label}</Text></View>
                    <Text style={s.cardName}>{req.subject_name}</Text>
                  </View>
                  <Text style={s.cardType}>{TYPE_LABELS[req.type] || req.type} — {req.start_date}{req.end_date ? ` - ${req.end_date}` : ''}</Text>
                  <Text style={s.cardReason}>{req.reason}</Text>
                  {req.status === 'pending' && (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleReject(req)}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>{t('common.reject')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => handleApprove(req)}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>{t('common.approve')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {req.review_notes && <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 6 }}>{t('admin.reviewNote')}: {req.review_notes}</Text>}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  instCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  cardName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  cardType: { fontSize: 12, color: Colors.primary, textAlign: 'right', marginTop: 4 },
  cardReason: { fontSize: 13, color: Colors.textSecondary, textAlign: 'right', marginTop: 4, lineHeight: 22 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});
