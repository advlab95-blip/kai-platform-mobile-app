// Platform admin · Moderation Queue
// ────────────────────────────────────────────────────────────────────
// Surfaces user-reported content (chats, posts, etc.) so the platform
// admin can dismiss false-positives or apply an action
// (content_removed / user_warned / user_suspended).
//
// Data layer: services/platformAdminService.ts → listModerationReports /
// reviewModerationReport. The reviewer + reviewed_at columns are
// auto-stamped server-side via the service helper.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import { confirmAlert, successAlert, errorAlert } from '../../utils/alerts';
import {
  listModerationReports,
  reviewModerationReport,
  type ModerationReport,
} from '../../services/platformAdminService';

type StatusKey = 'pending' | 'reviewing' | 'dismissed' | 'action_taken' | 'all';

const STATUS_FILTERS: Array<{ key: StatusKey; label: string }> = [
  { key: 'all',          label: 'الكل' },
  { key: 'pending',      label: 'بانتظار' },
  { key: 'reviewing',    label: 'قيد المراجعة' },
  { key: 'dismissed',    label: 'تم التجاهل' },
  { key: 'action_taken', label: 'تم اتخاذ إجراء' },
];

// reason_category → Arabic label + badge colour
const REASON_BADGE: Record<ModerationReport['reason_category'], { label: string; bg: string; fg: string }> = {
  spam:          { label: 'سبام',     bg: '#FEF3C7', fg: '#B45309' },
  harassment:    { label: 'تحرش',     bg: '#FEE2E2', fg: '#DC2626' },
  inappropriate: { label: 'غير لائق', bg: '#FFEDD5', fg: '#C2410C' },
  violence:      { label: 'عنف',      bg: '#FCE7F3', fg: '#BE185D' },
  other:         { label: 'أخرى',     bg: '#F1F5F9', fg: '#475569' },
};

// content_type icon — keeps the queue scannable. Falls back to a generic
// document icon for unknown types added later in the schema.
function contentIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'message':   return 'chatbubble';
    case 'comment':   return 'chatbox';
    case 'post':      return 'document-text';
    case 'user':      return 'person-circle';
    case 'media':     return 'image';
    default:          return 'document';
  }
}

function relativeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

const ACTION_OPTIONS: Array<{ key: string; label: string; icon: keyof typeof Ionicons.glyphMap; tone: 'warn' | 'danger' }> = [
  { key: 'content_removed', label: 'حذف المحتوى',     icon: 'trash',          tone: 'danger' },
  { key: 'user_warned',     label: 'تحذير المستخدم',  icon: 'alert-circle',   tone: 'warn'   },
  { key: 'user_suspended',  label: 'تعليق المستخدم',  icon: 'ban',            tone: 'danger' },
];

export default function AdminModeration() {
  const [statusFilter, setStatusFilter] = useState<StatusKey>('pending');
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action sheet (for "إجراء متخذ" — picks the actual action_taken value).
  const [actionFor, setActionFor] = useState<ModerationReport | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listModerationReports(
        statusFilter === 'all' ? undefined : { status: statusFilter },
      );
      setReports(data);
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل البلاغات');
    }
  }, [statusFilter]);

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

  // "تجاهل" — moves the report into `dismissed` with no action_taken.
  // Confirmation prompt because once dismissed the row drops out of the
  // pending queue and is easy to forget.
  const handleDismiss = (r: ModerationReport) => {
    confirmAlert(
      'تجاهل البلاغ',
      'هل تريد تجاهل هذا البلاغ؟ سيُحفظ القرار ولن يظهر في قائمة المنتظرة.',
      async () => {
        try {
          await reviewModerationReport(r.id, 'dismissed');
          successAlert('تم', 'تم تجاهل البلاغ');
          await load();
        } catch (e: any) {
          errorAlert('خطأ', e?.message || 'فشل تحديث البلاغ');
        }
      },
      false,
      'تجاهل',
    );
  };

  const openActionSheet = (r: ModerationReport) => {
    haptics.selection();
    setActionFor(r);
  };

  const applyAction = async (actionKey: string) => {
    if (!actionFor) return;
    setApplying(true);
    try {
      await reviewModerationReport(actionFor.id, 'action_taken', actionKey);
      successAlert('تم', 'تم تسجيل الإجراء');
      setActionFor(null);
      await load();
    } catch (e: any) {
      errorAlert('خطأ', e?.message || 'فشل تطبيق الإجراء');
    } finally {
      setApplying(false);
    }
  };

  const filters = useMemo(() => STATUS_FILTERS, []);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="مراجعة المحتوى المُبلَّغ"
        subtitle="قائمة البلاغات وقرار الإدارة"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {filters.map((f) => {
            const active = statusFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => { haptics.selection(); setStatusFilter(f.key); }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 40 }} />
          ) : error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="warning" size={40} color={Colors.error} />
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : reports.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="shield-checkmark" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد بلاغات</Text>
            </View>
          ) : (
            reports.map((r) => {
              const badge = REASON_BADGE[r.reason_category] || REASON_BADGE.other;
              const isOpen = r.status === 'pending' || r.status === 'reviewing';
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.ageText}>{relativeAgo(r.created_at)}</Text>
                    <View style={[styles.reasonBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.reasonText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                  </View>

                  <View style={styles.cardHeaderRow}>
                    <View style={styles.catIconWrap}>
                      <Ionicons name={contentIcon(r.content_type)} size={16} color={Colors.primary} />
                    </View>
                    <Text style={styles.contentType}>{r.content_type}</Text>
                  </View>

                  <Text style={styles.reason} numberOfLines={3}>{r.reason}</Text>

                  {r.content_snapshot ? (
                    <View style={styles.snapshotBox}>
                      <Text style={styles.snapshotText} numberOfLines={3}>
                        {r.content_snapshot}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {r.reporter_name || 'مُبلِّغ'}
                      {r.institute_name ? ` · ${r.institute_name}` : ''}
                    </Text>
                  </View>

                  {isOpen ? (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.dismissBtn]}
                        onPress={() => handleDismiss(r)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="close-circle" size={14} color={Colors.textSecondary} />
                        <Text style={styles.dismissText}>تجاهل</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.takeActionBtn]}
                        onPress={() => openActionSheet(r)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="hammer" size={14} color="#fff" />
                        <Text style={styles.takeActionText}>إجراء متخذ</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.closedRow}>
                      <Ionicons
                        name={r.status === 'dismissed' ? 'close-circle' : 'checkmark-done'}
                        size={14}
                        color={Colors.textMuted}
                      />
                      <Text style={styles.closedText}>
                        {r.status === 'dismissed' ? 'تم التجاهل' : `إجراء: ${r.action_taken || '—'}`}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ────────── Action picker sheet ────────── */}
      <SwipeableSheet visible={!!actionFor} onClose={() => setActionFor(null)} maxHeight={0.55}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>اختر الإجراء</Text>
          <Text style={styles.sheetSubtitle}>سيُحفظ القرار وستُسجَّل هويتك كمراجع.</Text>

          <View style={{ marginTop: 12 }}>
            {ACTION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.optionRow,
                  opt.tone === 'danger' ? styles.optionDanger : styles.optionWarn,
                  applying && { opacity: 0.6 },
                ]}
                disabled={applying}
                onPress={() => applyAction(opt.key)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={opt.tone === 'danger' ? Colors.error : Colors.warning}
                />
                <Text style={styles.optionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {applying ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 14 }} />
          ) : null}
        </View>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  chipsRow: { paddingHorizontal: 16, paddingTop: 14, gap: 8, flexDirection: 'row' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTextActive: { color: '#fff' },
  content: { paddingHorizontal: 16, paddingTop: 14 },
  emptyWrap: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 },
  catIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  contentType: { fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  reasonBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  reasonText: { fontSize: 10, fontWeight: '800' },
  reason: { fontSize: 13, color: Colors.text, textAlign: 'right', lineHeight: 19 },
  snapshotBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.border,
  },
  snapshotText: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', textAlign: 'right', lineHeight: 17 },
  metaRow: { marginTop: 10 },
  metaText: { fontSize: 10, color: Colors.textMuted, textAlign: 'right' },
  ageText: { fontSize: 10, color: Colors.textMuted },

  actionsRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  dismissBtn: { backgroundColor: '#F1F5F9' },
  dismissText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  takeActionBtn: { backgroundColor: Colors.error },
  takeActionText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  closedRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 10 },
  closedText: { fontSize: 11, color: Colors.textMuted },

  // Sheet
  sheetContent: { paddingHorizontal: 18, paddingBottom: 30 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  sheetSubtitle: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
  optionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  optionDanger: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  optionWarn:   { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  optionText: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' },
});
