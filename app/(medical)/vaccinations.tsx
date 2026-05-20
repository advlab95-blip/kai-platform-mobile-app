// MedicalVaccinations — vaccination registry across all students with a
// "next due" highlight. Add sheet mirrors the medications screen.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useMedicalStore from '../../stores/medicalStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  listVaccinations, addVaccination, type VaccinationRecord,
} from '../../services/medicalService';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MedicalVaccinations() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { allStudents, loadAllStudents } = useMedicalStore();

  const [records, setRecords] = useState<VaccinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [vaccineName, setVaccineName] = useState('');
  const [doseNumber, setDoseNumber] = useState('');
  const [administered, setAdministered] = useState(todayStr());
  const [nextDue, setNextDue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const data = await listVaccinations(userInstituteId, { limit: 300 });
      setRecords(data);
    } catch (err) { if (__DEV__) console.error('[medical/vaccinations] load', err); }
  }, [userInstituteId]);

  useEffect(() => {
    if (userInstituteId && allStudents.length === 0) loadAllStudents(userInstituteId);
  }, [userInstituteId, allStudents.length, loadAllStudents]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const reset = () => {
    setPicked(null); setVaccineName(''); setDoseNumber('');
    setAdministered(todayStr()); setNextDue(''); setSearch('');
  };

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = allStudents as any[];
    if (!q) return src.slice(0, 80);
    return src.filter((s) => (s.full_name || '').toLowerCase().includes(q)).slice(0, 80);
  }, [allStudents, search]);

  const handleSubmit = async () => {
    if (!userId || !userInstituteId) return;
    if (!picked) { Alert.alert('تنبيه', 'اختر الطالب'); return; }
    if (vaccineName.trim().length < 1) { Alert.alert('تنبيه', 'اكتب اسم التطعيم'); return; }
    if (!DATE_PATTERN.test(administered)) { Alert.alert('تنبيه', 'صيغة التاريخ غير صحيحة'); return; }
    if (nextDue && !DATE_PATTERN.test(nextDue)) { Alert.alert('تنبيه', 'صيغة موعد الجرعة القادمة غير صحيحة'); return; }

    setSubmitting(true);
    haptics.medium();
    try {
      await addVaccination({
        institute_id: userInstituteId,
        student_id: picked.id,
        recorded_by: userId,
        vaccine_name: vaccineName.trim(),
        dose_number: doseNumber ? Number(doseNumber) : undefined,
        administered_at: administered,
        next_due_date: nextDue || undefined,
      });
      haptics.success();
      reset();
      setSheetOpen(false);
      load();
    } catch (err: any) {
      haptics.error();
      if (err?.message?.includes('vaccination_unique')) {
        Alert.alert('موجود بالفعل', 'هذه الجرعة من التطعيم مسجلة لهذا الطالب');
      } else {
        Alert.alert('خطأ', err?.message || 'فشل الحفظ');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dueSoon = useMemo(() => {
    const today = new Date();
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 30);
    return records.filter((r) => r.next_due_date && new Date(r.next_due_date) <= horizon && new Date(r.next_due_date) >= today);
  }, [records]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="سجل التطعيمات"
        subtitle={dueSoon.length > 0 ? `${dueSoon.length} جرعة قادمة خلال 30 يوم` : 'سجل كل التطعيمات'}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(16,185,129,0.30)"
        fallbackRoute="/(medical)"
      />

      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => { haptics.medium(); reset(); setSheetOpen(true); }}
          style={styles.addBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.addBtnText}>تطعيم جديد</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={5} cardHeight={88} />
          </View>
        ) : records.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="shield-checkmark-outline" size={36} color={tokens.brand[500]} />
            <Text style={styles.emptyTitle}>لا توجد تطعيمات مسجّلة</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {records.map((r, idx) => {
              const isDue = r.next_due_date && new Date(r.next_due_date) <= new Date();
              return (
                <FadeSlideIn key={r.id} delay={Math.min(idx * 20, 250)} translateFrom={6}>
                  <View style={[styles.row, isDue && { borderColor: tokens.semantic.warning, borderWidth: 1.5 }]}>
                    <View style={styles.iconWrap}>
                      <Ionicons name="shield-checkmark" size={18} color={tokens.semantic.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recordName}>
                        {r.vaccine_name}
                        {r.dose_number ? ` (الجرعة ${r.dose_number})` : ''}
                      </Text>
                      <Text style={styles.metaText}>
                        {r.student_name || 'طالب'} • {formatDate(r.administered_at)}
                      </Text>
                      {r.next_due_date ? (
                        <Text style={[styles.dueText, isDue && { color: tokens.semantic.danger, fontWeight: '800' }]}>
                          الجرعة القادمة: {formatDate(r.next_due_date)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </FadeSlideIn>
              );
            })}
          </View>
        )}
      </ScrollView>

      <SwipeableSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} maxHeight={0.95}>
        <View style={styles.sheetWrap}>
          <Text style={styles.sheetTitle}>تطعيم جديد</Text>

          {!picked ? (
            <View>
              <Text style={styles.sheetLabel}>اختر الطالب</Text>
              <TextInput value={search} onChangeText={setSearch}
                placeholder="ابحث بالاسم..." placeholderTextColor={tokens.text[4]}
                style={styles.input} textAlign="right" />
              <ScrollView style={styles.studentList} keyboardShouldPersistTaps="handled">
                {filteredStudents.map((s: any) => (
                  <TouchableOpacity key={s.id}
                    onPress={() => { haptics.selection(); setPicked({ id: s.id, name: s.full_name }); }}
                    style={styles.studentRow} activeOpacity={0.85}>
                    <Ionicons name="person-circle-outline" size={20} color={tokens.text[3]} />
                    <Text style={styles.studentRowName}>{s.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setPicked(null)}
              style={styles.selectedChip} activeOpacity={0.85}>
              <Ionicons name="person" size={16} color={tokens.brand[500]} />
              <Text style={styles.selectedChipText}>{picked.name}</Text>
              <Ionicons name="close" size={14} color={tokens.text[3]} />
            </TouchableOpacity>
          )}

          {picked && (
            <>
              <Text style={styles.sheetLabel}>اسم التطعيم *</Text>
              <TextInput value={vaccineName} onChangeText={setVaccineName}
                placeholder="مثال: التطعيم الثلاثي" placeholderTextColor={tokens.text[4]}
                style={styles.input} textAlign="right" />

              <Text style={styles.sheetLabel}>رقم الجرعة</Text>
              <TextInput value={doseNumber} onChangeText={setDoseNumber}
                placeholder="1, 2, 3..." placeholderTextColor={tokens.text[4]}
                keyboardType="number-pad" style={styles.input} textAlign="right" />

              <Text style={styles.sheetLabel}>تاريخ الإعطاء *</Text>
              <TextInput value={administered} onChangeText={setAdministered}
                placeholder="YYYY-MM-DD" placeholderTextColor={tokens.text[4]}
                style={styles.input} autoCapitalize="none" autoCorrect={false} textAlign="right" />

              <Text style={styles.sheetLabel}>الجرعة القادمة (اختياري)</Text>
              <TextInput value={nextDue} onChangeText={setNextDue}
                placeholder="YYYY-MM-DD" placeholderTextColor={tokens.text[4]}
                style={styles.input} autoCapitalize="none" autoCorrect={false} textAlign="right" />

              <TouchableOpacity onPress={handleSubmit} disabled={submitting}
                style={[styles.submitBtn, submitting && { opacity: 0.5 }]} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator color="#fff" />
                  : <Ionicons name="save" size={18} color="#fff" />}
                <Text style={styles.submitBtnText}>
                  {submitting ? 'جاري الحفظ...' : 'حفظ التطعيم'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

function formatDate(ymd: string): string {
  try { return new Date(ymd).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ymd; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  actionRow: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'flex-start' },
  addBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: tokens.radius.md,
    backgroundColor: tokens.brand[500], ...tokens.shadow.md,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  row: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.border[2], padding: 12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: tokens.semantic.successBg,
    alignItems: 'center', justifyContent: 'center',
  },
  recordName: { fontSize: 13, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  metaText: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 2 },
  dueText: { fontSize: 11, color: tokens.semantic.warning, textAlign: 'right', marginTop: 4, fontWeight: '700' },
  sheetWrap: { paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 30 : 20, gap: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  sheetLabel: { fontSize: 12, fontWeight: '700', color: tokens.text[2], textAlign: 'right', marginTop: 4 },
  input: {
    backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2],
    borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14, color: tokens.text[1], textAlign: 'right',
  },
  studentList: { maxHeight: 200, backgroundColor: tokens.surface.surface2, borderRadius: tokens.radius.md, marginTop: 6 },
  studentRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: tokens.border[2],
  },
  studentRowName: { flex: 1, fontSize: 13, color: tokens.text[1], textAlign: 'right' },
  selectedChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: tokens.brand[100], borderWidth: 1, borderColor: tokens.brand[100],
  },
  selectedChipText: { fontSize: 13, fontWeight: '800', color: tokens.brand[500] },
  submitBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: tokens.radius.md, backgroundColor: tokens.brand[500],
    marginTop: 6,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 14, color: tokens.text[3] },
});
