// MedicalMedications — institute-wide medication log + quick "give now" sheet.
// Per-student drilldown happens via the existing records screen.

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
import { timeAgo } from '../../utils/helpers';
import {
  listMedicationLogs, addMedicationLog, type MedicationLog,
} from '../../services/medicalService';

export default function MedicalMedications() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { allStudents, loadAllStudents } = useMedicalStore();

  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [medName, setMedName] = useState('');
  const [dose, setDose] = useState('');
  const [route, setRoute] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const data = await listMedicationLogs(userInstituteId, { limit: 200 });
      setLogs(data);
    } catch (err) { if (__DEV__) console.error('[medical/medications] load', err); }
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
    setPicked(null); setMedName(''); setDose(''); setRoute(''); setNotes(''); setSearch('');
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
    if (medName.trim().length < 1) { Alert.alert('تنبيه', 'اكتب اسم الدواء'); return; }
    if (dose.trim().length < 1) { Alert.alert('تنبيه', 'اكتب الجرعة'); return; }

    setSubmitting(true);
    haptics.medium();
    try {
      await addMedicationLog({
        institute_id: userInstituteId,
        student_id: picked.id,
        given_by: userId,
        medication_name: medName.trim(),
        dose: dose.trim(),
        route: route.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      haptics.success();
      reset();
      setSheetOpen(false);
      load();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل الحفظ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="سجل الأدوية"
        subtitle="ما أُعطي للطلاب + متى"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(220,38,38,0.30)"
        fallbackRoute="/(medical)"
      />

      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => { haptics.medium(); reset(); setSheetOpen(true); }}
          style={styles.addBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.addBtnText}>تسجيل جرعة</Text>
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
            <SkeletonList count={5} cardHeight={72} />
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="bandage-outline" size={36} color={tokens.brand[500]} />
            <Text style={styles.emptyTitle}>لا توجد جرعات مسجّلة</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {logs.map((m, idx) => (
              <FadeSlideIn key={m.id} delay={Math.min(idx * 20, 250)} translateFrom={6}>
                <View style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="medical" size={18} color={tokens.semantic.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>{m.medication_name}</Text>
                    <Text style={styles.metaText}>
                      {m.student_name || 'طالب'} • {m.dose}
                      {m.route ? ` • ${m.route}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.timeText}>{timeAgo(m.given_at)}</Text>
                </View>
              </FadeSlideIn>
            ))}
          </View>
        )}
      </ScrollView>

      <SwipeableSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} maxHeight={0.95}>
        <View style={styles.sheetWrap}>
          <Text style={styles.sheetTitle}>تسجيل جرعة دواء</Text>

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
              <Text style={styles.sheetLabel}>الدواء *</Text>
              <TextInput value={medName} onChangeText={setMedName}
                placeholder="مثال: باراسيتامول" placeholderTextColor={tokens.text[4]}
                style={styles.input} textAlign="right" />

              <Text style={styles.sheetLabel}>الجرعة *</Text>
              <TextInput value={dose} onChangeText={setDose}
                placeholder="مثال: 500 ملغ" placeholderTextColor={tokens.text[4]}
                style={styles.input} textAlign="right" />

              <Text style={styles.sheetLabel}>طريقة الإعطاء</Text>
              <TextInput value={route} onChangeText={setRoute}
                placeholder="فموي / عضلي / موضعي..." placeholderTextColor={tokens.text[4]}
                style={styles.input} textAlign="right" />

              <Text style={styles.sheetLabel}>ملاحظات</Text>
              <TextInput value={notes} onChangeText={setNotes}
                placeholder="ملاحظات إضافية..." placeholderTextColor={tokens.text[4]}
                style={[styles.input, { minHeight: 60 }]} multiline textAlignVertical="top" textAlign="right" />

              <TouchableOpacity onPress={handleSubmit} disabled={submitting}
                style={[styles.submitBtn, submitting && { opacity: 0.5 }]} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator color="#fff" />
                  : <Ionicons name="save" size={18} color="#fff" />}
                <Text style={styles.submitBtnText}>
                  {submitting ? 'جاري الحفظ...' : 'حفظ الجرعة'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SwipeableSheet>
    </SafeAreaView>
  );
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
    backgroundColor: tokens.semantic.dangerBg,
    alignItems: 'center', justifyContent: 'center',
  },
  medName: { fontSize: 13, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  metaText: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 2 },
  timeText: { fontSize: 11, color: tokens.text[4] },
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
