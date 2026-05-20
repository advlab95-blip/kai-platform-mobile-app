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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { haptics } from '../../utils/haptics';
import { searchMatch } from '../../hooks/useSmartSearch';
import CreateInstitutionWizard from '../../components/shared/CreateInstitutionWizard';
import BulkUsersWizard from '../../components/shared/BulkUsersWizard';
import EmptyState from '../../components/shared/EmptyState';

type InstFilter = 'all' | 'institute' | 'school';
type DeleteMode = 'institute_only' | 'with_users';

export default function AdminInstitutions() {
  const router = useRouter();
  const { userId } = useAuthStore();
  const { institutes, loadInstitutes } = useDataStore();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InstFilter>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, { totalStudents: number; totalTeachers: number } | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkTarget, setBulkTarget] = useState<{ id: string; name: string; type: 'institute' | 'school' } | null>(null);
  // Delete sheet state — replaces React Native's Alert.alert (which truncates
  // 4-button menus on Android and renders broken on some OEM skins). A custom
  // sheet gives us a 3-way picker with proper Arabic copy + a confirm step
  // for the destructive option.
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmMode, setDeleteConfirmMode] = useState<DeleteMode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadInstitutes();
    } finally {
      setLoading(false);
    }
  }, [loadInstitutes]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadInstitutes(); } finally { setRefreshing(false); }
  }, [loadInstitutes]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return (institutes || []).filter((i: any) => {
      if (filter !== 'all' && (i.type || 'institute') !== filter) return false;
      if (!q) return true;
      return searchMatch(i.name, q) || searchMatch(i.city, q) || searchMatch(i.code, q);
    });
  }, [institutes, filter, search]);

  const counts = useMemo(() => {
    const list = institutes || [];
    return {
      all: list.length,
      institute: list.filter((i: any) => (i.type || 'institute') === 'institute').length,
      school: list.filter((i: any) => i.type === 'school').length,
    };
  }, [institutes]);

  const toggleExpand = useCallback(async (inst: any) => {
    haptics.selection();
    if (expanded === inst.id) { setExpanded(null); return; }
    setExpanded(inst.id);
    if (!stats[inst.id]) {
      try {
        const s = await api.getInstituteStats(inst.id);
        setStats((prev) => ({ ...prev, [inst.id]: s }));
      } catch {
        setStats((prev) => ({ ...prev, [inst.id]: null }));
      }
    }
  }, [expanded, stats]);

  const handleManageAccounts = useCallback((inst: any) => {
    haptics.selection();
    router.push(`/(admin)/users?instituteId=${inst.id}` as any);
  }, [router]);

  const openDelete = useCallback((inst: any) => {
    haptics.warning();
    setDeleteConfirmMode(null);
    setDeleteTarget(inst);
  }, []);

  const closeDelete = useCallback(() => {
    if (busyId) return;
    setDeleteTarget(null);
    setDeleteConfirmMode(null);
  }, [busyId]);

  const performDelete = useCallback(async (inst: any, mode: DeleteMode) => {
    setBusyId(inst.id);
    try {
      await api.deleteInstitute(inst.id, mode, userId || undefined, inst.name);
      api.logAdminAction({
        actorId: userId || '',
        actorRole: 'admin',
        action: 'delete_institution',
        targetType: 'institution',
        targetId: inst.id,
        targetName: inst.name,
        instituteId: inst.id,
        metadata: { mode, type: inst.type || 'institute', city: inst.city || null },
      }).catch(() => {});
      haptics.success();
      await loadInstitutes();
      setDeleteTarget(null);
      setDeleteConfirmMode(null);
      Alert.alert('تم', 'تم حذف المؤسسة');
    } catch (e: any) {
      haptics.error();
      Alert.alert('خطأ', e?.message || 'فشل الحذف');
    } finally {
      setBusyId(null);
    }
  }, [loadInstitutes, userId]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="إدارة المؤسسات"
        subtitle={counts.all > 0 ? `${counts.all} مؤسسة مسجّلة` : 'لا توجد مؤسسات بعد'}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats cards row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#EEF2FF' }]}>
            <View style={[styles.statIconWrap, { backgroundColor: '#4F46E520' }]}>
              <Ionicons name="business" size={18} color="#4F46E5" />
            </View>
            <Text style={styles.statValue}>{counts.all}</Text>
            <Text style={styles.statLabel}>الإجمالي</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F5F3FF' }]}>
            <View style={[styles.statIconWrap, { backgroundColor: '#7C3AED20' }]}>
              <Ionicons name="school" size={18} color="#7C3AED" />
            </View>
            <Text style={styles.statValue}>{counts.institute}</Text>
            <Text style={styles.statLabel}>المعاهد</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F0FDFA' }]}>
            <View style={[styles.statIconWrap, { backgroundColor: '#0D948820' }]}>
              <Ionicons name="library" size={18} color="#0D9488" />
            </View>
            <Text style={styles.statValue}>{counts.school}</Text>
            <Text style={styles.statLabel}>المدارس</Text>
          </View>
        </View>

        {/* Primary action — create */}
        <TouchableOpacity
          style={styles.primaryCreateBtn}
          onPress={() => { haptics.medium(); setShowWizard(true); }}
          activeOpacity={0.88}
        >
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.primaryCreateBtnText}>إنشاء مؤسسة جديدة</Text>
        </TouchableOpacity>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث باسم المؤسسة، المدينة، أو الرمز..."
            placeholderTextColor={Colors.textMuted}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {([
            { k: 'all', label: 'الكل', count: counts.all, icon: 'apps-outline' as const },
            { k: 'institute', label: 'معاهد', count: counts.institute, icon: 'school-outline' as const },
            { k: 'school', label: 'مدارس', count: counts.school, icon: 'library-outline' as const },
          ]).map((f) => {
            const active = filter === f.k;
            return (
              <TouchableOpacity
                key={f.k}
                onPress={() => { haptics.selection(); setFilter(f.k as InstFilter); }}
                style={[styles.filterChip, active && styles.filterChipActive]}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={f.icon}
                  size={14}
                  color={active ? '#fff' : Colors.textSecondary}
                />
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
                <View style={[styles.filterCountPill, active && styles.filterCountPillActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                    {f.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Loading state */}
        {loading && !institutes?.length && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>جاري التحميل...</Text>
          </View>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <EmptyState
            icon="business-outline"
            title={search ? 'لا توجد نتائج' : 'لا توجد مؤسسات'}
            message={search ? 'جرّب كلمات بحث أخرى أو غيّر الفلتر.' : 'ابدأ بإنشاء أول مؤسسة لإدارتها من هنا.'}
            actionLabel={search ? undefined : 'إنشاء مؤسسة'}
            onAction={search ? undefined : () => { haptics.medium(); setShowWizard(true); }}
          />
        )}

        {/* Institutions list */}
        {filtered.map((inst: any) => {
          const isSchool = inst.type === 'school';
          const isOpen = expanded === inst.id;
          const st = stats[inst.id];
          return (
            <View key={inst.id} style={[styles.card, isOpen && styles.cardOpen]}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => toggleExpand(inst)}
                style={styles.cardHead}
              >
                <View style={[styles.typeIcon, isSchool ? styles.typeIconSchool : styles.typeIconInst]}>
                  <Ionicons
                    name={isSchool ? 'library' : 'school'}
                    size={22}
                    color={isSchool ? '#0D9488' : '#4F46E5'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.instName} numberOfLines={1}>{inst.name}</Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.typeBadge, isSchool ? styles.typeBadgeSchool : styles.typeBadgeInst]}>
                      <Ionicons
                        name={isSchool ? 'library' : 'school'}
                        size={9}
                        color={isSchool ? '#0D9488' : '#4F46E5'}
                      />
                      <Text style={[styles.typeBadgeText, isSchool ? styles.typeBadgeTextSchool : styles.typeBadgeTextInst]}>
                        {isSchool ? 'مدرسة' : 'معهد'}
                      </Text>
                    </View>
                    {inst.city ? (
                      <View style={styles.cityChip}>
                        <Ionicons name="location" size={9} color={Colors.textMuted} />
                        <Text style={styles.cityText}>{inst.city}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.chevronWrap}>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.cardBody}>
                  {/* Stats */}
                  <View style={styles.bodyStatsRow}>
                    <View style={styles.bodyStatBox}>
                      <View style={[styles.bodyStatIcon, { backgroundColor: '#F0FDFA' }]}>
                        <Ionicons name="people" size={14} color="#0D9488" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bodyStatNum}>{st ? st.totalStudents : '—'}</Text>
                        <Text style={styles.bodyStatLabel}>طلاب</Text>
                      </View>
                    </View>
                    <View style={styles.bodyStatBox}>
                      <View style={[styles.bodyStatIcon, { backgroundColor: '#EEF2FF' }]}>
                        <Ionicons name="school" size={14} color="#4F46E5" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bodyStatNum}>{st ? st.totalTeachers : '—'}</Text>
                        <Text style={styles.bodyStatLabel}>أساتذة</Text>
                      </View>
                    </View>
                  </View>

                  {/* Primary action — manage users */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.primaryAction}
                    onPress={() => handleManageAccounts(inst)}
                  >
                    <Ionicons name="person-add" size={18} color="#fff" />
                    <Text style={styles.primaryActionText}>إدارة حسابات المؤسسة</Text>
                  </TouchableOpacity>

                  {/* Secondary actions grid */}
                  <View style={styles.secondaryGrid}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.secondaryGridBtn}
                      onPress={() => {
                        haptics.selection();
                        setBulkTarget({ id: inst.id, name: inst.name, type: isSchool ? 'school' : 'institute' });
                      }}
                    >
                      <Ionicons name="cloud-upload" size={18} color={Colors.primary} />
                      <Text style={styles.secondaryGridBtnText}>إنشاء جماعي (Excel)</Text>
                    </TouchableOpacity>

                    {isSchool && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.secondaryGridBtn}
                        onPress={() => router.push(`/(institute)/classes?instituteId=${inst.id}` as any)}
                      >
                        <Ionicons name="grid" size={18} color={Colors.primary} />
                        <Text style={styles.secondaryGridBtnText}>الصفوف والشعب</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Destructive — delete */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.dangerAction}
                    disabled={busyId === inst.id}
                    onPress={() => openDelete(inst)}
                  >
                    {busyId === inst.id ? (
                      <ActivityIndicator color={Colors.error} size="small" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={16} color={Colors.error} />
                        <Text style={styles.dangerActionText}>حذف المؤسسة</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Create wizard */}
      <CreateInstitutionWizard
        visible={showWizard}
        onClose={() => setShowWizard(false)}
        callerUserId={userId || ''}
        onCreated={async () => { await loadInstitutes(); }}
      />

      {/* Bulk users modal — per selected institution */}
      <Modal
        visible={!!bulkTarget}
        animationType="slide"
        onRequestClose={() => setBulkTarget(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
          <View style={styles.bulkModalHeader}>
            <TouchableOpacity onPress={() => setBulkTarget(null)} style={styles.bulkCloseBtn}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.bulkModalTitle} numberOfLines={1}>
              {bulkTarget ? `إنشاء حسابات — ${bulkTarget.name}` : 'إنشاء حسابات جماعية'}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          {bulkTarget && (
            <BulkUsersWizard
              institutionId={bulkTarget.id}
              institutionName={bulkTarget.name}
              institutionType={bulkTarget.type}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Delete bottom sheet — replaces Alert.alert (which Android Lollipop+ OEMs
          render with truncated/broken 4-button menus). Two-step: first picker
          chooses keep-users vs delete-everything, then a confirm step for the
          destructive option. */}
      <SwipeableSheet
        visible={!!deleteTarget}
        onClose={closeDelete}
        maxHeight={0.7}
        minHeight={0.45}
        overlayTapDisabled={!!busyId}
        swipeDownDisabled={!!busyId}
      >
        {deleteTarget && (
          <View style={styles.deleteSheet}>
            {deleteConfirmMode === null ? (
              <>
                <View style={styles.deleteHeader}>
                  <View style={styles.deleteHeaderIcon}>
                    <Ionicons name="warning" size={24} color="#DC2626" />
                  </View>
                  <Text style={styles.deleteTitle}>حذف المؤسسة</Text>
                  <Text style={styles.deleteSubtitle} numberOfLines={2}>
                    {deleteTarget.name}
                  </Text>
                </View>

                <Text style={styles.deletePrompt}>اختر طريقة الحذف:</Text>

                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.deleteOption}
                  onPress={() => {
                    haptics.selection();
                    setDeleteConfirmMode('institute_only');
                  }}
                >
                  <View style={[styles.deleteOptionIcon, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="archive" size={20} color="#B45309" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deleteOptionTitle}>حذف المؤسسة فقط</Text>
                    <Text style={styles.deleteOptionDesc}>الاحتفاظ بالمستخدمين لنقلهم لاحقاً لمؤسسة أخرى</Text>
                  </View>
                  <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.deleteOption, styles.deleteOptionDanger]}
                  onPress={() => {
                    haptics.warning();
                    setDeleteConfirmMode('with_users');
                  }}
                >
                  <View style={[styles.deleteOptionIcon, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="trash" size={20} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.deleteOptionTitle, { color: '#DC2626' }]}>
                      حذف كل شيء
                    </Text>
                    <Text style={styles.deleteOptionDesc}>المؤسسة + جميع المستخدمين نهائياً — لا يمكن التراجع</Text>
                  </View>
                  <Ionicons name="chevron-back" size={16} color="#DC2626" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.deleteCancel}
                  onPress={closeDelete}
                  disabled={!!busyId}
                >
                  <Text style={styles.deleteCancelText}>إلغاء</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.deleteHeader}>
                  <View style={[styles.deleteHeaderIcon, deleteConfirmMode === 'with_users' && { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons
                      name={deleteConfirmMode === 'with_users' ? 'alert-circle' : 'archive'}
                      size={28}
                      color={deleteConfirmMode === 'with_users' ? '#DC2626' : '#B45309'}
                    />
                  </View>
                  <Text style={styles.deleteTitle}>تأكيد الحذف</Text>
                  <Text style={styles.deleteSubtitle}>
                    {deleteConfirmMode === 'with_users'
                      ? `سيتم حذف "${deleteTarget.name}" مع جميع مستخدميها نهائياً.`
                      : `سيتم حذف "${deleteTarget.name}" مع الاحتفاظ بالمستخدمين.`}
                  </Text>
                </View>

                {deleteConfirmMode === 'with_users' && (
                  <View style={styles.deleteWarningBox}>
                    <Ionicons name="warning-outline" size={16} color="#B91C1C" />
                    <Text style={styles.deleteWarningText}>
                      هذا الإجراء غير قابل للتراجع. تأكد قبل المتابعة.
                    </Text>
                  </View>
                )}

                <View style={styles.deleteConfirmRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.deleteBackBtn}
                    onPress={() => setDeleteConfirmMode(null)}
                    disabled={!!busyId}
                  >
                    <Text style={styles.deleteBackBtnText}>رجوع</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.deleteConfirmBtn,
                      deleteConfirmMode === 'with_users' ? styles.deleteConfirmBtnDanger : styles.deleteConfirmBtnWarning,
                      !!busyId && { opacity: 0.6 },
                    ]}
                    onPress={() => performDelete(deleteTarget, deleteConfirmMode)}
                    disabled={!!busyId}
                  >
                    {busyId ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name={deleteConfirmMode === 'with_users' ? 'trash' : 'archive'}
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.deleteConfirmBtnText}>
                          {deleteConfirmMode === 'with_users' ? 'حذف نهائي' : 'حذف المؤسسة'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // ── Stats row ──────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
  },
  statIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  statLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', marginTop: 2 },

  // ── Create button ──────────────────────────────────────────────────────
  primaryCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 14,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryCreateBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // ── Search ─────────────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface,
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, textAlign: 'right', fontSize: 14, padding: 0 },

  // ── Filter chips ───────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  filterCountPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCountPillActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterCountText: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary },
  filterCountTextActive: { color: '#fff' },

  // ── Loading / center ──────────────────────────────────────────────────
  centerBox: { padding: 40, alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },

  // ── Card ──────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardOpen: {
    borderColor: Colors.primary + '40',
    shadowColor: Colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14,
  },
  typeIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  typeIconInst: { backgroundColor: '#EEF2FF' },
  typeIconSchool: { backgroundColor: '#F0FDFA' },
  instName: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  typeBadgeInst: { backgroundColor: '#EEF2FF' },
  typeBadgeSchool: { backgroundColor: '#F0FDFA' },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  typeBadgeTextInst: { color: '#4F46E5' },
  typeBadgeTextSchool: { color: '#0D9488' },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cityText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600' },
  chevronWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Card body (expanded) ──────────────────────────────────────────────
  cardBody: {
    padding: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: '#F8FAFC',
    gap: 10,
  },
  bodyStatsRow: { flexDirection: 'row', gap: 8 },
  bodyStatBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  bodyStatIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  bodyStatNum: { fontSize: 16, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  bodyStatLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '700', textAlign: 'right' },

  primaryAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 13, borderRadius: 12,
  },
  primaryActionText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  secondaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryGridBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.surface,
    paddingVertical: 11, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  secondaryGridBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 12 },

  dangerAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  dangerActionText: { color: Colors.error, fontWeight: '700', fontSize: 12 },

  // ── Bulk modal ────────────────────────────────────────────────────────
  bulkModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  bulkCloseBtn: { padding: 8 },
  bulkModalTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'center' },

  // ── Delete sheet ──────────────────────────────────────────────────────
  deleteSheet: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
  deleteHeader: { alignItems: 'center', marginBottom: 18 },
  deleteHeaderIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  deleteTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 4 },
  deleteSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  deletePrompt: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'right',
    marginBottom: 10,
    fontWeight: '700',
  },
  deleteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  deleteOptionDanger: { borderColor: '#FECACA' },
  deleteOptionIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteOptionTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  deleteOptionDesc: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2, lineHeight: 16 },
  deleteCancel: {
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    marginTop: 4,
  },
  deleteCancelText: { color: Colors.textSecondary, fontWeight: '800', fontSize: 14 },
  deleteWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteWarningText: { flex: 1, fontSize: 11, color: '#991B1B', textAlign: 'right', fontWeight: '700', lineHeight: 16 },
  deleteConfirmRow: { flexDirection: 'row', gap: 10 },
  deleteBackBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  deleteBackBtnText: { color: Colors.textSecondary, fontWeight: '800', fontSize: 14 },
  deleteConfirmBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  deleteConfirmBtnDanger: { backgroundColor: '#DC2626' },
  deleteConfirmBtnWarning: { backgroundColor: '#B45309' },
  deleteConfirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
