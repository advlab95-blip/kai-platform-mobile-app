// Delete-section swipeable sheet (with mandatory student transfer when section has students).
// Pure presentational — parent owns target pickers, busy/loading flags, and the submit handler.

import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import type { GradeRow, SectionRow } from '../_helpers';

interface Props {
  // Null = sheet hidden.
  target: { sec: SectionRow; gradeName: string } | null;
  loadingStudents: boolean;
  studentIds: string[];
  grades: GradeRow[];
  sectionsByGrade: Record<string, SectionRow[]>;
  targetGradeId: string | null;
  targetSectionId: string | null;
  busy: boolean;
  onPickGrade: (gradeId: string) => void;
  onPickSection: (sectionId: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function DeleteSectionSheet({
  target, loadingStudents, studentIds, grades, sectionsByGrade,
  targetGradeId, targetSectionId, busy, onPickGrade, onPickSection, onClose, onSubmit,
}: Props) {
  const visible = !!target;
  const handleClose = () => { if (!busy) onClose(); };

  return (
    <SwipeableSheet visible={visible} onClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetBody}>
          <View style={styles.deleteIconWrap}>
            <Ionicons name="trash" size={22} color="#DC2626" />
          </View>
          <Text style={styles.modalTitle}>حذف الشعبة</Text>
          <Text style={styles.modalSubtitle}>
            {target ? `${target.gradeName} · شعبة ${target.sec.name}` : ''}
          </Text>

          {loadingStudents ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : studentIds.length === 0 ? (
            <View style={styles.deleteEmpty}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
              <Text style={styles.deleteEmptyText}>
                هذه الشعبة فارغة. يمكن حذفها مباشرة.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.deleteWarnBanner}>
                <Ionicons name="warning" size={16} color="#B45309" />
                <Text style={styles.deleteWarnText}>
                  يوجد {studentIds.length} طالب في هذه الشعبة. اختر وجهة النقل قبل الحذف:
                </Text>
              </View>

              <Text style={styles.pickerLabel}>الصف</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickerChipsRow}
              >
                {grades.map((g) => {
                  const active = targetGradeId === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      activeOpacity={0.8}
                      onPress={() => onPickGrade(g.id)}
                      style={[styles.pickerChip, active && styles.pickerChipActive]}
                    >
                      <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {targetGradeId && (
                <>
                  <Text style={styles.pickerLabel}>الشعبة</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pickerChipsRow}
                  >
                    {(sectionsByGrade[targetGradeId] || [])
                      .filter((s) => s.id !== target?.sec.id)
                      .map((s) => {
                        const active = targetSectionId === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            activeOpacity={0.8}
                            onPress={() => onPickSection(s.id)}
                            style={[styles.pickerChip, active && styles.pickerChipActive]}
                          >
                            <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>
                              {s.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    {(sectionsByGrade[targetGradeId] || []).filter((s) => s.id !== target?.sec.id).length === 0 && (
                      <Text style={styles.pickerEmptyText}>لا توجد شعب أخرى — اختر صفاً آخر أو أنشئ شعبة جديدة أولاً</Text>
                    )}
                  </ScrollView>
                </>
              )}
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={{ color: Colors.textMuted, fontWeight: '800' }}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: '#DC2626' }]}
              onPress={onSubmit}
              disabled={busy || loadingStudents}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontWeight: '900' }}>
                  {studentIds.length > 0 ? 'نقل الطلاب وحذف الشعبة' : 'حذف الشعبة'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
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
  deleteIconWrap: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  deleteEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 12,
  },
  deleteEmptyText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textAlign: 'center', flexShrink: 1 },
  deleteWarnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 14,
  },
  deleteWarnText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#78350F', lineHeight: 18 },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  pickerChipsRow: {
    gap: 8,
    paddingBottom: 12,
  },
  pickerChip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1.2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pickerChipText: { fontSize: 13, fontWeight: '800', color: Colors.text },
  pickerChipTextActive: { color: '#fff' },
  pickerEmptyText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    paddingHorizontal: 8,
  },
  submitBtn: {
    paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 12, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, marginTop: 8,
  },
});
