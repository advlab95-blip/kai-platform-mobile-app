import React, { useEffect, useState, useCallback } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import useAdminStore from '../../stores/adminStore';
import useAuthStore from '../../stores/authStore';
import { api } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';
import { confirmAlert } from '../../utils/alerts';
const ROLE_BG: Record<string, { bg: string; text: string }> = {
  teacher: { bg: '#EFF6FF', text: '#1D4ED8' },
  student: { bg: '#F0FDFA', text: '#0D9488' },
  parent: { bg: '#F5F3FF', text: '#7C3AED' },
  cafeteria: { bg: '#FFF7ED', text: '#F97316' },
  medical: { bg: '#FEF2F2', text: '#EF4444' },
};
const ALL_ROLES = ['teacher', 'student', 'parent', 'cafeteria', 'medical'];

export default function AdminFinance() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { institutes } = useDataStore();
  const { pricing, pricingData, accountLog, loadPricing, loadAccountLog } = useAdminStore();
  const userId = useAuthStore((s) => s.userId);

  const TABS = [
    { key: 'pricing', label: t('admin.pricing') },
    { key: 'subject_pricing', label: t('admin.subjectPricing') },
    { key: 'log', label: t('admin.accountLog') },
    { key: 'invoices', label: t('admin.invoices') },
  ];

  const ROLE_LABELS: Record<string, string> = {
    teacher: t('roles.teacher'),
    student: t('roles.student'),
    parent: t('roles.parent'),
    cafeteria: t('roles.cafeteria'),
    medical: t('roles.medical'),
  };

  const [activeTab, setActiveTab] = useState('pricing');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pricing edit
  const [pricingVersion, setPricingVersion] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editMax, setEditMax] = useState('');
  const [saving, setSaving] = useState(false);

  // Log filter
  const [filterInstId, setFilterInstId] = useState('');

  // Subject pricing
  const [subjectInstId, setSubjectInstId] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectPrice, setSubjectPrice] = useState('');
  const [savingSubject, setSavingSubject] = useState(false);

  // Invoice form
  const [invoiceInst, setInvoiceInst] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadPricing(), loadAccountLog()]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSavePricing = async (instId: string, role: string) => {
    setSaving(true);
    try {
      await api.savePricing({
        instituteId: instId,
        role,
        pricePerAccount: Number(editPrice),
        maxAccounts: Number(editMax),
        currency: 'IQD',
      });
      api.logAdminAction({
        actorId: userId || '',
        actorRole: 'admin',
        action: 'update_pricing',
        targetType: 'pricing',
        targetId: instId,
        targetName: institutes.find((i: any) => i.id === instId)?.name,
        instituteId: instId,
        metadata: { role, pricePerAccount: Number(editPrice), maxAccounts: Number(editMax) },
      }).catch(() => {});
      Alert.alert(t('common.success'), t('admin.pricingSaved'));
      setEditingKey(null);
      await loadPricing();
      setPricingVersion((v) => v + 1);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubjectPricing = async () => {
    if (!subjectInstId) {
      Alert.alert(t('common.error'), t('admin.selectInstitute'));
      return;
    }
    if (!subjectName.trim()) {
      Alert.alert(t('common.error'), t('admin.enterSubjectName'));
      return;
    }
    if (!subjectPrice.trim() || isNaN(Number(subjectPrice))) {
      Alert.alert(t('common.error'), t('admin.enterValidPrice'));
      return;
    }
    setSavingSubject(true);
    try {
      await api.savePricing({
        instituteId: subjectInstId,
        subject: subjectName.trim(),
        pricePerAccount: Number(subjectPrice),
        currency: 'IQD',
      });
      api.logAdminAction({
        actorId: userId || '',
        actorRole: 'admin',
        action: 'update_subject_pricing',
        targetType: 'pricing',
        targetId: subjectInstId,
        targetName: institutes.find((i: any) => i.id === subjectInstId)?.name,
        instituteId: subjectInstId,
        metadata: { subject: subjectName.trim(), pricePerAccount: Number(subjectPrice) },
      }).catch(() => {});
      Alert.alert(t('common.success'), t('admin.subjectPricingSaved'));
      setSubjectName('');
      setSubjectPrice('');
      await loadPricing();
      setPricingVersion((v) => v + 1);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.saveFailed'));
    } finally {
      setSavingSubject(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'log') {
      loadAccountLog(filterInstId || undefined);
    }
  }, [filterInstId, activeTab]);

  const renderPricing = () => (
    <View>
      <Text style={styles.sectionDesc}>{t('admin.pricePerAccount')}</Text>
      {institutes.length === 0 ? (
        <Text style={styles.emptyText}>{t('admin.noInstitutes')}</Text>
      ) : (
        institutes.map((inst) => (
          <View key={inst.id} style={styles.card}>
            <Text style={styles.cardHeader}>{inst.name}</Text>
            {ALL_ROLES.map((role) => {
              const key = `${inst.id}_${role}`;
              const p = pricing.find((pr: any) => pr.institute_id === inst.id && pr.role === role);
              const isEditing = editingKey === key;
              const counts = pricingData?.counts?.[key] || 0;

              return (
                <View key={role} style={styles.pricingRow}>
                  {isEditing ? (
                    <View style={styles.editRow}>
                      <TouchableOpacity
                        onPress={() => handleSavePricing(inst.id, role)}
                        disabled={saving}
                        style={styles.saveSmallBtn}
                      >
                        {saving ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.saveSmallText}>{t('common.save')}</Text>
                        )}
                      </TouchableOpacity>
                      <TextInput
                        style={styles.editInput}
                        value={editMax}
                        onChangeText={setEditMax}
                        keyboardType="numeric"
                        placeholder={t('admin.limit')}
                        textAlign="center"
                      />
                      <TextInput
                        style={styles.editInput}
                        value={editPrice}
                        onChangeText={setEditPrice}
                        keyboardType="numeric"
                        placeholder={t('common.price')}
                        textAlign="center"
                      />
                    </View>
                  ) : (
                    <View style={styles.priceDisplay}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingKey(key);
                          setEditPrice(String(p?.price_per_account || 0));
                          setEditMax(String(p?.max_accounts || 999));
                        }}
                        style={styles.editSmallBtn}
                      >
                        <Text style={styles.editSmallText}>{t('common.edit')}</Text>
                      </TouchableOpacity>
                      <Text style={styles.priceValue}>{p?.price_per_account || 0} IQD</Text>
                    </View>
                  )}
                  <View style={styles.pricingInfo}>
                    <Text style={styles.pricingCount}>
                      ({counts}/{p?.max_accounts || '∞'})
                    </Text>
                    <Text style={styles.pricingRole}>{ROLE_LABELS[role]}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );

  const subjectPricingList = pricing.filter((p: any) => p.subject && !p.role);

  const renderSubjectPricing = () => (
    <View>
      <Text style={styles.sectionDesc}>{t('admin.subjectPricingByInst')}</Text>

      {/* Add subject pricing form */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>{t('admin.addSubjectPricing')}</Text>

        <Text style={styles.fieldLabel}>{t('admin.theInstitution')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={styles.instPickerRow}>
            {institutes.map((inst) => (
              <TouchableOpacity
                key={inst.id}
                style={[styles.instPickerBtn, subjectInstId === inst.id && styles.instPickerBtnActive]}
                onPress={() => setSubjectInstId(inst.id)}
              >
                <Text
                  style={[styles.instPickerText, subjectInstId === inst.id && styles.instPickerTextActive]}
                >
                  {inst.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.fieldLabel}>{t('admin.subjectNameLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('admin.subjectNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={subjectName}
          onChangeText={setSubjectName}
          textAlign="right"
        />

        <Text style={styles.fieldLabel}>{t('admin.priceIQD')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('admin.pricePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={subjectPrice}
          onChangeText={setSubjectPrice}
          keyboardType="numeric"
          textAlign="right"
        />

        <TouchableOpacity
          style={[styles.sendBtn, savingSubject && { opacity: 0.6 }]}
          onPress={handleSaveSubjectPricing}
          disabled={savingSubject}
          activeOpacity={0.8}
        >
          {savingSubject ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="save" size={16} color="#fff" />
              <Text style={styles.sendBtnText}>{t('admin.savePricing')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Existing subject prices */}
      {subjectPricingList.length === 0 ? (
        <Text style={styles.emptyText}>{t('admin.noSubjectPricing')}</Text>
      ) : (
        institutes.map((inst) => {
          const instSubjects = subjectPricingList.filter((p: any) => p.institute_id === inst.id);
          if (instSubjects.length === 0) return null;
          return (
            <View key={inst.id} style={styles.card}>
              <Text style={styles.cardHeader}>{inst.name}</Text>
              {instSubjects.map((sp: any) => (
                <View key={sp.id || `${sp.institute_id}_${sp.subject}`} style={styles.pricingRow}>
                  <View style={styles.priceDisplay}>
                    <Text style={styles.priceValue}>{sp.price_per_account || 0} IQD</Text>
                  </View>
                  <View style={styles.pricingInfo}>
                    <Text style={styles.pricingRole}>{sp.subject}</Text>
                  </View>
                </View>
              ))}
            </View>
          );
        })
      )}
    </View>
  );

  const renderAccountLog = () => (
    <View>
      <Text style={styles.sectionDesc}>{t('admin.accountCreatedLog')}</Text>

      {/* Filter */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filterInstId === '' && styles.filterBtnActive]}
          onPress={() => setFilterInstId('')}
        >
          <Text style={[styles.filterBtnText, filterInstId === '' && styles.filterBtnTextActive]}>
            {t('common.all')}
          </Text>
        </TouchableOpacity>
        {institutes.slice(0, 4).map((inst) => (
          <TouchableOpacity
            key={inst.id}
            style={[styles.filterBtn, filterInstId === inst.id && styles.filterBtnActive]}
            onPress={() => setFilterInstId(inst.id)}
          >
            <Text
              style={[styles.filterBtnText, filterInstId === inst.id && styles.filterBtnTextActive]}
              numberOfLines={1}
            >
              {inst.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {accountLog.length === 0 ? (
        <Text style={styles.emptyText}>{t('admin.noLogEntries')}</Text>
      ) : (
        accountLog.map((entry: any) => (
          <View key={entry.id} style={styles.logCard}>
            <View style={styles.logHeader}>
              <Text style={styles.logDate}>
                {new Date(entry.created_at).toLocaleDateString('ar-IQ')}
              </Text>
              <View style={styles.logLeft}>
                <View
                  style={[
                    styles.logRoleBadge,
                    { backgroundColor: ROLE_BG[entry.created_user_role]?.bg || '#F1F5F9' },
                  ]}
                >
                  <Text
                    style={[
                      styles.logRoleText,
                      { color: ROLE_BG[entry.created_user_role]?.text || Colors.textMuted },
                    ]}
                  >
                    {ROLE_LABELS[entry.created_user_role] || entry.created_user_role}
                  </Text>
                </View>
                <View>
                  <Text style={styles.logName}>{entry.created_user_name}</Text>
                  <Text style={styles.logInst}>{entry.institute_name}</Text>
                </View>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderInvoices = () => (
    <View>
      <Text style={styles.sectionDesc}>{t('admin.sendInvoice')}</Text>
      <View style={styles.card}>
        <Text style={styles.cardHeader}>{t('admin.newInvoice')}</Text>

        {/* Institute picker - simple buttons */}
        <Text style={styles.fieldLabel}>{t('admin.theInstitution')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={styles.instPickerRow}>
            {institutes.map((inst) => (
              <TouchableOpacity
                key={inst.id}
                style={[styles.instPickerBtn, invoiceInst === inst.id && styles.instPickerBtnActive]}
                onPress={() => setInvoiceInst(inst.id)}
              >
                <Text
                  style={[
                    styles.instPickerText,
                    invoiceInst === inst.id && styles.instPickerTextActive,
                  ]}
                >
                  {inst.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.fieldLabel}>{t('admin.invoiceAmount')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('admin.invoiceAmountPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={invoiceAmount}
          onChangeText={setInvoiceAmount}
          keyboardType="numeric"
          textAlign="right"
        />

        <Text style={styles.fieldLabel}>{t('admin.invoiceNote')}</Text>
        <TextInput
          style={[styles.input, { minHeight: 60 }]}
          placeholder={t('admin.invoiceDetails')}
          placeholderTextColor={Colors.textMuted}
          value={invoiceNote}
          onChangeText={setInvoiceNote}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={styles.sendBtn}
          onPress={async () => {
            if (!invoiceInst || !invoiceAmount) {
              Alert.alert(t('common.error'), t('admin.completeFields'));
              return;
            }
            if (isNaN(Number(invoiceAmount))) {
              Alert.alert(t('common.error'), t('admin.invalidAmount'));
              return;
            }
            const inst = institutes.find((i: any) => i.id === invoiceInst);
            if (!inst) { Alert.alert(t('common.error'), t('admin.instituteNotFound')); return; }
            const instName = inst.name || '';
            confirmAlert(
              'تأكيد إرسال الفاتورة',
              `سيتم إنشاء فاتورة بمبلغ ${Number(invoiceAmount).toLocaleString()} للمؤسسة "${instName}". هل أنت متأكد؟`,
              async () => {
                try {
                  await api.createInvoice(invoiceInst, Number(invoiceAmount), invoiceNote.trim() || undefined);
                  api.logAdminAction({
                    actorId: userId || '',
                    actorRole: 'admin',
                    action: 'create_invoice',
                    targetType: 'invoice',
                    targetId: invoiceInst,
                    targetName: instName,
                    instituteId: invoiceInst,
                    metadata: { amount: Number(invoiceAmount), note: invoiceNote.trim() || null },
                  }).catch(() => {});
                  Alert.alert(t('common.success'), t('admin.invoiceSent'));
                  setInvoiceInst('');
                  setInvoiceAmount('');
                  setInvoiceNote('');
                } catch (err: any) {
                  Alert.alert(t('common.error'), err.message || t('admin.invoiceFailed'));
                }
              }
            );
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="send" size={16} color="#fff" />
          <Text style={styles.sendBtnText}>{t('admin.sendInvoiceBtn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.finance')}
        subtitle={t('admin.financeManagement')}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >

        {/* Tab Switcher */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 40 }} />
          ) : (
            <>
              {activeTab === 'pricing' && <View key={pricingVersion}>{renderPricing()}</View>}
              {activeTab === 'subject_pricing' && <View key={`sp_${pricingVersion}`}>{renderSubjectPricing()}</View>}
              {activeTab === 'log' && renderAccountLog()}
              {activeTab === 'invoices' && renderInvoices()}
            </>
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  // Pricing
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  pricingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pricingRole: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  pricingCount: {
    fontSize: 9,
    color: Colors.textMuted,
  },
  priceDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceValue: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.success,
  },
  editSmallBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editSmallText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primary,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
    width: 56,
    color: Colors.text,
  },
  saveSmallBtn: {
    backgroundColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  saveSmallText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  // Account Log
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
  },
  filterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  logCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logRoleBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  logRoleText: {
    fontSize: 9,
    fontWeight: '700',
  },
  logName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  logInst: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  logDate: {
    fontSize: 9,
    color: Colors.textMuted,
  },
  // Invoices
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: 6,
  },
  instPickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  instPickerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  instPickerBtnActive: {
    backgroundColor: Colors.primary,
  },
  instPickerText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  instPickerTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
