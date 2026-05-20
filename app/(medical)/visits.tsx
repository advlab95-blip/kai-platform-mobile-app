// MedicalVisits — daily clinic visit log + quick "new visit" sheet.
// On insert with sent_home=true, notifies parent + classroom teacher (via
// the existing notifications table; existing push pipeline relays it).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  TextInput, Switch, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useMedicalStore from '../../stores/medicalStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SectionLabel from '../../components/institute/SectionLabel';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { timeAgo } from '../../utils/helpers';
import {
  listClinicVisits, addClinicVisit, type ClinicVisit,
} from '../../services/medicalService';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';

export default function MedicalVisits() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { allStudents, loadAllStudents } = useMedicalStore();

  const [visits, setVisits] = useState<ClinicVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New-visit sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [symptoms, setSymptoms] = useState('');
  const [treatment, setTreatment] = useState('');
  const [sentHome, setSentHome] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const data = await listClinicVisits(userInstituteId, { sinceDays: 30, limit: 200 });
      setVisits(data);
    } catch (err) {
      if (__DEV__) console.error('[medical/visits] load', err);
    }
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

  const resetSheet = () => {
    setSelectedStudent(null);
    setSymptoms('');
    setTreatment('');
    setSentHome(false);
    setFollowUp(false);
    setStudentSearch('');
  };

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const src = allStudents as any[];
    if (!q) return src.slice(0, 80);
    return src.filter((s) => (s.full_name || '').toLowerCase().includes(q)).slice(0, 80);
  }, [allStudents, studentSearch]);

  const handleSubmit = async () => {
    if (!userId || !userInstituteId) return;
    if (!selectedStudent) { Alert.alert('تنبيه', 'اختر طالباً أولاً'); return; }
    if (symptoms.trim().length < 1) { Alert.alert('تنبيه', 'اكتب الأعراض'); return; }

    setSubmitting(true);
    haptics.medium();
    try {
      const visit = await addClinicVisit({
        institute_id: userInstituteId,
        student_id: selectedStudent.id,
        recorded_by: userId,
        symptoms: symptoms.trim(),
        treatment: treatment.trim() || undefined,
        sent_home: sentHome,
        follow_up_needed: followUp,
      });

      // Best-effort notifications. Failures don't abort the visit log.
      if (sentHome) {
        try {
          const parentId = await api.getParentByStudent(selectedStudent.id, userInstituteId);
          if (parentId) {
            await supabase.from('notifications').insert({
              user_id: parentId,
              title: 'إشعار من العيادة',
              content: `${selectedStudent.name} في العيادة الآن وتقرّر إرساله للبيت. الأعراض: ${visit.symptoms.slice(0, 120)}`,
              type: 'medical',
              institute_id: userInstituteId,
            });
          }
        } catch (e) { if (__DEV__) console.warn('[medical] parent notify failed', e); }

        // Notify the classroom teacher(s) — institute admin enrolls students
        // to classes via enrollments.class_id. We notify any teacher whose
        // teacher_assignments overlap the student's class.
        try {
          const { data: studentClass } = await supabase
            .from('enrollments')
            .select('class_id, section_id')
            .eq('user_id', selectedStudent.id)
            .eq('institute_id', userInstituteId)
            .eq('role', 'student')
            .eq('status', 'active')
            .maybeSingle();
          const classId = (studentClass as any)?.class_id;
          const sectionId = (studentClass as any)?.section_id;
          if (classId || sectionId) {
            const { data: teachers } = await supabase
              .from('teacher_assignments')
              .select('teacher_id')
              .eq('institute_id', userInstituteId)
              .or(`${classId ? `class_id.eq.${classId}` : ''}${classId && sectionId ? ',' : ''}${sectionId ? `section_id.eq.${sectionId}` : ''}`)
              .limit(20);
            const teacherIds = Array.from(new Set(((teachers as any[]) || []).map((t) => t.teacher_id))).filter(Boolean);
            if (teacherIds.length > 0) {
              await supabase.from('notifications').insert(
                teacherIds.map((tid) => ({
                  user_id: tid,
                  title: 'طالب أُرسل للبيت من العيادة',
                  content: `${selectedStudent.name} غادر للبيت — العيادة سجّلت زيارة`,
                  type: 'medical',
                  institute_id: userInstituteId,
                })),
              );
            }
          }
        } catch (e) { if (__DEV__) console.warn('[medical] teacher notify failed', e); }
      }

      haptics.success();
      Alert.alert('تم', 'تم تسجيل الزيارة');
      resetSheet();
      setSheetOpen(false);
      load();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل تسجيل الزيارة');
    } finally {
      setSubmitting(false);
    }
  };

  const todayCount = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return visits.filter((v) => new Date(v.visit_at).getTime() >= start.getTime()).length;
  }, [visits]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="زيارات العيادة"
        subtitle={`${todayCount} زيارة اليوم`}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(220,38,38,0.30)"
        fallbackRoute="/(medical)"
      />

      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => { haptics.medium(); resetSheet(); setSheetOpen(true); }}
          style={styles.addBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.addBtnText}>زيارة جديدة</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <SectionLabel title="آخر 30 يوماً" icon="time-outline" />
        </View>
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <SkeletonList count={4} cardHeight={96} />
          </View>
        ) : visits.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="medkit-outline" size={36} color={tokens.brand[500]} />
            <Text style={styles.emptyTitle}>لا توجد زيارات</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {visits.map((v, idx) => (
              <FadeSlideIn key={v.id} delay={Math.min(idx * 20, 250)} translateFrom={6}>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.flagsRow}>
                      {v.sent_home && (
                        <View style={[styles.flag, { backgroundColor: tokens.semantic.dangerBg }]}>
                          <Text style={[styles.flagText, { color: tokens.semantic.danger }]}>أُرسل للبيت</Text>
                        </View>
                      )}
                      {v.follow_up_needed && (
                        <View style={[styles.flag, { backgroundColor: tokens.semantic.warningBg }]}>
                          <Text style={[styles.flagText, { color: tokens.semantic.warning }]}>متابعة</Text>
                        </View>
                      )}
                    </View>
                    <View>
                      <Text style={styles.studentName}>{v.student_name || 'طالب'}</Text>
                      <Text style={styles.timeText}>{timeAgo(v.visit_at)}</Text>
                    </View>
                  </View>
                  <Text style={styles.symptomsText} numberOfLines={3}>{v.symptoms}</Text>
                  {v.treatment ? (
                    <Text style={styles.treatmentText} numberOfLines={2}>
                      <Text style={styles.treatmentLabel}>العلاج: </Text>{v.treatment}
                    </Text>
                  ) : null}
                </View>
              </FadeSlideIn>
            ))}
          </View>
        )}
      </ScrollView>

      {/* New visit sheet */}
      <SwipeableSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} maxHeight={0.95}>
        <View style={styles.sheetWrap}>
          <Text style={styles.sheetTitle}>زيارة جديدة</Text>

          {/* Student picker (collapses when selected) */}
          {!selectedStudent ? (
            <View>
              <Text style={styles.sheetLabel}>اختر الطالب</Text>
              <TextInput
                value={studentSearch}
                onChangeText={setStudentSearch}
                placeholder="ابحث بالاسم..."
                placeholderTextColor={tokens.text[4]}
                style={styles.input}
                textAlign="right"
              />
              <ScrollView style={styles.studentList} keyboardShouldPersistTaps="handled">
                {filteredStudents.map((s: any) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => { haptics.selection(); setSelectedStudent({ id: s.id, name: s.full_name }); }}
                    style={styles.studentRow}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="person-circle-outline" size={20} color={tokens.text[3]} />
                    <Text style={styles.studentRowName}>{s.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setSelectedStudent(null)}
              style={styles.selectedChip}
              activeOpacity={0.85}
            >
              <Ionicons name="person" size={16} color={tokens.brand[500]} />
              <Text style={styles.selectedChipText}>{selectedStudent.name}</Text>
              <Ionicons name="close" size={14} color={tokens.text[3]} />
            </TouchableOpacity>
          )}

          {selectedStudent && (
            <>
              <Text style={styles.sheetLabel}>الأعراض *</Text>
              <TextInput
                value={symptoms}
                onChangeText={setSymptoms}
                placeholder="مثال: صداع وغثيان..."
                placeholderTextColor={tokens.text[4]}
                style={[styles.input, { minHeight: 70 }]}
                multiline
                textAlignVertical="top"
                textAlign="right"
              />

              <Text style={styles.sheetLabel}>العلاج / الإجراء</Text>
              <TextInput
                value={treatment}
                onChangeText={setTreatment}
                placeholder="مثال: راحة + ماء + باراسيتامول..."
                placeholderTextColor={tokens.text[4]}
                style={[styles.input, { minHeight: 60 }]}
                multiline
                textAlignVertical="top"
                textAlign="right"
              />

              <View style={styles.switchRow}>
                <Switch value={sentHome} onValueChange={setSentHome}
                  trackColor={{ false: tokens.border[2], true: tokens.semantic.danger }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>أُرسل للبيت</Text>
                  <Text style={styles.switchHint}>
                    يرسل إشعار لولي الأمر + الأستاذ
                  </Text>
                </View>
              </View>

              <View style={styles.switchRow}>
                <Switch value={followUp} onValueChange={setFollowUp}
                  trackColor={{ false: tokens.border[2], true: tokens.semantic.warning }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>يحتاج متابعة</Text>
                  <Text style={styles.switchHint}>يظهر بقائمة المتابعة</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
                activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator color="#fff" />
                  : <Ionicons name="save" size={18} color="#fff" />}
                <Text style={styles.submitBtnText}>
                  {submitting ? 'جاري الحفظ...' : 'حفظ الزيارة'}
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
    backgroundColor: tokens.brand[500],
    ...tokens.shadow.md,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  card: {
    backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2], padding: 14, gap: 8,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
  studentName: { fontSize: 14, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  timeText: { fontSize: 11, color: tokens.text[4], textAlign: 'right', marginTop: 2 },
  flagsRow: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap', maxWidth: 200, justifyContent: 'flex-start' },
  flag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  flagText: { fontSize: 10, fontWeight: '800' },
  symptomsText: { fontSize: 13, color: tokens.text[1], textAlign: 'right', lineHeight: 19 },
  treatmentText: { fontSize: 12, color: tokens.text[2], textAlign: 'right', lineHeight: 17 },
  treatmentLabel: { fontWeight: '800' },

  sheetWrap: { paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 30 : 20, gap: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  sheetLabel: { fontSize: 12, fontWeight: '700', color: tokens.text[2], textAlign: 'right', marginTop: 4 },
  input: {
    backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2],
    borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14, color: tokens.text[1], textAlign: 'right',
  },
  studentList: {
    maxHeight: 200,
    backgroundColor: tokens.surface.surface2,
    borderRadius: tokens.radius.md,
    marginTop: 6,
  },
  studentRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: tokens.border[2],
  },
  studentRowName: { flex: 1, fontSize: 13, color: tokens.text[1], textAlign: 'right' },
  selectedChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: tokens.brand[100], borderWidth: 1, borderColor: tokens.brand[100],
  },
  selectedChipText: { fontSize: 13, fontWeight: '800', color: tokens.brand[500] },

  switchRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    backgroundColor: tokens.surface.surface2, borderRadius: tokens.radius.md, padding: 12,
  },
  switchTitle: { fontSize: 13, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  switchHint: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 2 },

  submitBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: tokens.radius.md, backgroundColor: tokens.brand[500],
    marginTop: 6,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 14, color: tokens.text[3] },
});
