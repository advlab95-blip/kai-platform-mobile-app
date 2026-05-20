import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import useFeatureFlagsStore from '../../stores/featureFlagsStore';
import { confirmAlert } from '../../utils/alerts';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';

function formatAmount(amount: number): string {
  if (!amount || amount === 0) return '0';
  if (amount < 1000) return amount.toLocaleString('ar-IQ');
  if (amount < 1000000) return `${(amount / 1000).toFixed(1)}K`;
  return `${(amount / 1000000).toFixed(1)}M`;
}

export default function AdminFees() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { institutes } = useDataStore();
  const isEnabled = useFeatureFlag('fees_management');
  const { allFlags, loadAllFlags } = useFeatureFlagsStore();
  useEffect(() => { loadAllFlags(); }, []);
  const [selectedInst, setSelectedInst] = useState('');
  // Per-institute flag check — admin bypass doesn't apply here because the flag
  // controls whether the SELECTED institute has fees module enabled, not the admin.
  const feesEnabledForSelected = !selectedInst
    ? true
    : (allFlags.find(f => f.institute_id === selectedInst && f.feature_key === 'fees_management')?.is_enabled === true);
  const [plans, setPlans] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'plans' | 'stats'>('plans');

  // Create plan modal
  const [showCreate, setShowCreate] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planAmount, setPlanAmount] = useState('');
  const [planYear, setPlanYear] = useState('2025-2026');
  const [planInstallments, setPlanInstallments] = useState('4');
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async (instId: string) => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api.getFeePlans(instId),
        api.getInstituteFeeStats(instId),
      ]);
      setPlans(p);
      setStats(s);
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (selectedInst) await loadData(selectedInst);
    } finally {
      setRefreshing(false);
    }
  }, [selectedInst]);

  const handleCreate = async () => {
    if (!planName.trim() || !planAmount.trim()) { Alert.alert(t('common.error'), t('admin.completeData')); return; }
    if (isNaN(parseFloat(planAmount))) { Alert.alert(t('common.error'), t('admin.invalidAmount')); return; }
    setCreating(true);
    try {
      await api.createFeePlan({
        instituteId: selectedInst, name: planName.trim(),
        academicYear: planYear.trim(), totalAmount: parseFloat(planAmount),
        installmentsCount: parseInt(planInstallments) || 1,
      });
      Alert.alert(t('common.success'), t('admin.feePlanCreated'));
      setShowCreate(false); setPlanName(''); setPlanAmount('');
      loadData(selectedInst);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setCreating(false);
    }
  };

  // Admin always has access — they manage features for institutions

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.fees')}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingBottom: 30 }}>

        {!selectedInst ? (
          <View style={{ paddingHorizontal: 16 }}>
            {institutes.map(inst => (
              <TouchableOpacity key={inst.id} style={s.instCard} onPress={() => { setSelectedInst(inst.id); loadData(inst.id); }}>
                <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' }}>{inst.name}</Text>
                <Ionicons name="wallet" size={20} color="#10B981" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {!feesEnabledForSelected && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12 }}>
                <Ionicons name="warning" size={18} color="#D97706" />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#92400E', textAlign: 'right' }}>
                  ميزة إدارة الرسوم مطفّأة لهذه المؤسسة — فعّلها من صفحة "الميزات" قبل إنشاء خطط.
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <TouchableOpacity
                style={[s.addBtn, !feesEnabledForSelected && { opacity: 0.4 }]}
                disabled={!feesEnabledForSelected}
                onPress={() => setShowCreate(true)}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectedInst('')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.primary }}>{institutes.find(i => i.id === selectedInst)?.name}</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Stats card */}
            {stats && (
              <View style={s.statsCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  <View style={{ alignItems: 'center' }}><Text style={[s.statNum, { color: '#10B981' }]}>{formatAmount(stats.totalCollected)}</Text><Text style={s.statLabel}>{t('admin.collected')}</Text></View>
                  <View style={{ alignItems: 'center' }}><Text style={[s.statNum, { color: '#F59E0B' }]}>{formatAmount(stats.totalRemaining)}</Text><Text style={s.statLabel}>{t('admin.remaining')}</Text></View>
                  <View style={{ alignItems: 'center' }}><Text style={[s.statNum, { color: '#EF4444' }]}>{stats.overdueCount}</Text><Text style={s.statLabel}>{t('admin.overdue')}</Text></View>
                  <View style={{ alignItems: 'center' }}><Text style={[s.statNum, { color: Colors.primary }]}>{stats.paidCount}</Text><Text style={s.statLabel}>{t('admin.completed')}</Text></View>
                </View>
              </View>
            )}

            {/* Plans */}
            {loading ? <ActivityIndicator color={Colors.primary} style={{ paddingTop: 30 }} /> : plans.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="wallet-outline" size={48} color="#E2E8F0" />
                <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>{t('admin.noFeePlans')}</Text>
              </View>
            ) : plans.map(plan => (
              <View key={plan.id} style={s.planCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <TouchableOpacity onPress={() => {
                    // Two-level confirmation — deleting a fee plan cascades to any student
                    // payments referencing it, so require an extra yes before the destructive call.
                    confirmAlert(
                      t('common.delete'),
                      `حذف خطة الرسوم "${plan.name}"؟\nقيمتها: ${Number(plan.total_amount).toLocaleString()} د.ع`,
                      () => {
                        confirmAlert(
                          'تأكيد نهائي',
                          `لا يمكن التراجع. حذف "${plan.name}" نهائياً؟`,
                          async () => {
                            try {
                              await api.deleteFeePlan(plan.id);
                              api.logAdminAction({
                                actorId: userId || '',
                                actorRole: 'admin',
                                action: 'delete_fee_plan',
                                targetType: 'fee_plan',
                                targetId: plan.id,
                                targetName: plan.name,
                                instituteId: selectedInst,
                                metadata: { total_amount: plan.total_amount, academic_year: plan.academic_year },
                              }).catch(() => {});
                              Alert.alert('تم', 'تم حذف الخطة');
                              loadData(selectedInst);
                            } catch (err: any) {
                              Alert.alert(t('common.error'), err.message || t('admin.deleteFailed'));
                            }
                          },
                          true,
                        );
                      },
                      true,
                    );
                  }}>
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  </TouchableOpacity>
                  <Text style={s.planTitle}>{plan.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>{plan.installments_count} {t('admin.installments')}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#10B981' }}>{Number(plan.total_amount).toLocaleString()} د.ع</Text>
                </View>
                <Text style={{ fontSize: 10, color: Colors.textMuted, textAlign: 'right', marginTop: 4 }}>{plan.academic_year}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Create Plan sheet */}
      <SwipeableSheet visible={showCreate} onClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBody}>
            <Text style={s.modalTitle}>{t('admin.newFeePlan')}</Text>
            <TextInput style={s.input} placeholder={t('admin.planNamePlaceholder')} placeholderTextColor={Colors.textMuted} value={planName} onChangeText={setPlanName} textAlign="right" />
            <TextInput style={s.input} placeholder={t('admin.totalAmountPlaceholder')} placeholderTextColor={Colors.textMuted} value={planAmount} onChangeText={setPlanAmount} textAlign="center" keyboardType="numeric" />
            <TextInput style={s.input} placeholder={t('admin.academicYear')} placeholderTextColor={Colors.textMuted} value={planYear} onChangeText={setPlanYear} textAlign="center" />
            <TextInput style={s.input} placeholder={t('admin.installmentsCount')} placeholderTextColor={Colors.textMuted} value={planInstallments} onChangeText={setPlanInstallments} textAlign="center" keyboardType="numeric" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}><Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textSecondary }}>{t('common.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, creating && { opacity: 0.5 }]} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{t('common.create')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  instCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  addBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  statsCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  statNum: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  planCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  planTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  sheetBody: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 16 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: Colors.text, marginBottom: 10 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#10B981', alignItems: 'center' },
});
