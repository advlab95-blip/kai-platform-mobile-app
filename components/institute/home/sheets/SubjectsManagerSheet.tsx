// SubjectsManagerSheet — manage subjects per institution type.
//
// Flow for a SCHOOL:
//   1. Pick a stage (الابتدائية / المتوسطة / الإعدادية) — only the ones the
//      school is actually configured with show up.
//   2. Pick a grade inside that stage (e.g. "الأول الابتدائي").
//   3. See subjects already saved for that grade + pick from the Iraqi
//      curriculum preset for that stage + add custom by typing.
//
// Flow for an INSTITUTE:
//   1. Pick a class (قاعة) — institute admins create these in "إدارة الصفوف".
//   2. See subjects saved for that class + add custom by typing.
//   Students in the institute see only subjects they're enrolled in
//   (via student_subjects junction); admins manage subjects per قاعة here.
//
// Schema: subjects rows carry institute_id + optional stage_id + grade_id
// (schools) OR class_id (institutes). Same table serves both types.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import { tokens } from '../../../../constants/designTokens';
import { api } from '../../../../services/api';
import { haptics } from '../../../../utils/haptics';
import { supabase } from '../../../../services/supabase';
import SwipeableSheet from '../../../shared/SwipeableSheet';

// ───────────────────────────────────────────────────────────────────────
// Iraqi curriculum presets — common subjects per stage. Admin can pick from
// these in one tap instead of typing every time; custom subjects still work.
// Keys here MUST match the `name` column in stages (case-insensitive contains).
// ───────────────────────────────────────────────────────────────────────
const CURRICULUM: Record<string, string[]> = {
  'الابتدائية': [
    'القرآن الكريم',
    'التربية الإسلامية',
    'اللغة العربية',
    'اللغة الإنكليزية',
    'الرياضيات',
    'العلوم',
    'الاجتماعيات',
    'التاريخ',
    'الجغرافيا',
    'التربية الفنية',
    'التربية الرياضية',
    'الحاسوب',
  ],
  'المتوسطة': [
    'القرآن الكريم',
    'التربية الإسلامية',
    'اللغة العربية',
    'اللغة الإنكليزية',
    'الرياضيات',
    'الفيزياء',
    'الكيمياء',
    'الأحياء',
    'علوم الأرض',
    'التاريخ',
    'الجغرافيا',
    'التربية الوطنية',
    'الحاسوب',
    'التربية الفنية',
    'التربية الرياضية',
  ],
  'الإعدادية': [
    'القرآن الكريم',
    'التربية الإسلامية',
    'اللغة العربية',
    'اللغة الإنكليزية',
    'اللغة الفرنسية',
    'الرياضيات',
    'الفيزياء',
    'الكيمياء',
    'الأحياء',
    'علم الأرض',
    'التاريخ',
    'الجغرافيا',
    'الاقتصاد',
    'علم الاجتماع',
    'علم النفس',
    'الفلسفة والمنطق',
    'الحاسوب',
    'التربية الرياضية',
  ],
};

function presetForStage(stageName: string | undefined): string[] {
  if (!stageName) return [];
  const key = Object.keys(CURRICULUM).find((k) => stageName.includes(k.slice(0, 4)) || stageName.includes(k));
  return key ? CURRICULUM[key] : [];
}

// ───────────────────────────────────────────────────────────────────────

type Subject = { id: string; name: string; stage_id: string | null; grade_id: string | null; class_id: string | null };
type Stage = { id: string; name: string; order_num: number };
type Grade = { id: string; name: string; stage_id: string; order_num: number };
type Klass = { id: string; name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  instituteId: string;
  instituteType: 'institute' | 'school';
};

export default function SubjectsManagerSheet({ visible, onClose, instituteId, instituteType }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Klass[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isSchool = instituteType === 'school';

  const load = useCallback(async () => {
    if (!instituteId) return;
    setLoading(true);
    try {
      const subs = await supabase
        .from('subjects')
        .select('id, name, stage_id, grade_id, class_id')
        .eq('institute_id', instituteId)
        .order('name')
        .limit(500);
      setSubjects((subs.data as any[]) || []);

      if (isSchool) {
        const [sts, grs] = await Promise.all([
          supabase.from('stages').select('id, name, order_num').eq('institute_id', instituteId).order('order_num'),
          supabase.from('grades').select('id, name, stage_id, order_num').eq('institute_id', instituteId).order('order_num'),
        ]);
        const stageRows = (sts.data as any[]) || [];
        const gradeRows = (grs.data as any[]) || [];
        setStages(stageRows);
        setGrades(gradeRows);
        // Auto-select first stage so the user lands on something useful.
        if (stageRows.length > 0 && !selectedStageId) {
          setSelectedStageId(stageRows[0].id);
        }
      } else {
        // Institute: load classes (قاعات).
        const cls = await supabase
          .from('classes')
          .select('id, name')
          .eq('institute_id', instituteId)
          .order('created_at', { ascending: false })
          .limit(500);
        const classRows = (cls.data as any[]) || [];
        setClasses(classRows);
        if (classRows.length > 0 && !selectedClassId) {
          setSelectedClassId(classRows[0].id);
        }
      }
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'فشل تحميل المواد');
    } finally {
      setLoading(false);
    }
  }, [instituteId, isSchool, selectedStageId, selectedClassId]);

  useEffect(() => {
    if (visible) {
      load();
      setNewName('');
    }
  }, [visible, load]);

  // Auto-select first grade when stage changes
  useEffect(() => {
    if (!isSchool) return;
    const inStage = grades.filter((g) => g.stage_id === selectedStageId);
    if (inStage.length > 0 && (!selectedGradeId || !inStage.find((g) => g.id === selectedGradeId))) {
      setSelectedGradeId(inStage[0].id);
    } else if (inStage.length === 0) {
      setSelectedGradeId(null);
    }
  }, [selectedStageId, grades, isSchool]);

  const currentStage = useMemo(() => stages.find((s) => s.id === selectedStageId), [stages, selectedStageId]);
  const gradesInStage = useMemo(
    () => grades.filter((g) => g.stage_id === selectedStageId),
    [grades, selectedStageId],
  );

  // Per-grade subject counts — drives the grade-chip badge so the admin
  // sees which grades still need attention at a glance instead of having
  // to click into each one.
  const subjectCountByGrade = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of subjects) {
      if (s.grade_id) m.set(s.grade_id, (m.get(s.grade_id) || 0) + 1);
    }
    return m;
  }, [subjects]);

  // Per-class subject counts (institutes).
  const subjectCountByClass = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of subjects) {
      if (s.class_id) m.set(s.class_id, (m.get(s.class_id) || 0) + 1);
    }
    return m;
  }, [subjects]);

  // Subjects matching the current scope:
  //   • Schools:    grade if picked → grade match; else stage → orphan-of-stage; else all
  //   • Institutes: class if picked → class match; else all institute-wide subjects
  const scopedSubjects = useMemo(() => {
    if (!isSchool) {
      if (selectedClassId) return subjects.filter((s) => s.class_id === selectedClassId);
      return subjects;
    }
    if (selectedGradeId) return subjects.filter((s) => s.grade_id === selectedGradeId);
    if (selectedStageId) return subjects.filter((s) => s.stage_id === selectedStageId && !s.grade_id);
    return subjects;
  }, [subjects, selectedGradeId, selectedStageId, selectedClassId, isSchool]);

  // Preset suggestions for the chosen stage, minus ones already saved at this scope.
  const presetSuggestions = useMemo(() => {
    if (!isSchool || !currentStage) return [];
    const existingNames = new Set(scopedSubjects.map((s) => s.name.trim()));
    return presetForStage(currentStage.name).filter((n) => !existingNames.has(n));
  }, [isSchool, currentStage, scopedSubjects]);

  // ── Handlers ─────────────────────────────────────────────────────────

  // Whether a scope (grade for schools, class for institutes) is selected
  // — required before any add operation.
  const scopeReady = isSchool ? !!selectedGradeId : !!selectedClassId;
  const scopeMissingMsg = isSchool ? 'اختر الصف أولاً' : 'اختر القاعة أولاً';

  const handleAddCustom = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('تنبيه', 'اكتب اسم المادة');
      return;
    }
    if (!scopeReady) {
      Alert.alert('تنبيه', scopeMissingMsg);
      return;
    }
    setAdding(true);
    try {
      const stageId = isSchool ? selectedStageId : null;
      const gradeId = isSchool ? selectedGradeId : null;
      const classId = isSchool ? null : selectedClassId;
      const created = await api.addSubject(instituteId, name, stageId, gradeId, classId);
      setSubjects((prev) => [...prev, created as any].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      haptics.success();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'فشل إضافة المادة');
      haptics.error();
    } finally {
      setAdding(false);
    }
  }, [newName, instituteId, isSchool, selectedStageId, selectedGradeId, selectedClassId, scopeReady, scopeMissingMsg]);

  const handleAddPreset = useCallback(async (name: string) => {
    if (!scopeReady) {
      Alert.alert('تنبيه', scopeMissingMsg);
      return;
    }
    setSavingPreset(true);
    try {
      const stageId = isSchool ? selectedStageId : null;
      const gradeId = isSchool ? selectedGradeId : null;
      const classId = isSchool ? null : selectedClassId;
      const created = await api.addSubject(instituteId, name, stageId, gradeId, classId);
      setSubjects((prev) => [...prev, created as any].sort((a, b) => a.name.localeCompare(b.name)));
      haptics.success();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'فشل إضافة المادة');
    } finally {
      setSavingPreset(false);
    }
  }, [isSchool, instituteId, selectedStageId, selectedGradeId, selectedClassId, scopeReady, scopeMissingMsg]);

  // Apply the entire stage curriculum to EVERY grade in the current stage in
  // one operation. Skips subjects already saved for each grade so it's safe
  // to re-run after adding a few grades manually.
  const handleApplyCurriculumToAllGrades = useCallback(async () => {
    if (!isSchool || !currentStage) return;
    const stagePreset = presetForStage(currentStage.name);
    if (stagePreset.length === 0 || gradesInStage.length === 0) return;

    // Build the per-grade insertion list, skipping ones already saved.
    const inserts: Array<{ gradeId: string; gradeName: string; names: string[] }> = [];
    for (const g of gradesInStage) {
      const existing = new Set(
        subjects
          .filter((s) => s.grade_id === g.id)
          .map((s) => s.name.trim()),
      );
      const missing = stagePreset.filter((n) => !existing.has(n));
      if (missing.length > 0) inserts.push({ gradeId: g.id, gradeName: g.name, names: missing });
    }
    if (inserts.length === 0) {
      Alert.alert('جاهز', 'كل الصفوف في هذه المرحلة فيها المواد المطلوبة من المنهج');
      return;
    }
    const totalNewSubjects = inserts.reduce((acc, x) => acc + x.names.length, 0);

    Alert.alert(
      'تطبيق المنهج على كل الصفوف',
      `سيتم إضافة ${totalNewSubjects} مادة موزّعة على ${inserts.length} صف في "${currentStage.name}".\n\nالصفوف المتأثرة:\n• ${inserts.map((i) => `${i.gradeName} (+${i.names.length})`).join('\n• ')}`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: async () => {
            setSavingPreset(true);
            try {
              // One bulk insert per grade — keeps the round-trips bounded by
              // grade count, not by subject count.
              const newRows: any[] = [];
              for (const i of inserts) {
                const created = await api.addSubjectsBulk(
                  instituteId,
                  i.names,
                  selectedStageId,
                  i.gradeId,
                  null,
                );
                newRows.push(...(created as any[]));
              }
              setSubjects((prev) => [...prev, ...newRows].sort((a, b) => a.name.localeCompare(b.name)));
              haptics.success();
              Alert.alert('تم', `تم إضافة ${newRows.length} مادة بنجاح`);
            } catch (e: any) {
              Alert.alert('خطأ', e?.message || 'فشل التطبيق');
              haptics.error();
            } finally {
              setSavingPreset(false);
            }
          },
        },
      ],
    );
  }, [isSchool, currentStage, gradesInStage, subjects, instituteId, selectedStageId]);

  const handleAddAllPresets = useCallback(async () => {
    if (presetSuggestions.length === 0) return;
    if (!scopeReady) {
      Alert.alert('تنبيه', scopeMissingMsg);
      return;
    }
    const scopeLabel = isSchool
      ? grades.find((g) => g.id === selectedGradeId)?.name || ''
      : classes.find((c) => c.id === selectedClassId)?.name || '';
    Alert.alert(
      'إضافة كل المواد',
      `سيتم إضافة ${presetSuggestions.length} مادة دفعة واحدة لـ "${scopeLabel}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: async () => {
            setSavingPreset(true);
            try {
              const stageId = isSchool ? selectedStageId : null;
              const gradeId = isSchool ? selectedGradeId : null;
              const classId = isSchool ? null : selectedClassId;
              const created = await api.addSubjectsBulk(instituteId, presetSuggestions, stageId, gradeId, classId);
              setSubjects((prev) => [...prev, ...(created as any[])].sort((a, b) => a.name.localeCompare(b.name)));
              haptics.success();
            } catch (e: any) {
              Alert.alert('خطأ', e?.message || 'فشل الإضافة');
            } finally {
              setSavingPreset(false);
            }
          },
        },
      ],
    );
  }, [presetSuggestions, isSchool, selectedGradeId, selectedClassId, instituteId, selectedStageId, grades, classes, scopeReady, scopeMissingMsg]);

  const handleDelete = useCallback((subject: Subject) => {
    haptics.warning();
    Alert.alert(
      'حذف المادة',
      `هل تريد حذف "${subject.name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(subject.id);
            try {
              await api.deleteSubject(subject.id);
              setSubjects((prev) => prev.filter((s) => s.id !== subject.id));
              haptics.success();
            } catch (e: any) {
              Alert.alert('خطأ', e?.message || 'فشل الحذف');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }, []);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.92} minHeight={0.7}>
      <View style={{ paddingHorizontal: 18, paddingBottom: 20, paddingTop: 4, flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: tokens.color.brand100, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="book" size={22} color={tokens.color.brand500} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: Colors.text, textAlign: 'right' }}>
              إدارة المواد الدراسية
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 2 }}>
              {isSchool ? 'اختر المرحلة ثم الصف لإضافة المواد' : 'اختر القاعة لإضافة المواد التعليمية لها'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator>
          {/* Stage picker — schools only */}
          {isSchool && stages.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>المرحلة الدراسية</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {stages.map((st) => (
                  <Chip
                    key={st.id}
                    label={st.name}
                    active={selectedStageId === st.id}
                    onPress={() => { haptics.selection(); setSelectedStageId(st.id); }}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Grade picker — schools only, after stage chosen.
              Each chip shows a subject-count badge so the admin sees which
              grades are configured and which still need work at a glance. */}
          {isSchool && selectedStageId && gradesInStage.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>الصف</Text>
                {/* Quick action: apply the Iraqi curriculum across every grade
                    in this stage. Skips duplicates per-grade. */}
                {presetForStage(currentStage?.name).length > 0 && gradesInStage.length > 1 && (
                  <TouchableOpacity
                    onPress={handleApplyCurriculumToAllGrades}
                    disabled={savingPreset}
                    style={styles.bulkBtn}
                    activeOpacity={0.85}
                  >
                    {savingPreset ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="flash" size={13} color="#fff" />
                        <Text style={styles.bulkBtnText}>طبّق المنهج لكل الصفوف</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {gradesInStage.map((g) => (
                  <Chip
                    key={g.id}
                    label={g.name}
                    badgeCount={subjectCountByGrade.get(g.id) || 0}
                    active={selectedGradeId === g.id}
                    onPress={() => { haptics.selection(); setSelectedGradeId(g.id); }}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Schools without stages configured yet */}
          {isSchool && stages.length === 0 && !loading && (
            <View style={styles.emptyBox}>
              <Ionicons name="warning-outline" size={28} color={Colors.warning} />
              <Text style={styles.emptyTitle}>المراحل غير مُعدّة بعد</Text>
              <Text style={styles.emptyHint}>
                أضف المراحل والصفوف أولاً من بطاقة "إدارة الصفوف" في الصفحة الرئيسية، ثم ارجع هنا لإضافة المواد.
              </Text>
            </View>
          )}

          {/* Institute class picker (قاعات) — also shows per-class count */}
          {!isSchool && classes.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.sectionLabel}>القاعة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {classes.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    badgeCount={subjectCountByClass.get(c.id) || 0}
                    active={selectedClassId === c.id}
                    onPress={() => { haptics.selection(); setSelectedClassId(c.id); }}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Institutes without classes configured yet */}
          {!isSchool && classes.length === 0 && !loading && (
            <View style={styles.emptyBox}>
              <Ionicons name="warning-outline" size={28} color={Colors.warning} />
              <Text style={styles.emptyTitle}>لا توجد قاعات بعد</Text>
              <Text style={styles.emptyHint}>
                أضف القاعات أولاً من بطاقة "إدارة الصفوف/القاعات" في الصفحة الرئيسية، ثم ارجع هنا لإضافة المواد لكل قاعة.
              </Text>
            </View>
          )}

          {/* Curriculum presets — quick-add */}
          {isSchool && currentStage && selectedGradeId && presetSuggestions.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={styles.sectionLabel}>المنهج العراقي — اضغط للإضافة</Text>
                <TouchableOpacity
                  onPress={handleAddAllPresets}
                  disabled={savingPreset}
                  style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  {savingPreset ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={14} color={Colors.primary} />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.primary }}>إضافة الكل</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 }}>
                {presetSuggestions.map((name) => (
                  <TouchableOpacity
                    key={name}
                    onPress={() => handleAddPreset(name)}
                    disabled={savingPreset}
                    style={styles.presetChip}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={14} color={Colors.primary} />
                    <Text style={styles.presetChipText}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Custom subject input — only after a scope is picked */}
          {scopeReady && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.sectionLabel}>إضافة يدوية</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="اسم المادة (مثل: الرياضيات)"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                  onSubmitEditing={handleAddCustom}
                  editable={!adding}
                />
                <TouchableOpacity
                  onPress={handleAddCustom}
                  disabled={adding || !newName.trim()}
                  style={[styles.addBtn, (adding || !newName.trim()) && { opacity: 0.5 }]}
                >
                  {adding ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={styles.addBtnText}>إضافة</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Existing subjects for current scope */}
          <Text style={styles.sectionLabel}>
            المواد المسجّلة {isSchool && selectedGradeId
              ? `للصف "${gradesInStage.find((g) => g.id === selectedGradeId)?.name || ''}"`
              : !isSchool && selectedClassId
                ? `للقاعة "${classes.find((c) => c.id === selectedClassId)?.name || ''}"`
                : ''}
            <Text style={{ color: Colors.textMuted, fontWeight: '600' }}> · {scopedSubjects.length}</Text>
          </Text>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : scopedSubjects.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="book-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyHint}>
                لا توجد مواد بعد — اختر من المنهج أعلاه أو اكتب اسم مادة يدوياً
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, paddingBottom: 30 }}>
              {scopedSubjects.map((s) => (
                <SubjectChip
                  key={s.id}
                  name={s.name}
                  busy={deletingId === s.id}
                  onDelete={() => handleDelete(s)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </SwipeableSheet>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  onPress,
  badgeCount,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badgeCount?: number;
}) {
  // Badge tone:
  //   active           → light pill on the primary background
  //   inactive + has   → tinted "configured" badge
  //   inactive + zero  → muted "empty" badge so the admin sees what's missing
  const hasContent = (badgeCount || 0) > 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: Colors.primary, borderColor: Colors.primary },
      ]}
      activeOpacity={0.85}
    >
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
        <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
        {typeof badgeCount === 'number' && (
          <View
            style={[
              styles.chipBadge,
              active
                ? { backgroundColor: 'rgba(255,255,255,0.25)' }
                : hasContent
                  ? { backgroundColor: '#DBEAFE' }
                  : { backgroundColor: '#FEE2E2' },
            ]}
          >
            <Text
              style={[
                styles.chipBadgeText,
                active
                  ? { color: '#fff' }
                  : hasContent
                    ? { color: '#1D4ED8' }
                    : { color: '#B91C1C' },
              ]}
            >
              {badgeCount}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function SubjectChip({ name, busy, onDelete }: { name: string; busy: boolean; onDelete: () => void }) {
  return (
    <View style={[styles.subjectChip, busy && { opacity: 0.5 }]}>
      <Text style={styles.subjectChipText}>{name}</Text>
      <TouchableOpacity onPress={onDelete} disabled={busy} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
        {busy ? (
          <ActivityIndicator color={Colors.error} size="small" />
        ) : (
          <Ionicons name="close-circle" size={18} color={Colors.error} />
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = {
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.textSecondary,
    textAlign: 'right' as const,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  chipBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '900' as const,
  },
  bulkBtn: {
    flexDirection: 'row-reverse' as const,
    alignItems: 'center' as const,
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  bulkBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800' as const,
  },
  presetChip: {
    flexDirection: 'row-reverse' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  input: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    textAlign: 'right' as const,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row-reverse' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '800' as const,
    fontSize: 13,
  },
  subjectChip: {
    flexDirection: 'row-reverse' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subjectChipText: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: '#0F766E',
  },
  emptyBox: {
    paddingVertical: 24,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  emptyHint: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 18,
  },
};
