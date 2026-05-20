// Institute · Library (المكتبة)
// Foundation CRUD for books — list, search, add/edit. Borrowing/loans flow is
// intentionally out of scope: it requires a separate loans table + workflow
// (student picker, due dates, return state). Keep this screen book-only.
// TODO: loans screen — separate route /(institute)/library-loans.tsx with
//       book_loans table (student_id, book_id, borrowed_at, due_at, returned_at).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SectionLabel from '../../components/institute/SectionLabel';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { listBooks, upsertBook, type LibraryBook } from '../../services/instituteAdminService';

type FormState = {
  id?: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  copies_total: string;     // kept as string for TextInput; parsed on save
  copies_available: string;
  cover_url: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  title: '', author: '', isbn: '', category: '',
  copies_total: '1', copies_available: '1', cover_url: '', notes: '',
};

// Parse a string to a non-negative integer. Returns 0 for empty / invalid input.
function toInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function InstituteLibrary() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // Track whether the available field was manually edited so opening a new-book
  // form auto-syncs available to total, but editing afterwards doesn't get
  // overwritten if the user changes total again.
  const [availableTouched, setAvailableTouched] = useState(false);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await listBooks(userInstituteId);
      setBooks(list);
    } catch (err: any) {
      if (__DEV__) console.error('[library] load', err);
      Alert.alert('خطأ', err?.message || 'تعذّر تحميل الكتب');
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

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return books;
    return books.filter(b =>
      (b.title || '').includes(q) ||
      (b.author || '').includes(q) ||
      (b.isbn || '').includes(q) ||
      (b.category || '').includes(q),
    );
  }, [books, search]);

  const openNew = () => {
    haptics.light();
    setForm(EMPTY_FORM);
    setAvailableTouched(false);
    setSheetOpen(true);
  };

  const openEdit = (b: LibraryBook) => {
    haptics.light();
    setForm({
      id: b.id,
      title: b.title || '',
      author: b.author || '',
      isbn: b.isbn || '',
      category: b.category || '',
      copies_total: String(b.copies_total ?? 0),
      copies_available: String(b.copies_available ?? 0),
      cover_url: b.cover_url || '',
      notes: b.notes || '',
    });
    setAvailableTouched(true); // editing existing — don't auto-overwrite
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (saving) return;
    setSheetOpen(false);
    setForm(EMPTY_FORM);
    setAvailableTouched(false);
  };

  const handleSave = async () => {
    if (!userInstituteId) return;
    const title = form.title.trim();
    if (!title) {
      Alert.alert('ناقص', 'العنوان مطلوب');
      return;
    }
    const total = toInt(form.copies_total);
    let available = toInt(form.copies_available);
    if (available > total) available = total;
    setSaving(true);
    try {
      const saved = await upsertBook({
        id: form.id,
        institute_id: userInstituteId,
        title,
        author: form.author.trim() || null,
        isbn: form.isbn.trim() || null,
        category: form.category.trim() || null,
        copies_total: total,
        copies_available: available,
        cover_url: form.cover_url.trim() || null,
        notes: form.notes.trim() || null,
      });
      // Optimistic refresh: replace or prepend.
      setBooks(prev => {
        const idx = prev.findIndex(b => b.id === saved.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [saved, ...prev];
      });
      haptics.success();
      closeSheet();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'تعذّر حفظ الكتاب');
    } finally {
      setSaving(false);
    }
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
        title="المكتبة"
        subtitle="إدارة الكتب والإعارة"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(168,85,247,0.30)"
      />

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={tokens.text[4]} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ابحث بعنوان، مؤلف، تصنيف..."
              placeholderTextColor={tokens.text[4]}
              style={styles.searchInput}
              textAlign="right"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={16} color={tokens.text[4]} />
              </TouchableOpacity>
            )}
          </View>

          <KeyboardAwareScroll
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
            }
          >
            <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
              <SectionLabel
                title={`الكتب (${filtered.length})`}
                icon="library-outline"
              />
            </View>

            {filtered.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="library-outline" size={36} color={tokens.brand[500]} />
                </View>
                <Text style={styles.emptyTitle}>
                  {search ? 'لا توجد نتائج' : 'لا توجد كتب'}
                </Text>
                <Text style={styles.emptyHint}>
                  {search ? 'جرّب بحث آخر' : 'أضف أول كتاب لمكتبتك'}
                </Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {filtered.map((b, i) => {
                  const available = b.copies_available ?? 0;
                  const total = b.copies_total ?? 0;
                  const isOut = total > 0 && available === 0;
                  const availColor = isOut ? tokens.semantic.danger : tokens.semantic.success;
                  const availBg = isOut ? tokens.semantic.dangerBg : tokens.semantic.successBg;
                  return (
                    <FadeSlideIn key={b.id} delay={Math.min(i * 25, 300)} translateFrom={6} style={styles.gridItem}>
                      <TouchableOpacity
                        style={styles.bookCard}
                        activeOpacity={0.7}
                        onPress={() => openEdit(b)}
                      >
                        <View style={styles.bookCover}>
                          <Ionicons name="book" size={28} color={tokens.brand[500]} />
                        </View>
                        <Text style={styles.bookTitle} numberOfLines={2}>{b.title}</Text>
                        {b.author ? (
                          <Text style={styles.bookAuthor} numberOfLines={1}>{b.author}</Text>
                        ) : <View style={{ height: 14 }} />}
                        <View style={styles.bookFooter}>
                          <View style={[styles.availPill, { backgroundColor: availBg }]}>
                            <Text style={[styles.availText, { color: availColor }]}>
                              {available}/{total} {isOut ? 'نفدت' : 'متاحة'}
                            </Text>
                          </View>
                          {b.category ? (
                            <View style={styles.catBadge}>
                              <Text style={styles.catText} numberOfLines={1}>{b.category}</Text>
                            </View>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    </FadeSlideIn>
                  );
                })}
              </View>
            )}
          </KeyboardAwareScroll>

          <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openNew}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.fabText}>كتاب</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ═══ Add / Edit sheet ═══ */}
      <SwipeableSheet
        visible={sheetOpen}
        onClose={closeSheet}
        maxHeight={0.92}
        minHeight={0.6}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={closeSheet} accessibilityLabel="إغلاق">
              <Ionicons name="close" size={24} color={tokens.text[1]} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>
              {form.id ? 'تعديل الكتاب' : 'كتاب جديد'}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLabel}>العنوان *</Text>
            <TextInput
              value={form.title}
              onChangeText={v => setForm(f => ({ ...f, title: v }))}
              placeholder="اسم الكتاب"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>المؤلف</Text>
            <TextInput
              value={form.author}
              onChangeText={v => setForm(f => ({ ...f, author: v }))}
              placeholder="اسم المؤلف"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>ISBN</Text>
            <TextInput
              value={form.isbn}
              onChangeText={v => setForm(f => ({ ...f, isbn: v }))}
              placeholder="978-XXXXXXXXXX"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
              keyboardType="default"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>التصنيف</Text>
            <TextInput
              value={form.category}
              onChangeText={v => setForm(f => ({ ...f, category: v }))}
              placeholder="مثال: رياضيات، أدب، علوم"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
            />

            {/* Numeric pair */}
            <View style={styles.row2}>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>عدد النسخ</Text>
                <TextInput
                  value={form.copies_total}
                  onChangeText={v => {
                    const cleaned = v.replace(/[^0-9]/g, '');
                    setForm(f => ({
                      ...f,
                      copies_total: cleaned,
                      // Auto-sync available to total for fresh entries.
                      copies_available: availableTouched ? f.copies_available : cleaned,
                    }));
                  }}
                  placeholder="1"
                  placeholderTextColor={tokens.text[4]}
                  style={styles.textField}
                  textAlign="right"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>المتاحة</Text>
                <TextInput
                  value={form.copies_available}
                  onChangeText={v => {
                    const cleaned = v.replace(/[^0-9]/g, '');
                    setAvailableTouched(true);
                    setForm(f => ({ ...f, copies_available: cleaned }));
                  }}
                  placeholder="1"
                  placeholderTextColor={tokens.text[4]}
                  style={styles.textField}
                  textAlign="right"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>رابط الغلاف (اختياري)</Text>
            <TextInput
              value={form.cover_url}
              onChangeText={v => setForm(f => ({ ...f, cover_url: v }))}
              placeholder="https://..."
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>ملاحظات</Text>
            <TextInput
              value={form.notes}
              onChangeText={v => setForm(f => ({ ...f, notes: v }))}
              placeholder="ملاحظات إضافية..."
              placeholderTextColor={tokens.text[4]}
              style={[styles.textField, styles.textArea]}
              textAlign="right"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>
                      {form.id ? 'حفظ التعديلات' : 'إضافة الكتاب'}
                    </Text>
                  </>
                )
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 13, color: tokens.text[3], fontWeight: '500' },

  // Search
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
    marginVertical: 12,
    ...tokens.shadow.xs,
  },
  searchInput: { flex: 1, fontSize: 13, color: tokens.text[1], padding: 0 },

  // Grid
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    gap: 8,
  },
  gridItem: { width: '48.5%' },
  bookCard: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
    minHeight: 200,
  },
  bookCover: {
    height: 80,
    backgroundColor: tokens.brand[100],
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bookTitle: { fontSize: 13, fontWeight: '800', color: tokens.text[1], textAlign: 'right', marginBottom: 2 },
  bookAuthor: { fontSize: 11, color: tokens.text[3], fontWeight: '600', textAlign: 'right', marginBottom: 6 },
  bookFooter: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 'auto' },
  availPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  availText: { fontSize: 10, fontWeight: '800' },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: tokens.surface.surface2,
    maxWidth: 90,
  },
  catText: { fontSize: 10, fontWeight: '700', color: tokens.text[2] },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 50, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500', textAlign: 'center' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.brand[500],
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: tokens.radius.xl,
    ...tokens.shadow.md,
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Sheet
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border[2],
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: tokens.text[1] },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: tokens.text[2], textAlign: 'right', marginBottom: 6 },

  textField: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[1],
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: tokens.text[1],
  },
  textArea: { minHeight: 80, paddingTop: 10 },

  row2: { flexDirection: 'row-reverse', gap: 10, marginTop: 14 },
  col: { flex: 1 },

  saveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.brand[500],
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
