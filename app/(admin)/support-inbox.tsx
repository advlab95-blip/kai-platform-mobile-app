// Platform admin · Support Inbox
// ────────────────────────────────────────────────────────────────────
// Lists user-submitted support tickets and lets the platform admin
// triage them: change status, change priority, add internal notes,
// or close as resolved (which timestamps + records the admin who did it).
//
// Data layer: services/platformAdminService.ts → listTickets / updateTicket
// (RLS already restricts these queries to platform admins; see schema notes).

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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import { successAlert, errorAlert } from '../../utils/alerts';
import useAuthStore from '../../stores/authStore';
import {
  listTickets,
  updateTicket,
  type SupportTicket,
  type TicketStatus,
  type TicketPriority,
  type TicketCategory,
} from '../../services/platformAdminService';

// ───────── Static label maps (Arabic) ─────────
const STATUS_FILTERS: Array<{ key: TicketStatus | 'all'; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'open', label: 'مفتوحة' },
  { key: 'in_progress', label: 'قيد العمل' },
  { key: 'waiting_user', label: 'بانتظار المستخدم' },
  { key: 'resolved', label: 'محلولة' },
  { key: 'closed', label: 'مغلقة' },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد العمل',
  waiting_user: 'بانتظار المستخدم',
  resolved: 'محلولة',
  closed: 'مغلقة',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'مرتفعة',
  urgent: 'عاجلة',
};

// Color-coded badge per priority — matches finance.tsx visual language.
const PRIORITY_COLOR: Record<TicketPriority, { bg: string; fg: string }> = {
  low:    { bg: '#F1F5F9', fg: '#64748B' },
  normal: { bg: '#DBEAFE', fg: '#1E40AF' },
  high:   { bg: '#FEF3C7', fg: '#B45309' },
  urgent: { bg: '#FEE2E2', fg: '#DC2626' },
};

const CATEGORY_ICON: Record<TicketCategory, keyof typeof Ionicons.glyphMap> = {
  bug:      'bug',
  feature:  'bulb',
  question: 'help-circle',
  billing:  'card',
  other:    'ellipsis-horizontal-circle',
};

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  bug:      'خطأ',
  feature:  'اقتراح ميزة',
  question: 'سؤال',
  billing:  'فوترة',
  other:    'أخرى',
};

// Returns Arabic relative time ("منذ X يوم") — keeps the list scannable
// without forcing the admin to mentally parse ISO timestamps.
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

export default function AdminSupportInbox() {
  const userId = useAuthStore((s) => s.userId);

  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Detail sheet state ──
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [editStatus, setEditStatus] = useState<TicketStatus>('open');
  const [editPriority, setEditPriority] = useState<TicketPriority>('normal');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listTickets(
        statusFilter === 'all' ? undefined : { status: statusFilter },
      );
      setTickets(data);
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل التذاكر');
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

  const openDetail = (t: SupportTicket) => {
    haptics.selection();
    setSelected(t);
    setEditStatus(t.status);
    setEditPriority(t.priority);
    setEditNotes(t.admin_notes || '');
  };

  const closeDetail = () => setSelected(null);

  // Generic save — applies only the fields the admin actually touched.
  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateTicket(selected.id, {
        status: editStatus,
        priority: editPriority,
        admin_notes: editNotes.trim() || null,
      });
      successAlert('تم الحفظ', 'تم تحديث التذكرة');
      closeDetail();
      await load();
    } catch (e: any) {
      errorAlert('خطأ', e?.message || 'فشل حفظ التغييرات');
    } finally {
      setSaving(false);
    }
  };

  // Shortcut: resolve + stamp resolved_at / resolved_by in one go so the
  // admin doesn't have to manually fiddle with the status picker for the
  // common "this is done, close it" flow.
  const handleResolve = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateTicket(selected.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: userId || null,
        admin_notes: editNotes.trim() || null,
      });
      successAlert('تم', 'تم وضع التذكرة كمحلولة');
      closeDetail();
      await load();
    } catch (e: any) {
      errorAlert('خطأ', e?.message || 'فشل تحديث الحالة');
    } finally {
      setSaving(false);
    }
  };

  const statusChips = useMemo(() => STATUS_FILTERS, []);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="صندوق الدعم"
        subtitle="ملاحظات وبلاغات المستخدمين"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {statusChips.map((c) => {
            const active = statusFilter === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => { haptics.selection(); setStatusFilter(c.key); }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
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
          ) : tickets.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="mail-open" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد تذاكر</Text>
            </View>
          ) : (
            tickets.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => openDetail(t)}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.ageText}>{relativeAgo(t.created_at)}</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLOR[t.priority].bg }]}>
                    <Text style={[styles.priorityText, { color: PRIORITY_COLOR[t.priority].fg }]}>
                      {PRIORITY_LABEL[t.priority]}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardHeaderRow}>
                  <View style={styles.catIconWrap}>
                    <Ionicons name={CATEGORY_ICON[t.category]} size={16} color={Colors.primary} />
                  </View>
                  <Text style={styles.subject} numberOfLines={1}>{t.subject}</Text>
                </View>

                <Text style={styles.body} numberOfLines={2}>{t.body}</Text>

                <View style={styles.cardFooter}>
                  <Text style={styles.statusPill}>{STATUS_LABEL[t.status]}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {t.user_name || 'مستخدم'}
                    {t.institute_name ? ` · ${t.institute_name}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* ────────── Detail / Edit Sheet ────────── */}
      <SwipeableSheet visible={!!selected} onClose={closeDetail} maxHeight={0.92}>
        {selected ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            <Text style={styles.sheetTitle}>{selected.subject}</Text>
            <Text style={styles.sheetMeta}>
              {CATEGORY_LABEL[selected.category]} · {selected.user_name || 'مستخدم'}
              {selected.institute_name ? ` · ${selected.institute_name}` : ''} · {relativeAgo(selected.created_at)}
            </Text>

            <View style={styles.sheetBodyBox}>
              <Text style={styles.sheetBodyText}>{selected.body}</Text>
            </View>

            <Text style={styles.fieldLabel}>الحالة</Text>
            <View style={styles.pickerRow}>
              {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.pickerChip, editStatus === s && styles.pickerChipActive]}
                  onPress={() => { haptics.selection(); setEditStatus(s); }}
                >
                  <Text style={[styles.pickerText, editStatus === s && styles.pickerTextActive]}>
                    {STATUS_LABEL[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>الأولوية</Text>
            <View style={styles.pickerRow}>
              {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pickerChip, editPriority === p && styles.pickerChipActive]}
                  onPress={() => { haptics.selection(); setEditPriority(p); }}
                >
                  <Text style={[styles.pickerText, editPriority === p && styles.pickerTextActive]}>
                    {PRIORITY_LABEL[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>ملاحظات الإدارة</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="ملاحظة داخلية للفريق…"
              placeholderTextColor={Colors.textMuted}
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
              textAlign="right"
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
              disabled={saving}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>حفظ</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.successBtn, saving && { opacity: 0.6 }]}
              disabled={saving}
              onPress={handleResolve}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>وضع كمحلولة</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  chipsRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTextActive: { color: '#fff' },
  content: { paddingHorizontal: 16, paddingTop: 14 },
  emptyWrap: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  // Ticket card
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
  cardTopRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  catIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  subject: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  body: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', lineHeight: 18 },
  cardFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  statusPill: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  metaText: { fontSize: 10, color: Colors.textMuted, textAlign: 'left' },
  ageText: { fontSize: 10, color: Colors.textMuted },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priorityText: { fontSize: 10, fontWeight: '800' },

  // Sheet
  sheetContent: { paddingHorizontal: 18, paddingBottom: 30 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, textAlign: 'right', marginBottom: 6 },
  sheetMeta: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginBottom: 12 },
  sheetBodyBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  sheetBodyText: { fontSize: 13, color: Colors.text, textAlign: 'right', lineHeight: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, textAlign: 'right', marginBottom: 8, marginTop: 4 },
  pickerRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  pickerChipActive: { backgroundColor: Colors.primary },
  pickerText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  pickerTextActive: { color: '#fff' },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
    minHeight: 90,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  successBtn: {
    backgroundColor: Colors.success,
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
