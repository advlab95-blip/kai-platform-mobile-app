import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, TextInput, ActivityIndicator, Switch,
  KeyboardAvoidingView, Platform,
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
import useFeatureFlagsStore from '../../stores/featureFlagsStore';
import { confirmAlert } from '../../utils/alerts';
import { copyToClipboard } from '../../utils/clipboard';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';
import SwipeableSheet from '../../components/shared/SwipeableSheet';

export default function AdminDevices() {
  const { t } = useTranslation();

  const DEVICE_TYPES = [
    { key: 'fingerprint', label: t('admin.fingerprint'), icon: 'finger-print' },
    { key: 'face', label: t('admin.faceRecognition'), icon: 'scan' },
    { key: 'card', label: t('admin.smartCard'), icon: 'card' },
  ];
  const { userId } = useAuthStore();
  const { institutes, userInstituteId } = useDataStore();
  const isEnabled = useFeatureFlag('device_attendance');
  const { allFlags, loadAllFlags } = useFeatureFlagsStore();
  useEffect(() => { loadAllFlags(); }, []);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add device modal
  const [showAdd, setShowAdd] = useState(false);
  const [addInstId, setAddInstId] = useState('');
  const [addBranchId, setAddBranchId] = useState('');
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState('fingerprint');
  const [addLocation, setAddLocation] = useState('');
  const [adding, setAdding] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);

  // API Key viewer
  const [viewingDevice, setViewingDevice] = useState<any>(null);

  // Today's logs
  const [showLogs, setShowLogs] = useState(false);
  const [logsInstId, setLogsInstId] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadDevices = async () => {
    try {
      const data = await api.getAttendanceDevices();
      setDevices(data);
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDevices(); }, []);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadDevices(); } finally { setRefreshing(false); }
  }, []);

  const handleAddDevice = async () => {
    if (!addName.trim()) { Alert.alert(t('common.error'), t('admin.enterDeviceName')); return; }
    if (!addInstId) { Alert.alert(t('common.error'), t('admin.selectInstitution2')); return; }
    // Refuse to add a device if device_attendance is disabled for the chosen institute.
    // Otherwise the admin creates a device that students can't see because the feature is off.
    const deviceFlag = allFlags.find(f => f.institute_id === addInstId && f.feature_key === 'device_attendance');
    if (deviceFlag?.is_enabled !== true) {
      Alert.alert(
        'ميزة أجهزة الحضور مطفّأة',
        'هذه المؤسسة ما عندها ميزة "أجهزة الحضور" مُفعّلة. فعّلها من صفحة "الميزات" قبل إضافة جهاز.',
      );
      return;
    }
    setAdding(true);
    try {
      const device = await api.createAttendanceDevice(addInstId, addName.trim(), addType, addLocation.trim(), userId || '', addBranchId || undefined);
      api.logAdminAction({
        actorId: userId || '',
        actorRole: 'admin',
        action: 'create_device',
        targetType: 'device',
        targetId: device?.id,
        targetName: addName.trim(),
        instituteId: addInstId || undefined,
        metadata: { device_type: addType, location: addLocation.trim() || null, branch_id: addBranchId || null },
      }).catch(() => {});
      setShowAdd(false);
      setAddName('');
      setAddLocation('');
      setAddBranchId('');
      loadDevices();
      // Open the key viewer modal with selectable/copyable text instead of
      // burying the key inside a native Alert — Alert truncates on some Androids
      // and blocks text selection, so admins couldn't reliably copy long keys.
      setViewingDevice(device);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.addDeviceFailed'));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (deviceId: string, currentActive: boolean) => {
    try {
      await api.toggleDeviceActive(deviceId, !currentActive);
      loadDevices();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  const handleDelete = (device: any) => {
    confirmAlert(t('admin.deleteDevice'), t('admin.deleteDeviceConfirm', { name: device.device_name }), async () => {
      try {
        await api.deleteAttendanceDevice(device.id);
        api.logAdminAction({
          actorId: userId || '',
          actorRole: 'admin',
          action: 'delete_device',
          targetType: 'device',
          targetId: device.id,
          targetName: device.device_name,
          instituteId: device.institute_id || undefined,
          metadata: { device_type: device.device_type, location: device.location_description || null },
        }).catch(() => {});
        Alert.alert(t('common.success'), t('admin.deviceDeleted'));
        loadDevices();
      } catch (err: any) { Alert.alert(t('common.error'), err.message); }
    }, true);
  };

  const handleViewLogs = async (instituteId: string) => {
    setLogsInstId(instituteId);
    setShowLogs(true);
    setLoadingLogs(true);
    try {
      const data = await api.getDeviceAttendanceLogs(instituteId);
      setLogs(data);
    } catch { setLogs([]); } finally {
      setLoadingLogs(false);
    }
  };

  const [sendingAbsenceFor, setSendingAbsenceFor] = useState<string | null>(null);
  const handleSendAbsenceNotifications = (instituteId: string, instituteName: string) => {
    confirmAlert(
      'إرسال إشعارات الغياب',
      `سيتم تسجيل غياب لكل طالب ما عنده بصمة اليوم في "${instituteName}" وإرسال إشعار لأولياء أمورهم. تأكيد؟`,
      async () => {
        setSendingAbsenceFor(instituteId);
        try {
          const result = await api.sendAbsenceNotifications(instituteId);
          haptics.success();
          api.logAdminAction({
            actorId: userId || '',
            actorRole: 'admin',
            action: 'send_absence_notifications',
            targetType: 'institute',
            targetId: instituteId,
            targetName: instituteName,
            instituteId,
            metadata: result as any,
          }).catch(() => {});
          Alert.alert(
            'تم الإرسال',
            `تم تسجيل غياب: ${result.students_marked_absent || 0} طالب\nإشعارات لأولياء الأمور: ${result.parent_notifications_inserted || 0}\nمسجّل غياب مسبقاً: ${result.already_marked_absent || 0}\nبدون أولياء أمور: ${result.students_without_parents || 0}`,
          );
        } catch (err: any) {
          Alert.alert(t('common.error'), err?.message || 'فشل إرسال الإشعارات');
        } finally {
          setSendingAbsenceFor(null);
        }
      },
      false,
    );
  };

  const getEndpointUrl = () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    return url ? `${url}/functions/v1/attendance-device` : 'https://YOUR_PROJECT.supabase.co/functions/v1/attendance-device';
  };

  // Admin always has access — they manage features for institutions

  if (loading) {
    return <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}><RoleInnerHero title={t('admin.devices')} gradient={tokens.gradient.brand} glowAccent="rgba(59,130,246,0.30)" /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={Colors.primary} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.devices')}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        right={(
          <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)} accessibilityLabel="إضافة جهاز" accessibilityRole="button">
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={s.addBtnText}>{t('admin.addDevice')}</Text>
          </TouchableOpacity>
        )}
      />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingBottom: 30 }}>

        {/* Endpoint Info */}
        <View style={s.infoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.text }}>{t('admin.endpointTitle')}</Text>
            <Ionicons name="link" size={16} color={Colors.primary} />
          </View>
          <Text style={s.endpoint} selectable>{getEndpointUrl()}</Text>
          <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 6 }}>
            {t('admin.endpointInstructions')}
          </Text>
        </View>

        {/* Primary CTA — big, visible, always-accessible Add Device button */}
        <TouchableOpacity
          style={s.primaryAddCard}
          onPress={() => { haptics.light(); setShowAdd(true); }}
          activeOpacity={0.85}
          accessibilityLabel={t('admin.addAttendanceDevice')}
          accessibilityRole="button"
        >
          <View style={s.primaryAddIcon}>
            <Ionicons name="add-circle" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.primaryAddTitle}>{t('admin.addAttendanceDevice')}</Text>
            <Text style={s.primaryAddSub}>سجّل جهاز بصمة / وجه / بطاقة جديد</Text>
          </View>
        </TouchableOpacity>

        {/* Devices per institute */}
        {institutes.map(inst => {
          const instDevices = devices.filter(d => d.institute_id === inst.id);
          return (
            <View key={inst.id} style={s.section}>
              <View style={s.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity onPress={() => handleViewLogs(inst.id)} style={s.logsBtn}>
                    <Ionicons name="list" size={14} color={Colors.primary} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>{t('admin.todayLog')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSendAbsenceNotifications(inst.id, inst.name)}
                    style={s.absenceBtn}
                    disabled={sendingAbsenceFor === inst.id}
                    accessibilityLabel="إرسال إشعارات الغياب"
                    accessibilityRole="button"
                  >
                    {sendingAbsenceFor === inst.id ? (
                      <ActivityIndicator size="small" color="#B45309" />
                    ) : (
                      <>
                        <Ionicons name="mail-unread" size={14} color="#B45309" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>إشعار غياب</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.sectionTitle}>{inst.name}</Text>
                  <Ionicons name={inst.type === 'school' ? 'school' : 'business'} size={16} color={Colors.primary} />
                </View>
              </View>

              {instDevices.length === 0 ? (
                <Text style={s.empty}>{t('admin.noRegisteredDevices')}</Text>
              ) : instDevices.map(device => (
                <View key={device.id} style={s.deviceCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Switch value={device.is_active} onValueChange={() => handleToggle(device.id, device.is_active)}
                        trackColor={{ false: '#E2E8F0', true: '#BBF7D0' }} thumbColor={device.is_active ? '#059669' : '#94A3B8'} />
                      <TouchableOpacity onPress={() => handleDelete(device)} accessibilityLabel="حذف الجهاز" accessibilityRole="button">
                        <Ionicons name="trash-outline" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={s.deviceName}>{device.device_name}</Text>
                      <Text style={s.deviceMeta}>
                        {DEVICE_TYPES.find(t => t.key === device.device_type)?.label || device.device_type}
                        {device.branches?.name ? ` — فرع: ${device.branches.name}` : ''}
                        {device.location_description ? ` — ${device.location_description}` : ''}
                      </Text>
                    </View>
                    <View style={[s.deviceIcon, !device.is_active && { backgroundColor: '#F1F5F9' }]}>
                      <Ionicons name={DEVICE_TYPES.find(t => t.key === device.device_type)?.icon as any || 'finger-print'} size={22} color={device.is_active ? '#059669' : '#94A3B8'} />
                    </View>
                  </View>

                  {/* API Key + Status */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
                    <TouchableOpacity style={s.keyBtn} onPress={() => setViewingDevice(device)}>
                      <Ionicons name="key" size={12} color="#7C3AED" />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{t('admin.viewKey')}</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                        {device.last_heartbeat ? `${t('admin.lastConnection')}: ${new Date(device.last_heartbeat).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}` : t('admin.notConnectedYet')}
                      </Text>
                      <View style={[s.statusDot, { backgroundColor: device.is_active ? '#059669' : '#94A3B8' }]} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {/* Add Device Modal */}
      <SwipeableSheet visible={showAdd} onClose={() => setShowAdd(false)} maxHeight={0.85}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBody}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setShowAdd(false)} accessibilityLabel="إغلاق" accessibilityRole="button">
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text }}>{t('admin.addAttendanceDevice')}</Text>
            </View>

            {/* Institute picker */}
            <Text style={s.label}>{t('admin.theInstitution')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
              {institutes.map(inst => (
                <TouchableOpacity key={inst.id} style={[s.chip, addInstId === inst.id && s.chipActive]} onPress={() => {
                  setAddInstId(inst.id);
                  setAddBranchId('');
                  // Load branches for this institute
                  api.getBranches(inst.id).then(b => setBranches(b)).catch(() => setBranches([]));
                }}>
                  <Text style={[s.chipText, addInstId === inst.id && s.chipTextActive]}>{inst.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Branch picker — shows only if institute has branches */}
            {addInstId && branches.length > 0 && (
              <>
                <Text style={s.label}>{t('admin.theBranch')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
                  {branches.map(branch => (
                    <TouchableOpacity key={branch.id} style={[s.chip, addBranchId === branch.id && s.chipActive]} onPress={() => setAddBranchId(branch.id)}>
                      <Ionicons name="git-branch" size={12} color={addBranchId === branch.id ? '#fff' : Colors.textMuted} />
                      <Text style={[s.chipText, addBranchId === branch.id && s.chipTextActive]}>{branch.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Device type */}
            <Text style={s.label}>{t('admin.deviceType')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {DEVICE_TYPES.map(dt => (
                <TouchableOpacity key={dt.key} style={[s.chip, addType === dt.key && s.chipActive]} onPress={() => setAddType(dt.key)}>
                  <Ionicons name={dt.icon as any} size={14} color={addType === dt.key ? '#fff' : Colors.textMuted} />
                  <Text style={[s.chipText, addType === dt.key && s.chipTextActive]}>{dt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Name */}
            <Text style={s.label}>{t('admin.deviceName')}</Text>
            <TextInput style={s.input} placeholder={t('admin.deviceNamePlaceholder')} placeholderTextColor={Colors.textMuted} value={addName} onChangeText={setAddName} textAlign="right" />

            {/* Location */}
            <Text style={s.label}>{t('admin.deviceLocation')}</Text>
            <TextInput style={s.input} placeholder={t('admin.deviceLocationPlaceholder')} placeholderTextColor={Colors.textMuted} value={addLocation} onChangeText={setAddLocation} textAlign="right" />

            <TouchableOpacity style={[s.submitBtn, adding && { opacity: 0.6 }]} onPress={handleAddDevice} disabled={adding}>
              {adding ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={s.submitBtnText}>{t('admin.addDeviceAndGenerateKey')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SwipeableSheet>

      {/* API Key Viewer Sheet */}
      <SwipeableSheet visible={!!viewingDevice} onClose={() => setViewingDevice(null)} maxHeight={0.55}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, alignItems: 'center', gap: 16 }}>
          <Ionicons name="key" size={40} color="#7C3AED" />
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text }}>{t('admin.apiKey')}</Text>
          <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center' }}>
            {t('admin.copyKeyInstructions')}
          </Text>
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, width: '100%', borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#374151', textAlign: 'center' }} selectable>
              {viewingDevice?.api_key}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: '#7C3AED', width: '100%' }]}
            onPress={async () => {
              const ok = await copyToClipboard(viewingDevice?.api_key || '');
              haptics.success();
              Alert.alert(ok ? t('common.success') : t('common.error'), ok ? t('admin.keyCopied', { defaultValue: 'تم نسخ المفتاح' }) : t('admin.keyCopyFailed', { defaultValue: 'فشل النسخ — انسخ يدوياً' }));
            }}
          >
            <Ionicons name="copy" size={18} color="#fff" />
            <Text style={s.submitBtnText}>{t('admin.copyKey', { defaultValue: 'نسخ المفتاح' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.submitBtn, { backgroundColor: '#64748B', width: '100%', marginTop: 0 }]} onPress={() => setViewingDevice(null)}>
            <Text style={s.submitBtnText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </SwipeableSheet>

      {/* Today's Logs Sheet */}
      <SwipeableSheet visible={showLogs} onClose={() => setShowLogs(false)} maxHeight={0.9}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          <TouchableOpacity onPress={() => setShowLogs(false)} accessibilityLabel="إغلاق" accessibilityRole="button">
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right' }}>
            {t('admin.todayLog')} — {institutes.find(i => i.id === logsInstId)?.name}
          </Text>
        </View>
        {loadingLogs ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : logs.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
            <Ionicons name="document-text-outline" size={48} color="#E2E8F0" />
            <Text style={s.empty}>{t('common.noData')}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {logs.map((item: any) => (
              <View key={item.id} style={s.logItem}>
                <Text style={{ fontSize: 12, color: Colors.textMuted }}>
                  {new Date(item.scanned_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>{item.users?.full_name || item.student_code}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>
                    {item.attendance_devices?.device_name || 'جهاز'}
                    {item.branches?.name ? ` — ${item.branches.name}` : ''}
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#059669" />
              </View>
            ))}
          </ScrollView>
        )}
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  infoCard: { backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: '#C7D2FE' },
  primaryAddCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.primary,
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryAddIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAddTitle: { fontSize: 15, fontWeight: '900', color: '#fff', textAlign: 'right' },
  primaryAddSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 2 },
  endpoint: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#4F46E5', textAlign: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 10 },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  logsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  absenceBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minHeight: 28 },
  deviceCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  deviceIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  deviceName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  deviceMeta: { fontSize: 11, color: Colors.textMuted },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  keyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5F3FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  empty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 },
  logItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  sheetBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8 },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTextActive: { color: '#fff' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  submitBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
