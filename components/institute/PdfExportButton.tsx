// PdfExportButton — reusable export pill for institute reports.
//
// Strategy:
//   1. If `expo-print` is installed (it is, per package.json v15.0.8) →
//      build an RTL HTML doc, render via Print.printToFileAsync, then
//      hand off to expo-sharing (also installed) for native share sheet.
//   2. If for any reason print/sharing fail at runtime (older bundle,
//      web build, …) → graceful fallback: produce a CSV string and copy
//      it via the project's copyToClipboard util.
//   3. Final fallback: dump CSV into a plain Alert so the data is never
//      lost to the user.
//
// Importantly: the require() is wrapped in try/catch so the bundler can't
// hard-crash the screen if a dev removes expo-print from package.json.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';
import { copyToClipboard } from '../../utils/clipboard';

type Column = { key: string; label: string };

interface Props {
  data: any[];
  columns: Column[];
  title: string;
  /** Used for the saved file name. Default: derived from `title`. */
  filename?: string;
  /** Pill label override — default "تصدير". */
  label?: string;
  /** Optional disable (e.g. while data is loading). */
  disabled?: boolean;
}

// Minimal HTML escape — body content goes inside <td>, so we only need
// the standard 5 entities. Avoid pulling in a library.
function esc(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(title: string, columns: Column[], data: any[]): string {
  const now = new Date().toLocaleString('ar-IQ');
  const headerCells = columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const rows = data
    .map((row) => {
      const tds = columns.map((c) => `<td>${esc(row?.[c.key])}</td>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", "Cairo", "Tahoma", sans-serif;
    color: #0F172A;
    direction: rtl;
    text-align: right;
    margin: 0;
    padding: 0;
  }
  .hdr {
    border-bottom: 2px solid #2F2FBA;
    padding-bottom: 10px;
    margin-bottom: 18px;
  }
  .hdr h1 { margin: 0 0 4px; font-size: 20px; color: #1E1E6B; }
  .hdr .meta { font-size: 11px; color: #64748B; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td {
    border: 1px solid #E2E8F0;
    padding: 7px 8px;
    text-align: right;
    vertical-align: top;
  }
  thead th {
    background: #EEF2FF;
    color: #1E1E6B;
    font-weight: 700;
    font-size: 11px;
  }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  .empty {
    text-align: center;
    padding: 30px;
    color: #94A3B8;
    font-size: 13px;
  }
  .ftr {
    margin-top: 18px;
    font-size: 10px;
    color: #94A3B8;
    border-top: 1px solid #E2E8F0;
    padding-top: 8px;
  }
</style>
</head>
<body>
  <div class="hdr">
    <h1>${esc(title)}</h1>
    <div class="meta">تاريخ التصدير: ${esc(now)} — عدد السجلات: ${data.length}</div>
  </div>
  ${data.length === 0
    ? '<div class="empty">لا توجد بيانات للتصدير</div>'
    : `<table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
  <div class="ftr">تم الإنشاء بواسطة تطبيق Kai</div>
</body>
</html>`;
}

function buildCsv(columns: Column[], data: any[]): string {
  const head = columns.map((c) => `"${String(c.label).replace(/"/g, '""')}"`).join(',');
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const v = row?.[c.key];
        const s = v === null || v === undefined ? '' : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      })
      .join(',')
  );
  // Prepend BOM so Excel opens Arabic correctly.
  return '\uFEFF' + [head, ...rows].join('\n');
}

async function tryPdfFlow(html: string, filename: string): Promise<boolean> {
  // Print module — wrapped so missing dep doesn't crash the screen.
  let Print: any = null;
  try { Print = require('expo-print'); } catch { return false; }
  if (!Print?.printToFileAsync) return false;

  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    if (!uri) return false;

    // Try to surface a native share sheet so the user can save / send.
    let Sharing: any = null;
    try { Sharing = require('expo-sharing'); } catch {}
    if (Sharing?.isAvailableAsync && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      });
      return true;
    }

    // No share sheet available — surface the file location at least.
    Alert.alert('تم التصدير', `حُفظ الملف في:\n${uri}`);
    return true;
  } catch (err: any) {
    if (__DEV__) console.warn('[PdfExportButton] print failed', err);
    return false;
  }
}

export default function PdfExportButton({
  data, columns, title, filename, label = 'تصدير', disabled,
}: Props) {
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy || disabled) return;
    haptics.light();
    setBusy(true);

    const safeName = (filename || title || 'export').replace(/[^\w\u0600-\u06FF-]+/g, '_');

    try {
      // Empty datasets: warn first — no point opening a print dialog over nothing.
      if (!data || data.length === 0) {
        Alert.alert('لا توجد بيانات', 'لا توجد سجلات للتصدير حالياً.');
        return;
      }

      const html = buildHtml(title, columns, data);
      const printed = Platform.OS === 'web' ? false : await tryPdfFlow(html, safeName);
      if (printed) return;

      // ── Fallback path ─────────────────────────────────────────────
      const csv = buildCsv(columns, data);
      const copied = await copyToClipboard(csv, 'بيانات التصدير');
      if (copied) {
        Alert.alert('تم النسخ', 'تم نسخ البيانات بصيغة CSV — يمكن لصقها في Excel أو Sheets.');
      } else {
        // Last-resort: dump first 2000 chars into an alert. Better than
        // silently losing the report.
        const preview = csv.length > 2000 ? csv.slice(0, 2000) + '\n…' : csv;
        Alert.alert(title, preview);
      }
    } catch (err: any) {
      if (__DEV__) console.error('[PdfExportButton]', err);
      Alert.alert('خطأ', err?.message || 'تعذّر التصدير');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy || disabled}
      activeOpacity={0.8}
      style={[styles.pill, (busy || disabled) && styles.pillDisabled]}
      accessibilityRole="button"
      accessibilityLabel={`تصدير ${title}`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tokens.brand[500]} />
      ) : (
        <Ionicons name="download-outline" size={14} color={tokens.brand[500]} />
      )}
      <Text style={styles.pillText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.brand[100],
    backgroundColor: tokens.brand[50],
  },
  pillDisabled: { opacity: 0.5 },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.brand[500],
  },
});
