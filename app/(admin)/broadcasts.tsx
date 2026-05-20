// Platform-wide broadcast composer + history for the Platform Admin.
// Compose tab: title, body, severity, target scope (with conditional
// role / institute pickers), optional CTA. Send via createBroadcast →
// sendBroadcast (SECURITY DEFINER RPC fans out notifications).
// History tab: lists prior broadcasts with recipient counts.

import React, { useEffect, useState, useCallback } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import { supabase } from '../../services/supabase';
import {
  createBroadcast,
  sendBroadcast,
  listBroadcasts,
  type BroadcastSeverity,
  type BroadcastTargetScope,
  type PlatformBroadcast,
} from '../../services/platformAdminService';

// ──────────────────────── Constants ────────────────────────
const SEVERITIES: { key: BroadcastSeverity; label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'info',     label: 'معلومة', color: tokens.color.info,    bg: tokens.color.infoBg,    icon: 'information-circle-outline' },
  { key: 'success',  label: 'نجاح',   color: tokens.color.success, bg: tokens.color.successBg, icon: 'checkmark-circle-outline' },
  { key: 'warning',  label: 'تنبيه',  color: tokens.color.warning, bg: tokens.color.warningBg, icon: 'warning-outline' },
  { key: 'critical', label: 'حرج',    color: tokens.color.danger,  bg: tokens.color.dangerBg,  icon: 'alert-circle-outline' },
];

const SCOPES: { key: BroadcastTargetScope; label: string }[] = [
  { key: 'all',             label: 'الكل' },
  { key: 'role',            label: 'دور' },
  { key: 'institute',       label: 'مؤسسات' },
  { key: 'institute_role',  label: 'مؤسسات + دور' },
];

const ROLES: { key: string; label: string }[] = [
  { key: 'admin',      label: 'ادمن منصة' },
  { key: 'institute',  label: 'إدارة مؤسسة' },
  { key: 'teacher',    label: 'أستاذ' },
  { key: 'student',    label: 'طالب' },
  { key: 'parent',     label: 'ولي أمر' },
  { key: 'cafeteria',  label: 'كافتيريا' },
  { key: 'medical',    label: 'طبابة' },
];

const TABS = [
  { key: 'compose', label: 'تأليف' },
  { key: 'history', label: 'السجل' },
] as const;

// ──────────────────────── Helpers ──────────────────────────
function severityMeta(s: BroadcastSeverity) {
  return SEVERITIES.find((x) => x.key === s) || SEVERITIES[0];
}

// "منذ N دقيقة/ساعة/يوم" — relative timeline for sent_at
function humanizeSent(iso: string | null): string {
  if (!iso) return 'لم يُرسل بعد';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  return new Date(iso).toLocaleDateString('ar-IQ');
}

// ──────────────────────── Screen ───────────────────────────
type InstituteRow = { id: string; name: string };

export default function AdminBroadcasts() {
  const [tab, setTab] = useState<typeof TABS[number]['key']>('compose');

  // Compose state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<BroadcastSeverity>('info');
  const [scope, setScope] = useState<BroadcastTargetScope>('all');
  const [role, setRole] = useState<string>('');
  const [selectedInstitutes, setSelectedInstitutes] = useState<Set<string>>(new Set());
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [sending, setSending] = useState(false);

  // Institutes for picker (only loaded when needed)
  const [institutes, setInstitutes] = useState<InstituteRow[]>([]);
  const [loadingInsts, setLoadingInsts] = useState(false);

  // History state
  const [history, setHistory] = useState<PlatformBroadcast[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load institutes lazily — only when a scope that needs them is selected.
  const needsInstitutes = scope === 'institute' || scope === 'institute_role';
  useEffect(() => {
    if (!needsInstitutes || institutes.length > 0 || loadingInsts) return;
    (async () => {
      setLoadingInsts(true);
      try {
        const { data, error } = await supabase
          .from('institutes')
          .select('id, name')
          .order('name', { ascending: true })
          .limit(200);
        if (error) throw error;
        setInstitutes((data as InstituteRow[]) || []);
      } catch (err: any) {
        Alert.alert('خطأ', err?.message || 'فشل تحميل المؤسسات');
      } finally {
        setLoadingInsts(false);
      }
    })();
  }, [needsInstitutes, institutes.length, loadingInsts]);

  // Load history when entering the history tab
  const loadHistory = useCallback(async () => {
    try {
      const data = await listBroadcasts();
      setHistory(data);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل تحميل السجل');
    }
  }, []);

  useEffect(() => {
    if (tab !== 'history') return;
    (async () => {
      setLoadingHistory(true);
      await loadHistory();
      setLoadingHistory(false);
    })();
  }, [tab, loadHistory]);

  const onRefreshHistory = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadHistory(); } finally { setRefreshing(false); }
  }, [loadHistory]);

  const needsRole = scope === 'role' || scope === 'institute_role';

  const toggleInstitute = (id: string) => {
    haptics.selection();
    setSelectedInstitutes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetCompose = () => {
    setTitle('');
    setBody('');
    setSeverity('info');
    setScope('all');
    setRole('');
    setSelectedInstitutes(new Set());
    setCtaLabel('');
    setCtaUrl('');
  };

  const handleSend = async () => {
    // Validation
    if (!title.trim()) { Alert.alert('خطأ', 'أدخل عنوان الإعلان'); return; }
    if (!body.trim()) { Alert.alert('خطأ', 'أدخل محتوى الإعلان'); return; }
    if (needsRole && !role) { Alert.alert('خطأ', 'اختر الدور المستهدف'); return; }
    if (needsInstitutes && selectedInstitutes.size === 0) {
      Alert.alert('خطأ', 'اختر مؤسسة واحدة على الأقل');
      return;
    }
    if ((ctaLabel.trim() && !ctaUrl.trim()) || (!ctaLabel.trim() && ctaUrl.trim())) {
      Alert.alert('خطأ', 'يجب إدخال نص الرابط والرابط معاً، أو تركهما فارغين');
      return;
    }

    setSending(true);
    try {
      const created = await createBroadcast({
        title: title.trim(),
        body: body.trim(),
        severity,
        target_scope: scope,
        target_role: needsRole ? role : null,
        target_institute_ids: needsInstitutes ? Array.from(selectedInstitutes) : [],
        cta_label: ctaLabel.trim() || null,
        cta_url: ctaUrl.trim() || null,
      });
      const result = await sendBroadcast(created.id);
      haptics.success();
      Alert.alert(
        'تم الإرسال',
        `تم الإرسال إلى ${result.recipient_count || 0} مستخدم`,
      );
      resetCompose();
      // Refresh history in the background so user sees the new row on switch
      loadHistory().catch(() => {});
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل إرسال الإعلان');
    } finally {
      setSending(false);
    }
  };

  // ──────────────────────── Render ────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الإعلانات العامة"
        subtitle="رسالة لكل المنصة"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => { haptics.selection(); setTab(t.key); }}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'compose' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            <ComposeForm
              title={title} setTitle={setTitle}
              body={body} setBody={setBody}
              severity={severity} setSeverity={setSeverity}
              scope={scope} setScope={setScope}
              role={role} setRole={setRole}
              ctaLabel={ctaLabel} setCtaLabel={setCtaLabel}
              ctaUrl={ctaUrl} setCtaUrl={setCtaUrl}
              needsRole={needsRole}
              needsInstitutes={needsInstitutes}
              institutes={institutes}
              loadingInsts={loadingInsts}
              selectedInstitutes={selectedInstitutes}
              toggleInstitute={toggleInstitute}
              sending={sending}
              onSend={handleSend}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefreshHistory}
              tintColor={Colors.primary}
            />
          }
        >
          {loadingHistory ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 40 }} />
          ) : history.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={42} color={Colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد إعلانات بعد</Text>
            </View>
          ) : (
            history.map((b) => {
              const sm = severityMeta(b.severity);
              return (
                <View key={b.id} style={styles.histCard}>
                  <View style={styles.histHeader}>
                    <View style={[styles.sevBadge, { backgroundColor: sm.bg }]}>
                      <Ionicons name={sm.icon} size={11} color={sm.color} />
                      <Text style={[styles.sevBadgeText, { color: sm.color }]}>
                        {sm.label}
                      </Text>
                    </View>
                    <Text style={styles.histTitle} numberOfLines={1}>
                      {b.title}
                    </Text>
                  </View>
                  <Text style={styles.histBody} numberOfLines={3}>
                    {b.body}
                  </Text>
                  <View style={styles.histFooter}>
                    <Text style={styles.histTimeText}>
                      {humanizeSent(b.sent_at)}
                    </Text>
                    <View style={styles.recipientBadge}>
                      <Ionicons name="people-outline" size={11} color={Colors.textSecondary} />
                      <Text style={styles.recipientText}>
                        {b.recipient_count || 0} مستلم
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ──────────────────────── ComposeForm ──────────────────────
// Extracted to keep AdminBroadcasts focused on tab orchestration; the form
// itself has a lot of fields and re-rendering it here is fine because all
// state lives in the parent and props are already stable refs.
type ComposeProps = {
  title: string; setTitle: (s: string) => void;
  body: string; setBody: (s: string) => void;
  severity: BroadcastSeverity; setSeverity: (s: BroadcastSeverity) => void;
  scope: BroadcastTargetScope; setScope: (s: BroadcastTargetScope) => void;
  role: string; setRole: (s: string) => void;
  ctaLabel: string; setCtaLabel: (s: string) => void;
  ctaUrl: string; setCtaUrl: (s: string) => void;
  needsRole: boolean;
  needsInstitutes: boolean;
  institutes: InstituteRow[];
  loadingInsts: boolean;
  selectedInstitutes: Set<string>;
  toggleInstitute: (id: string) => void;
  sending: boolean;
  onSend: () => void;
};

function ComposeForm(p: ComposeProps) {
  return (
    <>
      <Text style={styles.fieldLabel}>العنوان</Text>
      <TextInput
        style={styles.input}
        value={p.title}
        onChangeText={p.setTitle}
        placeholder="عنوان واضح ومختصر"
        placeholderTextColor={Colors.textMuted}
        textAlign="right"
        maxLength={120}
      />

      <Text style={styles.fieldLabel}>المحتوى</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={p.body}
        onChangeText={p.setBody}
        placeholder="اكتب نص الإعلان…"
        placeholderTextColor={Colors.textMuted}
        multiline
        textAlign="right"
        textAlignVertical="top"
      />

      <Text style={styles.fieldLabel}>الأهمية</Text>
      <View style={styles.chipsRow}>
        {SEVERITIES.map((s) => {
          const active = p.severity === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              onPress={() => { haptics.selection(); p.setSeverity(s.key); }}
              style={[
                styles.chip,
                { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
                active && { backgroundColor: s.bg, borderColor: s.color },
              ]}
              activeOpacity={0.85}
            >
              <Ionicons name={s.icon} size={13} color={active ? s.color : Colors.textMuted} />
              <Text style={[styles.chipText, active && { color: s.color, fontWeight: '800' }]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>المستهدف</Text>
      <View style={styles.chipsRow}>
        {SCOPES.map((s) => {
          const active = p.scope === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              onPress={() => { haptics.selection(); p.setScope(s.key); }}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Conditional: role picker */}
      {p.needsRole && (
        <>
          <Text style={styles.fieldLabel}>الدور</Text>
          <View style={styles.chipsRow}>
            {ROLES.map((r) => {
              const active = p.role === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  onPress={() => { haptics.selection(); p.setRole(r.key); }}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Conditional: multi-select institutes */}
      {p.needsInstitutes && (
        <>
          <Text style={styles.fieldLabel}>
            المؤسسات ({p.selectedInstitutes.size} مختارة)
          </Text>
          {p.loadingInsts ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 12 }} />
          ) : p.institutes.length === 0 ? (
            <Text style={styles.muted}>لا توجد مؤسسات</Text>
          ) : (
            <View style={styles.chipsRow}>
              {p.institutes.map((inst) => {
                const active = p.selectedInstitutes.has(inst.id);
                return (
                  <TouchableOpacity
                    key={inst.id}
                    onPress={() => p.toggleInstitute(inst.id)}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.85}
                  >
                    {active && (
                      <Ionicons
                        name="checkmark"
                        size={12}
                        color="#fff"
                        style={{ marginEnd: 4 }}
                      />
                    )}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {inst.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* CTA */}
      <Text style={styles.fieldLabel}>زر إجراء (اختياري)</Text>
      <TextInput
        style={styles.input}
        value={p.ctaLabel}
        onChangeText={p.setCtaLabel}
        placeholder="نص الزر، مثلاً: اعرف أكثر"
        placeholderTextColor={Colors.textMuted}
        textAlign="right"
        maxLength={40}
      />
      <View style={{ height: 8 }} />
      <TextInput
        style={styles.input}
        value={p.ctaUrl}
        onChangeText={p.setCtaUrl}
        placeholder="https://…"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textAlign="left"
      />

      <TouchableOpacity
        style={[styles.sendBtn, p.sending && { opacity: 0.6 }]}
        onPress={p.onSend}
        disabled={p.sending}
        activeOpacity={0.85}
      >
        {p.sending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="paper-plane-outline" size={16} color="#fff" />
            <Text style={styles.sendBtnText}>إرسال الآن</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );
}

// ──────────────────────── Styles ───────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: tokens.radius.md,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#fff',
    ...tokens.shadow.xs,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabTextActive: { color: Colors.primary },

  // Compose form
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  textarea: {
    minHeight: 130,
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  chipTextActive: { color: '#fff' },
  muted: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },

  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    marginTop: 24,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  // History
  histCard: {
    backgroundColor: '#fff',
    borderRadius: tokens.radius.xl,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...tokens.shadow.xs,
  },
  histHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  histTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    marginStart: 8,
  },
  sevBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sevBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  histBody: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 18,
    marginBottom: 10,
  },
  histFooter: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  histTimeText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  recipientBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recipientText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },

  empty: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
