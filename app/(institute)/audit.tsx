// InstituteAudit — سجل العمليات داخل المؤسسة.
//
// مَن سوى شنو ومتى. يقرأ من institute_audit_log عبر
// instituteAdminService.listAuditEntries. RLS يحصر القراءة على
// admins/staff نفس المؤسسة (الفلتر eq('institute_id', userInstituteId)
// بالخدمة الموجودة + سياسات RLS = طبقتي حماية).
//
// لا يعدّل _layout.tsx (مسجّل مسبقاً كـ Tabs.Screen href:null) ولا
// يضيف خدمات/تبعيات جديدة — يستخدم listAuditEntries فقط.
//
// تصميم على نمط (institute)/finance.tsx: RoleInnerHero + tokens +
// SectionLabel + FadeSlideIn + RefreshControl.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, TextInput, Alert, LayoutAnimation,
  Platform, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SectionLabel from '../../components/institute/SectionLabel';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import PdfExportButton from '../../components/institute/PdfExportButton';
import { haptics } from '../../utils/haptics';
import { timeAgo } from '../../utils/helpers';
import {
  listAuditEntries,
  type AuditEntry,
} from '../../services/instituteAdminService';

// Enable LayoutAnimation on Android (no-op on iOS — it's on by default).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────────────────
// Action key → Arabic verb. Top of file as requested. Fallback returns raw.
// أي مفتاح غير مُترجم يطلع نصه الخام — يساعد المسؤول يطلب ترجمته لاحقاً.
// ─────────────────────────────────────────────────────────────────────────
function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    // user.*
    'user.create':            'أنشأ مستخدم',
    'user.update':            'حدّث مستخدم',
    'user.delete':            'حذف مستخدم',
    'user.freeze':            'جمّد مستخدم',
    'user.unfreeze':          'فعّل مستخدم',
    'user.role_change':       'غيّر دور مستخدم',
    // code / auth
    'code.rotate':            'غيّر رمز',
    'code.reset':             'أعاد توليد رمز',
    // announcement.*
    'announcement.publish':   'نشر إعلان',
    'announcement.update':    'حدّث إعلان',
    'announcement.delete':    'حذف إعلان',
    // payment / fee
    'payment.create':         'سجّل دفعة',
    'payment.update':         'عدّل دفعة',
    'payment.delete':         'حذف دفعة',
    'fee.create':             'أنشأ رسم',
    'fee.update':             'حدّث رسم',
    'fee.delete':             'حذف رسم',
    // class / subject
    'class.create':           'أنشأ صف',
    'class.update':           'حدّث صف',
    'class.delete':           'حذف صف',
    'subject.create':         'أنشأ مادة',
    'subject.update':         'حدّث مادة',
    'subject.delete':         'حذف مادة',
    // exam
    'exam.create':            'أنشأ امتحان',
    'exam.update':            'عدّل امتحان',
    'exam.delete':            'حذف امتحان',
    'exam.publish':           'نشر نتائج امتحان',
    // leave / attendance
    'approve_leave_request':  'وافق على إجازة',
    'reject_leave_request':   'رفض إجازة',
    'attendance.mark':        'سجّل حضور',
  };
  return map[action] || action;
}

// ─────────────────────────────────────────────────────────────────────────
// Category chips — group action prefixes.
// ─────────────────────────────────────────────────────────────────────────
type CategoryKey = 'all' | 'users' | 'announcements' | 'finance' | 'classes' | 'exams';

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'all',           label: 'الكل' },
  { key: 'users',         label: 'المستخدمون' },
  { key: 'announcements', label: 'الإعلانات' },
  { key: 'finance',       label: 'المالية' },
  { key: 'classes',       label: 'الصفوف' },
  { key: 'exams',         label: 'الامتحانات' },
];

function matchesCategory(action: string, key: CategoryKey): boolean {
  if (key === 'all') return true;
  const a = action.toLowerCase();
  switch (key) {
    case 'users':         return a.startsWith('user.') || a.includes('code.');
    case 'announcements': return a.startsWith('announcement.');
    case 'finance':       return a.startsWith('payment.') || a.startsWith('fee.');
    case 'classes':       return a.startsWith('class.') || a.startsWith('subject.');
    case 'exams':         return a.startsWith('exam.');
    default:              return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
function initialsOf(name: string | null | undefined): string {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].charAt(0);
  return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
}

function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'admin':     return 'إدارة';
    case 'institute': return 'إدارة';
    case 'teacher':   return 'أستاذ';
    case 'student':   return 'طالب';
    case 'parent':    return 'ولي أمر';
    case 'cafeteria': return 'كافتيريا';
    case 'medical':   return 'طبابة';
    default:          return role || '—';
  }
}

function prettyJson(obj: any): string {
  try {
    if (!obj || (typeof obj === 'object' && Object.keys(obj).length === 0)) {
      return 'لا بيانات إضافية';
    }
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────
export default function InstituteAudit() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await listAuditEntries(userInstituteId, { limit: 300 });
      setEntries(list);
    } catch (err: any) {
      if (__DEV__) console.error('[institute audit] load', err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل السجل');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Tenant detection fallback — mirrors finance.tsx pattern.
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const toggleExpand = useCallback((id: string) => {
    haptics.selection();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Client-side filter: category + search across actor_name OR target_label.
  // Limit is already 300 server-side so this is cheap; no need for re-query.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (!matchesCategory(e.action, category)) return false;
      if (!q) return true;
      const a = (e.actor_name || '').toLowerCase();
      const t = (e.target_label || '').toLowerCase();
      return a.includes(q) || t.includes(q);
    });
  }, [entries, category, search]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="سجل العمليات"
        subtitle="من سوّى شنو ومتى"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        fallbackRoute="/(institute)/services"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={tokens.text[4]} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث في السجل"
            placeholderTextColor={tokens.text[4]}
            style={styles.searchInput}
            textAlign="right"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close-circle" size={16} color={tokens.text[4]} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => { haptics.selection(); setCategory(c.key); }}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Header row: section label on the right, export pill on the left.
            Exports the *filtered* slice — admins reading "نشر إعلان" entries
            export only that subset, which is what they expect. */}
        <View style={styles.headerRowWithExport}>
          <SectionLabel title="آخر العمليات" icon="time-outline" />
          <PdfExportButton
            title="سجل العمليات"
            filename={`audit_${new Date().toISOString().slice(0, 10)}`}
            disabled={loading || filtered.length === 0}
            columns={[
              { key: 'created_at_label', label: 'التوقيت' },
              { key: 'actor_name',       label: 'منفّذ العملية' },
              { key: 'actor_role',       label: 'الدور' },
              { key: 'action_label',     label: 'العملية' },
              { key: 'target_label',     label: 'الهدف' },
            ]}
            data={filtered.map((e) => ({
              created_at_label: new Date(e.created_at).toLocaleString('ar-IQ'),
              actor_name: e.actor_name || '—',
              actor_role: e.actor_role || '—',
              action_label: getActionLabel(e.action),
              target_label: e.target_label || '—',
            }))}
          />
        </View>

        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <SkeletonList count={6} cardHeight={72} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>
              {search || category !== 'all' ? 'لا نتائج مطابقة' : 'لا توجد عمليات مسجلة'}
            </Text>
            <Text style={styles.emptyHint}>
              {search || category !== 'all' ? 'جرّب فلتر آخر' : 'سيتم تسجيل كل عملية إدارية هنا'}
            </Text>
          </View>
        ) : (
          filtered.map((e, i) => {
            const expanded = expandedId === e.id;
            return (
              <FadeSlideIn key={e.id} delay={Math.min(i * 18, 360)} translateFrom={8}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggleExpand(e.id)}
                  style={styles.card}
                >
                  <View style={styles.cardRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initialsOf(e.actor_name)}</Text>
                    </View>

                    <View style={styles.cardMain}>
                      <View style={styles.headerRow}>
                        <Text style={styles.actorName} numberOfLines={1}>
                          {e.actor_name || 'مستخدم محذوف'}
                        </Text>
                        <View style={styles.roleBadge}>
                          <Text style={styles.roleBadgeText}>{roleLabel(e.actor_role)}</Text>
                        </View>
                      </View>

                      <Text style={styles.actionVerb} numberOfLines={1}>
                        {getActionLabel(e.action)}
                        {e.target_label ? (
                          <Text style={styles.targetLabel}> — {e.target_label}</Text>
                        ) : null}
                      </Text>

                      <View style={styles.metaRow}>
                        <Text style={styles.timeText}>منذ {timeAgo(e.created_at)}</Text>
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={tokens.text[4]}
                        />
                      </View>
                    </View>
                  </View>

                  {expanded ? (
                    <View style={styles.expandWrap}>
                      <Text style={styles.expandTitle}>تفاصيل إضافية</Text>
                      <View style={styles.codeBlock}>
                        <Text style={styles.codeText} selectable>
                          {prettyJson(e.metadata)}
                        </Text>
                      </View>
                      {e.target_type ? (
                        <Text style={styles.metaLine}>
                          النوع: <Text style={styles.metaValue}>{e.target_type}</Text>
                        </Text>
                      ) : null}
                      <Text style={styles.metaLine}>
                        المفتاح الأصلي: <Text style={styles.metaValue}>{e.action}</Text>
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </FadeSlideIn>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },

  headerRowWithExport: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 4,
  },

  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    ...tokens.shadow.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: tokens.text[1],
    padding: 0,
  },

  chipsRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[2],
  },
  chipActive: {
    backgroundColor: tokens.brand[100],
    borderColor: tokens.brand[500],
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.text[3],
  },
  chipTextActive: {
    color: tokens.brand[500],
  },

  card: {
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginVertical: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  cardRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.brand[500],
  },
  cardMain: { flex: 1, minWidth: 0 },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  actorName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: tokens.semantic.infoBg,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.semantic.info,
  },
  actionVerb: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.text[2],
    textAlign: 'right',
    marginTop: 4,
    lineHeight: 20,
  },
  targetLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: tokens.text[3],
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    fontSize: 11,
    color: tokens.text[4],
    fontWeight: '600',
  },
  expandWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.border[2],
    gap: 6,
  },
  expandTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.text[3],
    textAlign: 'right',
  },
  codeBlock: {
    backgroundColor: tokens.surface.surface2,
    borderRadius: tokens.radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: tokens.border[2],
  },
  codeText: {
    fontSize: 11,
    color: tokens.text[2],
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  metaLine: {
    fontSize: 11,
    color: tokens.text[3],
    textAlign: 'right',
    fontWeight: '500',
  },
  metaValue: {
    color: tokens.text[1],
    fontWeight: '700',
  },

  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
});
