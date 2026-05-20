// InstituteHelpSupport — تذاكر الدعم بين إدارة المؤسسة وفريق المنصة.
//
// تابان: "تذكرة جديدة" (فورم) + "تذاكري السابقة" (قائمة).
// الفورم يستخدم platformAdminService.createTicket (مع user_id +
// institute_id كي يربط التذكرة بالمؤسسة الصح — multi-tenant).
// قائمة التذاكر تقرأ من support_tickets مفلترة بـ user_id الحالي فقط
// (eq + limit + select columns محددة — ما نستخدم select(*) لأن
// قاعدة الـ bandwidth بالمشروع تمنع ذلك).
//
// لا يعدّل _layout.tsx (مسجّل مسبقاً) ولا يضيف تبعيات جديدة.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl,
  Platform,
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
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { timeAgo } from '../../utils/helpers';
import { supabase } from '../../services/supabase';
import {
  createTicket,
  type TicketCategory,
  type TicketPriority,
} from '../../services/platformAdminService';

// ─────────────────────────────────────────────────────────────────────────
// Tab + dictionary types
// ─────────────────────────────────────────────────────────────────────────
type Tab = 'new' | 'mine';
type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';

// Bounded local row shape — explicit columns (no select('*')).
type MyTicketRow = {
  id: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  admin_notes: string | null;
  created_at: string;
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug:      'مشكلة',
  feature:  'اقتراح',
  question: 'استفسار',
  billing:  'فوترة',
  other:    'أخرى',
};

const CATEGORY_ICONS: Record<TicketCategory, keyof typeof Ionicons.glyphMap> = {
  bug:      'bug-outline',
  feature:  'bulb-outline',
  question: 'help-circle-outline',
  billing:  'card-outline',
  other:    'ellipsis-horizontal-circle-outline',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low:    'منخفض',
  normal: 'عادي',
  high:   'مرتفع',
  urgent: 'عاجل',
};

const PRIORITY_STYLE: Record<TicketPriority, { bg: string; fg: string }> = {
  low:    { bg: tokens.surface.surface2,    fg: tokens.text[3] },
  normal: { bg: tokens.semantic.infoBg,     fg: tokens.semantic.info },
  high:   { bg: tokens.semantic.warningBg,  fg: tokens.semantic.warning },
  urgent: { bg: tokens.semantic.dangerBg,   fg: tokens.semantic.danger },
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open:          'مفتوحة',
  in_progress:   'قيد المعالجة',
  waiting_user:  'بانتظار ردك',
  resolved:      'تم الحل',
  closed:        'مغلقة',
};

const STATUS_STYLE: Record<TicketStatus, { bg: string; fg: string }> = {
  open:         { bg: tokens.semantic.infoBg,    fg: tokens.semantic.info },
  in_progress:  { bg: tokens.semantic.warningBg, fg: tokens.semantic.warning },
  waiting_user: { bg: tokens.semantic.purpleBg,  fg: tokens.semantic.purple },
  resolved:     { bg: tokens.semantic.successBg, fg: tokens.semantic.success },
  closed:       { bg: tokens.surface.surface2,   fg: tokens.text[3] },
};

const CATEGORIES: TicketCategory[] = ['bug', 'feature', 'question', 'billing', 'other'];
const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

// ─────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────
export default function InstituteHelpSupport() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [tab, setTab] = useState<Tab>('new');

  // New-ticket form state
  const [category, setCategory] = useState<TicketCategory>('question');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // My-tickets list state
  const [tickets, setTickets] = useState<MyTicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  // ── Load my tickets ────────────────────────────────────────────────
  const loadMine = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Explicit columns (no select('*')) + .limit() per bandwidth rules.
      // RLS on support_tickets restricts rows to the caller's user_id, but
      // we keep the .eq('user_id', …) filter as defense-in-depth.
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, category, priority, status, subject, admin_notes, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setTickets((data || []) as MyTicketRow[]);
    } catch (err: any) {
      if (__DEV__) console.error('[help-support] loadMine', err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل التذاكر');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Auto-load when the "تذاكري السابقة" tab is first opened.
  useEffect(() => {
    if (tab === 'mine' && tickets.length === 0 && !loading) loadMine();
    // We intentionally don't depend on tickets.length to avoid a re-fetch loop —
    // only re-trigger when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const onRefreshMine = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadMine(); } finally { setRefreshing(false); }
  }, [loadMine]);

  // ── Validation + submit ────────────────────────────────────────────
  const canSubmit = useMemo(() => {
    return (
      !!userId &&
      subject.trim().length >= 3 &&
      body.trim().length >= 10 &&
      !submitting
    );
  }, [userId, subject, body, submitting]);

  const resetForm = useCallback(() => {
    setCategory('question');
    setPriority('normal');
    setSubject('');
    setBody('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!userId) {
      Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً');
      return;
    }
    if (subject.trim().length < 3) {
      Alert.alert('تحقق', 'العنوان قصير جداً');
      return;
    }
    if (body.trim().length < 10) {
      Alert.alert('تحقق', 'يرجى شرح المشكلة بشكل أوضح');
      return;
    }

    setSubmitting(true);
    try {
      await createTicket({
        user_id: userId,
        institute_id: userInstituteId || null,
        category,
        priority,
        subject: subject.trim(),
        body: body.trim(),
      });
      haptics.success();
      setSuccessMsg('تم — سيتواصل معك الفريق قريباً');
      resetForm();
      // Switch to my-tickets and refresh so the new entry appears at the top.
      setTab('mine');
      await loadMine();
      // Auto-hide the success banner after a few seconds.
      setTimeout(() => setSuccessMsg(null), 4500);
    } catch (err: any) {
      haptics.error();
      if (__DEV__) console.error('[help-support] submit', err);
      Alert.alert('فشل الإرسال', err?.message || 'حاول مرة أخرى لاحقاً');
    } finally {
      setSubmitting(false);
    }
  }, [userId, userInstituteId, category, priority, subject, body, resetForm, loadMine]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الدعم الفني"
        subtitle="اطلب المساعدة من فريقنا"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        fallbackRoute="/(institute)/services"
      />

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <TouchableOpacity
          onPress={() => { haptics.selection(); setTab('new'); }}
          style={[styles.tab, tab === 'new' && styles.tabActive]}
          activeOpacity={0.85}
        >
          <Ionicons
            name="create-outline"
            size={16}
            color={tab === 'new' ? tokens.brand[500] : tokens.text[3]}
          />
          <Text style={[styles.tabText, tab === 'new' && styles.tabTextActive]}>
            تذكرة جديدة
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { haptics.selection(); setTab('mine'); }}
          style={[styles.tab, tab === 'mine' && styles.tabActive]}
          activeOpacity={0.85}
        >
          <Ionicons
            name="list-outline"
            size={16}
            color={tab === 'mine' ? tokens.brand[500] : tokens.text[3]}
          />
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>
            تذاكري السابقة
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'new' ? (
        <KeyboardAwareScroll
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {successMsg ? (
            <FadeSlideIn translateFrom={6}>
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={18} color={tokens.semantic.success} />
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            </FadeSlideIn>
          ) : null}

          {/* Category */}
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <SectionLabel title="نوع الطلب" icon="layers-outline" />
          </View>
          <View style={styles.chipsRow}>
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => { haptics.selection(); setCategory(c); }}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={CATEGORY_ICONS[c]}
                    size={14}
                    color={active ? tokens.brand[500] : tokens.text[3]}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {CATEGORY_LABELS[c]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Priority */}
          <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
            <SectionLabel title="الأولوية" icon="flag-outline" />
          </View>
          <View style={styles.chipsRow}>
            {PRIORITIES.map((p) => {
              const active = priority === p;
              const palette = PRIORITY_STYLE[p];
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => { haptics.selection(); setPriority(p); }}
                  style={[
                    styles.chip,
                    active && { backgroundColor: palette.bg, borderColor: palette.fg },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && { color: palette.fg, fontWeight: '800' },
                    ]}
                  >
                    {PRIORITY_LABELS[p]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Subject */}
          <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
            <SectionLabel title="العنوان" icon="text-outline" />
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="العنوان"
              placeholderTextColor={tokens.text[4]}
              style={styles.input}
              textAlign="right"
              maxLength={120}
              returnKeyType="next"
            />
          </View>

          {/* Body */}
          <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
            <SectionLabel title="التفاصيل" icon="document-text-outline" />
          </View>
          <View style={[styles.inputWrap, styles.bodyWrap]}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="اشرح المشكلة بالتفصيل"
              placeholderTextColor={tokens.text[4]}
              style={[styles.input, styles.bodyInput]}
              textAlign="right"
              multiline
              numberOfLines={8}
              maxLength={4000}
              textAlignVertical="top"
            />
          </View>
          <Text style={styles.counterText}>
            {body.length} / 4000
          </Text>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.submitText}>إرسال</Text>
              </>
            )}
          </TouchableOpacity>
        </KeyboardAwareScroll>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefreshMine}
              tintColor={tokens.brand[500]}
            />
          }
        >
          <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
            <SectionLabel title="تذاكري" icon="ticket-outline" />
          </View>

          {loading ? (
            <View style={{ paddingHorizontal: 16 }}>
              <SkeletonList count={5} cardHeight={96} />
            </View>
          ) : tickets.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="ticket-outline" size={36} color={tokens.brand[500]} />
              </View>
              <Text style={styles.emptyTitle}>لم تقدّم أي تذكرة بعد</Text>
              <Text style={styles.emptyHint}>
                أرسل تذكرة جديدة من التبويب الأول وسيتواصل معك الفريق
              </Text>
              <TouchableOpacity
                onPress={() => { haptics.selection(); setTab('new'); }}
                style={styles.emptyCta}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyCtaText}>تذكرة جديدة</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tickets.map((t, i) => {
              const pStyle = PRIORITY_STYLE[t.priority];
              const sStyle = STATUS_STYLE[t.status];
              const showNotes =
                (t.status === 'resolved' || t.status === 'closed') &&
                !!t.admin_notes &&
                t.admin_notes.trim().length > 0;
              return (
                <FadeSlideIn key={t.id} delay={Math.min(i * 25, 320)} translateFrom={8}>
                  <View style={styles.ticketCard}>
                    <View style={styles.ticketHeader}>
                      <View style={styles.ticketHeaderLeft}>
                        <View style={[styles.priorityBadge, { backgroundColor: pStyle.bg }]}>
                          <Text style={[styles.priorityBadgeText, { color: pStyle.fg }]}>
                            {PRIORITY_LABELS[t.priority]}
                          </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: sStyle.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: sStyle.fg }]}>
                            {STATUS_LABELS[t.status]}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.categoryIconWrap}>
                        <Ionicons
                          name={CATEGORY_ICONS[t.category]}
                          size={18}
                          color={tokens.brand[500]}
                        />
                      </View>
                    </View>

                    <Text style={styles.ticketSubject} numberOfLines={2}>
                      {t.subject}
                    </Text>

                    <View style={styles.ticketFooter}>
                      <Text style={styles.ticketCategory}>{CATEGORY_LABELS[t.category]}</Text>
                      <Text style={styles.ticketTime}>منذ {timeAgo(t.created_at)}</Text>
                    </View>

                    {showNotes ? (
                      <View style={styles.notesWrap}>
                        <Text style={styles.notesLabel}>رد الفريق:</Text>
                        <Text style={styles.notesText} numberOfLines={4}>
                          {t.admin_notes}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </FadeSlideIn>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },

  tabsWrap: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[2],
  },
  tabActive: {
    backgroundColor: tokens.brand[100],
    borderColor: tokens.brand[500],
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.text[3],
  },
  tabTextActive: {
    color: tokens.brand[500],
  },

  successBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.semantic.successBg,
    borderWidth: 1,
    borderColor: tokens.semantic.success,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: tokens.semantic.success,
    textAlign: 'right',
  },

  chipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 6,
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
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

  inputWrap: {
    marginHorizontal: 16,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...tokens.shadow.xs,
  },
  bodyWrap: {
    paddingVertical: 12,
    minHeight: 180,
  },
  input: {
    fontSize: 14,
    color: tokens.text[1],
    padding: 0,
    writingDirection: 'rtl',
  },
  bodyInput: {
    minHeight: 160,
    lineHeight: 22,
  },
  counterText: {
    fontSize: 10,
    color: tokens.text[4],
    fontWeight: '600',
    textAlign: 'left',
    paddingHorizontal: 20,
    marginTop: 4,
  },

  submitBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.brand[500],
    ...Platform.select({
      ios: {
        shadowColor: tokens.brand[500],
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 4 },
    }),
  },
  submitBtnDisabled: {
    backgroundColor: tokens.text[4],
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },

  // Ticket card
  ticketCard: {
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginVertical: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  ticketHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketHeaderLeft: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketSubject: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
    marginTop: 10,
    lineHeight: 22,
  },
  ticketFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  ticketCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.text[3],
  },
  ticketTime: {
    fontSize: 11,
    color: tokens.text[4],
    fontWeight: '600',
  },
  notesWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.border[2],
    gap: 4,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: tokens.semantic.success,
    textAlign: 'right',
  },
  notesText: {
    fontSize: 12,
    color: tokens.text[2],
    textAlign: 'right',
    lineHeight: 20,
  },

  // Empty state
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: {
    fontSize: 13,
    color: tokens.text[3],
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyCta: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.brand[500],
  },
  emptyCtaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
});
