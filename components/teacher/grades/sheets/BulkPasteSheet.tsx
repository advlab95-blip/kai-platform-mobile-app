// BulkPasteSheet — paste-CSV shortcut for teacher-grades entry.
//
// Flow:
//   1. Teacher pastes rows: "اسم الطالب,الدرجة" — one per line.
//   2. We match names to the current `students` list (loose match — trimmed,
//      case-insensitive, ignores extra whitespace + diacritics in Arabic).
//   3. Validate scores against max_score.
//   4. Call setEntry(studentId, value) for each matched row — populates the
//      existing matrix.
//   5. Show a summary (matched / unmatched / invalid).
//
// The teacher then reviews the matrix and clicks the existing "Save" button.
// We don't bypass the save flow — paste only PRE-FILLS values.
//
// Why a paste flow instead of file upload? See bulk-import.tsx — file pickers
// in RN/Expo are inconsistent across iOS/Android/web. Paste covers 95% of
// admin workflows (Excel/Sheets → copy → paste) with zero dependency.

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { tokens } from '../../../../constants/designTokens';
import { haptics } from '../../../../utils/haptics';

type Student = { id: string; full_name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  students: Student[];
  maxScore: number;
  /** Called per matched row — wires straight into useGradesController.setEntry. */
  onApply: (studentId: string, value: string) => void;
};

// Normalize an Arabic name for matching: trim, collapse whitespace, lowercase,
// strip common diacritics (ـ ً ٌ ٍ َ ُ ِ ّ ْ). Loose enough to forgive admins
// who paste "أحمد علي" vs "احمد علي".
function normalize(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // tashkeel + tatweel
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function splitCsvLine(line: string): string[] {
  // Lightweight CSV: comma + optional quoted fields. Mirrors the parser in
  // app/(institute)/bulk-import.tsx.
  const out: string[] = [];
  let inQuotes = false;
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

type ParsedRow = {
  raw: string;
  name: string;
  scoreStr: string;
  matched?: Student;
  parsedScore?: number;
  error?: string;
};

export default function BulkPasteSheet({ visible, onClose, students, maxScore, onApply }: Props) {
  const [pasted, setPasted] = useState('');

  // Build lookup once per visible students slice.
  const lookup = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of students) m.set(normalize(s.full_name), s);
    return m;
  }, [students]);

  const rows = useMemo<ParsedRow[]>(() => {
    if (!pasted.trim()) return [];
    return pasted
      .split(/\r?\n/)
      .map((line) => line.replace(/^\uFEFF/, '').trim()) // strip BOM, trim
      .filter(Boolean)
      .map((line): ParsedRow => {
        const parts = splitCsvLine(line);
        const name = parts[0] || '';
        const scoreStr = (parts[1] || '').replace(',', '.');
        const matched = lookup.get(normalize(name));
        const n = Number(scoreStr);
        let error: string | undefined;
        if (!name) error = 'اسم فارغ';
        else if (!matched) error = 'لا يوجد طالب بهذا الاسم';
        else if (!scoreStr) error = 'الدرجة مفقودة';
        else if (!Number.isFinite(n) || n < 0) error = 'الدرجة غير صحيحة';
        else if (n > maxScore) error = `الدرجة أعلى من الحد (${maxScore})`;
        return { raw: line, name, scoreStr, matched, parsedScore: Number.isFinite(n) ? n : undefined, error };
      });
  }, [pasted, lookup, maxScore]);

  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.length - validCount;

  const handleApply = () => {
    if (validCount === 0) {
      Alert.alert('تنبيه', 'لا توجد صفوف صالحة للتطبيق');
      return;
    }
    Alert.alert(
      'تطبيق الدرجات',
      `سيتم تعبئة ${validCount} طالب في الجدول. (يجب الضغط على "حفظ" بعد المراجعة لحفظ الدرجات فعلياً.)`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تطبيق',
          onPress: () => {
            haptics.success();
            let applied = 0;
            for (const r of rows) {
              if (!r.error && r.matched && r.parsedScore != null) {
                onApply(r.matched.id, String(r.parsedScore));
                applied++;
              }
            }
            setPasted('');
            onClose();
            if (errorCount > 0) {
              Alert.alert('تم', `طُبّق ${applied} درجة — ${errorCount} صف تم تجاهله. راجع الجدول قبل الحفظ.`);
            }
          },
        },
      ],
    );
  };

  const handleClose = () => {
    if (pasted.trim() && !Alert.alert) {
      // Web fallback — just close.
    }
    setPasted('');
    onClose();
  };

  return (
    <SwipeableSheet visible={visible} onClose={handleClose} maxHeight={0.92}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="clipboard-outline" size={20} color={tokens.color.brand500} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>إدخال درجات بالجملة</Text>
            <Text style={styles.subtitle}>
              الصق من Excel: اسم,درجة (سطر لكل طالب)
            </Text>
          </View>
        </View>

        {/* Example */}
        <View style={styles.exampleBox}>
          <Text style={styles.exampleLabel}>مثال:</Text>
          <Text style={styles.exampleText} numberOfLines={3}>
            أحمد علي, 85{'\n'}
            محمد حسين, 72{'\n'}
            فاطمة كريم, 90
          </Text>
        </View>

        <TextInput
          value={pasted}
          onChangeText={setPasted}
          placeholder="الصق الصفوف هنا..."
          placeholderTextColor={tokens.color.text4}
          style={styles.input}
          multiline
          textAlignVertical="top"
          textAlign="right"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Summary */}
        {rows.length > 0 && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {rows.length} صف •{' '}
              <Text style={{ color: tokens.color.success, fontWeight: '800' }}>{validCount} صالح</Text>
              {errorCount > 0 && (
                <>
                  {' • '}
                  <Text style={{ color: tokens.color.danger, fontWeight: '800' }}>{errorCount} خطأ</Text>
                </>
              )}
            </Text>
          </View>
        )}

        {/* Preview (errors first to make them obvious) */}
        {rows.length > 0 && (
          <ScrollView style={styles.previewWrap} contentContainerStyle={{ paddingBottom: 8 }}>
            {[...rows].sort((a, b) => Number(!!a.error) - Number(!!b.error)).slice(0, 15).map((r, i) => (
              <View key={i} style={[styles.previewRow, r.error && styles.previewRowError]}>
                <Ionicons
                  name={r.error ? 'close-circle' : 'checkmark-circle'}
                  size={16}
                  color={r.error ? tokens.color.danger : tokens.color.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName} numberOfLines={1}>
                    {r.matched?.full_name || r.name || '—'}
                  </Text>
                  {r.error && (
                    <Text style={styles.previewError} numberOfLines={1}>{r.error}</Text>
                  )}
                </View>
                <Text style={styles.previewScore}>
                  {r.scoreStr || '—'}
                </Text>
              </View>
            ))}
            {rows.length > 15 && (
              <Text style={styles.moreNote}>+ {rows.length - 15} صف إضافي</Text>
            )}
          </ScrollView>
        )}

        <TouchableOpacity
          onPress={handleApply}
          disabled={validCount === 0}
          style={[styles.applyBtn, validCount === 0 && styles.btnDisabled]}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-down-circle" size={18} color="#fff" />
          <Text style={styles.applyBtnText}>
            تطبيق {validCount > 0 ? `(${validCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '900', color: tokens.color.text, textAlign: 'right' },
  subtitle: { fontSize: 11, color: tokens.color.text3, textAlign: 'right', marginTop: 2 },

  exampleBox: {
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    padding: 10,
    gap: 4,
  },
  exampleLabel: { fontSize: 11, fontWeight: '700', color: tokens.color.text3, textAlign: 'right' },
  exampleText: {
    fontSize: 12, color: tokens.color.text, textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },

  input: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: 12,
    fontSize: 14,
    color: tokens.color.text,
    minHeight: 120,
    textAlign: 'right',
  },

  summary: {
    paddingHorizontal: 4,
  },
  summaryText: { fontSize: 12, color: tokens.color.text, textAlign: 'right' },

  previewWrap: {
    maxHeight: 200,
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
  },
  previewRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
  },
  previewRowError: { backgroundColor: '#FEE2E230' },
  previewName: { fontSize: 12, color: tokens.color.text, textAlign: 'right', fontWeight: '700' },
  previewError: { fontSize: 10, color: tokens.color.danger, textAlign: 'right', marginTop: 1 },
  previewScore: { fontSize: 13, fontWeight: '900', color: tokens.color.text, minWidth: 40, textAlign: 'left' },

  moreNote: {
    fontSize: 11,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 8,
  },

  applyBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand500,
  },
  btnDisabled: { opacity: 0.5 },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
