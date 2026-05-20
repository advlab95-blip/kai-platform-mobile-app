// Platform admin · Changelog Editor
// ────────────────────────────────────────────────────────────────────
// Authors "What's New" entries that surface to users in the in-app
// changelog feed. Drafts can be saved without publishing; publishing
// stamps `published_at` and exposes the row to clients (publishedOnly
// filter on the read side).
//
// Data: services/platformAdminService.ts → listChangelogEntries /
// createChangelogEntry / publishChangelogEntry.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import { successAlert, errorAlert, confirmAlert } from '../../utils/alerts';
import {
  listChangelogEntries,
  createChangelogEntry,
  publishChangelogEntry,
  type ChangelogEntry,
} from '../../services/platformAdminService';

type Tab = 'compose' | 'published';
type Category = ChangelogEntry['category'];

// Static category metadata — icon + Arabic label + tone colours.
const CATEGORY_META: Record<Category, { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }> = {
  feature:     { label: 'ميزة جديدة', icon: 'sparkles',       bg: '#DBEAFE', fg: '#1E40AF' },
  improvement: { label: 'تحسين',      icon: 'trending-up',    bg: '#D1FAE5', fg: '#065F46' },
  fix:         { label: 'إصلاح',      icon: 'build',          bg: '#FEF3C7', fg: '#B45309' },
  security:    { label: 'أمان',       icon: 'shield-checkmark', bg: '#FEE2E2', fg: '#DC2626' },
  breaking:    { label: 'تغيير جوهري', icon: 'warning',       bg: '#FFEDD5', fg: '#C2410C' },
};

const CATEGORY_LIST: Category[] = ['feature', 'improvement', 'fix', 'security', 'breaking'];

// Role labels — kept lightweight, matches the rest of the admin surface.
const ROLE_OPTIONS: Array<{ key: string | null; label: string }> = [
  { key: null,        label: 'الكل' },
  { key: 'admin',     label: 'الادمن' },
  { key: 'institute', label: 'الإدارة' },
  { key: 'teacher',   label: 'أستاذ' },
  { key: 'student',   label: 'طالب' },
  { key: 'parent',    label: 'ولي أمر' },
];

export default function AdminChangelogEditor() {
  const [tab, setTab] = useState<Tab>('compose');

  // Compose form state
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Category>('feature');
  const [targetRole, setTargetRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Published list state
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listChangelogEntries();
      setEntries(data);
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل السجل');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const resetForm = () => {
    setVersion('');
    setTitle('');
    setBody('');
    setCategory('feature');
    setTargetRole(null);
  };

  // Common pre-flight validation — kept inline (one screen, one form).
  const validate = (): string | null => {
    if (!version.trim()) return 'أدخل رقم الإصدار (مثال: v1.2.0)';
    if (!title.trim())   return 'أدخل عنواناً للتحديث';
    if (!body.trim())    return 'أدخل وصف التحديث';
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validate();
    if (err) { errorAlert('بيانات ناقصة', err); return; }
    setSaving(true);
    try {
      await createChangelogEntry({
        version: version.trim(),
        title: title.trim(),
        body: body.trim(),
        category,
        target_role: targetRole,
      });
      successAlert('تم الحفظ', 'تم حفظ التحديث كمسودة');
      resetForm();
      await load();
    } catch (e: any) {
      errorAlert('خطأ', e?.message || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndPublish = async () => {
    const err = validate();
    if (err) { errorAlert('بيانات ناقصة', err); return; }
    confirmAlert(
      'نشر التحديث',
      'سيظهر هذا التحديث لكل المستخدمين المستهدفين فوراً. هل تريد النشر؟',
      async () => {
        setSaving(true);
        try {
          const created = await createChangelogEntry({
            version: version.trim(),
            title: title.trim(),
            body: body.trim(),
            category,
            target_role: targetRole,
          });
          await publishChangelogEntry(created.id);
          successAlert('تم النشر', 'تم نشر التحديث');
          resetForm();
          setTab('published');
          await load();
        } catch (e: any) {
          errorAlert('خطأ', e?.message || 'فشل النشر');
        } finally {
          setSaving(false);
        }
      },
      false,
      'نشر',
    );
  };

  const handlePublishExisting = (entry: ChangelogEntry) => {
    confirmAlert(
      'نشر التحديث',
      `سيتم نشر "${entry.title}" لكل المستخدمين المستهدفين.`,
      async () => {
        try {
          await publishChangelogEntry(entry.id);
          successAlert('تم النشر', 'تم نشر التحديث');
          await load();
        } catch (e: any) {
          errorAlert('خطأ', e?.message || 'فشل النشر');
        }
      },
      false,
      'نشر',
    );
  };

  const roleLabel = useMemo(
    () => (key: string | null) => ROLE_OPTIONS.find((r) => r.key === key)?.label || 'الكل',
    [],
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="سجل التحديثات"
        subtitle="ما الجديد للمستخدمين"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            tab === 'published'
              ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
              : undefined
          }
          contentContainerStyle={{ paddingBottom: 50 }}
        >
          {/* Tab switcher */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'compose' && styles.tabBtnActive]}
              onPress={() => { haptics.selection(); setTab('compose'); }}
            >
              <Text style={[styles.tabText, tab === 'compose' && styles.tabTextActive]}>تأليف</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'published' && styles.tabBtnActive]}
              onPress={() => { haptics.selection(); setTab('published'); }}
            >
              <Text style={[styles.tabText, tab === 'published' && styles.tabTextActive]}>المنشور</Text>
            </TouchableOpacity>
          </View>

          {tab === 'compose' ? (
            <View style={styles.content}>
              <View style={styles.card}>
                <Text style={styles.cardHeader}>تحديث جديد</Text>

                <Text style={styles.fieldLabel}>رقم الإصدار</Text>
                <TextInput
                  style={styles.input}
                  placeholder="v1.2.0"
                  placeholderTextColor={Colors.textMuted}
                  value={version}
                  onChangeText={setVersion}
                  textAlign="right"
                  autoCapitalize="none"
                />

                <Text style={styles.fieldLabel}>العنوان</Text>
                <TextInput
                  style={styles.input}
                  placeholder="مثال: تحسينات على المحادثة"
                  placeholderTextColor={Colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  textAlign="right"
                />

                <Text style={styles.fieldLabel}>الوصف</Text>
                <TextInput
                  style={[styles.input, { minHeight: 110 }]}
                  placeholder="اشرح ما الجديد بأسلوب واضح ومختصر…"
                  placeholderTextColor={Colors.textMuted}
                  value={body}
                  onChangeText={setBody}
                  multiline
                  textAlign="right"
                  textAlignVertical="top"
                />

                <Text style={styles.fieldLabel}>التصنيف</Text>
                <View style={styles.catRow}>
                  {CATEGORY_LIST.map((c) => {
                    const meta = CATEGORY_META[c];
                    const active = category === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.catChip,
                          { backgroundColor: active ? meta.fg : meta.bg },
                        ]}
                        onPress={() => { haptics.selection(); setCategory(c); }}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={13}
                          color={active ? '#fff' : meta.fg}
                        />
                        <Text style={[styles.catText, { color: active ? '#fff' : meta.fg }]}>
                          {meta.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>الجمهور المستهدف</Text>
                <View style={styles.roleRow}>
                  {ROLE_OPTIONS.map((r) => {
                    const active = targetRole === r.key;
                    return (
                      <TouchableOpacity
                        key={String(r.key)}
                        style={[styles.roleChip, active && styles.roleChipActive]}
                        onPress={() => { haptics.selection(); setTargetRole(r.key); }}
                      >
                        <Text style={[styles.roleText, active && styles.roleTextActive]}>{r.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.draftBtn, saving && { opacity: 0.6 }]}
                  disabled={saving}
                  onPress={handleSaveDraft}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color={Colors.primary} />
                      <Text style={styles.draftBtnText}>حفظ كمسودة</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.publishBtn, saving && { opacity: 0.6 }]}
                  disabled={saving}
                  onPress={handleSaveAndPublish}
                  activeOpacity={0.85}
                >
                  <Ionicons name="rocket" size={16} color="#fff" />
                  <Text style={styles.publishBtnText}>حفظ ونشر</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.content}>
              {loading ? (
                <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 40 }} />
              ) : error ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="warning" size={40} color={Colors.error} />
                  <Text style={styles.emptyText}>{error}</Text>
                </View>
              ) : entries.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="document-text" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>لا توجد تحديثات بعد</Text>
                </View>
              ) : (
                entries.map((e) => {
                  const meta = CATEGORY_META[e.category];
                  return (
                    <View key={e.id} style={styles.entryCard}>
                      <View style={styles.entryTopRow}>
                        <View style={[styles.catBadge, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={12} color={meta.fg} />
                          <Text style={[styles.catBadgeText, { color: meta.fg }]}>{meta.label}</Text>
                        </View>
                        <Text style={styles.versionPill}>{e.version}</Text>
                      </View>

                      <Text style={styles.entryTitle} numberOfLines={2}>{e.title}</Text>
                      <Text style={styles.entryBody} numberOfLines={3}>{e.body}</Text>

                      <View style={styles.entryFooter}>
                        <Text style={styles.entryMeta}>
                          {e.target_role ? roleLabel(e.target_role) : 'الكل'}
                          {e.published_at ? ` · نُشر ${new Date(e.published_at).toLocaleDateString('ar-IQ')}` : ' · مسودة'}
                        </Text>
                        {!e.is_published ? (
                          <TouchableOpacity
                            style={styles.publishSmall}
                            onPress={() => handlePublishExisting(e)}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="rocket" size={12} color="#fff" />
                            <Text style={styles.publishSmallText}>نشر</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.publishedTag}>
                            <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                            <Text style={styles.publishedTagText}>منشور</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },

  content: { paddingHorizontal: 16, paddingTop: 16 },
  emptyWrap: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
    marginBottom: 12,
  },

  catRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  catChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  catText: { fontSize: 11, fontWeight: '800' },

  roleRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  roleChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F1F5F9' },
  roleChipActive: { backgroundColor: Colors.primary },
  roleText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  roleTextActive: { color: '#fff' },

  draftBtn: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  draftBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '800' },
  publishBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  publishBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Entry card (published list)
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  entryTopRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  catBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  catBadgeText: { fontSize: 10, fontWeight: '800' },
  versionPill: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.text,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  entryTitle: { fontSize: 14, fontWeight: '900', color: Colors.text, textAlign: 'right', marginBottom: 4 },
  entryBody: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', lineHeight: 18 },
  entryFooter: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  entryMeta: { fontSize: 10, color: Colors.textMuted, textAlign: 'right' },
  publishSmall: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  publishSmallText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  publishedTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  publishedTagText: { fontSize: 10, fontWeight: '800', color: Colors.success },
});
