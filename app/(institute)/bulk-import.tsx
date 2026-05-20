// Bulk Import — paste-CSV path for institute admins onboarding many users at once.
//
// Why paste instead of a file picker?
//   File pickers in RN/Expo are inconsistent across iOS/Android/web and add a
//   non-trivial dependency surface. Pasting CSV content covers 95% of real
//   workflows (admin opens Excel/Sheets → copy → paste) without the headaches.
//
// Flow:
//   1. Admin downloads (shares) a blank CSV template
//   2. Admin pastes filled-in CSV into the textarea
//   3. "تحقَّق" parses + validates client-side AND server-side (via
//      `validateBulkImport` RPC which checks duplicates, role legality, etc.)
//   4. "تنفيذ الاستيراد" is intentionally disabled — the actual user creation
//      requires service-role privileges that only live in the create-user Edge
//      Function. Wiring a `bulk_create_users` Edge Function is the TODO below.
//
// TODO (separate task — out of scope for this screen):
//   - Add Edge Function `bulk-create-users` that loops over validated rows,
//     calls auth.admin.createUser + inserts profile + enrollment + class link
//     in a single SECURITY DEFINER RPC. Service-role key must stay server-side.
//   - Wire the "تنفيذ الاستيراد" button to call that function and show a
//     per-row success/error report.

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { documentDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SectionLabel from '../../components/institute/SectionLabel';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  validateBulkImport,
  executeBulkImport,
  type BulkImportRow,
  type BulkImportExecuteResult,
} from '../../services/instituteAdminService';
import useAuthStore from '../../stores/authStore';

// ── CSV parsing (inline — no extra dep) ─────────────────────────────
// Handles: header row, comma separation, leading/trailing whitespace, BOM,
// blank lines, simple double-quote wrapping for fields with commas.
// Does NOT handle multi-line quoted cells (educational CSV rarely has them).

type ParsedRow = {
  idx: number; // 1-based row number (excluding header)
  raw: Record<string, string>;
  full_name: string;
  role: string;
  code: string;
  phone: string;
  class_name: string;
  localError?: string;
};

type ServerCheck = {
  total: number;
  valid: number;
  errors: number;
  rows: Array<{ idx: number; ok: boolean; error?: string }>;
};

const EXPECTED_COLUMNS = ['full_name', 'role', 'code', 'phone', 'class_name'] as const;
const ALLOWED_ROLES = new Set(['student', 'teacher', 'parent']);

function splitCsvLine(line: string): string[] {
  // Minimal handling for fields wrapped in double quotes (allows commas inside).
  const out: string[] = [];
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Escaped quote inside a quoted field: ""
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): { headers: string[]; rows: ParsedRow[]; headerError?: string } {
  // Strip UTF-8 BOM that Excel loves to inject.
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const missing = EXPECTED_COLUMNS.filter((c) => !headers.includes(c));
  let headerError: string | undefined;
  if (missing.length === EXPECTED_COLUMNS.length) {
    headerError = 'لم يتم العثور على رأس الجدول. تأكّد أن السطر الأول يحتوي أسماء الأعمدة.';
  } else if (missing.length > 0) {
    headerError = `أعمدة ناقصة: ${missing.join('، ')}`;
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, j) => { raw[h] = (cells[j] ?? '').trim(); });

    const full_name = raw['full_name'] || '';
    const role = (raw['role'] || '').toLowerCase();
    const code = raw['code'] || '';
    const phone = raw['phone'] || '';
    const class_name = raw['class_name'] || '';

    // Light client-side validation — server still has the authoritative check.
    let localError: string | undefined;
    if (!full_name) localError = 'الاسم الكامل فارغ';
    else if (!role) localError = 'الدور فارغ';
    else if (!ALLOWED_ROLES.has(role)) localError = `دور غير معروف: ${role}`;
    else if (!code) localError = 'رمز الدخول فارغ';

    rows.push({ idx: i, raw, full_name, role, code, phone, class_name, localError });
  }
  return { headers, rows, headerError };
}

const TEMPLATE_CSV =
  'full_name,role,code,phone,class_name\n' +
  'أحمد محمد,student,1001,07700000001,الأول الابتدائية أ\n' +
  'سارة علي,student,1002,07700000002,الأول الابتدائية أ\n' +
  'الأستاذ خالد,teacher,2001,07700000010,\n';

const PREVIEW_LIMIT = 20;

export default function BulkImport() {
  const { userInstituteId } = useDataStore();
  const { userId } = useAuthStore();

  const [pasted, setPasted] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [headerError, setHeaderError] = useState<string | undefined>(undefined);
  const [serverCheck, setServerCheck] = useState<ServerCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<BulkImportExecuteResult | null>(null);

  const handleDownloadTemplate = useCallback(async () => {
    if (generating) return;
    haptics.light();
    setGenerating(true);
    try {
      if (Platform.OS === 'web') {
        // Best-effort browser download. Falls back to Alert on environments
        // without DOM (shouldn't happen on web but defensive).
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'bulk_import_template.csv';
          a.click();
          URL.revokeObjectURL(url);
        }
        return;
      }
      const fileUri = (documentDirectory || '') + 'bulk_import_template.csv';
      await writeAsStringAsync(fileUri, TEMPLATE_CSV, { encoding: EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'قالب الاستيراد الدفعي',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        // Last resort — show inline so the admin can still copy it.
        Alert.alert('قالب CSV', TEMPLATE_CSV);
      }
    } catch (err: any) {
      Alert.alert('تعذّر إنشاء القالب', err?.message || 'حاول مرة أخرى');
    } finally {
      setGenerating(false);
    }
  }, [generating]);

  const handleParse = useCallback(async () => {
    if (!userInstituteId) {
      Alert.alert('تنبيه', 'لم يتم تحديد المؤسسة بعد. أعد فتح الشاشة.');
      return;
    }
    if (!pasted.trim()) {
      Alert.alert('تنبيه', 'الصق محتوى CSV أولاً');
      return;
    }
    haptics.light();
    setChecking(true);
    setServerCheck(null);
    try {
      const { rows, headerError: hErr } = parseCsv(pasted);
      setParsed(rows);
      setHeaderError(hErr);
      if (hErr) {
        // Skip server validation if headers are wrong — would error out anyway.
        haptics.warning();
        return;
      }
      if (rows.length === 0) {
        haptics.warning();
        Alert.alert('فارغ', 'لم يتم العثور على أي صف للبيانات');
        return;
      }
      // Only send rows that passed local validation — server doesn't need to
      // re-flag obvious empties. Local-error rows still display in preview.
      const cleanRows: BulkImportRow[] = rows
        .filter((r) => !r.localError)
        .map((r) => ({
          full_name: r.full_name,
          role: r.role as BulkImportRow['role'],
          code: r.code,
          phone: r.phone || undefined,
          // class_id is the column the RPC expects; we only know class_name
          // client-side. Server-side validate_bulk_import is expected to map
          // class_name → class_id, or skip when missing. Documented as a TODO.
        }));
      const result = await validateBulkImport(userInstituteId, cleanRows);
      setServerCheck(result);
      haptics.success();
    } catch (err: any) {
      haptics.error();
      Alert.alert('فشل التحقّق', err?.message || 'تعذّر التحقّق من البيانات');
    } finally {
      setChecking(false);
    }
  }, [pasted, userInstituteId]);

  const handleClear = useCallback(() => {
    haptics.light();
    setPasted('');
    setParsed(null);
    setServerCheck(null);
    setHeaderError(undefined);
    setExecuteResult(null);
  }, []);

  // Run the validated rows through admin-ops/bulk_import_simple. The screen has
  // already shown which rows pass; we only ship the green ones so the server
  // never has to re-flag obvious failures, and rejected rows stay visible in
  // the preview for the admin to fix and re-import.
  const handleExecute = useCallback(async () => {
    if (!parsed || !userInstituteId) return;
    if (!serverCheck) {
      Alert.alert('تنبيه', 'شغّل التحقّق أولاً قبل التنفيذ');
      return;
    }
    const badIdxs = new Set(serverCheck.rows.filter((r) => !r.ok).map((r) => r.idx));
    const rowsToImport = parsed
      .filter((r) => !r.localError && !badIdxs.has(r.idx))
      .map((r) => ({
        idx: r.idx,
        full_name: r.full_name,
        role: r.role as BulkImportRow['role'],
        code: r.code,
        phone: r.phone || undefined,
      }));

    if (rowsToImport.length === 0) {
      Alert.alert('لا يوجد', 'لا توجد صفوف صالحة للاستيراد');
      return;
    }

    setExecuting(true);
    setExecuteResult(null);
    try {
      haptics.medium();
      const result = await executeBulkImport(userInstituteId, rowsToImport, userId || undefined);
      setExecuteResult(result);
      if (result.failed.length === 0) {
        haptics.success();
        Alert.alert('تم', `تم استيراد ${result.created.length} حساب بنجاح`);
      } else {
        haptics.warning();
        Alert.alert(
          'استيراد جزئي',
          `${result.created.length} نجحت — ${result.failed.length} فشلت. راجع التفاصيل أدناه.`,
        );
      }
    } catch (err: any) {
      haptics.error();
      Alert.alert('فشل التنفيذ', err?.message || 'تعذّر تنفيذ الاستيراد');
    } finally {
      setExecuting(false);
    }
  }, [parsed, userInstituteId, serverCheck, userId]);

  // Build a fast lookup from server result to color rows in the preview.
  const serverErrorByIdx = useMemo(() => {
    if (!serverCheck) return new Map<number, string>();
    const map = new Map<number, string>();
    serverCheck.rows.forEach((r) => {
      if (!r.ok && r.error) map.set(r.idx, r.error);
    });
    return map;
  }, [serverCheck]);

  const stats = useMemo(() => {
    if (!parsed) return null;
    const total = parsed.length;
    const localErrors = parsed.filter((r) => r.localError).length;
    const serverErrors = serverCheck?.errors ?? 0;
    const valid = serverCheck ? serverCheck.valid : Math.max(0, total - localErrors);
    return { total, valid, errors: localErrors + serverErrors };
  }, [parsed, serverCheck]);

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

  const preview = parsed ? parsed.slice(0, PREVIEW_LIMIT) : [];
  const remainingCount = parsed ? Math.max(0, parsed.length - PREVIEW_LIMIT) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="استيراد دفعي"
        subtitle="من ملف CSV"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <KeyboardAwareScroll contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ── Section 1: Template ───────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <SectionLabel title="القالب" icon="document-text-outline" />
        </View>

        <FadeSlideIn translateFrom={10}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>الأعمدة المطلوبة</Text>
            <View style={styles.colsList}>
              {[
                { k: 'full_name', label: 'الاسم الكامل', required: true },
                { k: 'role', label: 'الدور (student / teacher / parent)', required: true },
                { k: 'code', label: 'رمز الدخول', required: true },
                { k: 'phone', label: 'الهاتف', required: false },
                { k: 'class_name', label: 'اسم الصف/القاعة', required: false },
              ].map((c) => (
                <View key={c.k} style={styles.colRow}>
                  <View style={[styles.colBadge, { backgroundColor: c.required ? tokens.brand[100] : tokens.surface.surface2 }]}>
                    <Text style={[styles.colKey, { color: c.required ? tokens.brand[500] : tokens.text[3] }]}>{c.k}</Text>
                  </View>
                  <Text style={styles.colLabel}>{c.label}</Text>
                  {c.required && <Text style={styles.colReq}>*</Text>}
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.templateBtn, generating && styles.btnDisabled]}
              onPress={handleDownloadTemplate}
              disabled={generating}
              activeOpacity={0.85}
            >
              {generating ? (
                <ActivityIndicator color={tokens.brand[500]} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color={tokens.brand[500]} />
                  <Text style={styles.templateBtnText}>تحميل قالب CSV فارغ</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </FadeSlideIn>

        {/* ── Section 2: Paste ──────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <SectionLabel title="اللصق والتحقّق" icon="clipboard-outline" />
        </View>

        <FadeSlideIn translateFrom={10} delay={60}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>الصق محتوى الـ CSV هنا</Text>
            <TextInput
              value={pasted}
              onChangeText={setPasted}
              multiline
              numberOfLines={10}
              placeholder={'full_name,role,code,phone,class_name\nأحمد محمد,student,1001,07700000001,الأول الابتدائية أ'}
              placeholderTextColor={tokens.text[4]}
              style={styles.textarea}
              textAlign="right"
              textAlignVertical="top"
              autoCorrect={false}
              autoCapitalize="none"
              editable={!checking}
            />

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, !pasted && styles.btnDisabled]}
                onPress={handleClear}
                disabled={!pasted}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={15} color={tokens.text[2]} />
                <Text style={styles.secondaryBtnText}>مسح</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (checking || !pasted.trim()) && styles.btnDisabled]}
                onPress={handleParse}
                disabled={checking || !pasted.trim()}
                activeOpacity={0.85}
              >
                {checking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>تحقَّق</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </FadeSlideIn>

        {/* ── Header error banner ──────────────────────────── */}
        {headerError && (
          <FadeSlideIn translateFrom={10}>
            <View style={[styles.banner, { backgroundColor: tokens.semantic.dangerBg }]}>
              <Ionicons name="alert-circle" size={18} color={tokens.semantic.danger} />
              <Text style={[styles.bannerText, { color: tokens.semantic.danger }]}>{headerError}</Text>
            </View>
          </FadeSlideIn>
        )}

        {/* ── Counts ──────────────────────────────────────── */}
        {stats && !headerError && (
          <FadeSlideIn translateFrom={10}>
            <View style={styles.countsRow}>
              <View style={[styles.countCard, { backgroundColor: tokens.brand[100] }]}>
                <Text style={[styles.countValue, { color: tokens.brand[500] }]}>{stats.total}</Text>
                <Text style={styles.countLabel}>الإجمالي</Text>
              </View>
              <View style={[styles.countCard, { backgroundColor: tokens.semantic.successBg }]}>
                <Text style={[styles.countValue, { color: tokens.semantic.success }]}>{stats.valid}</Text>
                <Text style={styles.countLabel}>صالح</Text>
              </View>
              <View style={[styles.countCard, { backgroundColor: tokens.semantic.dangerBg }]}>
                <Text style={[styles.countValue, { color: tokens.semantic.danger }]}>{stats.errors}</Text>
                <Text style={styles.countLabel}>أخطاء</Text>
              </View>
            </View>
          </FadeSlideIn>
        )}

        {/* ── Preview table ────────────────────────────────── */}
        {parsed && parsed.length > 0 && !headerError && (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
              <SectionLabel
                title={`المعاينة (أول ${Math.min(PREVIEW_LIMIT, parsed.length)} من ${parsed.length})`}
                icon="list-outline"
              />
            </View>

            <View style={{ paddingHorizontal: 14 }}>
              {preview.map((row, i) => {
                const serverErr = serverErrorByIdx.get(row.idx);
                const err = row.localError || serverErr;
                const ok = !err;
                return (
                  <FadeSlideIn key={`${row.idx}-${i}`} delay={Math.min(i * 20, 300)} translateFrom={6}>
                    <View style={[styles.previewRow, !ok && styles.previewRowError]}>
                      <View style={[styles.previewIdx, { backgroundColor: ok ? tokens.semantic.successBg : tokens.semantic.dangerBg }]}>
                        <Text style={[styles.previewIdxText, { color: ok ? tokens.semantic.success : tokens.semantic.danger }]}>
                          {row.idx}
                        </Text>
                      </View>
                      <View style={styles.previewMain}>
                        <Text style={styles.previewName} numberOfLines={1}>
                          {row.full_name || '—'}
                        </Text>
                        <Text style={styles.previewMeta} numberOfLines={1}>
                          {row.role || '?'} · {row.code || '—'}{row.class_name ? ` · ${row.class_name}` : ''}
                        </Text>
                        {err && <Text style={styles.previewError}>{err}</Text>}
                      </View>
                      <Ionicons
                        name={ok ? 'checkmark-circle' : 'close-circle'}
                        size={20}
                        color={ok ? tokens.semantic.success : tokens.semantic.danger}
                      />
                    </View>
                  </FadeSlideIn>
                );
              })}
              {remainingCount > 0 && (
                <View style={styles.moreNote}>
                  <Text style={styles.moreNoteText}>{`و ${remainingCount} صف إضافي غير معروض في المعاينة`}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Execute ─────────────────────────────────────── */}
        {parsed && parsed.length > 0 && !headerError && (
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            {!serverCheck && (
              <View style={[styles.banner, { backgroundColor: tokens.semantic.infoBg, marginBottom: 10 }]}>
                <Ionicons name="information-circle-outline" size={18} color={tokens.semantic.info} />
                <Text style={[styles.bannerText, { color: tokens.semantic.info }]}>
                  شغّل التحقّق أولاً قبل التنفيذ — الاستيراد يرسل الصفوف الصالحة فقط.
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.executeBtn,
                (executing || !serverCheck || (stats?.valid ?? 0) === 0) && styles.btnDisabled,
              ]}
              disabled={executing || !serverCheck || (stats?.valid ?? 0) === 0}
              activeOpacity={0.85}
              onPress={handleExecute}
            >
              {executing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="rocket-outline" size={18} color="#fff" />
              )}
              <Text style={styles.executeBtnText}>
                {executing
                  ? 'جاري الاستيراد...'
                  : `تنفيذ الاستيراد${stats ? ` (${stats.valid})` : ''}`}
              </Text>
            </TouchableOpacity>

            {executeResult && (
              <View style={{ marginTop: 14, gap: 8 }}>
                <View style={[styles.banner, { backgroundColor: tokens.semantic.successBg }]}>
                  <Ionicons name="checkmark-circle" size={18} color={tokens.semantic.success} />
                  <Text style={[styles.bannerText, { color: tokens.semantic.success }]}>
                    {`تم إنشاء ${executeResult.created.length} حساب من أصل ${executeResult.total}`}
                  </Text>
                </View>
                {executeResult.failed.length > 0 && (
                  <View style={[styles.banner, { backgroundColor: tokens.semantic.dangerBg }]}>
                    <Ionicons name="alert-circle" size={18} color={tokens.semantic.danger} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bannerText, { color: tokens.semantic.danger, fontWeight: '700' }]}>
                        {`فشل ${executeResult.failed.length} صف:`}
                      </Text>
                      {executeResult.failed.slice(0, 8).map((f) => (
                        <Text
                          key={f.idx}
                          style={[styles.bannerText, { color: tokens.semantic.danger, marginTop: 2 }]}
                          numberOfLines={2}
                        >
                          {`• الصف ${f.idx} — ${f.full_name}: ${f.reason}`}
                        </Text>
                      ))}
                      {executeResult.failed.length > 8 && (
                        <Text style={[styles.bannerText, { color: tokens.semantic.danger, marginTop: 2 }]}>
                          {`+ ${executeResult.failed.length - 8} صف آخر`}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 13, color: tokens.text[3], fontWeight: '500' },

  card: {
    marginHorizontal: 14,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    padding: 14,
    gap: 10,
    marginBottom: 10,
    ...tokens.shadow.xs,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
  },

  colsList: { gap: 6 },
  colRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  colBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 90,
    alignItems: 'center',
  },
  colKey: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  colLabel: {
    flex: 1,
    fontSize: 12,
    color: tokens.text[2],
    textAlign: 'right',
  },
  colReq: { color: tokens.semantic.danger, fontWeight: '800' },

  templateBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.brand[100],
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    marginTop: 4,
  },
  templateBtnText: {
    color: tokens.brand[500],
    fontSize: 13,
    fontWeight: '800',
  },

  textarea: {
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1,
    borderColor: tokens.border[1],
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    color: tokens.text[1],
    minHeight: 140,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  actionsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 4,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.brand[500],
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    ...tokens.shadow.xs,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1,
    borderColor: tokens.border[1],
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
  },
  secondaryBtnText: { color: tokens.text[2], fontSize: 13, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },

  banner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    marginBottom: 6,
  },
  bannerText: { flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  countsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingHorizontal: 14,
    marginVertical: 6,
  },
  countCard: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    ...tokens.shadow.xs,
  },
  countValue: { fontSize: 22, fontWeight: '900' },
  countLabel: { fontSize: 11, color: tokens.text[3], fontWeight: '700', marginTop: 2 },

  previewRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: tokens.border[2],
    marginVertical: 3,
    ...tokens.shadow.xs,
  },
  previewRowError: {
    borderColor: tokens.semantic.danger,
    backgroundColor: '#FFF8F8',
  },
  previewIdx: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIdxText: { fontSize: 12, fontWeight: '800' },
  previewMain: { flex: 1, minWidth: 0 },
  previewName: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.text[1],
    textAlign: 'right',
  },
  previewMeta: {
    fontSize: 11,
    color: tokens.text[3],
    textAlign: 'right',
    marginTop: 2,
  },
  previewError: {
    fontSize: 11,
    color: tokens.semantic.danger,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 2,
  },

  moreNote: { alignItems: 'center', paddingVertical: 10 },
  moreNoteText: { fontSize: 12, color: tokens.text[3], fontWeight: '600' },

  executeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.brand[500],
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
    ...tokens.shadow.md,
  },
  executeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
