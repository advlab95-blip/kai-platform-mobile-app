// Granular Sub-Roles — institute admin delegation.
//
// Lets the main admin grant scoped permissions (financial / academic /
// student_affairs / communications) to other institute staff so workload
// can be split. Backed by `institute_role_assignments` via
// instituteAdminService.{listRoleAssignments,grantRole,revokeRole}.
//
// IMPORTANT: user search is filtered by institute_id of the current admin
// AND excludes students/parents — those roles are never delegation targets.

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  ActivityIndicator, TextInput, Alert, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import SectionLabel from '../../components/institute/SectionLabel';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { confirmAlert } from '../../utils/alerts';
import {
  listRoleAssignments, grantRole, revokeRole,
  type RoleAssignment, type InstituteRoleKey,
} from '../../services/instituteAdminService';
import { supabase } from '../../services/supabase';

// ── Role metadata (Arabic labels + colors + short descriptions) ──────
type RoleFilter = 'all' | InstituteRoleKey;

const ROLE_META: Record<InstituteRoleKey, {
  label: string;
  short: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  fg: string;
}> = {
  financial: {
    label: 'مالي',
    short: 'الرسوم، الرواتب، التقارير المالية',
    icon: 'cash-outline',
    bg: tokens.semantic.successBg,
    fg: tokens.semantic.success,
  },
  academic: {
    label: 'أكاديمي',
    short: 'الجداول، الامتحانات، الدرجات',
    icon: 'school-outline',
    bg: tokens.semantic.infoBg,
    fg: tokens.semantic.info,
  },
  student_affairs: {
    label: 'شؤون طلاب',
    short: 'الحضور، السلوك، الإجازات',
    icon: 'people-outline',
    bg: tokens.semantic.purpleBg,
    fg: tokens.semantic.purple,
  },
  communications: {
    label: 'تواصل',
    short: 'الإعلانات، الإشعارات، الرسائل',
    icon: 'megaphone-outline',
    bg: tokens.semantic.warningBg,
    fg: tokens.semantic.warning,
  },
};

const FILTER_TABS: { key: RoleFilter; label: string }[] = [
  { key: 'all',             label: 'الكل' },
  { key: 'financial',       label: 'مالي' },
  { key: 'academic',        label: 'أكاديمي' },
  { key: 'student_affairs', label: 'شؤون طلاب' },
  { key: 'communications',  label: 'تواصل' },
];

// ── "منذ X" formatter — short Arabic relative date ───────────────────
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `منذ ${mo} شهر`;
  const y = Math.floor(mo / 12);
  return `منذ ${y} سنة`;
}

// Shape of user search results — narrow on purpose (no PII beyond what we display).
type UserHit = { id: string; full_name: string; role: string };

export default function RolesScreen() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [items, setItems] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<RoleFilter>('all');

  // Grant-sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserHit[]>([]);
  const [picked, setPicked] = useState<UserHit | null>(null);
  const [pickedRole, setPickedRole] = useState<InstituteRoleKey | null>(null);
  const [granting, setGranting] = useState(false);

  // Debounce timer ref — cleared when query changes or sheet closes.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await listRoleAssignments(userInstituteId);
      setItems(list);
    } catch (err) {
      if (__DEV__) console.error('[roles] load', err);
    } finally {
      setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // ── Filtered active assignments ────────────────────────────────────
  const visible = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((x) => x.role_key === filter);
  }, [filter, items]);

  // ── User search (debounced 300ms) ──────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!userInstituteId) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      // Limit columns + cap at 10 hits to keep payload tiny.
      // Filter by institute_id (multi-tenant safety) + exclude students/parents
      // since delegation only makes sense for staff.
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, role')
        .eq('institute_id', userInstituteId)
        .in('role', ['admin', 'institute', 'teacher'])
        .ilike('full_name', `%${trimmed}%`)
        .limit(10);
      if (error) throw error;
      setResults((data || []) as UserHit[]);
    } catch (err) {
      if (__DEV__) console.error('[roles] search', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [userInstituteId]);

  // Schedule a search whenever the query changes — cancel any pending one.
  useEffect(() => {
    if (!sheetOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(search), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, sheetOpen, runSearch]);

  const openGrant = () => {
    haptics.light();
    setSearch('');
    setResults([]);
    setPicked(null);
    setPickedRole(null);
    setSheetOpen(true);
  };

  const onGrant = async () => {
    if (!userInstituteId || !picked || !pickedRole) return;

    // Guard: prevent re-granting a role this user already has (matches DB unique constraint).
    const dup = items.find(
      (x) => x.user_id === picked.id && x.role_key === pickedRole,
    );
    if (dup) {
      Alert.alert('موجود مسبقاً', `${picked.full_name} لديه هذا الدور بالفعل.`);
      return;
    }

    try {
      setGranting(true);
      await grantRole({
        institute_id: userInstituteId,
        user_id: picked.id,
        role_key: pickedRole,
      });
      haptics.success();
      setSheetOpen(false);
      await load();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل منح الدور');
    } finally {
      setGranting(false);
    }
  };

  const onRevoke = (a: RoleAssignment) => {
    const meta = ROLE_META[a.role_key];
    confirmAlert(
      'إلغاء الدور',
      `إلغاء صلاحية "${meta?.label || a.role_key}" من ${a.user_name || 'المستخدم'}؟`,
      async () => {
        const previous = items;
        setItems((prev) => prev.filter((x) => x.id !== a.id));
        try {
          await revokeRole(a.id);
          haptics.success();
        } catch (err: any) {
          setItems(previous);
          Alert.alert('خطأ', err?.message || 'فشل الإلغاء');
        }
      },
      true,
      'إلغاء',
    );
  };

  if (!userInstituteId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.brand[500]} />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الأدوار والصلاحيات"
        subtitle="وزّع الإدارة على فريقك"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : (
        <KeyboardAwareScroll
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 12 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
          }
        >
          {/* Explanation card */}
          <View style={styles.explainCard}>
            <View style={styles.explainIcon}>
              <Ionicons name="information-circle" size={20} color={tokens.brand[500]} />
            </View>
            <Text style={styles.explainText}>
              كل دور يفتح صلاحيات محددة. مفيد للمؤسسات الكبيرة حيث يقسّم العمل بين عدة موظفين.
            </Text>
          </View>

          {/* Filter tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => { haptics.selection(); setFilter(tab.key); }}
                  style={[styles.tab, active && styles.tabActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
            <SectionLabel title="الصلاحيات الممنوحة" icon="shield-checkmark-outline" />
          </View>

          {visible.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="key-outline" size={36} color={tokens.brand[500]} />
              </View>
              <Text style={styles.emptyTitle}>
                {filter === 'all'
                  ? 'لم يتم منح أي صلاحيات إضافية بعد'
                  : 'لا توجد صلاحيات بهذا التصنيف'}
              </Text>
              <Text style={styles.emptyHint}>اضغط "منح دور" لإضافة أول صلاحية</Text>
            </View>
          ) : (
            visible.map((a, i) => {
              const meta = ROLE_META[a.role_key];
              return (
                <FadeSlideIn key={a.id} delay={Math.min(i * 40, 400)} translateFrom={10}>
                  <View style={styles.row}>
                    <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={18} color={meta.fg} />
                    </View>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {a.user_name || '—'}
                      </Text>
                      <View style={styles.rowMeta}>
                        <View style={[styles.roleBadge, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.roleBadgeText, { color: meta.fg }]}>
                            {meta.label}
                          </Text>
                        </View>
                        <Text style={styles.rowDate}>{timeAgo(a.granted_at)}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.revokeBtn}
                      onPress={() => onRevoke(a)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close-circle-outline" size={14} color={tokens.semantic.danger} />
                      <Text style={styles.revokeText}>إلغاء</Text>
                    </TouchableOpacity>
                  </View>
                </FadeSlideIn>
              );
            })
          )}
        </KeyboardAwareScroll>
      )}

      <TouchableOpacity style={styles.fab} onPress={openGrant} activeOpacity={0.9}>
        <View style={styles.fabInner}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>منح دور</Text>
        </View>
      </TouchableOpacity>

      {/* ── Grant sheet ─────────────────────────────────────────────── */}
      <SwipeableSheet
        visible={sheetOpen}
        onClose={() => !granting && setSheetOpen(false)}
        maxHeight={0.9}
        overlayTapDisabled={granting}
        swipeDownDisabled={granting}
      >
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={() => !granting && setSheetOpen(false)} disabled={granting}>
            <Ionicons name="close" size={22} color={tokens.text[1]} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>منح دور جديد</Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAwareScroll
          contentContainerStyle={styles.sheetBody}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>اختر المستخدم</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={tokens.text[4]} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ابحث بالاسم..."
              placeholderTextColor={tokens.text[4]}
              style={styles.searchInput}
              textAlign="right"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching && <ActivityIndicator size="small" color={tokens.brand[500]} />}
          </View>

          {picked ? (
            <View style={styles.pickedCard}>
              <View style={styles.pickedAvatar}>
                <Ionicons name="person" size={18} color={tokens.brand[500]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickedName}>{picked.full_name}</Text>
                <Text style={styles.pickedRole}>{picked.role}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { haptics.light(); setPicked(null); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={tokens.text[4]} />
              </TouchableOpacity>
            </View>
          ) : (
            search.trim().length >= 2 && (
              <View style={styles.resultsList}>
                {results.length === 0 && !searching ? (
                  <Text style={styles.noResults}>لا توجد نتائج</Text>
                ) : (
                  results.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.resultChip}
                      onPress={() => { haptics.selection(); setPicked(u); }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="person-circle-outline" size={18} color={tokens.brand[500]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultName} numberOfLines={1}>{u.full_name}</Text>
                        <Text style={styles.resultRole}>{u.role}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )
          )}

          <Text style={[styles.label, { marginTop: 18 }]}>اختر الدور</Text>
          <View style={styles.roleGrid}>
            {(Object.keys(ROLE_META) as InstituteRoleKey[]).map((key) => {
              const meta = ROLE_META[key];
              const active = pickedRole === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => { haptics.selection(); setPickedRole(key); }}
                  activeOpacity={0.85}
                  style={[
                    styles.roleCard,
                    active && { borderColor: meta.fg, backgroundColor: meta.bg },
                  ]}
                >
                  <View style={styles.roleCardHeader}>
                    <Ionicons name={meta.icon} size={18} color={meta.fg} />
                    <Text style={[styles.roleCardLabel, active && { color: meta.fg }]}>
                      {meta.label}
                    </Text>
                  </View>
                  <Text style={styles.roleCardDesc}>{meta.short}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (!picked || !pickedRole || granting) && { opacity: 0.5 },
            ]}
            onPress={onGrant}
            disabled={!picked || !pickedRole || granting}
            activeOpacity={0.85}
          >
            {granting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>منح</Text>
              </>
            )}
          </TouchableOpacity>
        </KeyboardAwareScroll>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 13, color: tokens.text[3], fontWeight: '500' },

  explainCard: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: tokens.brand[50],
    borderWidth: 1,
    borderColor: tokens.brand[100],
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 12,
    borderRadius: tokens.radius.lg,
  },
  explainIcon: { paddingTop: 2 },
  explainText: {
    flex: 1,
    fontSize: 12,
    color: tokens.text[2],
    textAlign: 'right',
    lineHeight: 19,
    fontWeight: '500',
  },

  tabsRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 14,
    gap: 6,
    marginBottom: 6,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[2],
  },
  tabActive: {
    backgroundColor: tokens.brand[500],
    borderColor: tokens.brand[500],
  },
  tabText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  tabTextActive: { color: '#fff' },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginVertical: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0, gap: 4 },
  rowName: { fontSize: 14, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },
  rowMeta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  roleBadgeText: { fontSize: 10, fontWeight: '800' },
  rowDate: { fontSize: 11, color: tokens.text[4], fontWeight: '500' },

  revokeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.semantic.dangerBg,
  },
  revokeText: { fontSize: 11, fontWeight: '700', color: tokens.semantic.danger },

  emptyBox: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 12, color: tokens.text[3], fontWeight: '500', textAlign: 'center' },

  fab: {
    position: 'absolute',
    bottom: 26,
    left: 20,
    borderRadius: 999,
    ...tokens.shadow.md,
  },
  fabInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: tokens.brand[500],
  },
  fabText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // ── Sheet ─────────────────────────────────────────────────────────
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: tokens.border[2],
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  sheetBody: { padding: 16, paddingBottom: 36 },

  label: {
    fontSize: 13, fontWeight: '700', color: tokens.text[1],
    textAlign: 'right', marginBottom: 8,
  },

  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[1],
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: tokens.text[1],
    padding: 0,
  },

  resultsList: { marginTop: 8, gap: 6 },
  resultChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1,
    borderColor: tokens.border[2],
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultName: { fontSize: 13, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },
  resultRole: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 2 },
  noResults: {
    fontSize: 12, color: tokens.text[3],
    textAlign: 'center', paddingVertical: 14,
  },

  pickedCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.brand[50],
    borderWidth: 1,
    borderColor: tokens.brand[100],
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  pickedAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  pickedName: { fontSize: 14, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  pickedRole: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 2 },

  roleGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleCard: {
    width: '48%',
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[2],
    borderRadius: tokens.radius.md,
    padding: 10,
    gap: 6,
  },
  roleCardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  roleCardLabel: { fontSize: 13, fontWeight: '800', color: tokens.text[1] },
  roleCardDesc: {
    fontSize: 11,
    color: tokens.text[3],
    textAlign: 'right',
    lineHeight: 16,
    fontWeight: '500',
  },

  saveBtn: {
    marginTop: 22,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.brand[500],
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
