import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Alert, KeyboardAvoidingView, Platform,
  Image, Modal, Pressable, Dimensions,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import WhatsAppButton from '../../components/shared/WhatsAppButton';
import { searchMatch } from '../../hooks/useSmartSearch';
import { confirmAlert, successAlert } from '../../utils/alerts';
import CreateAccountWizard from '../../components/shared/CreateAccountWizard';
import BulkUsersWizard from '../../components/shared/BulkUsersWizard';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import AssignmentSheet, { type PickedAssignment } from '../../components/admin/users/AssignmentSheet';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { tokens as dtokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';

type Role = 'all' | 'teacher' | 'student' | 'parent';

interface Row {
  id: string;
  name: string;
  role: string;
  code: string;
  phone: string;
  is_frozen: boolean;
  section_id?: string | null;
  class_id?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  teacher: 'أستاذ', student: 'طالب', parent: 'ولي أمر',
  institute: 'إدارة', cafeteria: 'كافتيريا', medical: 'طبابة',
};
const ROLE_BG: Record<string, { bg: string; text: string }> = {
  teacher: { bg: '#EFF6FF', text: '#1D4ED8' },
  student: { bg: '#F0FDFA', text: '#0D9488' },
  parent: { bg: '#FEF3C7', text: '#D97706' },
  institute: { bg: '#EEF2FF', text: '#6366F1' },
  cafeteria: { bg: '#FFE4E6', text: '#E11D48' },
  medical: { bg: '#ECFDF5', text: '#059669' },
};

// Per-role accent used by the new card design (left accent bar + avatar ring + name underline).
// Distinct from ROLE_BG (pill bg/text) — we want a stronger saturated color for the accent.
const ROLE_ACCENT: Record<string, string> = {
  teacher: '#1D4ED8',
  student: dtokens.color.teal600,
  parent: dtokens.color.p600,
  institute: dtokens.color.brand500,
  cafeteria: dtokens.color.o600,
  medical: dtokens.color.m600,
  admin: dtokens.color.brand500,
};

// Arabic alef/hamza normalization so "الإعدادية" and "الاعدادية" both parse
const normalizeAr = (s: string) => (s || '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').trim();

interface ParsedClass { id: string; name: string; stage: string; grade: string; section: string; }

// Parse a flat class name ("السادس الإعدادية أ") into stage/grade/section.
// Returns null when the name doesn't contain one of the known stage keywords.
function parseClassName(cls: { id: string; name: string }): ParsedClass | null {
  const STAGES = ['الابتدائية', 'المتوسطة', 'الإعدادية'];
  const hay = normalizeAr(cls.name);
  for (const stage of STAGES) {
    const needle = normalizeAr(stage);
    const idx = hay.indexOf(needle);
    if (idx === -1) continue;
    const grade = hay.slice(0, idx).trim();
    const section = hay.slice(idx + needle.length).trim();
    if (!grade || !section) continue;
    return { id: cls.id, name: cls.name, stage, grade, section };
  }
  return null;
}

export default function InstituteUsers() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userInstituteId, detectInstitute } = useDataStore();
  const { userId } = useAuthStore();

  // Optional `?role=teacher|student|parent` deep-link from the home stats cards.
  const params = useLocalSearchParams<{ role?: string }>();
  const initialRole: Role = (() => {
    const r = String(params?.role || '').toLowerCase();
    return r === 'teacher' || r === 'student' || r === 'parent' ? (r as Role) : 'all';
  })();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role>(initialRole);
  // Reveal the user's login code on-demand. Codes are sensitive and masked
  // by default — the admin must explicitly tap "إظهار الرمز" to view.
  const [revealedCodeUserId, setRevealedCodeUserId] = useState<string | null>(null);
  // Cache of fetched plaintext codes keyed by user id. We only fetch on-demand
  // (when the admin taps the eye) so we never leak codes for users they didn't
  // explicitly request. Stored in memory only — cleared on screen unmount.
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({});

  // ── Compact search bar (T2): collapsed icon by default, expands when tapped.
  // Auto-collapses 1s after the input is emptied to give the list maximum
  // screen real estate.
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = React.useRef<TextInput | null>(null);

  // ── Reset-code prompt (T1: key button)
  const [resetCodeUser, setResetCodeUser] = useState<Row | null>(null);
  const [resetCodeValue, setResetCodeValue] = useState('');
  const [resetCodeSaving, setResetCodeSaving] = useState(false);

  // ── Stage/grade/section filter (T4)
  const [showStructFilter, setShowStructFilter] = useState(false);
  const [structFilterStage, setStructFilterStage] = useState<string | null>(null);
  const [structFilterGrade, setStructFilterGrade] = useState<string | null>(null);
  const [structFilterSection, setStructFilterSection] = useState<string | null>(null);
  // Applied values — `filtered` only honours these once the user presses "تطبيق".
  const [appliedStage, setAppliedStage] = useState<string | null>(null);
  const [appliedGrade, setAppliedGrade] = useState<string | null>(null);
  const [appliedSection, setAppliedSection] = useState<string | null>(null);
  const [structureStages, setStructureStages] = useState<Array<{ id: string; name: string }>>([]);
  const [structureGrades, setStructureGrades] = useState<Array<{ id: string; name: string; stage_id: string }>>([]);
  const [structureSections, setStructureSections] = useState<Array<{ id: string; name: string; grade_id: string }>>([]);
  const [structureLoading, setStructureLoading] = useState(false);

  // Re-apply when the deep-link param changes (back/forward navigation).
  useEffect(() => {
    if (initialRole !== 'all') setRoleFilter(initialRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.role]);

  // Avatars: bulk-loaded once per `load()` so each user row shows their pic.
  // Tap an avatar -> previewUrl set -> full-screen lightbox modal opens.
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Action sheet
  const [selectedUser, setSelectedUser] = useState<Row | null>(null);
  // Per-user enrollment / assignment info shown inside the action sheet
  // (student → grade + section, teacher → list of subjects + their sections).
  type UserInfo =
    | { kind: 'student'; gradeName: string | null; sectionName: string | null; classNames: string[] }
    | { kind: 'teacher'; rows: Array<{ subject: string | null; display: string | null }> }
    | null;
  const [userInfo, setUserInfo] = useState<UserInfo>(null);
  const [userInfoLoading, setUserInfoLoading] = useState(false);

  // Phone edit
  const [phoneEditUser, setPhoneEditUser] = useState<Row | null>(null);
  const [phoneEditValue, setPhoneEditValue] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);

  // Add-user entry points (single vs bulk wizards)
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [instName, setInstName] = useState('');
  const [instType, setInstType] = useState<'institute' | 'school'>('institute');
  // `classes` + `subjects` are still consumed by the edit-assignments modal
  // (loaded fresh inside openEditAssignments). Keep them here so the modal
  // pickers render the latest catalog without prop drilling.
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);

  // Freeze / delete states
  const [actionBusy, setActionBusy] = useState<'freeze' | 'delete' | null>(null);

  // Edit-assignments modal (admin can fully add/remove teacher's subject/class/section)
  const [editTeacher, setEditTeacher] = useState<Row | null>(null);
  const [editAssignments, setEditAssignments] = useState<Array<{ subjectId: string; subjectName: string; gradeKey: string; gradeLabel: string; classIds: string[] }>>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Hierarchical AssignmentSheet — opened from the edit-teacher modal "إضافة تعيين"
  // button. Replaces the old flat side-by-side dropdowns. Loads school structure
  // (stages/grades/sections/subjects) when the teacher edit modal opens.
  const [showAssignmentSheet, setShowAssignmentSheet] = useState(false);
  const [editStructure, setEditStructure] = useState<{
    stages: Array<{ id: string; name: string }>;
    grades: Array<{ id: string; name: string; stage_id: string }>;
    sections: Array<{ id: string; name: string; grade_id: string }>;
  }>({ stages: [], grades: [], sections: [] });

  // Edit student grade/section (admin can move student to another grade/section)
  const [editStudent, setEditStudent] = useState<Row | null>(null);
  const [editStudentLoading, setEditStudentLoading] = useState(false);
  const [editStudentSaving, setEditStudentSaving] = useState(false);
  const [studentStages, setStudentStages] = useState<Array<{ id: string; name: string }>>([]);
  const [studentGrades, setStudentGrades] = useState<Array<{ id: string; name: string; stage_id: string }>>([]);
  const [studentSections, setStudentSections] = useState<Array<{ id: string; name: string; grade_id: string }>>([]);
  const [studentPickStage, setStudentPickStage] = useState<string | null>(null);
  const [studentPickGrade, setStudentPickGrade] = useState<string | null>(null);
  const [studentPickSection, setStudentPickSection] = useState<string | null>(null);
  const [studentCurrentGrade, setStudentCurrentGrade] = useState<string | null>(null);
  const [studentCurrentSection, setStudentCurrentSection] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Without an institute we can't query anything — clear loading so the
    // detect-institute fallback can render an empty/retry state instead of
    // an infinite spinner (perceived as a freeze).
    if (!userInstituteId) {
      setLoading(false);
      return;
    }
    try {
      setLoadError(null);
      const [users, info] = await Promise.all([
        api.getInstituteUsersWithCodes(userInstituteId),
        api.getInstituteInfo(userInstituteId),
      ]);
      setRows((users as any[]) || []);
      setInstType((info?.type as any) || 'institute');
      setInstName((info?.name as any) || '');

      // Bulk-fetch avatars for the users we just loaded. Failure here is
      // non-fatal — list still renders with the colored-initial fallback.
      try {
        const ids = ((users as any[]) || []).map(u => u.id).filter(Boolean);
        if (ids.length) {
          const map = await api.getProfilePicsBulk(ids);
          setAvatars(map || {});
        } else {
          setAvatars({});
        }
      } catch (avErr) {
        if (__DEV__) console.warn('[avatars bulk]', avErr);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'تعذّر تحميل المستخدمين');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userInstituteId]);

  useEffect(() => {
    (async () => { if (!userInstituteId && userId) await detectInstitute(userId); })();
  }, [userId, userInstituteId]);

  useEffect(() => { load(); }, [load]);

  // Watchdog: if we're still loading after 12s (stuck on slow network or
  // detectInstitute hanging), surface a retry instead of an endless spinner.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      if (!userInstituteId && userId) {
        setLoadError('تعذّر تحديد المؤسسة — تحقق من اتصالك');
        setLoading(false);
      } else if (userInstituteId) {
        setLoadError('تأخر تحميل البيانات — اضغط لإعادة المحاولة');
        setLoading(false);
      }
    }, 12000);
    return () => clearTimeout(t);
  }, [loading, userInstituteId, userId]);

  // Load enrollment / assignment info whenever a user is selected.
  // Student → primary section + grade (from enrollments).
  // Teacher → resolved subject + section labels (from teacher_assignments + legacy).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!selectedUser) {
        setUserInfo(null);
        return;
      }
      setUserInfoLoading(true);
      try {
        if (selectedUser.role === 'student') {
          const sec = await api.getStudentSection(selectedUser.id).catch(() => null);
          // Institute-style "groups" — fetch class names too
          const classes = await api.getStudentClasses(selectedUser.id).catch(() => [] as any[]);
          if (!alive) return;
          setUserInfo({
            kind: 'student',
            gradeName: (sec as any)?.grades?.name || null,
            sectionName: (sec as any)?.sections?.name || null,
            classNames: ((classes as any[]) || []).map(c => c?.name).filter(Boolean),
          });
        } else if (selectedUser.role === 'teacher') {
          const resolved = await api.getTeacherAssignmentsResolved(selectedUser.id).catch(() => [] as any[]);
          if (!alive) return;
          const rows = ((resolved as any[]) || []).map(r => ({
            subject: r.subject_name || null,
            display: r.display_name && r.display_name !== '—' ? r.display_name : (r.section_name || r.class_name || null),
          }));
          setUserInfo({ kind: 'teacher', rows });
        } else {
          setUserInfo(null);
        }
      } catch {
        if (alive) setUserInfo(null);
      } finally {
        if (alive) setUserInfoLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selectedUser]);

  const filtered = useMemo(() => {
    const q = search.trim();
    // Resolve which section_ids are in-scope for the applied filter so we can
    // compare each row in O(1) regardless of filter depth. When only a stage
    // or grade is picked, we expand to ALL sections inside it.
    let allowedSectionIds: Set<string> | null = null;
    if (appliedSection) {
      allowedSectionIds = new Set([appliedSection]);
    } else if (appliedGrade) {
      allowedSectionIds = new Set(
        structureSections.filter(s => s.grade_id === appliedGrade).map(s => s.id),
      );
    } else if (appliedStage) {
      const gradeIds = new Set(structureGrades.filter(g => g.stage_id === appliedStage).map(g => g.id));
      allowedSectionIds = new Set(
        structureSections.filter(s => gradeIds.has(s.grade_id)).map(s => s.id),
      );
    }

    const out = rows.filter(r => {
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (q && !searchMatch(r.name, q) && !searchMatch(r.phone, q)) return false;
      if (allowedSectionIds) {
        // Row matches if its section_id OR class_id is in scope. We accept
        // class_id too because the legacy schools wizard sometimes wrote the
        // section pick into enrollments.class_id (see comment in
        // openEditAssignments). Admins (no section) are always shown.
        if (r.role === 'admin') return true;
        const sid = r.section_id || r.class_id || null;
        if (!sid || !allowedSectionIds.has(sid)) return false;
      }
      return true;
    });
    // Default sort: newest first by stable position — `getInstituteUsersWithCodes`
    // returns rows in enrollment order. We keep alpha within role for predictability.
    const roleOrder = (role: string) => {
      if (role === 'admin' || role === 'institute') return 0;
      if (role === 'teacher') return 1;
      if (role === 'student') return 2;
      if (role === 'parent') return 3;
      return 4;
    };
    const sorted = [...out].sort((a, b) => {
      const r = roleOrder(a.role) - roleOrder(b.role);
      return r !== 0 ? r : (a.name || '').localeCompare(b.name || '', 'ar');
    });
    return sorted;
  }, [rows, search, roleFilter, appliedStage, appliedGrade, appliedSection, structureGrades, structureSections]);

  // Additional health signals shown in the hero subtitle:
  // - frozen users (need admin attention)
  // - users missing a phone number (incomplete profiles)
  const healthStats = useMemo(() => ({
    frozen: rows.filter(r => r.is_frozen).length,
    noPhone: rows.filter(r => !r.phone).length,
  }), [rows]);

  const counts = useMemo(() => ({
    all: rows.length,
    teacher: rows.filter(r => r.role === 'teacher').length,
    student: rows.filter(r => r.role === 'student').length,
    parent: rows.filter(r => r.role === 'parent').length,
  }), [rows]);

  // Login codes are write-only from this list. To rotate a user's code,
  // open the dedicated user-codes sheet from settings — that flow shows
  // the freshly generated code once and never again.

  const handleEditPhone = (row: Row) => {
    setSelectedUser(null);
    setPhoneEditUser(row);
    setPhoneEditValue(row.phone || '');
  };

  const handleSavePhone = async () => {
    if (!phoneEditUser) return;
    const clean = phoneEditValue.replace(/[^\d]/g, '');
    if (!clean) {
      setPhoneSaving(true);
      try {
        await api.saveUserPhone(phoneEditUser.id, '');
        setRows(prev => prev.map(r => r.id === phoneEditUser.id ? { ...r, phone: '' } : r));
        setPhoneEditUser(null);
      } catch (err: any) {
        Alert.alert('خطأ', err?.message || 'فشل الحفظ');
      } finally { setPhoneSaving(false); }
      return;
    }
    const normalized = /^7[3-9]\d{8}$/.test(clean) ? '0' + clean : clean;
    if (!/^07[3-9]\d{8}$/.test(normalized)) {
      Alert.alert('رقم غير صحيح', 'المطلوب: 07XXXXXXXXX (11 رقم يبدأ بـ 07)');
      return;
    }
    setPhoneSaving(true);
    try {
      await api.saveUserPhone(phoneEditUser.id, normalized);
      setRows(prev => prev.map(r => r.id === phoneEditUser.id ? { ...r, phone: normalized } : r));
      setPhoneEditUser(null);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل الحفظ');
    } finally { setPhoneSaving(false); }
  };

  const handleToggleFreeze = async (row: Row) => {
    if (row.role === 'admin' || row.id === userId) {
      Alert.alert('غير مسموح', 'لا يمكن تجميد حساب الإدارة من هنا');
      return;
    }
    setActionBusy('freeze');
    try {
      if (row.is_frozen) {
        await api.unfreezeUser(row.id);
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_frozen: false } : r));
        successAlert('تم إلغاء التجميد', `${row.name} يقدر يستخدم حسابه الآن`);
      } else {
        await api.freezeUser(row.id, userId || '');
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_frozen: true } : r));
        successAlert('تم التجميد', `${row.name} ما راح يكدر يدخل بحسابه`);
      }
      setSelectedUser(null);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل العملية');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDelete = (row: Row) => {
    if (row.role === 'admin' || row.id === userId) {
      Alert.alert('غير مسموح', 'لا يمكن حذف حساب الإدارة من هنا');
      return;
    }
    const roleAr = ROLE_LABEL[row.role] || row.role;
    const warn = row.role === 'teacher'
      ? `سيتم حذف ${row.name} (${roleAr}) نهائياً مع كل بياناته. لا يمكن التراجع.`
      : `سيتم حذف ${row.name} (${roleAr}) نهائياً مع كل بياناته (الدرجات، الحضور، الرسائل…). لا يمكن التراجع.`;
    confirmAlert(
      'تأكيد الحذف',
      warn,
      async () => {
        setActionBusy('delete');
        try {
          if (!userInstituteId) {
            throw new Error('المؤسسة غير محددة');
          }
          await api.deleteUser(row.id, userId || undefined, row.name, row.role, userInstituteId);
          setRows(prev => prev.filter(r => r.id !== row.id));
          setSelectedUser(null);
          successAlert('تم الحذف', `تم حذف ${row.name}`);
        } catch (err: any) {
          Alert.alert('خطأ', err?.message || 'فشل الحذف');
        } finally {
          setActionBusy(null);
        }
      },
      true,
      'حذف نهائي',
    );
  };

  // ── Edit teacher assignments (admin-only, any time) ──────────────────────
  // Open the editor with the teacher's existing assignments pre-loaded.
  // Fetches classes + subjects fresh (can't rely on state being flushed
  // mid-async) and seeds `classes`/`subjects` so the picker chips render.
  const openEditAssignments = async (row: Row) => {
    setSelectedUser(null);
    if (row.role !== 'teacher') return;
    setEditTeacher(row);
    setEditAssignments([]);
    setEditStructure({ stages: [], grades: [], sections: [] });
    setEditLoading(true);
    try {
      if (!userInstituteId) throw new Error('المؤسسة غير محددة');
      // Fetch everything fresh — can't rely on `classes`/`subjects` state + parsedSchool
      // useMemo because they won't be flushed within this same async flow.
      // For schools we additionally pull the normalized school structure (stages/grades/sections)
      // so the new hierarchical AssignmentSheet has real data to walk through.
      const [clsRaw, subsRaw, existing, structure] = await Promise.all([
        api.getClassesByInstitute(userInstituteId),
        api.getSubjects(userInstituteId).catch(() => []),
        api.getTeacherAssignments(row.id),
        api.getSchoolStructure(userInstituteId).catch(() => ({ stages: [], grades: [], sections: [], subjects: [] })),
      ]);
      const clsList = (clsRaw || []).map((c: any) => ({ id: c.id, name: c.name }));
      const subsList = (subsRaw || []).map((s: any) => ({ id: s.id, name: s.name }));
      setClasses(clsList);
      setSubjects(subsList);
      setEditStructure({
        stages: ((structure as any).stages || []) as any,
        grades: ((structure as any).grades || []) as any,
        sections: ((structure as any).sections || []) as any,
      });

      // School wizard convention: the chosen class.id is saved into teacher_assignments.section_id.
      // So lookups below treat `section_id ?? class_id` as the class ID for both display and edit.
      const parsedLocal: ParsedClass[] = instType === 'school'
        ? (clsList.map(c => parseClassName(c)).filter(Boolean) as ParsedClass[])
        : [];

      const grouped = new Map<string, { subjectId: string; subjectName: string; gradeKey: string; gradeLabel: string; classIds: string[] }>();
      for (const a of (existing as any[]) || []) {
        if (!a.subject_id) continue;
        const subjId: string = a.subject_id;
        // Look up subject name from our own list — avoids relying on nested-join `subjects` FK
        // which may not be defined in every deployment.
        const subjName: string = subsList.find(s => s.id === subjId)?.name || a.subjects?.name || '';

        const cid: string | null = a.section_id || a.class_id || null;

        let gradeKey = '';
        let gradeLabel = '';
        if (instType === 'school' && cid) {
          const parsed = parsedLocal.find(p => p.id === cid);
          if (parsed) {
            gradeKey = `${parsed.stage}||${parsed.grade}`;
            gradeLabel = `${parsed.grade} ${parsed.stage}`;
          }
        }

        const key = `${subjId}||${gradeKey}`;
        if (!grouped.has(key)) {
          grouped.set(key, { subjectId: subjId, subjectName: subjName, gradeKey, gradeLabel, classIds: [] });
        }
        const entry = grouped.get(key)!;
        if (cid && !entry.classIds.includes(cid)) entry.classIds.push(cid);
      }
      setEditAssignments(Array.from(grouped.values()));
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تحميل التعيينات');
      setEditTeacher(null);
    } finally {
      setEditLoading(false);
    }
  };

  // Called when the hierarchical AssignmentSheet confirms a single pick.
  // We dedupe so that if the same (subject + grade) row already exists, the new
  // section_id (or class_id for institutes) is merged into its `classIds` list
  // instead of creating a duplicate row in the teacher's assignment table.
  const handleAssignmentPicked = useCallback((picked: PickedAssignment) => {
    setEditAssignments(prev => {
      const targetClassId = picked.sectionId || picked.classId;
      if (!targetClassId) return prev;
      // School: key by subject + grade so multiple sections of the same grade roll up.
      // Institute: each pick is its own row (no grade hierarchy).
      const gradeKey = picked.stageId && picked.gradeId ? `${picked.stageName}||${picked.gradeName}` : '';
      const gradeLabel = picked.gradeName && picked.stageName ? `${picked.gradeName} ${picked.stageName}` : '';
      const existingIdx = prev.findIndex(a => a.subjectId === picked.subjectId && a.gradeKey === gradeKey);
      if (existingIdx >= 0) {
        // Merge — but only if this class isn't already in the row.
        const existing = prev[existingIdx];
        if (existing.classIds.includes(targetClassId)) return prev;
        const updated = { ...existing, classIds: [...existing.classIds, targetClassId] };
        const next = [...prev];
        next[existingIdx] = updated;
        return next;
      }
      return [...prev, {
        subjectId: picked.subjectId,
        subjectName: picked.subjectName,
        gradeKey,
        gradeLabel,
        classIds: [targetClassId],
      }];
    });
  }, []);

  // ── Open student grade/section editor ──────────────────────────────────
  const openEditStudent = async (row: Row) => {
    setSelectedUser(null);
    if (row.role !== 'student' || !userInstituteId) return;
    setEditStudent(row);
    setEditStudentLoading(true);
    setStudentStages([]); setStudentGrades([]); setStudentSections([]);
    setStudentPickStage(null); setStudentPickGrade(null); setStudentPickSection(null);
    try {
      const [structure, current] = await Promise.all([
        api.getSchoolStructure(userInstituteId),
        api.getStudentSection(row.id).catch(() => null),
      ]);
      const stg = (structure.stages || []) as any[];
      const grd = (structure.grades || []) as any[];
      const sec = (structure.sections || []) as any[];
      setStudentStages(stg);
      setStudentGrades(grd);
      setStudentSections(sec);
      const curGradeId = (current as any)?.grade_id || null;
      const curSectionId = (current as any)?.section_id || null;
      setStudentCurrentGrade(curGradeId);
      setStudentCurrentSection(curSectionId);
      // Pre-select the current values so admin can see them and change selectively
      if (curGradeId) {
        const g = grd.find(x => x.id === curGradeId);
        if (g) setStudentPickStage(g.stage_id);
        setStudentPickGrade(curGradeId);
      }
      if (curSectionId) setStudentPickSection(curSectionId);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تحميل بيانات الصفوف');
      setEditStudent(null);
    } finally {
      setEditStudentLoading(false);
    }
  };

  const saveEditStudent = async () => {
    if (!editStudent || !userInstituteId) return;
    if (!studentPickGrade || !studentPickSection) {
      Alert.alert('تنبيه', 'اختر الصف والشعبة');
      return;
    }
    if (studentPickGrade === studentCurrentGrade && studentPickSection === studentCurrentSection) {
      Alert.alert('تنبيه', 'الطالب موجود حالياً بنفس الصف والشعبة');
      return;
    }
    setEditStudentSaving(true);
    try {
      await api.transferStudentToSection(editStudent.id, userInstituteId, studentPickGrade, studentPickSection);
      successAlert('تم النقل', `تم نقل ${editStudent.name} إلى الصف الجديد`);
      setEditStudent(null);
      await load();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل نقل الطالب');
    } finally {
      setEditStudentSaving(false);
    }
  };

  const saveEditAssignments = async () => {
    if (!editTeacher || !userInstituteId) return;
    setEditSaving(true);
    try {
      const flat: Array<{ subjectId: string; sectionId?: string; classId?: string }> = [];
      for (const a of editAssignments) {
        if (a.classIds.length > 0) {
          for (const cid of a.classIds) {
            if (instType === 'school') flat.push({ subjectId: a.subjectId, sectionId: cid });
            else flat.push({ subjectId: a.subjectId, classId: cid });
          }
        } else {
          flat.push({ subjectId: a.subjectId });
        }
      }
      await api.setTeacherAssignments(editTeacher.id, userInstituteId, flat);
      successAlert('تم الحفظ', `تم تحديث تعيينات ${editTeacher.name}`);
      setEditTeacher(null);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل الحفظ');
    } finally {
      setEditSaving(false);
    }
  };

  // ── T1: reveal/hide and reset login code helpers ─────────────────────────
  // Tapping the eye toggles reveal; we fetch the plaintext code lazily on
  // first reveal so we don't pre-load every code into memory. Mask = '••••••'.
  const handleToggleRevealCode = useCallback(async (row: Row) => {
    if (revealedCodeUserId === row.id) {
      setRevealedCodeUserId(null);
      return;
    }
    setRevealedCodeUserId(row.id);
    if (!revealedCodes[row.id]) {
      const code = await api.getUserPlainCode(row.id);
      if (code) {
        setRevealedCodes(prev => ({ ...prev, [row.id]: code }));
      }
    }
  }, [revealedCodeUserId, revealedCodes]);

  // Open the reset-code prompt. On iOS we use the native Alert.prompt; on
  // Android (no prompt support) we fall back to the inline modal driven by
  // `resetCodeUser` state. Either path ends in `confirmResetCode`.
  const handleOpenResetCode = useCallback((row: Row) => {
    if (Platform.OS === 'ios' && (Alert as any).prompt) {
      (Alert as any).prompt(
        'إعادة تعيين الرمز',
        `الرمز الجديد للحساب: ${row.name}\n(٦ أحرف على الأقل، حروف وأرقام)`,
        [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'حفظ',
            onPress: async (input?: string) => {
              const cleaned = (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (cleaned.length < 6) {
                Alert.alert('خطأ', 'الرمز قصير جداً — ٦ أحرف على الأقل');
                return;
              }
              await confirmResetCode(row, cleaned);
            },
          },
        ],
        'plain-text',
        '',
      );
    } else {
      setResetCodeUser(row);
      setResetCodeValue('');
    }
  }, []);

  // Performs the actual code rotation. Updates the revealed-codes cache so
  // the new code shows up the next time admin taps the eye.
  const confirmResetCode = useCallback(async (row: Row, newCode: string) => {
    setResetCodeSaving(true);
    try {
      const res: any = await api.resetUserCode(row.id, newCode);
      const finalCode = (res?.newCode || newCode).toUpperCase();
      setRevealedCodes(prev => ({ ...prev, [row.id]: finalCode }));
      setRevealedCodeUserId(row.id);
      setResetCodeUser(null);
      setResetCodeValue('');
      successAlert('تم تغيير الرمز', `الرمز الجديد لـ ${row.name}: ${finalCode}`);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تغيير الرمز');
    } finally {
      setResetCodeSaving(false);
    }
  }, []);

  // ── T2: auto-collapse the search bar 1s after input is emptied ────────────
  useEffect(() => {
    if (!searchExpanded) return;
    if (search.length > 0) return;
    const t = setTimeout(() => {
      // Re-check inside the timer in case the user typed during the wait.
      if (search.length === 0) setSearchExpanded(false);
    }, 1000);
    return () => clearTimeout(t);
  }, [search, searchExpanded]);

  // ── T4: load school structure (stages/grades/sections) for the filter sheet.
  // Reuses the same source as the existing teacher/student editors so we don't
  // double-fetch. Triggered lazily — only when the admin opens the sheet.
  const openStructFilter = useCallback(async () => {
    haptics.light();
    setShowStructFilter(true);
    // Seed the in-sheet pickers with the currently applied selection so the
    // admin can refine without re-picking from scratch.
    setStructFilterStage(appliedStage);
    setStructFilterGrade(appliedGrade);
    setStructFilterSection(appliedSection);
    if (structureStages.length > 0 || !userInstituteId) return;
    setStructureLoading(true);
    try {
      const s = await api.getSchoolStructure(userInstituteId);
      setStructureStages(((s as any).stages || []) as any);
      setStructureGrades(((s as any).grades || []) as any);
      setStructureSections(((s as any).sections || []) as any);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تحميل البنية');
    } finally {
      setStructureLoading(false);
    }
  }, [userInstituteId, appliedStage, appliedGrade, appliedSection, structureStages.length]);

  const applyStructFilter = useCallback(() => {
    setAppliedStage(structFilterStage);
    setAppliedGrade(structFilterGrade);
    setAppliedSection(structFilterSection);
    setShowStructFilter(false);
  }, [structFilterStage, structFilterGrade, structFilterSection]);

  const resetStructFilter = useCallback(() => {
    setStructFilterStage(null);
    setStructFilterGrade(null);
    setStructFilterSection(null);
    setAppliedStage(null);
    setAppliedGrade(null);
    setAppliedSection(null);
  }, []);

  const structFilterLabel = useMemo(() => {
    if (!appliedStage && !appliedGrade && !appliedSection) return null;
    const stage = structureStages.find(s => s.id === appliedStage);
    const grade = structureGrades.find(g => g.id === appliedGrade);
    const section = structureSections.find(s => s.id === appliedSection);
    return [stage?.name, grade?.name, section?.name].filter(Boolean).join(' · ') || null;
  }, [appliedStage, appliedGrade, appliedSection, structureStages, structureGrades, structureSections]);

  // ── Derived UI strings (memoized; no business effect) ─────────────────────
  // The section label changes depending on whether filters are active so the
  // user always knows which subset they're looking at.
  const sectionLabel = useMemo(() => {
    if (loading) return '';
    const total = rows.length;
    const shown = filtered.length;
    if (roleFilter === 'all' && !search.trim()) {
      return total > 0 ? `كل المستخدمين · ${total}` : '';
    }
    if (search.trim()) return `نتائج البحث · ${shown}`;
    const roleName = roleFilter === 'student' ? 'الطلاب'
      : roleFilter === 'teacher' ? 'الأساتذة'
      : roleFilter === 'parent' ? 'أولياء الأمور'
      : '';
    return `${roleName} · ${shown}`;
  }, [loading, rows.length, filtered.length, roleFilter, search]);

  const emptyCopy = useMemo(() => {
    if (search.trim()) {
      return {
        icon: 'search-outline' as const,
        title: 'لا نتائج مطابقة',
        message: 'جرّب كلمة بحث أخرى أو امسح المرشحات',
      };
    }
    switch (roleFilter) {
      case 'student':
        return { icon: 'school-outline' as const, title: 'لا يوجد طلاب بعد', message: 'أضف أول طالب لتبدأ' };
      case 'teacher':
        return { icon: 'briefcase-outline' as const, title: 'لا يوجد أساتذة بعد', message: 'أضف أول أستاذ لتبدأ' };
      case 'parent':
        return { icon: 'people-outline' as const, title: 'لا يوجد أولياء أمور بعد', message: 'أولياء الأمور يُضافون عند إضافة الطلاب' };
      default:
        return { icon: 'person-add-outline' as const, title: 'لا يوجد مستخدمون بعد', message: 'ابدأ ببناء قاعدة مستخدمي المؤسسة' };
    }
  }, [search, roleFilter]);

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="المستخدمون"
        subtitle={
          loading
            ? 'جاري التحميل…'
            : rows.length === 0
              ? 'لا يوجد مستخدمون بعد'
              : `${rows.length} حساب${healthStats.frozen > 0 ? ` · ${healthStats.frozen} مجمّد` : ''}${healthStats.noPhone > 0 ? ` · ${healthStats.noPhone} بدون رقم` : ''}`
        }
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
      />

      {/* === Stats overview: 4 tappable role tiles, each tile filters the list === */}
      <View style={styles.heroStatsCard}>
        {([
          { k: 'all',     label: 'المجموع', count: counts.all,     icon: 'people',         tint: dtokens.color.brand500, bg: dtokens.color.brand100 },
          { k: 'student', label: 'طلاب',    count: counts.student, icon: 'person',         tint: dtokens.color.teal600,  bg: dtokens.color.teal100  },
          { k: 'teacher', label: 'أساتذة',  count: counts.teacher, icon: 'school',         tint: '#1D4ED8',              bg: '#DBEAFE'              },
          { k: 'parent',  label: 'أولياء',  count: counts.parent,  icon: 'people-circle',  tint: dtokens.color.p600,     bg: dtokens.color.p100     },
        ] as const).map((s, idx) => {
          const active = roleFilter === s.k;
          return (
            <React.Fragment key={s.k}>
              {idx > 0 && <View style={styles.statTileDivider} />}
              <TouchableOpacity
                style={[styles.statTile, active && { backgroundColor: s.bg }]}
                onPress={() => { haptics.selection(); setRoleFilter(s.k as Role); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${s.label}: ${s.count}`}
              >
                <View style={[styles.statTileIcon, { backgroundColor: s.bg, borderColor: active ? s.tint : 'transparent' }]}>
                  <Ionicons name={s.icon as any} size={18} color={s.tint} />
                </View>
                <Text style={[styles.statTileValue, { color: s.tint }]}>{s.count}</Text>
                <Text style={styles.statTileLabel}>{s.label}</Text>
                {active && <View style={[styles.statTileActiveDot, { backgroundColor: s.tint }]} />}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>

      {/* === Compact toolbar (T2 + T3 + T4): collapsed search icon + structure filter button.
          Expanded: full-width search input that auto-collapses 1s after empty. === */}
      <View style={styles.toolbar}>
        {searchExpanded ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={dtokens.color.text3} style={styles.searchIcon} />
            <TextInput
              ref={searchInputRef}
              value={search} onChangeText={setSearch}
              placeholder="ابحث بالاسم أو الرقم"
              placeholderTextColor={dtokens.color.text3}
              style={styles.searchInput} textAlign="right"
              autoFocus
            />
            {search.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearch('')}
                style={styles.searchClearBtn}
                accessibilityLabel="مسح البحث"
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={dtokens.color.text3} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => { setSearchExpanded(false); }}
                style={styles.searchClearBtn}
                accessibilityLabel="إغلاق البحث"
                hitSlop={8}
              >
                <Ionicons name="close" size={16} color={dtokens.color.text3} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => { haptics.light(); setSearchExpanded(true); }}
            style={styles.searchIconBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="فتح البحث"
          >
            <Ionicons name="search" size={18} color={dtokens.color.text2} />
          </TouchableOpacity>
        )}

        {/* T4: stage/grade/section filter trigger */}
        <TouchableOpacity
          onPress={openStructFilter}
          style={[styles.toolbarBtn, structFilterLabel && styles.toolbarBtnActive]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="فلترة حسب المرحلة والصف والشعبة"
        >
          <Ionicons name="filter" size={14} color={structFilterLabel ? dtokens.color.brand500 : dtokens.color.text2} />
          <Text style={[styles.toolbarBtnText, structFilterLabel && { color: dtokens.color.brand500 }]} numberOfLines={1}>
            {structFilterLabel || 'الصف/الشعبة'}
          </Text>
          {structFilterLabel ? (
            <Ionicons name="checkmark-circle" size={12} color={dtokens.color.brand500} />
          ) : (
            <Ionicons name="chevron-down" size={12} color={dtokens.color.text3} />
          )}
        </TouchableOpacity>

        {(roleFilter !== 'all' || search.trim().length > 0 || structFilterLabel) ? (
          <TouchableOpacity
            onPress={() => { haptics.light(); setRoleFilter('all'); setSearch(''); resetStructFilter(); }}
            style={styles.toolbarClearBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle" size={13} color={dtokens.color.warning} />
            <Text style={styles.toolbarClearText}>مسح</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
          <SkeletonList count={5} cardHeight={78} />
        </View>
      ) : loadError ? (
        <ErrorState
          title="تعذّر تحميل المستخدمين"
          message={loadError}
          retryLabel="إعادة المحاولة"
          onRetry={async () => {
            setLoadError(null);
            setLoading(true);
            if (!userInstituteId && userId) await detectInstitute(userId);
            await load();
          }}
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 110, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={dtokens.color.brand500} />}
        >
          {filtered.length === 0 ? (
            <View style={{ paddingTop: 12 }}>
              <EmptyState
                icon={emptyCopy.icon}
                title={emptyCopy.title}
                message={emptyCopy.message}
                actionLabel={!search.trim() ? 'إضافة حساب' : undefined}
                onAction={!search.trim() ? () => { haptics.medium(); setShowAddSheet(true); } : undefined}
              />
            </View>
          ) : (
            <>
              {/* Section label with accent bar — clarifies which subset is shown */}
              {sectionLabel ? (
                <View style={styles.sectionLabelRow}>
                  <View style={styles.sectionLabelDot} />
                  <Text style={styles.sectionLabel}>{sectionLabel}</Text>
                  <View style={styles.sectionLabelBar} />
                </View>
              ) : null}

              {filtered.map(r => {
                const pillBg = ROLE_BG[r.role] || { bg: dtokens.color.surface2, text: dtokens.color.text2 };
                const accent = ROLE_ACCENT[r.role] || dtokens.color.brand500;
                const initial = (r.name || '؟').trim().charAt(0);
                const codeRevealed = revealedCodeUserId === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.85}
                    onPress={() => { haptics.light(); setSelectedUser(r); }}
                    onLongPress={() => { haptics.medium(); setSelectedUser(r); }}
                    delayLongPress={350}
                    style={[styles.card, r.is_frozen && styles.cardFrozen]}
                  >
                    {/* Right-edge role accent bar (RTL-correct visual hierarchy) */}
                    <View style={[styles.cardAccent, { backgroundColor: accent }]} />

                    {/* RTL row: avatar on the right, content middle, actions on the left */}
                    <View style={styles.cardRow}>
                      {/* Left side: WhatsApp + 3-dot menu (clearer affordance than chevron) */}
                      <View style={styles.cardLeftActions}>
                        <WhatsAppButton phone={r.phone} />
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation?.();
                            haptics.light();
                            setSelectedUser(r);
                          }}
                          hitSlop={8}
                          style={styles.cardMoreBtn}
                          accessibilityLabel="مزيد من الإجراءات"
                          accessibilityRole="button"
                        >
                          <Ionicons name="ellipsis-vertical" size={18} color={dtokens.color.text2} />
                        </TouchableOpacity>
                      </View>

                      {/* Middle: name + meta */}
                      <View style={styles.cardBody}>
                        {/* Top row: name + role pill + frozen badge (RTL: name reads right→left) */}
                        <View style={styles.nameRow}>
                          <Text style={styles.name} numberOfLines={1}>{r.name || '—'}</Text>
                          <View style={[styles.rolePill, { backgroundColor: pillBg.bg }]}>
                            <Text style={[styles.rolePillText, { color: pillBg.text }]}>{ROLE_LABEL[r.role] || r.role}</Text>
                          </View>
                          {r.is_frozen && (
                            <View style={styles.frozenBadge}>
                              <Ionicons name="snow" size={10} color={dtokens.color.warning} />
                              <Text style={styles.frozenBadgeText}>مجمّد</Text>
                            </View>
                          )}
                        </View>

                        {/* Meta row: code reveal pill + reset-code key + phone (T1: split key+eye) */}
                        <View style={styles.metaRow}>
                          {/* Eye: toggles reveal/hide. Shows the fetched plaintext (or '••••••' until fetched). */}
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation?.();
                              haptics.light();
                              handleToggleRevealCode(r);
                            }}
                            style={[styles.metaPill, codeRevealed && { backgroundColor: dtokens.color.brand100, borderColor: dtokens.color.brand500 }]}
                            accessibilityLabel={codeRevealed ? 'إخفاء الرمز' : 'إظهار الرمز'}
                          >
                            <Ionicons
                              name={codeRevealed ? 'eye-off-outline' : 'eye-outline'}
                              size={11}
                              color={codeRevealed ? dtokens.color.brand500 : dtokens.color.text2}
                            />
                            <Text style={[styles.metaPillText, codeRevealed && { color: dtokens.color.brand500, letterSpacing: 1.5 }]}>
                              {codeRevealed ? (revealedCodes[r.id] || r.code || '••••••') : '••••••'}
                            </Text>
                          </TouchableOpacity>
                          {/* Key: opens the reset-code prompt for this user. */}
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation?.();
                              haptics.light();
                              handleOpenResetCode(r);
                            }}
                            style={styles.metaPill}
                            accessibilityLabel="إعادة تعيين الرمز"
                            accessibilityRole="button"
                          >
                            <Ionicons name="key-outline" size={11} color={dtokens.color.text2} />
                            <Text style={styles.metaPillText}>تغيير</Text>
                          </TouchableOpacity>
                          {r.phone ? (
                            <View style={styles.metaPill}>
                              <Ionicons name="call-outline" size={11} color={dtokens.color.text2} />
                              <Text style={styles.metaPillText} numberOfLines={1}>{r.phone}</Text>
                            </View>
                          ) : (
                            <View style={[styles.metaPill, { backgroundColor: dtokens.color.warningBg, borderColor: dtokens.color.warningBg }]}>
                              <Ionicons name="alert-circle-outline" size={11} color={dtokens.color.warning} />
                              <Text style={[styles.metaPillText, { color: dtokens.color.warning }]}>بدون رقم</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Right: avatar with role-tinted ring */}
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          if (avatars[r.id]) setPreviewUrl(avatars[r.id]);
                          else setSelectedUser(r);
                        }}
                        style={[styles.avatar, { backgroundColor: pillBg.bg, borderColor: accent + '55', overflow: 'hidden' }]}
                        accessibilityLabel={`صورة ${r.name}`}
                      >
                        {avatars[r.id] ? (
                          <Image source={{ uri: avatars[r.id] }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <Text style={[styles.avatarInitial, { color: accent }]}>{initial}</Text>
                        )}
                      </Pressable>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity onPress={() => { haptics.medium(); setShowAddSheet(true); }} style={styles.fab} activeOpacity={0.9}>
        <LinearGradient
          colors={[dtokens.color.brand900, dtokens.color.brand500] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Ionicons name="person-add" size={22} color="#fff" />
          <Text style={styles.fabText}>إضافة</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Add action sheet — pick single vs bulk */}
      <SwipeableSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} maxHeight={0.45}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={styles.sheetTitle}>كيف تريد إضافة المستخدمين؟</Text>
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => { setShowAddSheet(false); setShowWizard(true); }}
          >
            <Ionicons name="person-add" size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowTitle}>حساب واحد</Text>
              <Text style={styles.sheetRowSub}>معالج خطوة بخطوة — الدور، البيانات، الربط</Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => { setShowAddSheet(false); setShowBulk(true); }}
          >
            <Ionicons name="cloud-upload" size={20} color="#8B5CF6" />
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowTitle}>جماعي (Excel)</Text>
              <Text style={styles.sheetRowSub}>ارفع ملف Excel لإنشاء عدة حسابات دفعة واحدة</Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </SwipeableSheet>

      {/* New account wizard */}
      {userInstituteId && (
        <CreateAccountWizard
          visible={showWizard}
          onClose={() => setShowWizard(false)}
          onCreated={() => { load(); }}
          instituteId={userInstituteId}
          instituteType={instType}
          callerUserId={userId || ''}
        />
      )}

      {/* Bulk users sheet */}
      {userInstituteId && (
        <SwipeableSheet visible={showBulk} onClose={() => { setShowBulk(false); load(); }} maxHeight={0.95}>
          <View style={{ height: SCREEN_HEIGHT * 0.85, backgroundColor: Colors.background }}>
            <View style={styles.bulkHeader}>
              <TouchableOpacity onPress={() => { setShowBulk(false); load(); }} style={styles.bulkBackBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.bulkHeaderTitle}>إنشاء حسابات جماعية</Text>
              <View style={{ width: 40 }} />
            </View>
            <BulkUsersWizard
              institutionId={userInstituteId}
              institutionName={instName}
              institutionType={instType}
            />
          </View>
        </SwipeableSheet>
      )}

      {/* Action sheet */}
      <SwipeableSheet visible={!!selectedUser} onClose={() => setSelectedUser(null)} maxHeight={0.7}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {selectedUser && (
            <>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.sheetTitle}>{selectedUser.name}</Text>
                  <Text style={styles.sheetSubtitle}>{ROLE_LABEL[selectedUser.role] || selectedUser.role}</Text>
                </View>
                <Pressable
                  onPress={() => { if (avatars[selectedUser.id]) setPreviewUrl(avatars[selectedUser.id]); }}
                  style={[styles.avatar, { backgroundColor: (ROLE_BG[selectedUser.role] || { bg: '#F1F5F9' }).bg, width: 48, height: 48, borderRadius: 24, overflow: 'hidden' }]}
                >
                  {avatars[selectedUser.id] ? (
                    <Image source={{ uri: avatars[selectedUser.id] }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Ionicons name="person" size={22} color={(ROLE_BG[selectedUser.role] || { text: Colors.textMuted }).text} />
                  )}
                </Pressable>
              </View>

              {/* Enrollment / assignment info — what class / section / subjects the user is in */}
              {(selectedUser.role === 'student' || selectedUser.role === 'teacher') && (
                <View style={styles.infoBox}>
                  {userInfoLoading ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : userInfo?.kind === 'student' ? (
                    userInfo.gradeName || userInfo.sectionName || userInfo.classNames.length > 0 ? (
                      <View style={{ gap: 8 }}>
                        {(userInfo.gradeName || userInfo.sectionName) && (
                          <View style={styles.infoRow}>
                            <Ionicons name="school" size={16} color="#0D9488" />
                            <Text style={styles.infoText} numberOfLines={2}>
                              {[userInfo.gradeName, userInfo.sectionName].filter(Boolean).join(' — ')}
                            </Text>
                          </View>
                        )}
                        {userInfo.classNames.length > 0 && (
                          <View style={styles.infoRow}>
                            <Ionicons name="people" size={16} color="#1D4ED8" />
                            <Text style={styles.infoText} numberOfLines={3}>
                              {userInfo.classNames.join(' · ')}
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.infoEmpty}>الطالب غير مرتبط بصف أو شعبة بعد</Text>
                    )
                  ) : userInfo?.kind === 'teacher' ? (
                    userInfo.rows.length > 0 ? (
                      <View style={{ gap: 6 }}>
                        {userInfo.rows.map((r, i) => (
                          <View key={i} style={styles.infoRow}>
                            <Ionicons name="book" size={14} color="#0D9488" />
                            <Text style={styles.infoText} numberOfLines={2}>
                              {r.subject || '—'}{r.display ? ` · ${r.display}` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.infoEmpty}>الأستاذ غير مُعيَّن لأي مادة أو صف بعد</Text>
                    )
                  ) : null}
                </View>
              )}

              <TouchableOpacity style={styles.sheetRow} onPress={() => handleEditPhone(selectedUser)}>
                <Ionicons name="call" size={20} color={Colors.primary} />
                <Text style={styles.sheetRowText}>تعديل رقم الهاتف</Text>
              </TouchableOpacity>

              {selectedUser.role === 'teacher' && (
                <TouchableOpacity style={styles.sheetRow} onPress={() => openEditAssignments(selectedUser)}>
                  <Ionicons name="book" size={20} color="#0D9488" />
                  <Text style={[styles.sheetRowText, { color: '#0D9488' }]}>إدارة المواد والصفوف</Text>
                </TouchableOpacity>
              )}

              {selectedUser.role === 'student' && instType === 'school' && (
                <TouchableOpacity style={styles.sheetRow} onPress={() => openEditStudent(selectedUser)}>
                  <Ionicons name="school" size={20} color="#0D9488" />
                  <Text style={[styles.sheetRowText, { color: '#0D9488' }]}>إدارة الصف والشعبة</Text>
                </TouchableOpacity>
              )}

              {/* Freeze/delete buttons hidden for admin accounts and the viewer's
                  own row — those actions aren't allowed here. No banner shown. */}
              {selectedUser.role !== 'admin' && selectedUser.id !== userId && (
                <>
                  <TouchableOpacity
                    style={styles.sheetRow}
                    onPress={() => handleToggleFreeze(selectedUser)}
                    disabled={actionBusy === 'freeze'}
                  >
                    {actionBusy === 'freeze' ? (
                      <ActivityIndicator size="small" color="#F97316" />
                    ) : (
                      <Ionicons name={selectedUser.is_frozen ? 'sunny' : 'snow'} size={20} color="#F97316" />
                    )}
                    <Text style={[styles.sheetRowText, { color: '#F97316' }]}>
                      {selectedUser.is_frozen ? 'إلغاء التجميد' : 'تجميد الحساب'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.sheetRow, styles.sheetRowDanger]}
                    onPress={() => handleDelete(selectedUser)}
                    disabled={actionBusy === 'delete'}
                  >
                    {actionBusy === 'delete' ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <Ionicons name="trash" size={20} color="#DC2626" />
                    )}
                    <Text style={[styles.sheetRowText, { color: '#DC2626' }]}>حذف الحساب</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity style={[styles.sheetRow, { justifyContent: 'center', marginTop: 6 }]} onPress={() => setSelectedUser(null)}>
                <Text style={styles.sheetRowText}>إلغاء</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SwipeableSheet>

      {/* Phone edit modal */}
      <SwipeableSheet visible={!!phoneEditUser} onClose={() => setPhoneEditUser(null)} maxHeight={0.5}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={styles.modalTitle}>تحديث رقم الهاتف</Text>
          {phoneEditUser && <Text style={styles.modalSubtitle}>{phoneEditUser.name}</Text>}
          <TextInput
            value={phoneEditValue} onChangeText={setPhoneEditValue}
            keyboardType="phone-pad" placeholder="07XXXXXXXXX"
            placeholderTextColor={Colors.textMuted}
            style={styles.modalInput} textAlign="right" autoFocus
          />
          <Text style={styles.modalHint}>11 رقم يبدأ بـ 07 — اترك الحقل فارغاً للحذف</Text>
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={() => setPhoneEditUser(null)} style={[styles.modalBtn, styles.modalBtnGhost]} disabled={phoneSaving}>
              <Text style={styles.modalBtnGhostText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSavePhone} style={[styles.modalBtn, styles.modalBtnPrimary, phoneSaving && { opacity: 0.6 }]} disabled={phoneSaving}>
              {phoneSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnPrimaryText}>حفظ</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SwipeableSheet>

      {/* Edit teacher assignments sheet — admin-only full control */}
      <SwipeableSheet visible={!!editTeacher} onClose={() => { if (!editSaving) setEditTeacher(null); }} maxHeight={0.95}>
        {/* Fixed height so the sheet stays tall even while editLoading is true.
            Without this, `flex: 1` collapses to ~spinner height because parent uses maxHeight only. */}
        <View style={{ height: SCREEN_HEIGHT * 0.85, backgroundColor: Colors.background }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setEditTeacher(null)} style={styles.iconBtn} disabled={editSaving}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>المواد والصفوف</Text>
            <View style={{ width: 40 }} />
          </View>

          {editLoading ? (
            <View style={{ padding: 16 }}>
              <SkeletonList count={5} cardHeight={56} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}>
              {editTeacher && (
                <View style={{ backgroundColor: '#EEF2FF', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="school" size={20} color={Colors.primary} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' }}>
                    {editTeacher.name}
                  </Text>
                </View>
              )}

              {editAssignments.length === 0 ? (
                <Text style={styles.warn}>لا توجد تعيينات — أضف تعييناً جديداً بالأسفل</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>التعيينات الحالية</Text>
                  {editAssignments.map((a, i) => (
                    <View key={i} style={styles.assignmentRow}>
                      <TouchableOpacity onPress={() => setEditAssignments(p => p.filter((_, idx) => idx !== i))}>
                        <Ionicons name="close-circle" size={20} color="#DC2626" />
                      </TouchableOpacity>
                      <Text style={styles.assignmentText} numberOfLines={2}>
                        {a.subjectName}{a.gradeLabel ? ` — ${a.gradeLabel}` : ''}
                        {a.classIds.length > 0 ? ` — ${a.classIds.length} ${instType === 'school' ? 'شعبة' : 'كروب'}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {subjects.length === 0 && (
                <Text style={styles.warn}>⚠️ لا توجد مواد — أضفها من "إدارة الصفوف" أولاً</Text>
              )}

              {/* Hierarchical picker entry point — replaces the previous flat
                  dropdown form. Tapping opens AssignmentSheet which walks the
                  admin through stage → grade → section → subject (or
                  class → subject for institutes). */}
              <TouchableOpacity
                onPress={() => { haptics.medium(); setShowAssignmentSheet(true); }}
                style={[styles.addAsn, subjects.length === 0 && { opacity: 0.4 }]}
                disabled={subjects.length === 0}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={styles.addAsnText}>إضافة تعيين</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={saveEditAssignments}
                disabled={editSaving}
                activeOpacity={0.85}
                style={{ marginTop: 10 }}
              >
                <LinearGradient colors={['#020024', '#2F2FBA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submit}>
                  {editSaving ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="save" size={20} color="#fff" />
                      <Text style={styles.submitText}>حفظ التعديلات</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </SwipeableSheet>

      {/* Hierarchical picker for adding ONE assignment. Renders ABOVE the
          edit-teacher sheet so the new sheet sits on top. Confirming a pick
          merges it into editAssignments via handleAssignmentPicked. */}
      <AssignmentSheet
        visible={showAssignmentSheet}
        onClose={() => setShowAssignmentSheet(false)}
        onPicked={handleAssignmentPicked}
        instituteType={instType}
        stages={editStructure.stages}
        grades={editStructure.grades}
        sections={editStructure.sections}
        subjects={subjects}
        classes={classes}
        teacherName={editTeacher?.name || null}
      />

      {/* Edit student grade/section — admin moves a student to another grade/section */}
      <SwipeableSheet visible={!!editStudent} onClose={() => { if (!editStudentSaving) setEditStudent(null); }} maxHeight={0.92}>
        <View style={{ height: SCREEN_HEIGHT * 0.82, backgroundColor: Colors.background }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setEditStudent(null)} style={styles.iconBtn} disabled={editStudentSaving}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>الصف والشعبة</Text>
            <View style={{ width: 40 }} />
          </View>

          {editStudentLoading ? (
            <View style={{ padding: 16 }}>
              <SkeletonList count={4} cardHeight={56} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}>
              {editStudent && (
                <View style={{ backgroundColor: '#F0FDFA', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="person" size={20} color="#0D9488" />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' }}>
                    {editStudent.name}
                  </Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>المرحلة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {studentStages.map(s => {
                    const active = studentPickStage === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => { setStudentPickStage(s.id); setStudentPickGrade(null); setStudentPickSection(null); }}
                        style={[styles.pickChip, active && { backgroundColor: '#EEF2FF', borderColor: Colors.primary }]}
                      >
                        <Text style={[styles.pickChipText, active && { color: Colors.primary }]}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {studentPickStage && (
                <>
                  <Text style={styles.fieldLabel}>الصف</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {studentGrades.filter(g => g.stage_id === studentPickStage).map(g => {
                        const active = studentPickGrade === g.id;
                        return (
                          <TouchableOpacity
                            key={g.id}
                            onPress={() => { setStudentPickGrade(g.id); setStudentPickSection(null); }}
                            style={[styles.pickChip, active && { backgroundColor: '#EEF2FF', borderColor: Colors.primary }]}
                          >
                            <Text style={[styles.pickChipText, active && { color: Colors.primary }]}>{g.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}

              {studentPickGrade && (
                <>
                  <Text style={styles.fieldLabel}>الشعبة</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {studentSections.filter(s => s.grade_id === studentPickGrade).map(s => {
                        const active = studentPickSection === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            onPress={() => setStudentPickSection(s.id)}
                            style={[styles.pickChip, active && { backgroundColor: '#ECFDF5', borderColor: '#059669' }]}
                          >
                            <Text style={[styles.pickChipText, active && { color: '#059669' }]}>{s.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}

              {studentCurrentGrade && (
                <Text style={[styles.fieldLabel, { textAlign: 'right', color: Colors.textMuted, marginTop: 12 }]}>
                  ⚠️ الدرجات والحضور السابقة سيتم أرشفتها (محفوظة بالداتابيس) عند النقل لصف جديد
                </Text>
              )}

              <TouchableOpacity
                onPress={saveEditStudent}
                disabled={editStudentSaving || !studentPickGrade || !studentPickSection}
                activeOpacity={0.85}
                style={{ marginTop: 10, opacity: (!studentPickGrade || !studentPickSection) ? 0.5 : 1 }}
              >
                <LinearGradient colors={['#020024', '#2F2FBA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submit}>
                  {editStudentSaving ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="save" size={20} color="#fff" />
                      <Text style={styles.submitText}>حفظ</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </SwipeableSheet>

      {/* T1: Reset-code prompt — fallback inline modal for platforms without Alert.prompt */}
      <SwipeableSheet visible={!!resetCodeUser} onClose={() => { if (!resetCodeSaving) { setResetCodeUser(null); setResetCodeValue(''); } }} maxHeight={0.5}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={styles.modalTitle}>إعادة تعيين الرمز</Text>
          {resetCodeUser && <Text style={styles.modalSubtitle}>{resetCodeUser.name}</Text>}
          <TextInput
            value={resetCodeValue}
            onChangeText={(t) => setResetCodeValue(t.toUpperCase())}
            placeholder="الرمز الجديد (٦ أحرف على الأقل)"
            placeholderTextColor={Colors.textMuted}
            style={[styles.modalInput, { fontFamily: 'monospace', letterSpacing: 2 }]}
            textAlign="left"
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={styles.modalHint}>حروف وأرقام إنكليزية فقط — لن نظهر الرمز القديم</Text>
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={() => { setResetCodeUser(null); setResetCodeValue(''); }}
              style={[styles.modalBtn, styles.modalBtnGhost]}
              disabled={resetCodeSaving}
            >
              <Text style={styles.modalBtnGhostText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!resetCodeUser) return;
                const cleaned = resetCodeValue.replace(/[^A-Z0-9]/g, '');
                if (cleaned.length < 6) {
                  Alert.alert('خطأ', 'الرمز قصير جداً — ٦ أحرف على الأقل');
                  return;
                }
                confirmResetCode(resetCodeUser, cleaned);
              }}
              style={[styles.modalBtn, styles.modalBtnPrimary, resetCodeSaving && { opacity: 0.6 }]}
              disabled={resetCodeSaving}
            >
              {resetCodeSaving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.modalBtnPrimaryText}>حفظ</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SwipeableSheet>

      {/* T4: Stage / grade / section filter sheet */}
      <SwipeableSheet visible={showStructFilter} onClose={() => setShowStructFilter(false)} maxHeight={0.85}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }}>
          <Text style={styles.sheetTitle}>فلترة حسب الصف والشعبة</Text>
          {structureLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : structureStages.length === 0 ? (
            <Text style={styles.infoEmpty}>لا توجد بنية مدرسية معرّفة بعد</Text>
          ) : (
            <>
              <Text style={styles.fieldLabel}>المرحلة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {structureStages.map(s => {
                    const active = structFilterStage === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => {
                          setStructFilterStage(s.id);
                          setStructFilterGrade(null);
                          setStructFilterSection(null);
                        }}
                        style={[styles.pickChip, active && { backgroundColor: '#EEF2FF', borderColor: Colors.primary }]}
                      >
                        <Text style={[styles.pickChipText, active && { color: Colors.primary }]}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {structFilterStage && (
                <>
                  <Text style={styles.fieldLabel}>الصف</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {structureGrades.filter(g => g.stage_id === structFilterStage).map(g => {
                        const active = structFilterGrade === g.id;
                        return (
                          <TouchableOpacity
                            key={g.id}
                            onPress={() => {
                              setStructFilterGrade(g.id);
                              setStructFilterSection(null);
                            }}
                            style={[styles.pickChip, active && { backgroundColor: '#EEF2FF', borderColor: Colors.primary }]}
                          >
                            <Text style={[styles.pickChipText, active && { color: Colors.primary }]}>{g.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}

              {structFilterGrade && (
                <>
                  <Text style={styles.fieldLabel}>الشعبة</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {structureSections.filter(s => s.grade_id === structFilterGrade).map(s => {
                        const active = structFilterSection === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            onPress={() => setStructFilterSection(s.id)}
                            style={[styles.pickChip, active && { backgroundColor: '#ECFDF5', borderColor: '#059669' }]}
                          >
                            <Text style={[styles.pickChipText, active && { color: '#059669' }]}>{s.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => { resetStructFilter(); setShowStructFilter(false); }}
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                >
                  <Text style={styles.modalBtnGhostText}>إعادة تعيين</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={applyStructFilter}
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  disabled={!structFilterStage && !structFilterGrade && !structFilterSection}
                >
                  <Text style={styles.modalBtnPrimaryText}>تطبيق</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </SwipeableSheet>

      {/* Avatar lightbox — tap anywhere to dismiss */}
      <Modal
        visible={!!previewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <Pressable
          onPress={() => setPreviewUrl(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}
        >
          {previewUrl && (
            <Image
              source={{ uri: previewUrl }}
              style={{ width: '90%', height: '70%', resizeMode: 'contain' }}
            />
          )}
          <View style={{ position: 'absolute', top: 50, right: 20 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color="#fff" />
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  iconBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '900', color: Colors.text },

  // ── Hero stats card: elevated white card with 4 tappable role tiles ────
  heroStatsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: dtokens.color.surface,
    borderRadius: dtokens.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: dtokens.color.border,
    ...dtokens.shadow.sm,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: dtokens.radius.md,
    gap: 5,
    position: 'relative',
  },
  statTileIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  statTileValue: {
    fontSize: dtokens.font.size['3xl'],
    fontWeight: dtokens.font.weight.black,
    letterSpacing: -0.6,
    marginTop: 2,
  },
  statTileLabel: {
    fontSize: dtokens.font.size.sm,
    fontWeight: dtokens.font.weight.bold,
    color: dtokens.color.text2,
  },
  statTileDivider: {
    width: 1,
    alignSelf: 'center',
    height: '55%',
    backgroundColor: dtokens.color.border,
  },
  statTileActiveDot: {
    position: 'absolute',
    bottom: 4,
    width: 16,
    height: 3,
    borderRadius: 2,
  },

  // Legacy hero stats (kept untouched — unused now but referenced by other places potentially)
  hero: { paddingBottom: 18, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroBack: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroEyebrow: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: '#fff', marginTop: 2 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginHorizontal: 12, backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: '#1E3A8A' },
  heroStatLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginTop: 2 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: '#CBD5E1' },

  // ── Search ─────────────────────────────────────────────────────────────
  // RTL layout: row-reverse so the search icon visually appears on the right,
  // text reads right→left, and the clear button sits on the left edge.
  // Search lives inside the toolbar row now — drop external margins so it
  // sits flush with the filter/clear buttons.
  searchWrap: {
    flex: 1,
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: dtokens.color.surface2,
    borderRadius: dtokens.radius.md,
    borderWidth: 1, borderColor: dtokens.color.border,
  },
  // Collapsed search trigger — small round icon button.
  searchIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: dtokens.color.surface,
    borderWidth: 1, borderColor: dtokens.color.border,
  },
  searchIcon: { opacity: 0.85 },
  searchInput: {
    flex: 1,
    fontSize: dtokens.font.size.lg,
    fontWeight: dtokens.font.weight.medium,
    color: dtokens.color.text,
    paddingVertical: 0,
  },
  searchClearBtn: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Toolbar — compact search trigger + filter button + clear (T2/T3/T4) ──
  toolbar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  toolbarBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: dtokens.radius.pill,
    backgroundColor: dtokens.color.surface,
    borderWidth: 1,
    borderColor: dtokens.color.border,
    maxWidth: 180,
  },
  toolbarBtnActive: {
    backgroundColor: dtokens.color.brand100,
    borderColor: dtokens.color.brand500,
  },
  toolbarBtnText: {
    fontSize: dtokens.font.size.sm,
    fontWeight: '700',
    color: dtokens.color.text2,
  },
  toolbarClearBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: dtokens.radius.pill,
    backgroundColor: dtokens.color.warningBg,
    borderWidth: 1,
    borderColor: dtokens.color.warning + '40',
  },
  toolbarClearText: {
    fontSize: dtokens.font.size.xs,
    fontWeight: '800',
    color: dtokens.color.warning,
  },
  // Legacy chip styles (preserved — may be referenced by other code paths)
  chipsRow: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 8, flexDirection: 'row' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: dtokens.radius.pill,
    backgroundColor: dtokens.color.surface,
    borderWidth: 1, borderColor: dtokens.color.border,
    marginRight: 8,
    ...dtokens.shadow.xs,
  },
  chipText: { fontSize: dtokens.font.size.base, fontWeight: dtokens.font.weight.heavy, letterSpacing: 0.2 },
  chipCount: {
    minWidth: 22, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: dtokens.radius.sm, alignItems: 'center',
  },
  chipCountText: { fontSize: dtokens.font.size.xs, fontWeight: dtokens.font.weight.black },

  // ── Section label (above the user list) ────────────────────────────────
  sectionLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  sectionLabelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: dtokens.color.brand500,
  },
  sectionLabelBar: {
    flex: 1,
    height: 1,
    backgroundColor: dtokens.color.border,
  },
  sectionLabel: {
    fontSize: dtokens.font.size.md,
    fontWeight: dtokens.font.weight.heavy,
    color: dtokens.color.text2,
    textAlign: 'right',
    letterSpacing: 0.2,
  },

  // Legacy empty (unused — EmptyState component handles it now)
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },

  // ── User card ──────────────────────────────────────────────────────────
  card: {
    backgroundColor: dtokens.color.surface,
    borderRadius: dtokens.radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
    paddingRight: 18, // extra room for the accent bar on the right (RTL leading)
    borderWidth: 1,
    borderColor: dtokens.color.border,
    ...dtokens.shadow.xs,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    right: 0, top: 10, bottom: 10,
    width: 4,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  cardFrozen: { backgroundColor: dtokens.color.warningBg, borderColor: '#FDE68A' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardLeftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardMoreBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: dtokens.color.surface2,
  },
  cardBody: { flex: 1, alignItems: 'flex-end', gap: 7 },
  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
  },
  avatarInitial: { fontSize: 20, fontWeight: '900' },
  name: {
    fontSize: dtokens.font.size.xl,
    fontWeight: dtokens.font.weight.heavy,
    color: dtokens.color.text,
    textAlign: 'right',
    flexShrink: 1,
    letterSpacing: -0.1,
  },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  frozenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: dtokens.color.warningBg,
  },
  frozenBadgeText: { fontSize: 10, fontWeight: '800', color: dtokens.color.warning },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  metaPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: dtokens.radius.sm,
    backgroundColor: dtokens.color.surface2,
    borderWidth: 1,
    borderColor: dtokens.color.border2,
  },
  metaPillText: { fontSize: dtokens.font.size.sm, fontWeight: '700', color: dtokens.color.text2, letterSpacing: 0.3 },
  rolePill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: dtokens.radius.sm },
  rolePillText: { fontSize: dtokens.font.size.xs + 1, fontWeight: '800', letterSpacing: 0.2 },

  // ── FAB ────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    borderRadius: 28,
    ...dtokens.shadow.brand,
  },
  fabInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 28 },
  fabText: { color: '#fff', fontSize: dtokens.font.size.lg, fontWeight: dtokens.font.weight.heavy },

  // ── Sheets ─────────────────────────────────────────────────────────────
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
  infoBox: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 6 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  infoText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  infoEmpty: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingVertical: 4 },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  sheetSubtitle: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 2 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: Colors.background },
  sheetRowDanger: { backgroundColor: '#FEF2F2' },
  sheetRowText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sheetRowTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  sheetRowSub: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  bulkHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  bulkBackBtn: { padding: 8 },
  bulkHeaderTitle: { fontSize: 17, fontWeight: '900', color: Colors.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: Colors.surface, borderRadius: 16, padding: 20, gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'right' },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: Colors.text, backgroundColor: Colors.background, marginTop: 4 },
  modalHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'right' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: Colors.primary },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  modalBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
  modalBtnGhostText: { color: Colors.text, fontWeight: '700', fontSize: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },
  pickChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  pickChipText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  warn: { fontSize: 12, color: '#B45309', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, textAlign: 'right' },
  assignmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#F0F9FF', borderRadius: 10 },
  assignmentText: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  assignmentBox: { gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  addAsn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.primary },
  addAsnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
