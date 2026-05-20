import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, Alert as _RNAlert, RefreshControl, Modal, Pressable, Image, Platform } from 'react-native';

// React Native's Alert.alert is a silent no-op on web. This shim routes alerts
// through window.alert/confirm so admin actions surface success + error to the
// browser. Drop-in replacement — preserves the existing Alert.alert(...) call
// sites elsewhere in this file.
const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }>,
  ) => {
    if (Platform.OS !== 'web') {
      _RNAlert.alert(title, message, buttons as any);
      return;
    }
    const msg = message ? `${title}\n\n${message}` : title;
    const cancelBtn = buttons?.find((b) => b.style === 'cancel');
    const actionBtn = buttons?.find((b) => b !== cancelBtn);
    if (cancelBtn && actionBtn) {
      // eslint-disable-next-line no-alert
      if (window.confirm(msg)) actionBtn.onPress?.(); else cancelBtn.onPress?.();
    } else {
      // eslint-disable-next-line no-alert
      window.alert(msg);
      actionBtn?.onPress?.();
    }
  },
};
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { copyToClipboard } from '../../utils/clipboard';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useAdminStore from '../../stores/adminStore';
import { api } from '../../services/api';
import { supabase, supabaseAdmin } from '../../services/supabase';
import useFeatureFlagsStore from '../../stores/featureFlagsStore';
import usePresenceStore from '../../stores/presenceStore';
import { useDebouncedSearch } from '../../utils/performance';
import { searchMatch } from '../../hooks/useSmartSearch';
import { confirmAlert, successAlert } from '../../utils/alerts';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';
import CreateAccountWizard from '../../components/shared/CreateAccountWizard';
import { useRouter } from 'expo-router';

import { generateCode, PERMISSIONS_KEY } from '../../components/admin/users/_helpers';
import { styles } from '../../components/admin/users/_styles';
import OnlineUsersCard from '../../components/admin/users/OnlineUsersCard';
import ActionButtons from '../../components/admin/users/ActionButtons';
import UsersFilterBar, { RoleFilter } from '../../components/admin/users/UsersFilterBar';
import SearchResultsList from '../../components/admin/users/SearchResultsList';
import InstitutesSection from '../../components/admin/users/InstitutesSection';
import OrphanedUsersList from '../../components/admin/users/OrphanedUsersList';
import InstitutionPermissionsList from '../../components/admin/users/InstitutionPermissionsList';
import UserDetailSheet from '../../components/admin/users/sheets/UserDetailSheet';
import ResetInstituteCodeModal from '../../components/admin/users/sheets/ResetInstituteCodeModal';
import TransferUserModal from '../../components/admin/users/sheets/TransferUserModal';
import InternalTransferSheet from '../../components/admin/users/sheets/InternalTransferSheet';
import DeleteInstituteSheet from '../../components/admin/users/sheets/DeleteInstituteSheet';

export default function AdminUsers() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userId } = useAuthStore();

  const ROLE_LABEL: Record<string, string> = {
    teacher: t('roles.teacher'),
    student: t('roles.student'),
    parent: t('roles.parent'),
    cafeteria: t('roles.cafeteria'),
    medical: t('roles.medical'),
    institute: t('roles.institute'),
    admin: t('roles.admin'),
  };
  const roleLabelFor = (r: string) => ROLE_LABEL[r] || r;

  const { institutes, loadInstitutes } = useDataStore();
  const { platformStats, loadPlatformStats } = useAdminStore();
  const { allFlags, loadAllFlags } = useFeatureFlagsStore();

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { query: searchQuery, setQuery: setSearchQuery } = useDebouncedSearch(250);

  // Avatar map (user_id → avatar_url) — populated in bulk after users load.
  // Lightbox preview URL — non-null shows the full-screen modal.
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const handlePreviewAvatar = useCallback((url?: string | null) => {
    if (url) setPreviewUrl(url);
  }, []);

  // Modals
  const [expandedInstitute, setExpandedInstitute] = useState<string | null>(null);
  const [wizardInstitute, setWizardInstitute] = useState<{ id: string; type: 'institute' | 'school' } | null>(null);
  const [filterInstType, setFilterInstType] = useState<'all' | 'institute' | 'school'>('all');
  const [filterRole, setFilterRole] = useState<RoleFilter>('all');
  const [filterClassId, setFilterClassId] = useState<string>('');
  const [filterSectionId, setFilterSectionId] = useState<string>('');

  // Reset institute code modal state
  const [resetCodeInstId, setResetCodeInstId] = useState<string>('');
  const [resetCodeValue, setResetCodeValue] = useState('');
  const [resettingCode, setResettingCode] = useState(false);
  // Current code is fetched when the key icon is tapped so the admin can SEE
  // the active code (one source of truth = the edge function) before deciding
  // to rotate it. Null while loading, '' if the institute has no admin yet.
  const [currentInstituteCode, setCurrentInstituteCode] = useState<string | null>(null);
  const [loadingCurrentCode, setLoadingCurrentCode] = useState(false);

  // Feature 1: User Detail Modal
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [originalCode, setOriginalCode] = useState('');
  const [pickerStage, setPickerStage] = useState('');
  const [pickerGrade, setPickerGrade] = useState('');
  const [pickerBranch, setPickerBranch] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);
  const [showNotifInput, setShowNotifInput] = useState(false);
  const [notifText, setNotifText] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);
  const [userPhone, setUserPhone] = useState('');
  const [freezingUser, setFreezingUser] = useState(false);
  const [userClasses, setUserClasses] = useState<string[]>([]);
  const [userClassOptions, setUserClassOptions] = useState<any[]>([]);
  const [editTeacherAssignments, setEditTeacherAssignments] = useState<Array<{ subjectId: string; gradeId: string; sectionIds: string[] }>>([]);
  // Wizard structure cache reused by the user detail teacher-assignment editor.
  const [wizardSchoolStructure, setWizardSchoolStructure] = useState<any>(null);

  // Feature 2: Online Users Count — sourced live from Supabase Realtime Presence
  // (via presenceStore). No polling, no DB writes, auto-cleanup on disconnect.
  const onlineCount = usePresenceStore((s) => s.platformCount);

  // Feature 3: Institute Permissions
  const [instPermissions, setInstPermissions] = useState<Record<string, { accounts: boolean; classes: boolean }>>({});

  // Feature 4: Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFilterRole, setTransferFilterRole] = useState('all');
  const [transferFilterInst, setTransferFilterInst] = useState('');
  const [transferSelectedUser, setTransferSelectedUser] = useState<any>(null);
  const [transferTargetInst, setTransferTargetInst] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Feature 5: Subscription Payment
  const [paidUsers, setPaidUsers] = useState<Record<string, boolean>>({});

  // Feature 8: Hierarchical view + section management
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [instStructureCache, setInstStructureCache] = useState<Record<string, any>>({});

  // Feature 9: Internal Transfer Modal
  const [showInternalTransfer, setShowInternalTransfer] = useState(false);
  const [internalTransferUser, setInternalTransferUser] = useState<any>(null);
  const [internalTransferInstId, setInternalTransferInstId] = useState('');
  const [internalTransferTarget, setInternalTransferTarget] = useState(''); // classId or sectionId
  const [internalTransferGrade, setInternalTransferGrade] = useState('');
  const [internalTransferring, setInternalTransferring] = useState(false);

  // Feature 6: Delete Institute
  const [showDeleteInstModal, setShowDeleteInstModal] = useState(false);
  const [deleteInstTarget, setDeleteInstTarget] = useState<any>(null);
  const [deleteInstStep, setDeleteInstStep] = useState<1 | 2>(1);
  const [deleteInstMode, setDeleteInstMode] = useState<'with_users' | 'institute_only' | null>(null);
  const [deleteInstTransferTarget, setDeleteInstTransferTarget] = useState('');
  const [deletingInst, setDeletingInst] = useState(false);

  const loadData = async () => {
    try {
      const result = await api.getAllUsersWithDetails({ pageSize: 5000 });
      const users = result.users || [];
      setAllUsers(users);
      // Bulk-fetch avatar URLs for the loaded users (one query, never blocks the
      // list — we render with a fallback while this resolves).
      try {
        const ids = users.map((u: any) => u.id).filter(Boolean);
        if (ids.length > 0) {
          const map = await api.getProfilePicsBulk(ids);
          setAvatars(map || {});
        } else {
          setAvatars({});
        }
      } catch (avatarErr) {
        // Avatars are non-critical — fall back to placeholder icons silently.
        if (__DEV__) console.warn('avatar bulk fetch failed', avatarErr);
      }
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const raw = await AsyncStorage.getItem(PERMISSIONS_KEY);
      if (raw) setInstPermissions(JSON.parse(raw));
    } catch (err) { console.error(err); }
  };

  const savePermissions = async (perms: Record<string, { accounts: boolean; classes: boolean }>) => {
    setInstPermissions(perms);
    try {
      await AsyncStorage.setItem(PERMISSIONS_KEY, JSON.stringify(perms));
    } catch (err) { console.error(err); }
  };

  const loadPaidUsers = async () => {
    try {
      const raw = await AsyncStorage.getItem('paid_users');
      if (raw) setPaidUsers(JSON.parse(raw));
    } catch (err) { console.error(err); }
  };

  const savePaidStatus = async (uId: string) => {
    const updated = { ...paidUsers, [uId]: true };
    setPaidUsers(updated);
    try {
      await AsyncStorage.setItem('paid_users', JSON.stringify(updated));
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    loadInstitutes();
    loadData();
    loadPlatformStats();
    loadPermissions();
    loadPaidUsers();
    loadAllFlags();
  }, []);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await Promise.all([loadInstitutes(), loadData(), loadPlatformStats()]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleDeleteUser = (user: any) => {
    Alert.alert(
      t('admin.deleteUser'),
      t('admin.deleteUserConfirm', { name: user.full_name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteUser(user.id, userId || undefined, user.full_name, user.role, user.institute_id);
              // Audit log — records WHO deleted WHOM (best-effort, never throws)
              api.logAdminAction({
                actorId: userId || '',
                actorRole: 'admin',
                action: 'delete_user',
                targetType: 'user',
                targetId: user.id,
                targetName: user.full_name,
                instituteId: user.institute_id,
                metadata: { role: user.role },
              });
              Alert.alert(t('common.success'), t('admin.userDeleted'));
              loadData();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('admin.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  // Feature 6: Open delete institute modal
  const openDeleteInstitute = (inst: any) => {
    setDeleteInstTarget(inst);
    setDeleteInstStep(1);
    setDeleteInstMode(null);
    setDeleteInstTransferTarget('');
    setDeletingInst(false);
    setShowDeleteInstModal(true);
  };

  const handleDeleteInstitute = async () => {
    if (!deleteInstTarget || !deleteInstMode) return;

    // If institute_only mode and users exist, transfer them first (sequential, with rollback-awareness)
    if (deleteInstMode === 'institute_only') {
      const instUsers = getUsersForInstitute(deleteInstTarget.id);
      if (instUsers.length > 0 && !deleteInstTransferTarget) {
        Alert.alert(t('common.error'), t('admin.selectNewInstitute'));
        return;
      }
      if (instUsers.length > 0) {
        setDeletingInst(true);
        // Sequential transfer. If any fails mid-way, we ROLL BACK the successful ones so the
        // admin doesn't end up with a split set of users across two institutes.
        const sourceInstId = deleteInstTarget.id;
        const transferred: string[] = [];
        const failedTransfers: string[] = [];
        for (const user of instUsers) {
          try {
            await api.transferUser(user.id, deleteInstTransferTarget);
            transferred.push(user.id);
          } catch (err: any) {
            failedTransfers.push(`${user.full_name || user.id}: ${err?.message || ''}`);
            break; // stop — we're about to rollback
          }
        }
        if (failedTransfers.length > 0) {
          // Rollback: move every successfully-transferred user back to the original institute.
          const rollbackFailures: string[] = [];
          for (const uid of transferred) {
            try {
              await api.transferUser(uid, sourceInstId);
            } catch (err: any) {
              rollbackFailures.push(`${uid}: ${err?.message || ''}`);
            }
          }
          // Surface the result — best outcome is "clean rollback", worst is "rollback partial".
          const msg = rollbackFailures.length === 0
            ? `فشل النقل. تم إلغاء العملية وإرجاع ${transferred.length} مستخدمين للمعهد الأصلي.\n\nالفشل الأصلي:\n• ${failedTransfers.slice(0, 5).join('\n• ')}`
            : `فشل النقل وتعذّر الإرجاع الكامل (${rollbackFailures.length} مستخدم لا يزال في المعهد الجديد). راجع يدوياً.\n\nفشل النقل:\n• ${failedTransfers.slice(0, 3).join('\n• ')}\nفشل الإرجاع:\n• ${rollbackFailures.slice(0, 3).join('\n• ')}`;
          Alert.alert(t('common.error'), msg);
          setDeletingInst(false);
          await loadData();
          return;
        }
      }
    }

    setDeletingInst(true);
    try {
      await api.deleteInstitute(deleteInstTarget.id, deleteInstMode, userId || undefined, deleteInstTarget.name);
      api.logAdminAction({
        actorId: userId || '',
        actorRole: 'admin',
        action: 'delete_institute',
        targetType: 'institute',
        targetId: deleteInstTarget.id,
        targetName: deleteInstTarget.name,
        metadata: { mode: deleteInstMode, transferred_to: deleteInstTransferTarget || null },
      });
      setShowDeleteInstModal(false);
      Alert.alert(t('common.success'), t('admin.instituteDeleted'));
      await Promise.all([loadInstitutes(), loadData(), loadPlatformStats()]);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.deleteInstituteFailed'));
      // Users already transferred — need to reload so admin sees current state
      await loadData();
    } finally {
      setDeletingInst(false);
    }
  };

  const getUsersForInstitute = (instId: string) => {
    return allUsers.filter((u: any) =>
      u.enrollments?.some((e: any) => e.institute_id === instId) ||
      u.institute_id === instId
    );
  };

  const loadInstStructure = async (instId: string) => {
    if (instStructureCache[instId]) return instStructureCache[instId];
    try {
      const inst = institutes.find(i => i.id === instId);
      const isSchool = (inst as any)?.type === 'school';
      if (isSchool) {
        const structure = await api.getSchoolStructure(instId);
        setInstStructureCache(prev => ({ ...prev, [instId]: { ...structure, type: 'school' } }));
        return { ...structure, type: 'school' };
      } else {
        const [classes, subjects] = await Promise.all([
          api.getClassesByInstitute(instId),
          api.getSubjects(instId),
        ]);
        const data = { classes, subjects, type: 'institute' };
        setInstStructureCache(prev => ({ ...prev, [instId]: data }));
        return data;
      }
    } catch { return null; }
  };

  const handleExpandInstitute = async (instId: string) => {
    if (expandedInstitute === instId) {
      setExpandedInstitute(null);
      return;
    }
    setExpandedInstitute(instId);
    setExpandedGroup(null);
    await loadInstStructure(instId);
  };

  const openInternalTransfer = (user: any, instId: string) => {
    setInternalTransferUser(user);
    setInternalTransferInstId(instId);
    setInternalTransferTarget('');
    setInternalTransferGrade('');
    setShowInternalTransfer(true);
  };

  const handleInternalTransfer = () => {
    if (!internalTransferUser || !internalTransferTarget) return;
    const inst = institutes.find(i => i.id === internalTransferInstId);
    const isSchool = (inst as any)?.type === 'school';
    const structure = instStructureCache[internalTransferInstId];

    let targetName = '';
    if (isSchool) {
      const sec = (structure?.sections || []).find((s: any) => s.id === internalTransferTarget);
      const grade = (structure?.grades || []).find((g: any) => g.id === internalTransferGrade);
      targetName = `${grade?.name || ''} — ${sec?.name || ''}`;
    } else {
      const cls = (structure?.classes || []).find((c: any) => c.id === internalTransferTarget);
      targetName = cls?.name || '';
    }

    // First confirmation
    Alert.alert(
      t('admin.confirmTransfer'),
      `${internalTransferUser.full_name} → ${targetName}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: () => {
            // Second confirmation
            Alert.alert(
              t('common.finalConfirm'),
              `${t('admin.areYouSure100')} ${internalTransferUser.full_name} → ${targetName}`,
              [
                { text: t('common.no'), style: 'cancel' },
                {
                  text: t('admin.yesTransfer'),
                  style: 'destructive',
                  onPress: async () => {
                    setInternalTransferring(true);
                    try {
                      if (isSchool) {
                        await api.transferStudentToSection(internalTransferUser.id, internalTransferInstId, internalTransferGrade, internalTransferTarget);
                      } else {
                        await api.transferStudentToGroup(internalTransferUser.id, internalTransferInstId, internalTransferTarget);
                      }
                      Alert.alert(t('common.success'), t('admin.transferSuccess'));
                      setShowInternalTransfer(false);
                      // Refresh
                      loadData();
                      setInstStructureCache(prev => { const n = { ...prev }; delete n[internalTransferInstId]; return n; });
                      await loadInstStructure(internalTransferInstId);
                    } catch (err: any) {
                      Alert.alert(t('common.error'), err.message || t('admin.transferFailed2'));
                    }
                    setInternalTransferring(false);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  // Base list: search query OR any active filter shows results.
  const hasActiveFilter = filterRole !== 'all' || !!filterClassId || !!filterSectionId;
  const filteredUsers = (searchQuery.trim() || hasActiveFilter)
    ? allUsers.filter((u) => {
        if (searchQuery.trim()) {
          if (!(searchMatch(u.full_name, searchQuery) || searchMatch(u.role, searchQuery) || searchMatch(u.user_code, searchQuery))) return false;
        }
        if (filterRole !== 'all' && u.role !== filterRole) return false;
        if (filterClassId && u.class_id !== filterClassId && u.grade_id !== filterClassId) return false;
        if (filterSectionId && u.section_id !== filterSectionId) return false;
        return true;
      })
    : []; // Empty list when no search/filter — main view shows under institutes.

  // Derive unique classes/sections from loaded users for the filter dropdowns —
  // avoids a separate fetch and stays in sync with whatever institute list is loaded.
  const availableClasses = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const u of allUsers) {
      if (u.role !== 'student') continue;
      const id = u.grade_id || u.class_id;
      const name = u.grade_name || u.class_name || u.grade?.name || u.class?.name;
      if (id && name && !map.has(id)) map.set(id, { id, name });
    }
    return Array.from(map.values());
  }, [allUsers]);
  const availableSections = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const u of allUsers) {
      if (u.role !== 'student') continue;
      if (filterClassId && u.grade_id !== filterClassId && u.class_id !== filterClassId) continue;
      const id = u.section_id;
      const name = u.section_name || u.section?.name;
      if (id && name && !map.has(id)) map.set(id, { id, name });
    }
    return Array.from(map.values());
  }, [allUsers, filterClassId]);

  // Feature 1: Open user detail
  const openUserDetail = async (user: any) => {
    setSelectedUser(user);
    setEditName(user.full_name || '');
    // Get email from Supabase Auth to show current login code
    let emailPrefix = '';
    try {
      const { data: authUser } = await (supabaseAdmin || supabase).auth.admin.getUserById(user.id);
      emailPrefix = authUser?.user?.email?.replace('@kaiplatform.app', '') || '';
    } catch {}
    setEditCode(emailPrefix.toUpperCase());
    setOriginalCode(emailPrefix.toUpperCase());
    setShowNotifInput(false);
    setNotifText('');
    setShowUserDetailModal(true);
    // Load phone from AsyncStorage
    try {
      const phone = await AsyncStorage.getItem(`user_phone_${user.id}`);
      setUserPhone(phone || '');
    } catch {
      setUserPhone('');
    }
    // Load user's classes
    if (['student', 'teacher'].includes(user.role) && user.institute_id) {
      try {
        const [cls, assigned, structure] = await Promise.all([
          api.getClassesByInstitute(user.institute_id),
          api.getUserClasses(user.id),
          api.getSchoolStructure(user.institute_id),
        ]);
        setUserClassOptions(cls);
        setUserClasses(assigned);
        setWizardSchoolStructure(structure);
        // Load existing teacher assignments
        if (user.role === 'teacher') {
          const assignments = await api.getTeacherAssignments(user.id);
          const grouped: Array<{ subjectId: string; gradeId: string; sectionIds: string[] }> = [];
          const map = new Map<string, string[]>();
          for (const a of assignments) {
            const key = `${a.subject_id || ''}__${a.section_id ? (a.sections as any)?.grades?.id || '' : ''}`;
            if (!map.has(key)) map.set(key, []);
            if (a.section_id) map.get(key)!.push(a.section_id);
            else if (a.class_id) map.get(key)!.push(a.class_id);
          }
          for (const [key, sids] of map) {
            const [subjectId, gradeId] = key.split('__');
            const subId = assignments.find(a => `${a.subject_id || ''}__${a.section_id ? (a.sections as any)?.grades?.id || '' : ''}` === key)?.subject_id || subjectId;
            grouped.push({ subjectId: subId, gradeId, sectionIds: sids });
          }
          setEditTeacherAssignments(grouped);
        }
      } catch {
        setUserClassOptions([]);
        setUserClasses([]);
      }
    } else {
      setUserClassOptions([]);
      setUserClasses([]);
    }
  };

  const handleToggleFreeze = (user: any) => {
    const isFrozen = user.is_frozen;
    Alert.alert(
      isFrozen ? t('admin.activateAccount') : t('admin.freezeAccount'),
      isFrozen
        ? t('admin.activateConfirm', { name: user.full_name })
        : t('admin.freezeConfirm', { name: user.full_name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isFrozen ? t('admin.activate') : t('admin.freeze'),
          style: isFrozen ? 'default' : 'destructive',
          onPress: async () => {
            setFreezingUser(true);
            try {
              if (isFrozen) {
                await api.unfreezeUser(user.id);
              } else {
                await api.freezeUser(user.id, userId || '');
              }
              api.logAdminAction({
                actorId: userId || '',
                actorRole: 'admin',
                action: isFrozen ? 'unfreeze_user' : 'freeze_user',
                targetType: 'user',
                targetId: user.id,
                targetName: user.full_name,
                instituteId: user.institute_id,
              });
              Alert.alert(t('common.success'), isFrozen ? t('admin.accountActivated') : t('admin.accountFrozen'));
              setSelectedUser({ ...user, is_frozen: !isFrozen });
              loadData();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('common.operationFailed'));
            }
            setFreezingUser(false);
          },
        },
      ]
    );
  };

  /** Save ALL changes at once — name, code, phone, classes, assignments */
  const handleSaveAll = async () => {
    if (!selectedUser) return;
    const codeChanged = editCode.trim() && editCode.trim().toUpperCase() !== originalCode;

    if (codeChanged && editCode.trim().length < 6) {
      Alert.alert(t('common.error'), 'الرمز قصير جداً — 6 أحرف على الأقل');
      return;
    }

    // Extracted so we can gate it behind an explicit code-change confirmation
    const runSaveAll = async () => {
      setSavingDetail(true);
      // Track per-step success/failure so partial save doesn't look like total failure
      const saved: string[] = [];
      const failed: string[] = [];
      try {
        // 1. Name
        if (editName.trim() && editName.trim() !== selectedUser.full_name) {
          try {
            await api.updateUserName(selectedUser.id, editName.trim());
            saved.push(t('admin.stepName', { defaultValue: 'الاسم' }));
          } catch (e: any) {
            failed.push(`${t('admin.stepName', { defaultValue: 'الاسم' })}: ${e?.message || ''}`);
          }
        }
        // 2. Code
        if (codeChanged) {
          try {
            await api.resetUserCode(selectedUser.id, editCode.trim().toUpperCase());
            // Audit: critical action
            api.logAdminAction({
              actorId: userId || '',
              actorRole: 'admin',
              action: 'reset_user_code',
              targetType: 'user',
              targetId: selectedUser.id,
              targetName: selectedUser.full_name,
              instituteId: selectedUser.institute_id,
              metadata: { previous_code: originalCode, new_code: editCode.trim().toUpperCase() },
            }).catch(() => {});
            saved.push(t('admin.stepCode', { defaultValue: 'الرمز' }));
          } catch (e: any) {
            failed.push(`${t('admin.stepCode', { defaultValue: 'الرمز' })}: ${e?.message || ''}`);
          }
        }
        // 3. Phone (always attempted since empty-string is valid)
        try {
          await api.saveUserPhone(selectedUser.id, userPhone.trim());
        } catch (e: any) {
          failed.push(`${t('admin.stepPhone', { defaultValue: 'الهاتف' })}: ${e?.message || ''}`);
        }
        // 4. Classes
        if (userClasses.length > 0) {
          try {
            await api.assignUserClasses(selectedUser.id, userClasses, selectedUser.institute_id);
            saved.push(t('admin.stepClasses', { defaultValue: 'الصفوف' }));
          } catch (e: any) {
            failed.push(`${t('admin.stepClasses', { defaultValue: 'الصفوف' })}: ${e?.message || ''}`);
          }
        }
        // 5. Teacher assignments
        if (selectedUser.role === 'teacher' && editTeacherAssignments.length > 0) {
          try {
            const inst = institutes.find(i => i.id === selectedUser.institute_id);
            const isSchool = (inst as any)?.type === 'school';
            const assignments: Array<{ subjectId: string; sectionId?: string; classId?: string }> = [];
            for (const asn of editTeacherAssignments) {
              if (asn.sectionIds.length > 0) {
                for (const sid of asn.sectionIds) {
                  if (isSchool) assignments.push({ subjectId: asn.subjectId, sectionId: sid });
                  else assignments.push({ subjectId: asn.subjectId, classId: sid });
                }
              } else {
                assignments.push({ subjectId: asn.subjectId });
              }
            }
            await api.setTeacherAssignments(selectedUser.id, selectedUser.institute_id, assignments);
            saved.push(t('admin.stepTeacherAssignments', { defaultValue: 'تعيينات الأستاذ' }));
          } catch (e: any) {
            failed.push(`${t('admin.stepTeacherAssignments', { defaultValue: 'تعيينات الأستاذ' })}: ${e?.message || ''}`);
          }
        }

        // Summarize results — distinguish full success / partial / all-failed
        if (failed.length === 0) {
          Alert.alert(t('common.success'), t('admin.changesSaved'));
        } else if (saved.length > 0) {
          Alert.alert(
            t('common.warning', { defaultValue: 'تنبيه' }),
            `تم حفظ: ${saved.join('، ')}\n\nفشل:\n• ${failed.join('\n• ')}`
          );
        } else {
          throw new Error(failed.join(' | '));
        }
        setShowUserDetailModal(false);
        loadData();
      } catch (err: any) {
        Alert.alert(t('common.error'), err.message || t('admin.saveFailed'));
      } finally {
        setSavingDetail(false);
      }
    };

    if (codeChanged) {
      // Gate the whole batch save behind an explicit confirmation when the login code
      // will be rewritten — it's the most destructive single action in this modal.
      confirmAlert(
        'تغيير رمز الدخول',
        `سيتغيّر رمز دخول "${selectedUser.full_name}" من ${originalCode} إلى ${editCode.trim().toUpperCase()} — المستخدم لن يقدر يدخل برمزه القديم بعدها. متابعة الحفظ؟`,
        runSaveAll,
        true,
      );
    } else {
      await runSaveAll();
    }
  };

  const handleSendNotif = async () => {
    if (!selectedUser || !notifText.trim()) return;
    setSendingNotif(true);
    try {
      await api.sendPushToUser(t('admin.notifFromAdmin'), notifText.trim(), selectedUser.id);
      Alert.alert(t('common.success'), t('admin.notifSent'));
      setNotifText('');
      setShowNotifInput(false);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.notifFailed'));
    }
    setSendingNotif(false);
  };

  // Feature 3: Toggle permission
  const togglePermission = (instId: string, field: 'accounts' | 'classes') => {
    const current = instPermissions[instId] || { accounts: true, classes: true };
    const updated = { ...instPermissions, [instId]: { ...current, [field]: !current[field] } };
    savePermissions(updated);
  };

  // Feature 4: Transfer user filtering
  const getTransferUsers = () => {
    let users = allUsers.filter((u) => u.role === 'student' || u.role === 'teacher');
    if (transferFilterRole !== 'all') {
      users = users.filter((u) => u.role === transferFilterRole);
    }
    if (transferFilterInst) {
      users = users.filter((u) => u.institute_id === transferFilterInst);
    }
    return users;
  };

  const handleTransfer = async () => {
    if (!transferSelectedUser || !transferTargetInst) return;
    setTransferring(true);
    try {
      await api.transferUserWithHistory(
        transferSelectedUser.id,
        transferSelectedUser.institute_id,
        transferTargetInst,
        userId || '',
        t('admin.transferByAdmin')
      );
      Alert.alert(t('common.success'), t('admin.userTransferred', { name: transferSelectedUser.full_name }));
      setTransferSelectedUser(null);
      setTransferTargetInst('');
      loadData();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.transferFailed2'));
    }
    setTransferring(false);
  };

  // Feature 5: Mark as paid
  const handleMarkPaid = (user: any) => {
    confirmAlert(t('admin.paySubscription'), t('admin.payConfirm', { name: user.full_name }), async () => {
      try {
        await api.markSubscriptionPaid(user.id, user.institute_id || '', 0);
        savePaidStatus(user.id);
        Alert.alert(t('common.success'), t('admin.paymentRecordedDB'));
      } catch {
        savePaidStatus(user.id);
        Alert.alert(t('common.success'), t('admin.paymentRecorded'));
      }
    });
  };

  // Compute orphaned users (users whose institute isn't in the loaded list).
  const orphans = (() => {
    const instIds = institutes.map((i: any) => i.id);
    return allUsers.filter((u: any) => !instIds.includes(u.institute_id) && u.role !== 'admin');
  })();

  const isLiveStreamingEnabled = (instId: string) => {
    const liveFlag = allFlags.find(f => f.institute_id === instId && f.feature_key === 'live_streaming');
    return liveFlag?.is_enabled === true;
  };

  const canViewUserCodes = React.useMemo(() => {
    const instId = selectedUser?.institute_id;
    if (!instId) return false;
    const flag = allFlags.find(f => f.institute_id === instId && f.feature_key === 'admin_view_user_codes');
    return flag?.is_enabled === true;
  }, [allFlags, selectedUser?.institute_id]);

  const handleToggleLiveStreaming = async (instId: string, val: boolean) => {
    try {
      await api.toggleFeatureFlag(instId, 'live_streaming', val, userId || '');
      await loadAllFlags();
      Alert.alert(t('common.success'), val ? t('admin.liveAllowed') : t('admin.liveBlocked'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('admin.updateFailed'));
    }
  };

  const handleConfirmResetCode = async () => {
    const code = resetCodeValue.trim().toUpperCase();
    if (code.length < 6) {
      Alert.alert(t('common.error'), 'الرمز قصير جداً — 6 أحرف على الأقل');
      return;
    }
    if (!/^[A-Z0-9]+$/.test(code)) {
      Alert.alert(t('common.error'), 'الرمز يجب أن يحتوي على أحرف إنكليزية وأرقام فقط');
      return;
    }
    setResettingCode(true);
    try {
      const res: any = await api.resetInstituteCode(resetCodeInstId, code);
      const finalCode = (res?.newCode || code).toUpperCase();
      // Resolve the institute name BEFORE clearing state so the success message
      // can mention which institute was updated — much clearer than a bare code.
      const instName = institutes.find((i: any) => i.id === resetCodeInstId)?.name || '';
      // Close the modal first, then reload to invalidate caches that hold the old code,
      // then surface the new code so the admin sees the post-rotation truth.
      setResetCodeInstId('');
      setResetCodeValue('');
      await loadData();
      haptics.success();
      Alert.alert(
        '✅ تم تغيير الرمز بنجاح',
        instName
          ? `الرمز الجديد لمؤسسة "${instName}":\n\n🔑  ${finalCode}\n\nاحفظ الرمز وسلّمه لإدارة المؤسسة — الرمز القديم لم يعد يعمل.`
          : `الرمز الجديد:\n\n🔑  ${finalCode}\n\nاحفظ الرمز — الرمز القديم لم يعد يعمل.`,
      );
    } catch (err: any) {
      // Translate technical/server messages into actionable user-facing text.
      // The edge function now surfaces specific Arabic messages (e.g. "حساب
      // إدارة المؤسسة غير موجود") — keep them visible so the admin knows
      // exactly which precondition failed instead of staring at "حدث خطأ".
      const raw = (err?.message || '').toString();
      let userMsg = raw || 'فشل تغيير الرمز';
      if (raw.includes('حساب إدارة المؤسسة غير موجود')) {
        userMsg = 'هذه المؤسسة لا يوجد لها حساب إدارة مفعّل — أضف حساب إدارة أولاً من زر "إضافة حساب".';
      } else if (raw.includes('مستخدم بالفعل') || raw.includes('مستخدم من قبل')) {
        userMsg = 'هذا الرمز مستخدم بالفعل من قبل حساب آخر — جرّب رمزاً مختلفاً.';
      } else if (raw.includes('قصير') || raw.includes('غير صالح')) {
        userMsg = raw;
      } else if (raw.includes('الجلسة منتهية')) {
        userMsg = 'الجلسة منتهية — أعد تسجيل الدخول وحاول ثانية.';
      } else if (raw === 'حدث خطأ — حاول مرة أخرى' || raw === 'internal') {
        userMsg = 'فشل تغيير الرمز — تأكد من اتصال الإنترنت، ومن أن المؤسسة لها حساب إدارة، ثم حاول ثانية.';
      }
      Alert.alert(t('common.error'), userMsg);
    } finally {
      setResettingCode(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.users')}
        subtitle={`${platformStats.totalUsers} ${t('admin.users')} — ${platformStats.institutes} ${t('admin.institute')}`}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <OnlineUsersCard
          onlineCount={onlineCount}
          titleLabel={t('admin.activeUsersNow')}
          subtitleLabel={t('admin.updatesEvery30Sec')}
        />

        <ActionButtons
          manageInstitutionsLabel="إدارة المؤسسات"
          transferLabel={t('admin.transferStudentTeacher')}
          onManageInstitutions={() => { haptics.medium(); router.push('/(admin)/institutions'); }}
          onOpenTransfer={() => {
            setTransferFilterRole('all');
            setTransferFilterInst('');
            setTransferSelectedUser(null);
            setTransferTargetInst('');
            setShowTransferModal(true);
          }}
        />

        <UsersFilterBar
          searchQuery={searchQuery}
          onChangeSearch={setSearchQuery}
          searchPlaceholder={t('admin.searchUser')}
          filterRole={filterRole}
          onChangeFilterRole={setFilterRole}
          filterClassId={filterClassId}
          onChangeFilterClassId={setFilterClassId}
          filterSectionId={filterSectionId}
          onChangeFilterSectionId={setFilterSectionId}
          availableClasses={availableClasses}
          availableSections={availableSections}
        />

        <SearchResultsList
          filteredUsers={filteredUsers}
          searchQuery={searchQuery}
          totalUsersCount={allUsers.length}
          paidUsers={paidUsers}
          roleLabelFor={roleLabelFor}
          searchResultsLabel={t('admin.searchResults')}
          usersLabel={t('admin.users')}
          paidLabel={t('admin.paid')}
          paySubscriptionLabel={t('admin.paySubscriptionIQD')}
          noResultsLabel={t('common.noResults')}
          onOpenUser={openUserDetail}
          onDeleteUser={handleDeleteUser}
          onMarkPaid={handleMarkPaid}
          avatars={avatars}
          onPreviewAvatar={handlePreviewAvatar}
        />

        <InstitutesSection
          loading={loading}
          institutes={institutes}
          filterInstType={filterInstType}
          onChangeFilterInstType={setFilterInstType}
          expandedInstitute={expandedInstitute}
          expandedGroup={expandedGroup}
          allLabel={t('common.all')}
          institutesLabel={t('admin.institutes')}
          schoolsOnlyLabel={t('admin.schoolsOnly')}
          institutionsLabel={t('admin.institutions')}
          noInstitutionsLabel={t('admin.noInstitutions')}
          cityFallbackLabel={t('admin.withoutCity')}
          userLabel={t('admin.user')}
          instituteTypeLabel={t('admin.institutionType')}
          schoolLabel={t('admin.school')}
          frozenLabel={t('admin.frozen')}
          noDataLabel={t('common.noData')}
          addAccountWizardLabel="إضافة حساب"
          roleLabelFor={roleLabelFor}
          getUsersForInstitute={getUsersForInstitute}
          onToggleExpandInstitute={handleExpandInstitute}
          onOpenResetCode={async (instId) => {
            // Open modal immediately so the user gets feedback, then fetch the
            // active code in the background. We DON'T pre-generate a new code
            // anymore — the input starts empty so the user actively types or
            // hits the regenerate button, preventing accidental overwrites.
            setResetCodeInstId(instId);
            setResetCodeValue('');
            setCurrentInstituteCode(null);
            setLoadingCurrentCode(true);
            try {
              const code = await api.getInstituteAdminCode(instId);
              setCurrentInstituteCode(code || '');
            } finally {
              setLoadingCurrentCode(false);
            }
          }}
          onOpenDeleteInstitute={openDeleteInstitute}
          onOpenWizard={(inst) => {
            haptics.medium();
            setWizardInstitute({ id: inst.id, type: (inst.type === 'school' ? 'school' : 'institute') });
          }}
          onSetExpandedGroup={setExpandedGroup}
          onOpenUser={openUserDetail}
          onDeleteUser={handleDeleteUser}
          onOpenInternalTransfer={openInternalTransfer}
          avatars={avatars}
          onPreviewAvatar={handlePreviewAvatar}
        />

        <OrphanedUsersList
          orphans={orphans}
          title={t('admin.usersWithoutInstitution')}
          onDeleteUser={handleDeleteUser}
          avatars={avatars}
          onPreviewAvatar={handlePreviewAvatar}
        />

        <InstitutionPermissionsList
          institutes={institutes}
          instPermissions={instPermissions}
          isLiveStreamingEnabled={isLiveStreamingEnabled}
          onTogglePermission={togglePermission}
          onToggleLiveStreaming={handleToggleLiveStreaming}
          title={t('admin.institutionPermissions')}
          accountsLabel={t('admin.accounts')}
          classesLabel={t('admin.classes')}
          liveStreamingLabel={t('admin.liveStreaming')}
          liveEnabledLabel={t('admin.liveEnabled')}
          liveStoppedLabel={t('admin.liveStopped')}
        />

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* User Detail Modal */}
      <UserDetailSheet
        visible={showUserDetailModal}
        onClose={() => setShowUserDetailModal(false)}
        selectedUser={selectedUser}
        institutes={institutes}
        canViewCodes={canViewUserCodes}
        editName={editName}
        setEditName={setEditName}
        editCode={editCode}
        setEditCode={setEditCode}
        userPhone={userPhone}
        setUserPhone={setUserPhone}
        pickerStage={pickerStage}
        setPickerStage={setPickerStage}
        pickerGrade={pickerGrade}
        setPickerGrade={setPickerGrade}
        pickerBranch={pickerBranch}
        setPickerBranch={setPickerBranch}
        userClassOptions={userClassOptions}
        userClasses={userClasses}
        setUserClasses={setUserClasses}
        showNotifInput={showNotifInput}
        setShowNotifInput={setShowNotifInput}
        notifText={notifText}
        setNotifText={setNotifText}
        sendingNotif={sendingNotif}
        savingDetail={savingDetail}
        freezingUser={freezingUser}
        editTeacherAssignments={editTeacherAssignments}
        setEditTeacherAssignments={setEditTeacherAssignments}
        wizardSchoolStructure={wizardSchoolStructure}
        onSaveAll={handleSaveAll}
        onSendNotif={handleSendNotif}
        onToggleFreeze={() => selectedUser && handleToggleFreeze(selectedUser)}
        onDelete={() => {
          setShowUserDetailModal(false);
          if (selectedUser) handleDeleteUser(selectedUser);
        }}
        roleLabelFor={roleLabelFor}
        userDetailsLabel={t('admin.userDetails')}
        nameLabel={t('common.name')}
        fullNameLabel={t('admin.fullName')}
        loginCodeLabel={t('admin.loginCode')}
        writeOrGenerateCodeLabel={t('admin.writeOrGenerateCode')}
        phoneLabel={t('common.phone')}
        phoneOptionalLabel={t('admin.phoneOptional')}
        classesEnrolledLabel={t('admin.classesEnrolled')}
        saveChangesLabel={t('admin.saveChanges')}
        sendNotificationLabel={t('admin.sendNotification')}
        notificationTextLabel={t('admin.notificationText')}
        sendLabel={t('common.send')}
        teachingAssignmentsLabel={t('admin.teachingAssignments')}
        addNewAssignmentLabel={t('admin.addNewAssignment')}
        activateAccountLabel={t('admin.activateAccount')}
        freezeAccountLabel={t('admin.freezeAccount')}
        deleteUserLabel={t('admin.deleteUser')}
        closeLabel={t('common.close')}
        institutionTypeLabel={t('admin.institutionType')}
      />

      {/* Reset Institute Login Code Modal */}
      <ResetInstituteCodeModal
        visible={!!resetCodeInstId}
        resetCodeValue={resetCodeValue}
        resettingCode={resettingCode}
        currentCode={currentInstituteCode}
        loadingCurrentCode={loadingCurrentCode}
        onChangeValue={setResetCodeValue}
        onClose={() => { setResetCodeInstId(''); setResetCodeValue(''); setCurrentInstituteCode(null); }}
        onRegenerate={() => setResetCodeValue(generateCode())}
        onCopyCurrent={async () => {
          if (currentInstituteCode) {
            await copyToClipboard(currentInstituteCode);
            haptics.success();
          }
        }}
        onConfirm={handleConfirmResetCode}
        titleLabel={t('admin.resetLoginCodeTitle', { defaultValue: 'إعادة رمز دخول المعهد' })}
        descLabel={t('admin.resetLoginCodeDesc', { defaultValue: 'اكتب رمزاً جديداً أو استخدم المُولَّد تلقائياً' })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('admin.confirm', { defaultValue: 'تأكيد' })}
      />

      {/* Transfer Modal */}
      <TransferUserModal
        visible={showTransferModal}
        institutes={institutes}
        transferUsers={getTransferUsers()}
        transferFilterRole={transferFilterRole}
        transferFilterInst={transferFilterInst}
        transferSelectedUser={transferSelectedUser}
        transferTargetInst={transferTargetInst}
        transferring={transferring}
        onClose={() => setShowTransferModal(false)}
        onChangeFilterRole={setTransferFilterRole}
        onChangeFilterInst={setTransferFilterInst}
        onSelectUser={setTransferSelectedUser}
        onSelectTarget={setTransferTargetInst}
        onConfirm={handleTransfer}
        titleLabel={t('admin.transferStudentTeacher')}
        allLabel={t('common.all')}
        teacherLabel={t('roles.teacher')}
        studentLabel={t('roles.student')}
        allInstitutesLabel={t('admin.allInstitutes')}
        noDataLabel={t('common.noData')}
        closeLabel={t('common.close')}
        confirmTransferLabel={t('admin.confirmTransfer')}
        roleLabelFor={roleLabelFor}
      />

      {/* Internal Transfer Modal */}
      <InternalTransferSheet
        visible={showInternalTransfer}
        onClose={() => setShowInternalTransfer(false)}
        internalTransferUser={internalTransferUser}
        internalTransferInstId={internalTransferInstId}
        internalTransferTarget={internalTransferTarget}
        internalTransferGrade={internalTransferGrade}
        internalTransferring={internalTransferring}
        institutes={institutes}
        instStructureCache={instStructureCache}
        roleLabelFor={roleLabelFor}
        onSelectGrade={(g) => { setInternalTransferGrade(g); setInternalTransferTarget(''); }}
        onSelectTarget={setInternalTransferTarget}
        onConfirm={handleInternalTransfer}
        cancelLabel={t('common.cancel')}
        confirmTransferLabel={t('admin.confirmTransfer')}
      />

      {/* Delete Institute Modal */}
      <DeleteInstituteSheet
        visible={showDeleteInstModal}
        onClose={() => setShowDeleteInstModal(false)}
        deleteInstTarget={deleteInstTarget}
        deleteInstStep={deleteInstStep}
        deleteInstMode={deleteInstMode}
        deleteInstTransferTarget={deleteInstTransferTarget}
        deletingInst={deletingInst}
        institutes={institutes}
        getUsersForInstitute={getUsersForInstitute}
        onSetMode={setDeleteInstMode}
        onSetStep={setDeleteInstStep}
        onSelectTransferTarget={setDeleteInstTransferTarget}
        onConfirmFullDelete={() => {
          confirmAlert('تأكيد نهائي', `حذف "${deleteInstTarget?.name}" مع كل البيانات؟`, handleDeleteInstitute, true);
        }}
        onConfirmTransferDelete={() => {
          const targetName = institutes.find((i) => i.id === deleteInstTransferTarget)?.name;
          Alert.alert(
            'تأكيد النقل والحذف',
            `سيتم نقل كل المستخدمين إلى "${targetName}" ثم حذف "${deleteInstTarget?.name}"`,
            [
              { text: 'إلغاء', style: 'cancel' },
              { text: 'نقل واحذف', onPress: handleDeleteInstitute },
            ]
          );
        }}
        cancelLabel={t('common.cancel')}
        nextLabel={t('common.next')}
        backLabel={t('common.back')}
      />

      {/* Create Account Wizard */}
      <CreateAccountWizard
        visible={!!wizardInstitute}
        onClose={() => setWizardInstitute(null)}
        onCreated={() => { loadData(); }}
        instituteId={wizardInstitute?.id || ''}
        instituteType={wizardInstitute?.type || 'institute'}
        callerUserId={userId || ''}
      />

      {/* Avatar Preview Lightbox */}
      <Modal
        visible={!!previewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <Pressable
          onPress={() => setPreviewUrl(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}
        >
          {previewUrl && (
            <Image
              source={{ uri: previewUrl }}
              style={{ width: '90%', height: '70%', resizeMode: 'contain' }}
            />
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
