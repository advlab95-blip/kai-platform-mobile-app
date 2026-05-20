// Platform admin · Impersonation
//
// Lets the super-admin start an audit-logged "sign in as" session against any
// institute user to reproduce a reported bug. The current backend records the
// session via `start_impersonation` RPC but does NOT swap the auth token —
// that's a follow-up; for now the admin still has to log out + log in with
// the target's code manually. Banner + this screen exist primarily for the
// audit trail and to remind the admin which session is "open".
//
// Search is best-effort across two sources: full_name (ilike on users) and
// smart code (exact match on user_codes). Both queries are debounced 300ms
// and capped at 20 rows total so this never becomes a "list all users" leak.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import { supabase } from '../../services/supabase';
import {
  listImpersonations,
  getActiveImpersonation,
  startImpersonation,
  impersonateUser,
  endImpersonation,
  type ImpersonationSession,
} from '../../services/platformAdminService';
import { useRouter } from 'expo-router';

// ───────────────────────── helpers ────────────────────────────────

function translateError(msg: string | undefined): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('unauthorized')) return 'غير مصرح';
  if (m.includes('already_impersonating')) return 'لديك جلسة نشطة بالفعل';
  if (m.includes('reason_required')) return 'السبب إلزامي (5 أحرف على الأقل)';
  return msg || 'حدث خطأ غير متوقع';
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('ar-IQ')} ${d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'نشطة الآن';
  try {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'أقل من دقيقة';
    if (mins < 60) return `${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem === 0 ? `${hrs} ساعة` : `${hrs} ساعة و ${rem} دقيقة`;
  } catch {
    return '—';
  }
}

// Local debounce hook — keeps a single value source debounced by `delay`ms.
// Inlined per task instructions to avoid pulling in a new util.
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ───────────────────────── types ──────────────────────────────────

type UserSearchResult = {
  id: string;
  full_name: string;
  role: string | null;
  code: string | null;
};

// ───────────────────────── screen ─────────────────────────────────

export default function AdminImpersonation() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<ImpersonationSession | null>(null);
  const [sessions, setSessions] = useState<ImpersonationSession[]>([]);
  const [endingActive, setEndingActive] = useState(false);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [reason, setReason] = useState('');
  const [starting, setStarting] = useState(false);

  // Guard so a slow earlier search can't overwrite the latest result set.
  const searchSeqRef = useRef(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, current] = await Promise.all([
        listImpersonations(50),
        getActiveImpersonation(),
      ]);
      setSessions(list);
      setActive(current);
    } catch (err: any) {
      Alert.alert('خطأ', translateError(err?.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  // ── End active session ────────────────────────────────────
  const handleEndActive = useCallback(() => {
    if (!active || endingActive) return;
    haptics.warning();
    Alert.alert(
      'إنهاء الجلسة',
      'هل تريد إنهاء جلسة الانتحال الحالية الآن؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إنهاء',
          style: 'destructive',
          onPress: async () => {
            setEndingActive(true);
            try {
              await endImpersonation(active.id);
              haptics.success();
              await loadAll();
            } catch (err: any) {
              haptics.error();
              Alert.alert('خطأ', translateError(err?.message));
            } finally {
              setEndingActive(false);
            }
          },
        },
      ],
    );
  }, [active, endingActive, loadAll]);

  // ── User search (best-effort: full_name ilike OR code exact) ──
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    const seq = ++searchSeqRef.current;
    setSearchLoading(true);

    (async () => {
      try {
        // Run name-search and code-search in parallel. Code search resolves
        // through user_codes(code, user_id) → users; name search hits users
        // directly. Both capped small so the union stays under 20.
        const upperCode = q.toUpperCase();
        const [nameRes, codeRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, full_name, role')
            .ilike('full_name', `%${q}%`)
            .limit(20),
          supabase
            .from('user_codes')
            .select('code, user:user_id ( id, full_name, role )')
            .ilike('code', `%${upperCode}%`)
            .limit(10),
        ]);

        if (cancelled || seq !== searchSeqRef.current) return;

        const merged = new Map<string, UserSearchResult>();
        for (const row of (nameRes.data || []) as any[]) {
          if (!row?.id) continue;
          merged.set(row.id, {
            id: row.id,
            full_name: row.full_name || '—',
            role: row.role || null,
            code: null,
          });
        }
        for (const row of (codeRes.data || []) as any[]) {
          const u = row?.user;
          if (!u?.id) continue;
          const existing = merged.get(u.id);
          merged.set(u.id, {
            id: u.id,
            full_name: u.full_name || existing?.full_name || '—',
            role: u.role || existing?.role || null,
            code: row.code || existing?.code || null,
          });
        }

        setSearchResults(Array.from(merged.values()).slice(0, 20));
      } catch {
        if (!cancelled && seq === searchSeqRef.current) setSearchResults([]);
      } finally {
        if (!cancelled && seq === searchSeqRef.current) setSearchLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  // ── Start impersonation ──────────────────────────────────
  const canStart = useMemo(
    () => !!selectedUser?.id && reason.trim().length >= 5 && !starting,
    [selectedUser, reason, starting],
  );

  const resetSheet = useCallback(() => {
    setQuery('');
    setSearchResults([]);
    setSelectedUser(null);
    setReason('');
  }, []);

  const router = useRouter();

  const handleStart = useCallback(async () => {
    if (!selectedUser) {
      Alert.alert('خطأ', 'اختر المستخدم المستهدف أولاً');
      return;
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      Alert.alert('خطأ', translateError('reason_required'));
      return;
    }
    setStarting(true);
    try {
      // Full auth swap: stashes admin's session, calls Edge Function which
      // verifies admin, records audit row, and issues a session for the
      // target. After this returns, supabase client is signed in as target.
      await impersonateUser(selectedUser.id, trimmedReason);
      haptics.success();
      setSheetOpen(false);
      resetSheet();
      // Send the admin to the impersonated user's root. The user's actual
      // role determines which (role) folder; the layout guards will resolve
      // it automatically — easiest path is /(student) etc. but we don't know
      // the target role here without another fetch. Send to root and let
      // _layout redirect.
      Alert.alert(
        'تم تسجيل الدخول كالمستخدم المستهدف',
        'أنت الآن تتصفح التطبيق كهذا المستخدم. شريط أحمر يظهر دائماً ليذكّرك. اضغط "إنهاء" عليه عند انتهائك.',
        [{ text: 'حسناً', onPress: () => router.replace('/' as any) }],
      );
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', translateError(err?.message));
    } finally {
      setStarting(false);
    }
  }, [selectedUser, reason, resetSheet, router]);

  // ───────────────────────── render ──────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="انتحال الهوية"
        subtitle="لأغراض الدعم الفني"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        <View style={styles.content}>
          {/* Active session banner */}
          {active && (
            <View style={styles.activeCard}>
              <View style={styles.activeHeaderRow}>
                <View style={styles.activeBadge}>
                  <Ionicons name="radio-button-on" size={10} color="#fff" />
                  <Text style={styles.activeBadgeText}>نشطة</Text>
                </View>
                <Text style={styles.activeTitle}>
                  أنت تنتحل: {active.target_name || '—'}
                  {active.target_institute_name ? ` من ${active.target_institute_name}` : ''}
                </Text>
              </View>
              <View style={styles.activeMetaRow}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={styles.activeMetaText}>بدأت: {formatDateTime(active.started_at)}</Text>
              </View>
              <View style={styles.activeMetaRow}>
                <Ionicons name="document-text-outline" size={12} color="#fff" />
                <Text style={styles.activeMetaText} numberOfLines={3}>
                  السبب: {active.reason || '—'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleEndActive}
                disabled={endingActive}
                style={[styles.endNowBtn, endingActive && { opacity: 0.6 }]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="إنهاء الجلسة الآن"
              >
                {endingActive ? (
                  <ActivityIndicator color={tokens.color.danger} size="small" />
                ) : (
                  <>
                    <Ionicons name="stop-circle" size={16} color={tokens.color.danger} />
                    <Text style={styles.endNowText}>إنهاء الجلسة الآن</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Start new session CTA */}
          <TouchableOpacity
            onPress={() => { haptics.medium(); setSheetOpen(true); }}
            style={styles.startBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="بدء انتحال جديد"
          >
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={styles.startBtnText}>بدء انتحال جديد</Text>
          </TouchableOpacity>

          {/* History */}
          <Text style={styles.sectionTitle}>سجل الجلسات</Text>

          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 40 }} />
          ) : sessions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="shield-checkmark-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyText}>لم تبدأ أي جلسة انتحال بعد</Text>
            </View>
          ) : (
            sessions.map((s) => {
              const isActiveRow = !s.ended_at;
              return (
                <View key={s.id} style={[styles.card, isActiveRow && styles.cardActive]}>
                  <View style={styles.cardHeaderRow}>
                    {isActiveRow && (
                      <View style={styles.smallActiveBadge}>
                        <Text style={styles.smallActiveBadgeText}>نشطة الآن</Text>
                      </View>
                    )}
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {s.target_name || '—'}
                    </Text>
                  </View>
                  {s.target_institute_name ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="business-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.metaText}>{s.target_institute_name}</Text>
                    </View>
                  ) : null}
                  <View style={styles.metaRow}>
                    <Ionicons name="document-text-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.metaText} numberOfLines={3}>
                      {s.reason || '—'}
                    </Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="play-circle-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.metaText}>بدأت: {formatDateTime(s.started_at)}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="hourglass-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.metaText}>المدة: {formatDuration(s.started_at, s.ended_at)}</Text>
                  </View>
                  {s.ended_reason ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="checkmark-circle-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.metaText}>سبب الإنهاء: {s.ended_reason}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Start sheet */}
      <SwipeableSheet
        visible={sheetOpen}
        onClose={() => { setSheetOpen(false); resetSheet(); }}
        maxHeight={0.85}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetTitle}>بدء انتحال جديد</Text>
            <Text style={styles.sheetSubtitle}>
              ابحث عن المستخدم بالاسم أو بالرمز، ثم اكتب سبباً للجلسة (إلزامي للتدقيق).
            </Text>

            <Text style={styles.fieldLabel}>بحث (اسم أو رمز)</Text>
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.input}
                placeholder="مثال: أحمد علي أو STD-1234"
                placeholderTextColor={Colors.textMuted}
                value={query}
                onChangeText={(v) => { setQuery(v); setSelectedUser(null); }}
                textAlign="right"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {searchLoading && (
                <ActivityIndicator
                  color={Colors.primary}
                  size="small"
                  style={styles.searchSpinner}
                />
              )}
            </View>

            {/* Selected user pill */}
            {selectedUser && (
              <View style={styles.selectedPill}>
                <TouchableOpacity
                  onPress={() => { haptics.light(); setSelectedUser(null); }}
                  style={styles.selectedClear}
                  accessibilityLabel="إلغاء الاختيار"
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.selectedName} numberOfLines={1}>
                    {selectedUser.full_name}
                  </Text>
                  <Text style={styles.selectedMeta} numberOfLines={1}>
                    {selectedUser.role || '—'}{selectedUser.code ? ` · ${selectedUser.code}` : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Results — only show when not yet selected */}
            {!selectedUser && searchResults.length > 0 && (
              <View style={styles.resultsWrap}>
                {searchResults.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.resultChip}
                    onPress={() => {
                      haptics.selection();
                      setSelectedUser(u);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.resultName} numberOfLines={1}>{u.full_name}</Text>
                    <Text style={styles.resultMeta} numberOfLines={1}>
                      {u.role || '—'}{u.code ? ` · ${u.code}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!selectedUser && !searchLoading && debouncedQuery.trim().length >= 2 && searchResults.length === 0 && (
              <Text style={styles.noResults}>لا توجد نتائج</Text>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
              السبب (إلزامي، 5 أحرف+)
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 90, paddingTop: 10 }]}
              placeholder="مثال: متابعة بلاغ خطأ تسجيل دخول طالب"
              placeholderTextColor={Colors.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
              textAlign="right"
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, !canStart && { opacity: 0.5 }]}
              onPress={handleStart}
              disabled={!canStart}
              activeOpacity={0.85}
            >
              {starting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="enter" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>بدء</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

// ───────────────────────── styles ─────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Active card
  activeCard: {
    backgroundColor: tokens.color.danger,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    gap: 8,
    ...tokens.shadow.danger,
  },
  activeHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  activeTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
    flex: 1,
  },
  activeMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  activeMetaText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },
  endNowBtn: {
    marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  endNowText: {
    color: tokens.color.danger,
    fontSize: 13,
    fontWeight: '900',
  },

  // Start button
  startBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 18,
    ...tokens.shadow.brand,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },

  // History
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '700',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  cardActive: {
    borderColor: tokens.color.danger,
    backgroundColor: tokens.color.dangerBg,
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  smallActiveBadge: {
    backgroundColor: tokens.color.danger,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  smallActiveBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },

  // Sheet
  sheetContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 6,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: 14,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: 6,
  },
  searchWrap: {
    position: 'relative',
  },
  searchSpinner: {
    position: 'absolute',
    left: 14,
    top: 14,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },

  // Results
  resultsWrap: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultChip: {
    backgroundColor: tokens.color.brand50,
    borderWidth: 1,
    borderColor: tokens.color.brand100,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  resultName: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.color.brand700,
    textAlign: 'right',
  },
  resultMeta: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  noResults: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Selected pill
  selectedPill: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  selectedClear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  selectedMeta: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },

  // Submit
  submitBtn: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});
