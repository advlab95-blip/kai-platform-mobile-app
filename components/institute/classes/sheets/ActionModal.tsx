// Single shared action sheet reused for: reset-code / transfer-section / transfer-grade.
// Render-driven by `actionType` (null = hidden). Pure presentational — parent owns
// every piece of state and every async handler.

import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';
import type { StageRow, GradeRow, SectionRow, UserLite, ActionType } from '../_helpers';

interface Props {
  actionUser: UserLite | null;
  actionUserRole: 'student' | 'teacher';
  actionType: ActionType;
  actionBusy: boolean;
  newCode: string;
  codeAvail: 'unknown' | 'yes' | 'no';
  targetStageId: string | null;
  targetGradeId: string | null;
  targetSectionId: string | null;
  teacherTransferMode: 'add' | 'replace';
  stages: StageRow[];
  grades: GradeRow[];
  sections: SectionRow[];
  sectionCounts: Record<string, number>;
  selectedSection: SectionRow | null;
  setNewCode: (v: string) => void;
  setCodeAvail: (v: 'unknown' | 'yes' | 'no') => void;
  setTargetStageId: (v: string | null) => void;
  setTargetGradeId: (v: string | null) => void;
  setTargetSectionId: (v: string | null) => void;
  setTeacherTransferMode: (v: 'add' | 'replace') => void;
  onClose: () => void;
  onRegenerate: () => void;
  onCheckAvailability: (code: string) => void;
  onSubmitReset: () => void;
  onSubmitTransferSection: () => void;
  onSubmitTransferGrade: () => void;
}

export default function ActionModal(props: Props) {
  const {
    actionUser, actionUserRole, actionType, actionBusy,
    newCode, codeAvail,
    targetStageId, targetGradeId, targetSectionId, teacherTransferMode,
    stages, grades, sections, sectionCounts, selectedSection,
    setNewCode, setCodeAvail, setTargetStageId, setTargetGradeId, setTargetSectionId, setTeacherTransferMode,
    onClose, onRegenerate, onCheckAvailability,
    onSubmitReset, onSubmitTransferSection, onSubmitTransferGrade,
  } = props;

  const visible = actionType !== null && actionUser !== null;

  // Derived picker data for transfer-grade
  const gradesInTargetStage = useMemo(
    () => grades.filter((g) => g.stage_id === targetStageId).sort((a, b) => (a.order_num || 0) - (b.order_num || 0)),
    [grades, targetStageId],
  );
  const sectionsInTargetGrade = useMemo(
    () => sections.filter((s) => s.grade_id === targetGradeId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [sections, targetGradeId],
  );
  // For transfer-section: pick among sections within the SAME grade as the
  // currently selected section (where the user came from).
  const currentGradeId = selectedSection?.grade_id || null;
  const sectionsSameGrade = useMemo(
    () => sections.filter((s) => s.grade_id === currentGradeId && s.id !== selectedSection?.id),
    [sections, currentGradeId, selectedSection],
  );

  return (
    <SwipeableSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetBody}>

            {actionType === 'reset-code' && (
              <>
                <Text style={styles.modalTitle}>تغيير رمز الحساب</Text>
                <Text style={styles.modalSubtitle}>
                  {actionUser?.full_name} · {actionUserRole === 'student' ? 'طالب' : 'أستاذ'}
                </Text>

                <Text style={styles.sectionLabel}>الرمز الجديد (8 حروف/أرقام)</Text>
                <View style={styles.codeInputWrap}>
                  <TouchableOpacity onPress={onRegenerate} style={styles.regenBtn} activeOpacity={0.7}>
                    <Ionicons name="refresh" size={22} color={Colors.primary} />
                  </TouchableOpacity>
                  <TextInput
                    value={newCode}
                    onChangeText={(v) => {
                      const up = v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                      setNewCode(up);
                      setCodeAvail('unknown');
                    }}
                    onEndEditing={(e) => onCheckAvailability(e.nativeEvent.text)}
                    placeholder="ABCD1234"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.codeInput}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={12}
                  />
                </View>

                {codeAvail !== 'unknown' && (
                  <View style={[styles.availChip, {
                    backgroundColor: codeAvail === 'yes' ? '#D1FAE5' : '#FEE2E2',
                  }]}>
                    <Ionicons
                      name={codeAvail === 'yes' ? 'checkmark-circle' : 'close-circle'}
                      size={13}
                      color={codeAvail === 'yes' ? '#059669' : '#DC2626'}
                    />
                    <Text style={[styles.availChipText, {
                      color: codeAvail === 'yes' ? '#059669' : '#DC2626',
                    }]}>
                      {codeAvail === 'yes' ? 'متاح' : 'مستخدم'}
                    </Text>
                  </View>
                )}

                <View style={styles.warnBox}>
                  <Ionicons name="information-circle" size={16} color="#92400E" />
                  <Text style={styles.warnText}>
                    بعد التغيير، الرمز القديم لن يعمل. احفظ الرمز الجديد للمستخدم.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={onSubmitReset}
                  disabled={actionBusy || codeAvail === 'no'}
                  style={[styles.submitBtn, {
                    backgroundColor: actionBusy || codeAvail === 'no' ? Colors.textMuted : Colors.primary,
                  }]}
                  activeOpacity={0.85}
                >
                  {actionBusy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitBtnText}>تأكيد التغيير</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
              </>
            )}

            {actionType === 'transfer-section' && (
              <>
                <Text style={styles.modalTitle}>نقل بين الشعب</Text>
                <Text style={styles.modalSubtitle}>
                  {actionUser?.full_name} — الشعبة الحالية: {selectedSection?.name || '—'}
                </Text>

                {actionUserRole === 'teacher' && (
                  <View style={styles.modeRow}>
                    <TouchableOpacity
                      onPress={() => setTeacherTransferMode('add')}
                      style={[styles.modeBtn, teacherTransferMode === 'add' && styles.modeBtnActive]}
                    >
                      <Ionicons name="add-circle" size={16} color={teacherTransferMode === 'add' ? Colors.primary : Colors.textMuted} />
                      <Text style={[styles.modeBtnText, teacherTransferMode === 'add' && styles.modeBtnTextActive]}>
                        إضافة للشعبة الجديدة
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setTeacherTransferMode('replace')}
                      style={[styles.modeBtn, teacherTransferMode === 'replace' && styles.modeBtnActive]}
                    >
                      <Ionicons name="swap-horizontal" size={16} color={teacherTransferMode === 'replace' ? Colors.primary : Colors.textMuted} />
                      <Text style={[styles.modeBtnText, teacherTransferMode === 'replace' && styles.modeBtnTextActive]}>
                        نقل كامل
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.sectionLabel}>اختر الشعبة الجديدة (نفس الصف)</Text>
                {sectionsSameGrade.length === 0 ? (
                  <Text style={{ color: Colors.textMuted, textAlign: 'center', padding: 12, fontWeight: '700' }}>
                    لا توجد شعب أخرى بنفس الصف
                  </Text>
                ) : (
                  <View style={styles.pickerRow}>
                    {sectionsSameGrade.map((sec) => {
                      const active = targetSectionId === sec.id;
                      return (
                        <TouchableOpacity
                          key={sec.id}
                          onPress={() => setTargetSectionId(sec.id)}
                          style={[styles.pickerBadge, active && styles.pickerBadgeActive]}
                        >
                          <Text style={[styles.pickerBadgeText, active && styles.pickerBadgeTextActive]}>
                            شعبة {sec.name}
                          </Text>
                          {sectionCounts[sec.id] ? (
                            <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: '700' }}>
                              · {sectionCounts[sec.id]} طالب
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity
                  onPress={onSubmitTransferSection}
                  disabled={actionBusy || !targetSectionId}
                  style={[styles.submitBtn, {
                    backgroundColor: actionBusy || !targetSectionId ? Colors.textMuted : Colors.primary,
                  }]}
                  activeOpacity={0.85}
                >
                  {actionBusy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitBtnText}>تأكيد النقل</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
              </>
            )}

            {actionType === 'transfer-grade' && (
              <KeyboardAwareScroll style={{ maxHeight: 500 }}>
                <Text style={styles.modalTitle}>نقل لصف آخر</Text>
                <Text style={styles.modalSubtitle}>
                  {actionUser?.full_name}
                </Text>

                {actionUserRole === 'student' && (
                  <View style={styles.warnBox}>
                    <Ionicons name="archive" size={16} color="#92400E" />
                    <Text style={styles.warnText}>
                      سيتم أرشفة درجات وحضور الطالب السابقة. البيانات محفوظة للتقرير النهائي عند التخرج لكن لن تظهر بحسابه الجديد.
                    </Text>
                  </View>
                )}

                {actionUserRole === 'teacher' && (
                  <View style={styles.modeRow}>
                    <TouchableOpacity
                      onPress={() => setTeacherTransferMode('add')}
                      style={[styles.modeBtn, teacherTransferMode === 'add' && styles.modeBtnActive]}
                    >
                      <Text style={[styles.modeBtnText, teacherTransferMode === 'add' && styles.modeBtnTextActive]}>
                        إضافة
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setTeacherTransferMode('replace')}
                      style={[styles.modeBtn, teacherTransferMode === 'replace' && styles.modeBtnActive]}
                    >
                      <Text style={[styles.modeBtnText, teacherTransferMode === 'replace' && styles.modeBtnTextActive]}>
                        نقل كامل
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.sectionLabel}>1. اختر المرحلة</Text>
                <View style={styles.pickerRow}>
                  {stages.map((st) => {
                    const active = targetStageId === st.id;
                    return (
                      <TouchableOpacity
                        key={st.id}
                        onPress={() => { setTargetStageId(st.id); setTargetGradeId(null); setTargetSectionId(null); }}
                        style={[styles.pickerBadge, active && styles.pickerBadgeActive]}
                      >
                        <Text style={[styles.pickerBadgeText, active && styles.pickerBadgeTextActive]}>{st.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {targetStageId && (
                  <>
                    <Text style={styles.sectionLabel}>2. اختر الصف</Text>
                    <View style={styles.pickerRow}>
                      {gradesInTargetStage.map((g) => {
                        const active = targetGradeId === g.id;
                        return (
                          <TouchableOpacity
                            key={g.id}
                            onPress={() => { setTargetGradeId(g.id); setTargetSectionId(null); }}
                            style={[styles.pickerBadge, active && styles.pickerBadgeActive]}
                          >
                            <Text style={[styles.pickerBadgeText, active && styles.pickerBadgeTextActive]}>{g.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {targetGradeId && (
                  <>
                    <Text style={styles.sectionLabel}>3. اختر الشعبة</Text>
                    {sectionsInTargetGrade.length === 0 ? (
                      <Text style={{ color: '#DC2626', textAlign: 'center', padding: 12, fontWeight: '700' }}>
                        هذا الصف ليس فيه شعب — أضف شعبة من واجهة الإدارة أولاً
                      </Text>
                    ) : (
                      <View style={styles.pickerRow}>
                        {sectionsInTargetGrade.map((sec) => {
                          const active = targetSectionId === sec.id;
                          return (
                            <TouchableOpacity
                              key={sec.id}
                              onPress={() => setTargetSectionId(sec.id)}
                              style={[styles.pickerBadge, active && styles.pickerBadgeActive]}
                            >
                              <Text style={[styles.pickerBadgeText, active && styles.pickerBadgeTextActive]}>
                                شعبة {sec.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}

                <TouchableOpacity
                  onPress={onSubmitTransferGrade}
                  disabled={actionBusy || !targetGradeId || !targetSectionId}
                  style={[styles.submitBtn, {
                    backgroundColor: actionBusy || !targetGradeId || !targetSectionId ? Colors.textMuted : Colors.primary,
                  }]}
                  activeOpacity={0.85}
                >
                  {actionBusy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitBtnText}>تأكيد النقل</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
              </KeyboardAwareScroll>
            )}
        </View>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 20 },
  modalTitle: {
    fontSize: 17, fontWeight: '900', color: Colors.text,
    textAlign: 'center', marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textAlign: 'center', marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '800', color: Colors.textMuted,
    textAlign: 'right', marginBottom: 8, marginTop: 6,
  },
  codeInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 10,
  },
  codeInput: {
    flex: 1, backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 18, fontWeight: '900', color: Colors.text,
    textAlign: 'center', letterSpacing: 4,
  },
  regenBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  availChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    alignSelf: 'flex-end', marginBottom: 10,
  },
  availChipText: { fontSize: 11, fontWeight: '800' },
  pickerBadge: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1.5,
    backgroundColor: Colors.surface, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  pickerBadgeActive: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary,
  },
  pickerBadgeText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  pickerBadgeTextActive: { color: Colors.primary },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
  },
  modeBtnActive: { backgroundColor: Colors.primary + '12', borderColor: Colors.primary },
  modeBtnText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  modeBtnTextActive: { color: Colors.primary },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C7', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: '#F59E0B',
    marginBottom: 12,
  },
  warnText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#92400E', textAlign: 'right', lineHeight: 18 },
  submitBtn: {
    paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  cancelBtn: {
    paddingVertical: 12, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, marginTop: 8,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
});
