// Admin Settings — reorganized into atomic SettingSection + SettingRow.
// Original logic preserved verbatim (handlers untouched); only the presentation
// layer was rewritten to group settings, add search, and support tablet 2-col
// layout in landscape.

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
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import { useRouter } from 'expo-router';
import { documentDirectory, writeAsStringAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useAdminStore from '../../stores/adminStore';
import { api } from '../../services/api';
import { confirmAlert } from '../../utils/alerts';
import { performLogout } from '../../utils/logout';
import ThemeSettings from '../../components/shared/ThemeSettings';
import LanguageSettings from '../../components/shared/LanguageSettings';
import InteractionSettings from '../../components/shared/InteractionSettings';
import PrivacyTermsGroup from '../../components/shared/PrivacyTermsGroup';
import CreateAccountWizard from '../../components/shared/CreateAccountWizard';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';
import SettingSection from '../../components/admin/settings/SettingSection';
import SettingRow from '../../components/admin/settings/SettingRow';

// Tablet landscape threshold — at this width we render sections in 2 columns.
const TABLET_LANDSCAPE_MIN_WIDTH = 900;

export default function AdminSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isTabletLandscape = winWidth >= TABLET_LANDSCAPE_MIN_WIDTH && winWidth > winHeight;

  const { userName, userId, logout } = useAuthStore();
  const { institutes, loadInstitutes } = useDataStore();
  const { systemSettings, tickets, toggleSetting, loadSystemSettings, loadTickets, replyToTicket } =
    useAdminStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logoutVisible, setLogoutVisible] = useState(false);

  // Search
  const [search, setSearch] = useState('');
  const q = search.trim();

  // Expanded section panels (controlled inline reveals beneath their row).
  const [expanded, setExpanded] = useState<{ [k: string]: boolean }>({});
  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  // My account
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [changingName, setChangingName] = useState(false);
  const [changingCode, setChangingCode] = useState(false);

  // Ticket reply
  const [replyingTicketId, setReplyingTicketId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Create admin
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [deletingAdminId, setDeletingAdminId] = useState<string | null>(null);

  // Toggle loading
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  // Reset confirmation
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetType, setResetType] = useState('');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetInstituteId, setResetInstituteId] = useState('');
  const [resetting, setResetting] = useState(false);

  // Backup
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadAll();
    if (institutes.length === 0) loadInstitutes();
  }, []);

  const loadAdmins = async () => {
    try {
      const result = await api.getAllUsersWithDetails({ pageSize: 5000 });
      setAdminUsers((result.users || []).filter((u: any) => u.role === 'admin'));
    } catch (err) { console.error(err); }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadSystemSettings(), loadTickets(), loadAdmins()]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadAll(); } finally { setRefreshing(false); }
  }, []);

  const handleReplyTicket = async () => {
    if (!replyText.trim() || !replyingTicketId) return;
    setSendingReply(true);
    try {
      await replyToTicket(replyingTicketId, replyText.trim());
      Alert.alert(t('common.success'), t('admin.replySent'));
      setReplyingTicketId(null);
      setReplyText('');
    } catch {
      Alert.alert(t('common.error'), t('admin.replyFailed'));
    } finally {
      setSendingReply(false);
    }
  };

  const handleReset = async () => {
    if (resetting) return; // Guard against double-tap on destructive op
    if (resetConfirmText !== 'تأكيد') {
      Alert.alert(t('common.error'), t('admin.typeConfirm'));
      return;
    }
    if (!resetInstituteId) {
      Alert.alert(t('common.error'), t('admin.selectInstFirst'));
      return;
    }
    setResetting(true);
    // Safety net: always export an automatic backup right before a destructive
    // reset. If the export fails we abort the reset — no backup means no way to
    // recover if the admin hits the wrong toggle.
    const instName = institutes.find(i => i.id === resetInstituteId)?.name || 'institute';
    try {
      const data = await api.exportInstituteData(resetInstituteId);
      const backup = {
        institute: { id: resetInstituteId, name: instName },
        exportDate: new Date().toISOString(),
        version: '1.0',
        reason: `auto-backup-before-reset:${resetType}`,
        data,
      };
      const json = JSON.stringify(backup, null, 2);
      const safeName = instName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
      const fileName = `pre_reset_backup_${safeName}_${Date.now()}.json`;
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      } else {
        const fileUri = documentDirectory + fileName;
        await writeAsStringAsync(fileUri, json, { encoding: EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: `نسخة احتياطية قبل الحذف — ${instName}` });
        }
      }
    } catch (err: any) {
      setResetting(false);
      Alert.alert(
        'فشل أخذ نسخة احتياطية',
        `تم إلغاء عملية الحذف لأن النسخة الاحتياطية فشلت.\n\n${err?.message || ''}\n\nصدّر النسخة يدوياً من "تصدير البيانات" ثم أعِد المحاولة.`,
      );
      return;
    }
    try {
      await api.resetData(resetType, resetInstituteId);
      Alert.alert(t('common.success'), t('common.operationSuccess'));
      setShowResetModal(false);
      setResetConfirmText('');
      setResetInstituteId('');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('common.operationFailed'));
    } finally {
      setResetting(false);
    }
  };

  const handleBackup = async (instId: string, instName: string) => {
    setExportingId(instId);
    try {
      const data = await api.exportInstituteData(instId);
      const backup = {
        institute: { id: instId, name: instName },
        exportDate: new Date().toISOString(),
        version: '1.0',
        data,
      };
      const json = JSON.stringify(backup, null, 2);
      const safeName = instName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
      const fileName = `backup_${safeName}_${Date.now()}.json`;

      if (Platform.OS === 'web') {
        // Web: download via blob
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert(t('common.success'), t('admin.exportBackupSuccess', { name: instName }));
      } else {
        const fileUri = documentDirectory + fileName;
        await writeAsStringAsync(fileUri, json, { encoding: EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: `نسخة ${instName}` });
        } else {
          Alert.alert('تم', `تم حفظ النسخة في: ${fileUri}`);
        }
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.exportFailed'));
    }
    setExportingId(null);
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setImporting(true);
      const fileUri = result.assets[0].uri;
      let jsonStr: string;

      if (Platform.OS === 'web') {
        const response = await fetch(fileUri);
        jsonStr = await response.text();
      } else {
        jsonStr = await readAsStringAsync(fileUri, { encoding: EncodingType.UTF8 });
      }

      const backup = JSON.parse(jsonStr);
      if (!backup.data || !backup.institute) {
        Alert.alert(t('common.error'), t('admin.invalidBackupFile'));
        setImporting(false);
        return;
      }

      const d = backup.data;
      const counts = [
        d.users?.length && `${d.users.length} مستخدم`,
        d.classes?.length && `${d.classes.length} صف`,
        d.timetables?.length && `${d.timetables.length} حصة`,
        d.attendance?.length && `${d.attendance.length} سجل حضور`,
        d.exams?.length && `${d.exams.length} امتحان`,
        d.announcements?.length && `${d.announcements.length} إعلان`,
        d.medicalRecords?.length && `${d.medicalRecords.length} سجل طبي`,
      ].filter(Boolean);

      setImporting(false);
      confirmAlert(
        'استيراد نسخة',
        `معهد: ${backup.institute.name}\nتاريخ: ${new Date(backup.exportDate).toLocaleDateString('ar')}\n\nالبيانات:\n${counts.join('\n') || 'لا توجد بيانات'}`,
        async () => {
          setImporting(true);
          try {
            const results = await api.importInstituteData(backup.data);
            const imported = Object.entries(results)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n');
            Alert.alert(t('common.success'), `${t('admin.importSuccess')}\n\n${imported}`);
          } catch (err: any) {
            Alert.alert(t('common.error'), err.message || t('admin.importFailed'));
          }
          setImporting(false);
        },
      );
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.readFileFailed'));
      setImporting(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Search predicate — checks title/subtitle/keywords for fuzzy hits.
  // Used to hide sections that have no matching rows when search is active.
  // ──────────────────────────────────────────────────────────────
  const matches = useCallback(
    (text: string) => {
      if (!q) return true;
      return text.toLowerCase().includes(q.toLowerCase());
    },
    [q],
  );

  // For each "logical row" we want searchable, we declare its keywords once
  // and then ask matches() per row. This keeps search consistent.
  const accountVisible = useMemo(() => ({
    name:    matches('الاسم name حسابي حساب user account'),
    code:    matches('رمز الدخول كود code password pin'),
    section: matches('حساب account profile الاسم رمز'),
  }), [matches]);

  const platformVisible = useMemo(() => ({
    admins:      matches('ادمن admin حسابات إدارة manage'),
    maintenance: matches('صيانة maintenance توقف'),
    sms:         matches('sms رسائل نصية إشعارات alerts'),
    section:     matches('منصة platform ادمن صيانة sms'),
  }), [matches]);

  const dataVisible = useMemo(() => ({
    autoBackup: matches('نسخ احتياطي تلقائي backup auto'),
    exportData: matches('تصدير بيانات export نسخة'),
    importData: matches('استيراد نسخة import'),
    section:    matches('بيانات نسخ احتياطية data backup'),
  }), [matches]);

  const supportVisible = useMemo(() => ({
    tickets: matches('دعم رسائل tickets support'),
    section: matches('دعم تذاكر support'),
  }), [matches]);

  const prefsVisible = useMemo(() => ({
    privacy:     matches('خصوصية شروط privacy terms policy'),
    interaction: matches('تفاعل اهتزاز haptic interaction sound'),
    section:     matches('تفضيلات لغة مظهر preferences'),
  }), [matches]);

  const dangerVisible = useMemo(() => ({
    resetAll:    matches('تصفير حذف كل البيانات reset all data'),
    resetInst:   matches('تصفير مؤسسة reset institute'),
    logout:      matches('خروج logout sign out'),
    section:     matches('خطر danger خروج تصفير'),
  }), [matches]);

  // A section is hidden when search is active AND no row inside it matches.
  const anyTrue = (o: Record<string, boolean>) => Object.values(o).some(Boolean);
  const showAccount  = q ? anyTrue(accountVisible)  : true;
  const showPlatform = q ? anyTrue(platformVisible) : true;
  const showData     = q ? anyTrue(dataVisible)     : true;
  const showSupport  = q ? anyTrue(supportVisible)  : true;
  const showPrefs    = q ? anyTrue(prefsVisible)    : true;
  const showDanger   = q ? anyTrue(dangerVisible)   : true;
  const anyMatches   = showAccount || showPlatform || showData || showSupport || showPrefs || showDanger;

  const pendingTicketsCount = tickets.filter((tk: any) => tk.status !== 'replied').length;

  // ──────────────────────────────────────────────────────────────
  // SECTION BUILDERS — each returns a SettingSection node.
  //
  // Pattern: each "logical entry" (row + optional inline expanded panel) is
  // wrapped in a single <View> so SettingSection treats them as ONE child and
  // draws hairline dividers only between distinct entries, never inside one.
  // ──────────────────────────────────────────────────────────────

  const renderAccountSection = () => (
    <SettingSection
      key="account"
      icon="person-circle-outline"
      title={t('admin.myAccount', { defaultValue: 'حسابي' })}
      subtitle="بياناتك الشخصية ورمز الدخول"
      hidden={!showAccount}
    >
      {accountVisible.name && (
        <View>
          <SettingRow
            icon="person"
            title={t('common.name')}
            subtitle={userName || t('admin.defaultName')}
            variant="nav"
            onPress={() => toggle('name')}
          />
          {expanded.name && (
            <View style={localStyles.inlinePanel}>
              <TextInput
                style={localStyles.input}
                placeholder={t('admin.newName')}
                placeholderTextColor={Colors.textMuted}
                value={newName}
                onChangeText={setNewName}
                textAlign="right"
              />
              <TouchableOpacity
                style={localStyles.primaryBtn}
                onPress={async () => {
                  if (!newName.trim()) return;
                  setChangingName(true);
                  try {
                    const { error } = await (await import('../../services/supabase')).supabase
                      .from('users')
                      .update({ full_name: newName.trim() })
                      .eq('id', userId);
                    if (!error) Alert.alert(t('common.success'), t('admin.namChanged'));
                    else Alert.alert(t('common.error'), t('admin.changeFailed'));
                  } catch {
                    Alert.alert(t('common.error'), t('admin.changeFailed'));
                  }
                  setChangingName(false);
                }}
                disabled={changingName}
              >
                {changingName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={localStyles.primaryBtnText}>{t('common.change')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {accountVisible.code && (
        <View>
          <SettingRow
            icon="key"
            title={t('admin.newLoginCode', { defaultValue: 'رمز الدخول' })}
            subtitle="تغيير الرمز السري لحسابك"
            variant="nav"
            onPress={() => toggle('code')}
          />
          {expanded.code && (
            <View style={localStyles.inlinePanel}>
              <TextInput
                style={localStyles.input}
                placeholder={t('admin.newLoginCode')}
                placeholderTextColor={Colors.textMuted}
                value={newCode}
                onChangeText={setNewCode}
                textAlign="right"
              />
              <TouchableOpacity
                style={localStyles.primaryBtn}
                onPress={async () => {
                  if (!newCode.trim() || newCode.trim().length < 4) {
                    Alert.alert(t('common.error'), t('admin.codeMinLength'));
                    return;
                  }
                  setChangingCode(true);
                  try {
                    await api.resetUserCode(userId || '', newCode.trim());
                    Alert.alert(t('common.success'), t('admin.codeChanged'));
                    setNewCode('');
                  } catch (err: any) {
                    Alert.alert(t('common.error'), err.message || t('admin.changeFailed'));
                  }
                  setChangingCode(false);
                }}
                disabled={changingCode}
              >
                {changingCode ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={localStyles.primaryBtnText}>{t('common.change')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SettingSection>
  );

  const renderPlatformSection = () => (
    <SettingSection
      key="platform"
      icon="shield-checkmark-outline"
      title="إدارة المنصة"
      subtitle="حسابات الادمن وإعدادات النظام العامة"
      hidden={!showPlatform}
    >
      {platformVisible.admins && (
        <View>
          <SettingRow
            icon="shield-checkmark"
            title={t('admin.adminManagement')}
            subtitle={`${adminUsers.length} حساب ادمن`}
            variant="nav"
            onPress={() => toggle('admins')}
          />
          {expanded.admins && (
            <View style={localStyles.inlinePanel}>
              <TouchableOpacity
                style={[localStyles.primaryBtn, { backgroundColor: Colors.success, alignSelf: 'stretch' }]}
                onPress={() => { haptics.selection(); setShowCreateAdmin(true); }}
              >
                <Text style={localStyles.primaryBtnText}>{t('admin.newAdminName')}</Text>
              </TouchableOpacity>
              {adminUsers.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={localStyles.helperText}>{t('admin.currentAdmins')}</Text>
                  {adminUsers.map((admin) => (
                    <View key={admin.id} style={localStyles.adminRow}>
                      <TouchableOpacity
                        onPress={() => {
                          if (admin.id === userId) {
                            Alert.alert(t('common.warning'), t('admin.cannotDeleteSelf'));
                            return;
                          }
                          confirmAlert(
                            t('admin.deleteAdmin'),
                            `${t('admin.deleteUserConfirm', { name: admin.full_name })}`,
                            async () => {
                              setDeletingAdminId(admin.id);
                              try {
                                await api.deleteUser(admin.id, userId || undefined, admin.full_name, 'admin');
                                Alert.alert(t('common.success'), t('admin.adminDeleted'));
                                loadAdmins();
                              } catch (err: any) {
                                Alert.alert(t('common.error'), err.message || t('admin.deleteFailed'));
                              }
                              setDeletingAdminId(null);
                            },
                            true,
                          );
                        }}
                        disabled={deletingAdminId === admin.id}
                      >
                        {deletingAdminId === admin.id ? (
                          <ActivityIndicator color={Colors.error} size="small" />
                        ) : (
                          <Ionicons name="trash-outline" size={18} color={admin.id === userId ? Colors.textMuted : Colors.error} />
                        )}
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="shield-checkmark" size={14} color={Colors.primary} />
                        <Text style={localStyles.adminName}>{admin.full_name}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {platformVisible.maintenance && (
        <SettingRow
          icon="construct"
          title={t('admin.maintenanceMode')}
          subtitle={t('admin.maintenanceDesc')}
          accent={Colors.warning}
          variant="toggle"
          toggleValue={!!systemSettings.maintenance}
          loading={togglingKey === 'maintenance'}
          onToggle={async () => { setTogglingKey('maintenance'); await toggleSetting('maintenance'); setTogglingKey(null); }}
        />
      )}

      {platformVisible.sms && (
        <SettingRow
          icon="chatbox-ellipses"
          title={t('admin.smsAlerts')}
          subtitle={t('admin.smsDesc')}
          accent={Colors.success}
          variant="toggle"
          toggleValue={!!systemSettings.smsAlerts}
          loading={togglingKey === 'smsAlerts'}
          onToggle={async () => { setTogglingKey('smsAlerts'); await toggleSetting('smsAlerts'); setTogglingKey(null); }}
        />
      )}
    </SettingSection>
  );

  const renderDataSection = () => (
    <SettingSection
      key="data"
      icon="server-outline"
      title="البيانات والنسخ الاحتياطية"
      subtitle="تصدير واستيراد بيانات المؤسسات"
      hidden={!showData}
    >
      {dataVisible.autoBackup && (
        <SettingRow
          icon="cloud-done"
          title={t('admin.autoBackup')}
          subtitle={t('admin.autoBackupDesc')}
          accent={Colors.success}
          variant="toggle"
          toggleValue={!!systemSettings.autoBackup}
          loading={togglingKey === 'autoBackup'}
          onToggle={async () => { setTogglingKey('autoBackup'); await toggleSetting('autoBackup'); setTogglingKey(null); }}
        />
      )}

      {dataVisible.exportData && (
        <View>
          <SettingRow
            icon="cloud-download"
            title={t('admin.backupAndExport')}
            subtitle={t('admin.exportInstData')}
            variant="nav"
            onPress={() => toggle('export')}
          />
          {expanded.export && (
            <View style={localStyles.inlinePanel}>
              {institutes.map((inst) => (
                <View key={inst.id} style={localStyles.backupRow}>
                  <TouchableOpacity
                    style={[localStyles.backupBtn, exportingId === inst.id && { opacity: 0.6 }]}
                    onPress={() => handleBackup(inst.id, inst.name)}
                    disabled={exportingId !== null}
                  >
                    {exportingId === inst.id ? (
                      <ActivityIndicator color={Colors.primary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={16} color={Colors.primary} />
                        <Text style={localStyles.backupBtnText}>{t('common.export')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="business" size={14} color={Colors.primary} />
                    <Text style={localStyles.adminName}>{inst.name}</Text>
                  </View>
                </View>
              ))}
              {institutes.length === 0 && (
                <Text style={localStyles.emptyText}>{t('admin.noInstitutes')}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {dataVisible.importData && (
        <SettingRow
          icon="cloud-upload"
          title={t('admin.importBackup')}
          subtitle="استيراد نسخة احتياطية من ملف JSON"
          accent={Colors.success}
          variant="nav"
          loading={importing}
          onPress={handleImport}
        />
      )}
    </SettingSection>
  );

  const renderSupportSection = () => (
    <SettingSection
      key="support"
      icon="chatbubbles-outline"
      title="الدعم الفني"
      subtitle="رسائل المستخدمين والردود"
      hidden={!showSupport}
    >
      {supportVisible.tickets && (
        <View>
          <SettingRow
            icon="chatbubble-ellipses"
            title={t('admin.supportTickets')}
            subtitle={pendingTicketsCount > 0
              ? `${pendingTicketsCount} رسالة بانتظار الرد`
              : `${tickets.length} رسالة`}
            variant="nav"
            onPress={() => toggle('tickets')}
          />
          {expanded.tickets && (
            <View style={localStyles.inlinePanel}>
              {tickets.length === 0 ? (
                <Text style={localStyles.emptyText}>{t('admin.noTickets')}</Text>
              ) : (
                tickets.map((ticket: any) => (
                  <View key={ticket.id} style={localStyles.ticketCard}>
                    <View style={localStyles.ticketHeader}>
                      <View
                        style={[
                          localStyles.ticketStatus,
                          { backgroundColor: ticket.status === 'replied' ? '#ECFDF5' : '#FEF3C7' },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: '700',
                            color: ticket.status === 'replied' ? Colors.success : Colors.warning,
                          }}
                        >
                          {ticket.status === 'replied' ? t('admin.replied') : t('admin.awaitingReply')}
                        </Text>
                      </View>
                      <Text style={localStyles.ticketUser}>{ticket.sender_name || t('admin.user')}</Text>
                    </View>
                    <Text style={localStyles.ticketSubject}>{ticket.subject}</Text>
                    <Text style={localStyles.ticketMessage} numberOfLines={2}>
                      {ticket.message}
                    </Text>
                    {ticket.reply && (
                      <View style={localStyles.ticketReply}>
                        <Text style={localStyles.ticketReplyLabel}>{t('admin.theReply')}</Text>
                        <Text style={localStyles.ticketReplyText}>{ticket.reply}</Text>
                      </View>
                    )}
                    {!ticket.reply && (
                      <>
                        {replyingTicketId === ticket.id ? (
                          <View style={localStyles.replyForm}>
                            <TextInput
                              style={localStyles.replyInput}
                              placeholder={t('admin.writeReply')}
                              placeholderTextColor={Colors.textMuted}
                              value={replyText}
                              onChangeText={setReplyText}
                              multiline
                              textAlign="right"
                            />
                            <View style={localStyles.replyBtnRow}>
                              <TouchableOpacity
                                onPress={() => {
                                  setReplyingTicketId(null);
                                  setReplyText('');
                                }}
                                style={localStyles.replyCancelBtn}
                              >
                                <Text style={localStyles.replyCancelText}>{t('common.cancel')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={handleReplyTicket}
                                disabled={sendingReply}
                                style={localStyles.replySendBtn}
                              >
                                {sendingReply ? (
                                  <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                  <Text style={localStyles.replySendText}>{t('common.send')}</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={localStyles.replyOpenBtn}
                            onPress={() => setReplyingTicketId(ticket.id)}
                          >
                            <Ionicons name="chatbubble" size={14} color={Colors.primary} />
                            <Text style={localStyles.replyOpenText}>{t('common.reply')}</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      )}
    </SettingSection>
  );

  const renderPrefsSection = () => {
    // ThemeSettings / LanguageSettings currently render null. InteractionSettings
    // and PrivacyTermsGroup render their own self-contained cards, so we just
    // place them under the section header without wrapping them in a
    // SettingSection card (they already provide their own surface).
    if (!showPrefs) return null;
    return (
      <View key="prefs">
        {/* Section header only — children are self-styled cards */}
        <View style={localStyles.bareHeader}>
          <View style={[localStyles.bareHeaderAccent, { backgroundColor: Colors.primary }]} />
          <View style={{ flex: 1 }}>
            <View style={localStyles.bareHeaderTitleRow}>
              <Ionicons name="options-outline" size={14} color={Colors.primary} />
              <Text style={[localStyles.bareHeaderTitle, { color: Colors.primary }]}>تفضيلات التطبيق</Text>
            </View>
            <Text style={localStyles.bareHeaderSubtitle}>المظهر، اللغة، الخصوصية، التفاعل</Text>
          </View>
        </View>

        <ThemeSettings />
        <LanguageSettings />
        {prefsVisible.interaction ? <InteractionSettings /> : null}
        {prefsVisible.privacy ? <PrivacyTermsGroup /> : null}
      </View>
    );
  };

  const renderDangerSection = () => (
    <View key="danger">
      {showDanger && (
        <SettingSection
          icon="warning-outline"
          title="المنطقة الخطرة"
          subtitle="عمليات لا يمكن التراجع عنها"
          danger
          accent={Colors.error}
        >
          {/* Warning banner row — uses children-as-JSX escape hatch */}
          <View style={localStyles.dangerBanner}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} />
            <Text style={localStyles.dangerBannerText}>
              العمليات في هذا القسم تؤثر على بيانات حقيقية. يتم أخذ نسخة احتياطية تلقائياً قبل أي تصفير، لكن يُنصح بالتأكد من نسخة يدوية أيضاً.
            </Text>
          </View>

          {dangerVisible.resetAll && (
            <SettingRow
              icon="trash"
              title={t('admin.resetAllData')}
              subtitle="حذف الامتحانات، الحضور، والفيديوهات (المستخدمون والمؤسسات لا يتأثرون)"
              destructive
              variant="nav"
              onPress={() => {
                setResetType('reset_all_data');
                setResetConfirmText('');
                setShowResetModal(true);
              }}
            />
          )}

          {dangerVisible.resetInst && (
            <SettingRow
              icon="business"
              title={t('admin.resetInstituteData')}
              subtitle="تصفير بيانات مؤسسة محددة"
              accent={Colors.warning}
              variant="nav"
              onPress={() => {
                setResetType('reset_institute');
                setResetConfirmText('');
                setShowResetModal(true);
              }}
            />
          )}
        </SettingSection>
      )}

      {/* Logout — standalone row outside the danger card for clarity */}
      {dangerVisible.logout && (
        <TouchableOpacity
          style={localStyles.logoutBtn}
          onPress={() => { haptics.warning(); setLogoutVisible(true); }}
        >
          <Ionicons name="log-out" size={20} color={Colors.error} />
          <Text style={localStyles.logoutText}>{t('common.logout')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Build the list of sections to render. In tablet landscape we split them
  // across two columns; danger always stays full-width at the bottom.
  const standardSections = [
    renderAccountSection(),
    renderPlatformSection(),
    renderDataSection(),
    renderSupportSection(),
    renderPrefsSection(),
  ].filter(Boolean);

  return (
    <SafeAreaView style={localStyles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('common.settings')}
        subtitle={t('admin.settingsSubtitle')}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          <View style={localStyles.content}>
            {/* ─────── Search bar ─────── */}
            <View style={localStyles.searchBar}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={localStyles.searchInput}
                placeholder="ابحث في الإعدادات..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                textAlign="right"
                returnKeyType="search"
              />
              {q.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {loading ? (
              <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 40 }} />
            ) : (
              <>
                {/* Empty search state */}
                {q && !anyMatches ? (
                  <View style={localStyles.emptyResults}>
                    <Ionicons name="search" size={32} color={Colors.textMuted} />
                    <Text style={localStyles.emptyResultsTitle}>لا توجد نتائج</Text>
                    <Text style={localStyles.emptyResultsDesc}>
                      جرّب كلمة مختلفة. مثلاً: &quot;صيانة&quot;، &quot;نسخ احتياطي&quot;، &quot;ادمن&quot;
                    </Text>
                  </View>
                ) : null}

                {/* Sections — 1 column on phone, 2 columns on tablet landscape */}
                {isTabletLandscape ? (
                  <View style={localStyles.twoColRow}>
                    <View style={localStyles.col}>
                      {standardSections.filter((_, i) => i % 2 === 0)}
                    </View>
                    <View style={localStyles.col}>
                      {standardSections.filter((_, i) => i % 2 === 1)}
                    </View>
                  </View>
                ) : (
                  standardSections
                )}

                {/* Danger always last and full-width */}
                {renderDangerSection()}
              </>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Reset Confirmation sheet */}
      <SwipeableSheet visible={showResetModal} onClose={() => setShowResetModal(false)}>
        <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24 }}>
          <View style={localStyles.modalIconWrap}>
            <Ionicons name="warning" size={36} color={Colors.error} />
          </View>
          <Text style={localStyles.modalTitle}>{t('common.finalConfirm')}</Text>
          <Text style={localStyles.modalDesc}>
            {resetType === 'reset_all_data'
              ? 'سيتم حذف جميع البيانات (الامتحانات، الحضور، الفيديوهات). المستخدمين والمؤسسات لن يتأثروا.'
              : 'سيتم تصفير بيانات المؤسسة المحددة.'}
          </Text>

          {/* اختيار المؤسسة */}
          <Text style={[localStyles.modalWarn, { marginBottom: 8 }]}>{t('admin.selectInstitution')}:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, marginBottom: 12 }}>
            {institutes.map((inst: any) => (
              <TouchableOpacity
                key={inst.id}
                style={{
                  backgroundColor: resetInstituteId === inst.id ? Colors.primary : '#F1F5F9',
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  marginLeft: 6,
                }}
                onPress={() => setResetInstituteId(inst.id)}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: resetInstituteId === inst.id ? '#fff' : Colors.text,
                  }}
                >
                  {inst.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={localStyles.modalWarn}>{t('admin.typeConfirm')}</Text>
          <TextInput
            style={localStyles.modalInput}
            placeholder='تأكيد'
            placeholderTextColor={Colors.textMuted}
            value={resetConfirmText}
            onChangeText={setResetConfirmText}
            textAlign="center"
          />
          <View style={localStyles.modalBtnRow}>
            <TouchableOpacity
              style={localStyles.modalCancelBtn}
              onPress={() => setShowResetModal(false)}
            >
              <Text style={localStyles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.modalDangerBtn, (resetConfirmText !== 'تأكيد' || resetting) && { opacity: 0.4 }]}
              onPress={handleReset}
              disabled={resetConfirmText !== 'تأكيد' || resetting}
            >
              {resetting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={localStyles.modalDangerText}>تنفيذ التصفير</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SwipeableSheet>

      <ConfirmSheet
        visible={logoutVisible}
        onClose={() => setLogoutVisible(false)}
        title={t('common.logout', { defaultValue: 'تسجيل الخروج' })}
        message={t('auth.confirmLogout', { defaultValue: 'هل تريد الخروج؟' })}
        confirmLabel={t('common.logout', { defaultValue: 'تسجيل الخروج' })}
        destructive
        onConfirm={performLogout}
      />

      <CreateAccountWizard
        visible={showCreateAdmin}
        onClose={() => setShowCreateAdmin(false)}
        onCreated={() => { loadAdmins(); }}
        instituteId=""
        instituteType="institute"
        callerUserId={userId || ''}
        mode="platform"
        enabledRoles={['admin']}
      />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Search
  searchBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    padding: 0,
  },
  emptyResults: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyResultsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 8,
  },
  emptyResultsDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // 2-column tablet layout
  twoColRow: {
    flexDirection: 'row',
    gap: 16,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },

  // Inline expandable panel (used under expanded SettingRows)
  inlinePanel: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignSelf: 'flex-start',
    alignItems: 'center',
    minWidth: 80,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  helperText: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'right',
    marginBottom: 6,
  },

  // Admin list inside expanded panel
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  adminName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },

  // Backup-per-institute list inside expanded panel
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  backupBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Tickets (inside expanded panel)
  ticketCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  ticketUser: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  ticketStatus: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ticketSubject: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 4,
  },
  ticketMessage: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 18,
    marginBottom: 8,
  },
  ticketReply: {
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  ticketReplyLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'right',
    marginBottom: 2,
  },
  ticketReplyText: {
    fontSize: 12,
    color: Colors.text,
    textAlign: 'right',
    lineHeight: 18,
  },
  replyForm: {
    marginTop: 8,
    gap: 8,
  },
  replyInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: Colors.text,
    minHeight: 50,
  },
  replyBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  replyCancelBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  replyCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  replySendBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  replySendText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  replyOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
  },
  replyOpenText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Danger banner
  dangerBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
  },
  dangerBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.error,
    lineHeight: 18,
    textAlign: 'right',
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 10,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.error,
  },

  // Bare header (used by Preferences group whose children are self-styled)
  bareHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  bareHeaderAccent: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  bareHeaderTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  bareHeaderTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  bareHeaderSubtitle: {
    fontSize: 10.5,
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },

  // Modal
  modalIconWrap: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  modalWarn: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  modalDangerBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.error,
    alignItems: 'center',
  },
  modalDangerText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
});
