// Announcement Templates — institute admin workflow.
//
// Why this exists: recurring announcements (holidays, reschedules, results)
// share boilerplate. Storing them with `{{var}}` placeholders lets the
// admin reuse them in one tap, with variable substitution at send-time.
//
// All data scoped to the current institute via instituteAdminService —
// the service helpers already filter by institute_id + go through RLS.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  ActivityIndicator, TextInput, ScrollView, Alert, Platform,
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
  listTemplates, upsertTemplate, deleteTemplate, type AnnTemplate,
} from '../../services/instituteAdminService';

// Variable detection regex — kept outside the component so each render
// reuses the same compiled instance.
const VAR_RX = /\{\{(\w+)\}\}/g;

function extractVars(body: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  // Reset lastIndex defensively — the regex is shared at module scope.
  VAR_RX.lastIndex = 0;
  while ((m = VAR_RX.exec(body)) !== null) {
    set.add(m[1]);
  }
  return Array.from(set);
}

export default function AnnTemplatesScreen() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [items, setItems] = useState<AnnTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fBody, setFBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await listTemplates(userInstituteId);
      setItems(list);
    } catch (err) {
      if (__DEV__) console.error('[ann-templates] load', err);
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

  const detectedVars = useMemo(() => extractVars(fBody), [fBody]);

  const openNew = () => {
    haptics.light();
    setEditingId(null);
    setFName('');
    setFCategory('');
    setFBody('');
    setSheetOpen(true);
  };

  const openEdit = (t: AnnTemplate) => {
    haptics.light();
    setEditingId(t.id);
    setFName(t.name || '');
    setFCategory(t.category || '');
    setFBody(t.body || '');
    setSheetOpen(true);
  };

  const onSave = async () => {
    if (!userInstituteId) return;
    const trimmedName = fName.trim();
    const trimmedBody = fBody.trim();
    if (!trimmedName) {
      Alert.alert('تنبيه', 'اسم القالب إلزامي');
      return;
    }
    if (!trimmedBody) {
      Alert.alert('تنبيه', 'نص القالب إلزامي');
      return;
    }
    if (trimmedName.length > 120) {
      Alert.alert('تنبيه', 'اسم القالب طويل جداً (أقصى 120 حرفاً)');
      return;
    }
    if (trimmedBody.length > 2000) {
      Alert.alert('تنبيه', 'النص طويل جداً (أقصى 2000 حرف)');
      return;
    }
    try {
      setSaving(true);
      const variables = extractVars(trimmedBody);
      await upsertTemplate({
        ...(editingId ? { id: editingId } : {}),
        institute_id: userInstituteId,
        name: trimmedName,
        category: fCategory.trim() || null,
        body: trimmedBody,
        variables,
      } as any);
      haptics.success();
      setSheetOpen(false);
      await load();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل حفظ القالب');
    } finally {
      setSaving(false);
    }
  };

  const onLongPressDelete = (t: AnnTemplate) => {
    confirmAlert(
      'حذف القالب',
      `هل تريد حذف "${t.name}"؟ لا يمكن التراجع.`,
      async () => {
        // Optimistic: remove right away so the list feels snappy.
        const previous = items;
        setItems((prev) => prev.filter((x) => x.id !== t.id));
        try {
          await deleteTemplate(t.id);
          haptics.success();
        } catch (err: any) {
          setItems(previous);
          Alert.alert('خطأ', err?.message || 'فشل حذف القالب');
        }
      },
      true,
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
        title="قوالب الإعلانات"
        subtitle="وفّر وقتك — قالب جاهز للحالات المتكررة"
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
          <View style={{ paddingHorizontal: 16 }}>
            <SectionLabel title="القوالب المحفوظة" icon="bookmarks-outline" />
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="document-text-outline" size={36} color={tokens.brand[500]} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد قوالب — أضف أول قالب</Text>
              <Text style={styles.emptyHint}>
                القوالب توفّر عليك إعادة كتابة نفس الإعلان كل مرة
              </Text>
            </View>
          ) : (
            items.map((t, i) => (
              <FadeSlideIn key={t.id} delay={Math.min(i * 40, 400)} translateFrom={10}>
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.7}
                  onPress={() => openEdit(t)}
                  onLongPress={() => onLongPressDelete(t)}
                  delayLongPress={500}
                >
                  <View style={styles.cardHeader}>
                    {!!t.category && (
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryText} numberOfLines={1}>{t.category}</Text>
                      </View>
                    )}
                    <Text style={styles.cardName} numberOfLines={1}>{t.name}</Text>
                  </View>
                  <Text style={styles.cardBody} numberOfLines={2}>{t.body}</Text>
                  <View style={styles.cardFooter}>
                    <View style={styles.useCountWrap}>
                      <Ionicons name="repeat-outline" size={12} color={tokens.text[4]} />
                      <Text style={styles.useCountText}>
                        استُخدم {t.use_count || 0} مرة
                      </Text>
                    </View>
                    {t.variables && t.variables.length > 0 && (
                      <View style={styles.varsHint}>
                        <Ionicons name="code-outline" size={12} color={tokens.brand[500]} />
                        <Text style={styles.varsHintText}>
                          {t.variables.length} متغيّر
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </FadeSlideIn>
            ))
          )}
        </KeyboardAwareScroll>
      )}

      <TouchableOpacity style={styles.fab} onPress={openNew} activeOpacity={0.9}>
        <View style={styles.fabInner}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>قالب جديد</Text>
        </View>
      </TouchableOpacity>

      <SwipeableSheet
        visible={sheetOpen}
        onClose={() => !saving && setSheetOpen(false)}
        maxHeight={0.9}
        overlayTapDisabled={saving}
        swipeDownDisabled={saving}
      >
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={() => !saving && setSheetOpen(false)} disabled={saving}>
            <Ionicons name="close" size={22} color={tokens.text[1]} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>
            {editingId ? 'تعديل القالب' : 'قالب جديد'}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAwareScroll
          contentContainerStyle={styles.sheetBody}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>اسم القالب *</Text>
          <TextInput
            value={fName}
            onChangeText={setFName}
            placeholder="مثال: تنويه إجازة"
            placeholderTextColor={tokens.text[4]}
            style={styles.input}
            textAlign="right"
            maxLength={120}
          />

          <Text style={styles.label}>التصنيف</Text>
          <TextInput
            value={fCategory}
            onChangeText={setFCategory}
            placeholder="عطلة، تأجيل، نتائج..."
            placeholderTextColor={tokens.text[4]}
            style={styles.input}
            textAlign="right"
            maxLength={60}
          />

          <Text style={styles.label}>نص القالب *</Text>
          <TextInput
            value={fBody}
            onChangeText={setFBody}
            placeholder="مثال: تنويه: الدوام معطّل يوم {{date}}"
            placeholderTextColor={tokens.text[4]}
            style={[styles.input, styles.textarea]}
            textAlign="right"
            multiline
            numberOfLines={6}
            maxLength={2000}
          />
          <Text style={styles.helper}>
            استخدم {'{{date}}'} أو {'{{name}}'} لقيم متغيرة. مثال: تنويه: الدوام معطّل يوم {'{{date}}'}
          </Text>

          {detectedVars.length > 0 && (
            <View style={styles.varsRow}>
              <Text style={styles.varsLabel}>متغيرات:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, flexDirection: 'row-reverse' }}
              >
                {detectedVars.map((v) => (
                  <View key={v} style={styles.varChip}>
                    <Text style={styles.varChipText}>{`{{${v}}}`}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={onSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {editingId ? 'حفظ التعديلات' : 'إضافة القالب'}
                </Text>
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

  card: {
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginVertical: 5,
    padding: 14,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
  },
  categoryBadge: {
    backgroundColor: tokens.brand[100],
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: 110,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.brand[500],
  },
  cardBody: {
    fontSize: 12,
    fontStyle: 'italic',
    color: tokens.text[3],
    textAlign: 'right',
    lineHeight: 18,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: tokens.border[2],
    paddingTop: 8,
  },
  useCountWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  useCountText: {
    fontSize: 11,
    color: tokens.text[4],
    fontWeight: '600',
  },
  varsHint: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  varsHintText: {
    fontSize: 11,
    color: tokens.brand[500],
    fontWeight: '700',
  },

  emptyBox: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
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
    textAlign: 'right', marginTop: 10, marginBottom: 6,
  },
  input: {
    backgroundColor: tokens.surface.surface,
    borderWidth: 1, borderColor: tokens.border[1], borderRadius: tokens.radius.md,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14, color: tokens.text[1],
  },
  textarea: { minHeight: 130, textAlignVertical: 'top' },
  helper: {
    fontSize: 11,
    color: tokens.text[3],
    textAlign: 'right',
    marginTop: 6,
    lineHeight: 17,
  },

  varsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  varsLabel: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  varChip: {
    backgroundColor: tokens.brand[50],
    borderWidth: 1,
    borderColor: tokens.brand[100],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  varChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.brand[500],
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
