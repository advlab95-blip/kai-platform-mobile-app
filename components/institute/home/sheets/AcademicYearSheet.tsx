// AcademicYearSheet — list existing academic years and add a new one via a
// scrollable year picker (no manual typing). Picking a starting year auto-fills
// the name "YYYY-YYYY+1" and the start/end dates (Sep 1 → Jun 30 by default).
// Pure presentational; parent owns the years list, form fields, and Supabase handlers.

import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  academicYears: any[];
  newYearName: string;
  newYearStart: string;
  newYearEnd: string;
  creatingYear: boolean;
  onChangeName: (v: string) => void;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onSetCurrent: (yearId: string) => void;
  onCreate: () => void;
};

// 6 years forward from 2026-2027 per user request (2026-05-13).
// Labels span "2026-2027" through "2031-2032".
// Iraqi school year convention: Sep 1 (start) → Jun 30 (end).
const YEARS = [2026, 2027, 2028, 2029, 2030, 2031];
function buildYearOptions(): number[] {
  return YEARS.slice();
}

function composeYearName(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

function defaultStartDate(startYear: number): string {
  return `${startYear}-09-01`;
}
function defaultEndDate(startYear: number): string {
  return `${startYear + 1}-06-30`;
}

// Parse a year name like "2025-2026" back to its start year (or null).
function parseStartYear(name: string): number | null {
  const m = name.match(/(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

export default function AcademicYearSheet({
  visible,
  onClose,
  academicYears,
  newYearName,
  newYearStart,
  newYearEnd,
  creatingYear,
  onChangeName,
  onChangeStart,
  onChangeEnd,
  onSetCurrent,
  onCreate,
}: Props) {
  const yearOptions = useMemo(buildYearOptions, []);
  // Anchor "current" school year using Iraqi Sep cutoff: if we're in Sep..Dec
  // (month >= 8), the current school year started this calendar year; else it
  // started last calendar year. Clamp into the available YEARS window.
  const baseYear = useMemo(() => {
    const now = new Date();
    const month = now.getMonth(); // 0=Jan ... 8=Sep ... 11=Dec
    const guess = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const min = yearOptions[0];
    const max = yearOptions[yearOptions.length - 1];
    return Math.min(Math.max(guess, min), max);
  }, [yearOptions]);
  const selectedStartYear = parseStartYear(newYearName);

  // When the sheet opens for the first time and no year is selected yet,
  // pre-select the current school year so the user can just press "إنشاء".
  useEffect(() => {
    if (!visible) return;
    if (!newYearName) {
      const startYear = baseYear;
      onChangeName(composeYearName(startYear));
      onChangeStart(defaultStartDate(startYear));
      onChangeEnd(defaultEndDate(startYear));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Auto-scroll the vertical picker to the currently-selected row on open.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!visible) return;
    const idx = yearOptions.findIndex(y => y === (selectedStartYear ?? baseYear));
    if (idx >= 0) {
      const ROW = 52; // approx row height incl. gap
      scrollRef.current?.scrollTo({ y: Math.max(0, idx * ROW - ROW * 1.5), animated: false });
    }
  }, [visible, selectedStartYear, baseYear, yearOptions]);

  const pickYear = (startYear: number) => {
    onChangeName(composeYearName(startYear));
    onChangeStart(defaultStartDate(startYear));
    onChangeEnd(defaultEndDate(startYear));
  };

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 20 }}>
          <Text style={styles.title}>السنوات الدراسية</Text>

          <ScrollView style={{ maxHeight: 200, marginBottom: 16 }}>
            {academicYears.map((y) => (
              <View
                key={y.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: y.is_current ? '#F0FDF4' : '#F8FAFC',
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: y.is_current ? 1.5 : 1,
                  borderColor: y.is_current ? '#22C55E' : '#E2E8F0',
                }}
              >
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {!y.is_current && (
                    <TouchableOpacity onPress={() => onSetCurrent(y.id)}>
                      <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '700' }}>تعيين حالية</Text>
                    </TouchableOpacity>
                  )}
                  {y.is_current && (
                    <View style={{ backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803D' }}>الحالية</Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.text }}>{y.name}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>{y.start_date} — {y.end_date}</Text>
                </View>
              </View>
            ))}
            {academicYears.length === 0 && (
              <Text style={{ textAlign: 'center', color: Colors.textMuted, padding: 20 }}>لا توجد سنوات دراسية</Text>
            )}
          </ScrollView>

          <Text style={styles.sectionLabel}>اختر السنة الدراسية</Text>

          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 4, gap: 8 }}
            style={{ marginBottom: 14, maxHeight: 220 }}
            nestedScrollEnabled
          >
            {yearOptions.map((startYear) => {
              const active = startYear === selectedStartYear;
              return (
                <TouchableOpacity
                  key={startYear}
                  onPress={() => pickYear(startYear)}
                  activeOpacity={0.85}
                  style={[styles.yearRow, active && styles.yearRowActive]}
                >
                  <Text style={[styles.yearRowText, active && styles.yearRowTextActive]}>
                    {composeYearName(startYear)}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Auto-filled details preview */}
          {selectedStartYear !== null && (
            <View style={styles.previewCard}>
              <View style={styles.previewRow}>
                <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.previewLabel}>بداية السنة</Text>
                <Text style={styles.previewValue}>{newYearStart || defaultStartDate(selectedStartYear)}</Text>
              </View>
              <View style={styles.previewRow}>
                <Ionicons name="calendar" size={14} color={Colors.textMuted} />
                <Text style={styles.previewLabel}>نهاية السنة</Text>
                <Text style={styles.previewValue}>{newYearEnd || defaultEndDate(selectedStartYear)}</Text>
              </View>
              <Text style={styles.previewHint}>التواريخ افتراضية للسنة الدراسية العراقية — تقدر تختار سنة مختلفة بالأعلى.</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' }}
              onPress={onClose}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textSecondary }}>إغلاق</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#7C3AED', alignItems: 'center', opacity: creatingYear ? 0.5 : 1 }}
              onPress={onCreate}
              disabled={creatingYear || !newYearName}
            >
              {creatingYear ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>إنشاء وتعيين</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: 8,
  },
  yearChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minWidth: 78,
    alignItems: 'center',
  },
  yearChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#6D28D9',
  },
  yearChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  yearChipTextActive: {
    color: '#fff',
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  yearRowActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#6D28D9',
  },
  yearRowText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  yearRowTextActive: {
    color: '#fff',
  },
  previewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  previewLabel: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'right',
    marginHorizontal: 8,
  },
  previewValue: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '800',
  },
  previewHint: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
    lineHeight: 17,
  },
});
