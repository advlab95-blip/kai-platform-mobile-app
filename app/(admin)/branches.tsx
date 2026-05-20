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
import SkeletonList from '../../components/shared/SkeletonList';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import useAuthStore from '../../stores/authStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import useFeatureFlagsStore from '../../stores/featureFlagsStore';
import { confirmAlert } from '../../utils/alerts';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';

export default function AdminBranches() {
  const { t } = useTranslation();
  const { institutes } = useDataStore();
  const { userId } = useAuthStore();
  const isEnabled = useFeatureFlag('multi_branch');
  const { allFlags, loadAllFlags } = useFeatureFlagsStore();
  useEffect(() => { loadAllFlags(); }, []);
  const [selectedInst, setSelectedInst] = useState('');
  const branchesEnabledForSelected = !selectedInst
    ? true
    : (allFlags.find(f => f.institute_id === selectedInst && f.feature_key === 'multi_branch')?.is_enabled === true);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [creating, setCreating] = useState(false);

  // Stats
  const [branchStats, setBranchStats] = useState<Record<string, any>>({});

  const loadBranches = useCallback(async (instId: string) => {
    setLoading(true);
    try {
      const data = await api.getBranches(instId);
      setBranches(data);
      // Load stats for all branches in parallel
      const statsResults = await Promise.all(
        data.map((b: any) => api.getBranchStats(b.id).catch(() => ({})))
      );
      const stats: Record<string, any> = {};
      data.forEach((b: any, i: number) => { stats[b.id] = statsResults[i]; });
      setBranchStats(stats);
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
      if (selectedInst) await loadBranches(selectedInst);
    } finally {
      setRefreshing(false);
    }
  }, [selectedInst]);

  const handleCreate = async () => {
    if (!branchName.trim() || !branchCode.trim()) { Alert.alert(t('common.error'), t('admin.enterNameAndCode')); return; }
    setCreating(true);
    try {
      await api.createBranch(selectedInst, branchName.trim(), branchCode.trim(), branchAddress.trim(), branchPhone.trim());
      Alert.alert(t('common.success'), t('admin.branchCreated'));
      setShowCreate(false);
      setBranchName(''); setBranchCode(''); setBranchAddress(''); setBranchPhone('');
      loadBranches(selectedInst);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
    setCreating(false);
  };

  const handleDelete = (branch: any) => {
    if (branch.is_main) { Alert.alert(t('common.error'), t('admin.cannotDeleteMainBranch')); return; }
    confirmAlert(t('admin.deleteBranch'), `${t('common.delete')} "${branch.name}"?`, async () => {
      try {
        await api.deleteBranch(branch.id);
        // Audit trail: record who deleted which branch, for which institute.
        api.logAdminAction({
          actorId: userId || '',
          actorRole: 'admin',
          action: 'delete_branch',
          targetType: 'branch',
          targetId: branch.id,
          targetName: branch.name,
          instituteId: selectedInst,
          metadata: { code: branch.code, address: branch.address },
        }).catch(() => {});
        loadBranches(selectedInst);
      } catch (err: any) { Alert.alert(t('common.error'), err.message); }
    }, true);
  };

  // Admin always has access — they manage features for institutions

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.branches')}
        subtitle={t('admin.branchesSubtitle')}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingBottom: 30 }}>

        {/* Institute selector */}
        {!selectedInst ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={s.sectionTitle}>{t('admin.selectInstitution')}</Text>
            {institutes.map(inst => (
              <TouchableOpacity key={inst.id} style={s.instCard} onPress={() => { setSelectedInst(inst.id); loadBranches(inst.id); }}>
                <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={s.instName}>{inst.name}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>{(inst as any).type === 'school' ? t('admin.school') : t('admin.institutionType')}</Text>
                </View>
                <View style={[s.instIcon, (inst as any).type === 'school' ? { backgroundColor: '#FFF7ED' } : {}]}>
                  <Ionicons name={(inst as any).type === 'school' ? 'school' : 'business'} size={20} color={(inst as any).type === 'school' ? '#B45309' : Colors.primary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {!branchesEnabledForSelected && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12 }}>
                <Ionicons name="warning" size={18} color="#D97706" />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#92400E', textAlign: 'right' }}>
                  ميزة الفروع المتعددة مطفّأة لهذه المؤسسة — فعّلها من صفحة "الميزات" قبل الإضافة.
                </Text>
              </View>
            )}
            {/* Back + Add */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 16 }}>
              <TouchableOpacity
                style={[s.addBtn, !branchesEnabledForSelected && { opacity: 0.4 }]}
                disabled={!branchesEnabledForSelected}
                onPress={() => setShowCreate(true)}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setSelectedInst('')}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.primary }}>{institutes.find(i => i.id === selectedInst)?.name}</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={{ paddingTop: 16 }}>
                <SkeletonList count={4} cardHeight={84} />
              </View>
            ) : branches.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <Ionicons name="business-outline" size={48} color="#E2E8F0" />
                <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>{t('admin.noBranches')}</Text>
              </View>
            ) : branches.map(branch => {
              const stats = branchStats[branch.id] || {};
              return (
                <View key={branch.id} style={s.branchCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {!branch.is_main && (
                        <TouchableOpacity onPress={() => handleDelete(branch)}>
                          <Ionicons name="trash-outline" size={16} color={Colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {branch.is_main && (
                        <View style={{ backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#059669' }}>{t('common.main')}</Text>
                        </View>
                      )}
                      <Text style={s.branchName}>{branch.name}</Text>
                      <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.primary, fontFamily: 'monospace' }}>{branch.code}</Text>
                      </View>
                    </View>
                  </View>
                  {branch.address && <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 6 }}>{branch.address}</Text>}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 18, fontWeight: '900', color: Colors.primary }}>{stats.totalStudents || 0}</Text><Text style={{ fontSize: 10, color: Colors.textMuted }}>{t('admin.studentStat')}</Text></View>
                    <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 18, fontWeight: '900', color: '#059669' }}>{stats.totalTeachers || 0}</Text><Text style={{ fontSize: 10, color: Colors.textMuted }}>{t('admin.teacherStat')}</Text></View>
                    <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 18, fontWeight: '900', color: '#F59E0B' }}>{stats.totalClasses || 0}</Text><Text style={{ fontSize: 10, color: Colors.textMuted }}>{t('common.class')}</Text></View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Create Branch sheet */}
      <SwipeableSheet visible={showCreate} onClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBody}>
            <Text style={s.modalTitle}>{t('admin.newBranch')}</Text>
            <TextInput style={s.input} placeholder={t('admin.branchNamePlaceholder')} placeholderTextColor={Colors.textMuted} value={branchName} onChangeText={setBranchName} textAlign="right" />
            <TextInput style={s.input} placeholder={t('admin.branchCodePlaceholder')} placeholderTextColor={Colors.textMuted} value={branchCode} onChangeText={val => setBranchCode(val.toUpperCase())} textAlign="left" autoCapitalize="characters" />
            <TextInput style={s.input} placeholder={t('admin.branchAddressPlaceholder')} placeholderTextColor={Colors.textMuted} value={branchAddress} onChangeText={setBranchAddress} textAlign="right" />
            <TextInput style={s.input} placeholder={t('admin.branchPhonePlaceholder')} placeholderTextColor={Colors.textMuted} value={branchPhone} onChangeText={setBranchPhone} textAlign="right" keyboardType="phone-pad" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textSecondary }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
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
  subtitle: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 12 },
  instCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  instIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  instName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  addBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  branchCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  branchName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sheetBody: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 16 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: Colors.text, marginBottom: 10 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' },
});
