// Institute · Behavior Notes (الملاحظات السلوكية)
// Foundation CRUD screen for daily student behavior tracking.
// Lists notes scoped to the current institute, supports filtering by sentiment,
// and adds new notes via a SwipeableSheet form. Style mirrors finance.tsx.

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
import {
  listBehaviorNotes, addBehaviorNote, type BehaviorNote,
} from '../../services/instituteAdminService';
import { api } from '../../services/api';

type Sentiment = 'positive' | 'neutral' | 'warning' | 'negative';
type Filter = 'all' | 'positive' | 'warning' | 'negative';

const SENTIMENT_META: Record<Sentiment, { label: string; emoji: string; dot: string; bg: string }> = {
  positive: { label: 'إيجابية', emoji: '😊', dot: tokens.semantic.success, bg: tokens.semantic.successBg },
  neutral:  { label: 'محايدة', emoji: '😐', dot: tokens.text[4],          bg: tokens.surface.surface2 },
  warning:  { label: 'تنبيهية', emoji: '⚠️', dot: tokens.semantic.warning, bg: tokens.semantic.warningBg },
  negative: { label: 'سلبية', emoji: '😠', dot: tokens.semantic.danger,  bg: tokens.semantic.dangerBg },
};

const FILTER_CHIPS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'positive', label: 'إيجابية' },
  { key: 'warning', label: 'تنبيهية' },
  { key: 'negative', label: 'سلبية' },
];

// Convert created_at to "منذ X" Arabic relative-time string.
function timeAgoAr(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'منذ لحظات';
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `منذ ${mo} شهر`;
  return `منذ ${Math.floor(mo / 12)} سنة`;
}

type StudentLite = { id: string; full_name: string };

export default function InstituteBehaviorNotes() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [notes, setNotes] = useState<BehaviorNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  // ── Add-note sheet state ──
  const [showAdd, setShowAdd] = useState(false);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pickedStudent, setPickedStudent] = useState<StudentLite | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment>('positive');
  const [category, setCategory] = useState('');
  const [noteText, setNoteText] = useState('');
  const [visibleToParent, setVisibleToParent] = useState(true);
  const [saving, setSaving] = useState(false);

  // Detect institute if missing — same pattern as finance.tsx.
  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await listBehaviorNotes(userInstituteId);
      setNotes(list);
    } catch (err: any) {
      if (__DEV__) console.error('[behavior-notes] load', err);
      Alert.alert('خطأ', err?.message || 'تعذّر تحميل الملاحظات');
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

  // Debounce the student-picker search (300ms) so we don't filter on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(studentQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [studentQuery]);

  // Lazy-load students only when the add sheet opens (cheaper than upfront).
  // Multi-tenant: scoped to userInstituteId via api.getStudentsByInstitute.
  useEffect(() => {
    if (!showAdd || !userInstituteId || students.length > 0) return;
    let alive = true;
    setStudentsLoading(true);
    (async () => {
      try {
        const rows = await api.getStudentsByInstitute(userInstituteId);
        if (!alive) return;
        setStudents(((rows as any[]) || []).map(r => ({ id: r.id, full_name: r.full_name || 'طالب' })));
      } catch (err) {
        if (__DEV__) console.warn('[behavior-notes] students load', err);
      } finally {
        if (alive) setStudentsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [showAdd, userInstituteId, students.length]);

  const filteredStudents = useMemo(() => {
    if (!debouncedQuery) return students.slice(0, 50);
    return students
      .filter(s => s.full_name.includes(debouncedQuery))
      .slice(0, 50);
  }, [students, debouncedQuery]);

  const filteredNotes = useMemo(() => {
    if (filter === 'all') return notes;
    return notes.filter(n => n.sentiment === filter);
  }, [notes, filter]);

  const resetForm = () => {
    setPickedStudent(null);
    setStudentQuery('');
    setDebouncedQuery('');
    setSentiment('positive');
    setCategory('');
    setNoteText('');
    setVisibleToParent(true);
  };

  const handleSave = async () => {
    if (!userInstituteId) return;
    if (!pickedStudent) {
      Alert.alert('ناقص', 'اختر طالباً');
      return;
    }
    const trimmed = noteText.trim();
    if (!trimmed) {
      Alert.alert('ناقص', 'اكتب نص الملاحظة');
      return;
    }
    setSaving(true);
    try {
      const created = await addBehaviorNote({
        institute_id: userInstituteId,
        student_id: pickedStudent.id,
        sentiment,
        category: category.trim() || null,
        note: trimmed,
        visible_to_parent: visibleToParent,
      });
      // Optimistically prepend with the student name we already know.
      setNotes(prev => [{ ...created, student_name: pickedStudent.full_name }, ...prev]);
      haptics.success();
      setShowAdd(false);
      resetForm();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'تعذّر حفظ الملاحظة');
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
        title="الملاحظات السلوكية"
        subtitle="تقييم سلوك الطلاب اليومي"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Filter chips */}
          <View style={styles.chipsRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: 'row-reverse' }}
            >
              {FILTER_CHIPS.map(c => {
                const active = filter === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => { haptics.light(); setFilter(c.key); }}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <KeyboardAwareScroll
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
            }
          >
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <SectionLabel title={`الملاحظات (${filteredNotes.length})`} icon="list-outline" />
            </View>

            {filteredNotes.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="chatbubbles-outline" size={36} color={tokens.brand[500]} />
                </View>
                <Text style={styles.emptyTitle}>لا توجد ملاحظات</Text>
                <Text style={styles.emptyHint}>
                  {filter === 'all' ? 'أضف أول ملاحظة سلوكية لطالب' : 'لا توجد ملاحظات بهذا التصنيف'}
                </Text>
              </View>
            ) : (
              filteredNotes.map((n, i) => {
                const meta = SENTIMENT_META[n.sentiment] || SENTIMENT_META.neutral;
                return (
                  <FadeSlideIn key={n.id} delay={Math.min(i * 25, 300)} translateFrom={6}>
                    <View style={styles.noteCard}>
                      {/* Header row: dot + student name + age */}
                      <View style={styles.noteHeader}>
                        <Text style={styles.noteAge}>{timeAgoAr(n.created_at)}</Text>
                        <View style={styles.noteHeaderRight}>
                          <Text style={styles.noteName} numberOfLines={1}>
                            {n.student_name || 'طالب'}
                          </Text>
                          <View style={[styles.dot, { backgroundColor: meta.dot }]} />
                        </View>
                      </View>

                      {/* Note body */}
                      <Text style={styles.noteBody} numberOfLines={2}>{n.note}</Text>

                      {/* Footer: sentiment + category + parent-visible pill */}
                      <View style={styles.noteFooter}>
                        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.badgeText, { color: meta.dot }]}>
                            {meta.emoji} {meta.label}
                          </Text>
                        </View>
                        {n.category ? (
                          <View style={[styles.badge, { backgroundColor: tokens.surface.surface2 }]}>
                            <Text style={[styles.badgeText, { color: tokens.text[2] }]}>{n.category}</Text>
                          </View>
                        ) : null}
                        {n.visible_to_parent ? (
                          <View style={[styles.badge, { backgroundColor: tokens.semantic.infoBg }]}>
                            <Ionicons name="eye-outline" size={11} color={tokens.semantic.info} />
                            <Text style={[styles.badgeText, { color: tokens.semantic.info, marginRight: 4 }]}>
                              يراه الوالد
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </FadeSlideIn>
                );
              })
            )}
          </KeyboardAwareScroll>

          {/* Floating add button */}
          <TouchableOpacity
            style={styles.fab}
            activeOpacity={0.85}
            onPress={() => { haptics.light(); setShowAdd(true); }}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.fabText}>ملاحظة</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ═══ Add-note sheet ═══ */}
      <SwipeableSheet
        visible={showAdd}
        onClose={() => { if (!saving) { setShowAdd(false); resetForm(); } }}
        maxHeight={0.92}
        minHeight={0.6}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetHeader}>
            <TouchableOpacity
              onPress={() => { if (!saving) { setShowAdd(false); resetForm(); } }}
              accessibilityLabel="إغلاق"
            >
              <Ionicons name="close" size={24} color={tokens.text[1]} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>ملاحظة سلوكية جديدة</Text>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Student picker */}
            <Text style={styles.fieldLabel}>الطالب</Text>
            {pickedStudent ? (
              <View style={styles.pickedRow}>
                <TouchableOpacity onPress={() => setPickedStudent(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close-circle" size={20} color={tokens.text[4]} />
                </TouchableOpacity>
                <Text style={styles.pickedName}>{pickedStudent.full_name}</Text>
                <Ionicons name="person-circle" size={22} color={tokens.brand[500]} />
              </View>
            ) : (
              <>
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={16} color={tokens.text[4]} />
                  <TextInput
                    value={studentQuery}
                    onChangeText={setStudentQuery}
                    placeholder="ابحث باسم الطالب..."
                    placeholderTextColor={tokens.text[4]}
                    style={styles.searchInput}
                    textAlign="right"
                  />
                  {studentQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setStudentQuery('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="close-circle" size={16} color={tokens.text[4]} />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.studentList}>
                  {studentsLoading ? (
                    <ActivityIndicator color={tokens.brand[500]} style={{ marginVertical: 12 }} />
                  ) : filteredStudents.length === 0 ? (
                    <Text style={styles.emptySubtle}>
                      {debouncedQuery ? 'لا توجد نتائج' : 'اكتب اسم الطالب للبحث'}
                    </Text>
                  ) : (
                    filteredStudents.map(s => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.studentRow}
                        activeOpacity={0.6}
                        onPress={() => { haptics.selection(); setPickedStudent(s); }}
                      >
                        <Ionicons name="chevron-back" size={14} color={tokens.text[4]} />
                        <Text style={styles.studentName} numberOfLines={1}>{s.full_name}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </>
            )}

            {/* Sentiment */}
            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>التقييم</Text>
            <View style={styles.sentimentRow}>
              {(['positive', 'neutral', 'warning', 'negative'] as Sentiment[]).map(key => {
                const meta = SENTIMENT_META[key];
                const active = sentiment === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.sentChip,
                      { backgroundColor: active ? meta.dot : meta.bg },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => { haptics.selection(); setSentiment(key); }}
                  >
                    <Text style={{ fontSize: 16 }}>{meta.emoji}</Text>
                    <Text style={[
                      styles.sentChipText,
                      { color: active ? '#fff' : meta.dot },
                    ]}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Category */}
            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>التصنيف (اختياري)</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="مثال: حضور، واجبات، انضباط، إنجاز"
              placeholderTextColor={tokens.text[4]}
              style={styles.textField}
              textAlign="right"
            />

            {/* Note */}
            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>نص الملاحظة</Text>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder="اكتب الملاحظة..."
              placeholderTextColor={tokens.text[4]}
              style={[styles.textField, styles.textArea]}
              textAlign="right"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Visible to parent toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              activeOpacity={0.7}
              onPress={() => { haptics.selection(); setVisibleToParent(v => !v); }}
            >
              <View style={[styles.toggleSwitch, visibleToParent && styles.toggleSwitchOn]}>
                <View style={[styles.toggleKnob, visibleToParent && styles.toggleKnobOn]} />
              </View>
              <Text style={styles.toggleLabel}>يظهر لولي الأمر</Text>
            </TouchableOpacity>

            {/* Save */}
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
                    <Text style={styles.saveBtnText}>حفظ الملاحظة</Text>
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

  // Filter chips
  chipsRow: { paddingVertical: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[1],
  },
  chipActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  chipTextActive: { color: '#fff' },

  // Note card
  noteCard: {
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: tokens.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  noteHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  noteHeaderRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  noteName: { fontSize: 14, fontWeight: '800', color: tokens.text[1], textAlign: 'right', flex: 1 },
  noteAge: { fontSize: 10, color: tokens.text[4], fontWeight: '600' },
  noteBody: { fontSize: 13, color: tokens.text[2], textAlign: 'right', lineHeight: 19, marginBottom: 10 },
  noteFooter: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  badge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
  emptySubtle: { fontSize: 12, color: tokens.text[4], textAlign: 'center', paddingVertical: 16 },

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

  // Picked student row
  pickedRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.brand[100],
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
  },
  pickedName: { flex: 1, fontSize: 14, fontWeight: '700', color: tokens.brand[500], textAlign: 'right' },

  // Search
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[1],
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: tokens.text[1], padding: 0 },

  // Student list
  studentList: {
    marginTop: 8,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: tokens.border[2],
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2,
    overflow: 'hidden',
  },
  studentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border[2],
  },
  studentName: { flex: 1, fontSize: 13, fontWeight: '600', color: tokens.text[1], textAlign: 'right', marginEnd: 10 },

  // Sentiment chips
  sentimentRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  sentChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.md,
  },
  sentChipText: { fontSize: 12, fontWeight: '800' },

  // Text inputs
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
  textArea: { minHeight: 90, paddingTop: 10 },

  // Toggle
  toggleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 6,
  },
  toggleSwitch: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: tokens.border[1],
    padding: 3,
    justifyContent: 'center',
  },
  toggleSwitchOn: { backgroundColor: tokens.brand[500] },
  toggleKnob: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleKnobOn: { alignSelf: 'flex-end' },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },

  // Save button
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
