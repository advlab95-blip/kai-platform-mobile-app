import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { api } from '../../services/api';
import { copyToClipboard } from '../../utils/clipboard';
import { haptics } from '../../utils/haptics';
import { searchMatch } from '../../hooks/useSmartSearch';
import SwipeableSheet from './SwipeableSheet';
import KeyboardAwareScroll from './KeyboardAwareScroll';

type Role = 'student' | 'teacher' | 'parent' | 'cafeteria' | 'medical' | 'admin';
type InstType = 'institute' | 'school';
type WizardMode = 'institute' | 'platform';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
  instituteId: string;
  instituteType: InstType;
  callerUserId: string;
  enabledRoles?: Role[];
  mode?: WizardMode;
}

const ROLE_META: Record<Role, { label: string; icon: any; color: string; desc: string }> = {
  student:   { label: 'طالب',     icon: 'person',     color: '#0D9488', desc: 'حساب طالب + ربط بصف/شعبة أو كروبات' },
  teacher:   { label: 'أستاذ',    icon: 'school',     color: '#1D4ED8', desc: 'حساب أستاذ + تعيينات المواد والشعب' },
  parent:    { label: 'ولي أمر',  icon: 'people',     color: '#7C3AED', desc: 'حساب ولي أمر + ربط بالأبناء' },
  cafeteria: { label: 'كافتيريا', icon: 'restaurant', color: '#F97316', desc: 'حساب مشرف كافتيريا' },
  medical:   { label: 'طبابة',    icon: 'medkit',     color: '#EF4444', desc: 'حساب مسؤول الطبابة' },
  admin:     { label: 'مدير منصة', icon: 'shield-checkmark', color: '#0EA5E9', desc: 'حساب مدير منصة (وصول كامل)' },
};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// A teacher assignment can target a school (grade + multi-sections) or an
// institute (multi-classes a.k.a قاعات). Both forms share `subjectId` and
// produce one teacher_assignments row per (section|class) on save.
type TeacherAssignment = {
  id: string;
  subjectId: string;
  // Schools
  gradeId: string;
  sectionIds: string[];
  // Institutes
  classIds: string[];
};

export default function CreateAccountWizard({
  visible, onClose, onCreated,
  instituteId, instituteType, callerUserId,
  enabledRoles,
  mode = 'institute',
}: Props) {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(generateCode());

  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  // School structure
  const [stages, setStages] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  // Student (school) selection
  const [selStageId, setSelStageId] = useState<string>('');
  const [selGradeId, setSelGradeId] = useState<string>('');
  const [selSectionId, setSelSectionId] = useState<string>('');

  // Student (institute) selection
  const [selSubjectIds, setSelSubjectIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selClassIds, setSelClassIds] = useState<string[]>([]);

  // Teacher assignments — same data shape for schools and institutes, only
  // the populated fields differ (schools fill gradeId+sectionIds; institutes
  // fill classIds). Keeping one shape avoids branching everywhere downstream.
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [draft, setDraft] = useState<TeacherAssignment>({ id: '', subjectId: '', gradeId: '', sectionIds: [], classIds: [] });

  // Inline subject creation — the wizard would otherwise dead-end when the
  // institute has no subjects seeded yet. Letting the admin add a subject
  // right here is faster than bouncing them to a separate management screen.
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);
  const handleAddSubject = useCallback(async () => {
    const name = newSubjectName.trim();
    if (!name) {
      Alert.alert('تنبيه', 'اكتب اسم المادة');
      return;
    }
    setAddingSubject(true);
    try {
      const created = await api.addSubject(instituteId, name);
      setSubjects((prev) => [...prev, created]);
      setDraft((d) => ({ ...d, subjectId: created.id }));
      setNewSubjectName('');
      setShowAddSubject(false);
      haptics.success();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'فشل إضافة المادة');
      haptics.error();
    } finally {
      setAddingSubject(false);
    }
  }, [newSubjectName, instituteId]);

  // Parent linking
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [childrenIds, setChildrenIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  const roles: Role[] = useMemo(() => {
    const all: Role[] = mode === 'platform'
      ? ['admin']
      : ['student', 'teacher', 'parent', 'cafeteria', 'medical'];
    if (enabledRoles && enabledRoles.length) return all.filter((r) => enabledRoles.includes(r));
    return all;
  }, [enabledRoles, mode]);

  const reset = () => {
    setStep(1); setRole(null); setFullName(''); setPhone(''); setCode(generateCode());
    setBusy(false); setCreatedCode(null);
    setSelStageId(''); setSelGradeId(''); setSelSectionId('');
    setSelSubjectIds([]); setSelClassIds([]);
    setAssignments([]); setDraft({ id: '', subjectId: '', gradeId: '', sectionIds: [], classIds: [] });
    setChildrenIds([]); setStudentSearch('');
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  // Load structure when entering step 3 (linking step)
  useEffect(() => {
    if (!visible || step !== 3 || !role) return;
    if (role === 'cafeteria' || role === 'medical' || role === 'admin') return;

    let cancel = false;
    (async () => {
      setLoadingData(true);
      try {
        if (instituteType === 'school') {
          const s = await api.getSchoolStructure(instituteId);
          if (cancel) return;
          setStages(s.stages || []);
          setGrades(s.grades || []);
          setSections(s.sections || []);
          setSubjects(s.subjects || []);
        } else {
          // Institute: subjects + classes (groups)
          const [subs, cls] = await Promise.all([
            api.getSubjects(instituteId).catch(() => []),
            api.getClassesByInstitute(instituteId).catch(() => []),
          ]);
          if (cancel) return;
          setSubjects(subs || []);
          setClasses(cls || []);
        }
        if (role === 'parent') {
          const students = await api.getStudentsByInstitute(instituteId).catch(() => []);
          if (cancel) return;
          setAllStudents(students || []);
        }
      } catch (e: any) {
        if (!cancel) Alert.alert('خطأ', e?.message || 'فشل تحميل البيانات');
      } finally {
        if (!cancel) setLoadingData(false);
      }
    })();
    return () => { cancel = true; };
  }, [visible, step, role, instituteId, instituteType]);

  // For school student: reset grade/section when stage changes
  useEffect(() => { setSelGradeId(''); setSelSectionId(''); }, [selStageId]);
  useEffect(() => { setSelSectionId(''); }, [selGradeId]);

  // Steps computation
  const needsLinking = role && role !== 'cafeteria' && role !== 'medical' && role !== 'admin';
  const totalSteps = needsLinking ? 4 : 3;
  const currentStepIndex = step;

  const goNext = () => {
    if (step === 1) {
      if (!role) { Alert.alert('تنبيه', 'اختر نوع الحساب'); return; }
      setStep(2); return;
    }
    if (step === 2) {
      if (!fullName.trim()) { Alert.alert('تنبيه', 'اكتب الاسم الكامل'); return; }
      if (!code.trim() || code.trim().length < 4) { Alert.alert('تنبيه', 'الرمز غير صالح'); return; }
      if (needsLinking) { setStep(3); } else { setStep(3); } // step 3 becomes review when no linking
      return;
    }
    if (step === 3) {
      if (!needsLinking) { return submit(); }
      // Validate linking step
      if (role === 'student') {
        if (instituteType === 'school') {
          if (!selSectionId) { Alert.alert('تنبيه', 'اختر الصف والشعبة'); return; }
        } else {
          if (selClassIds.length === 0) { Alert.alert('تنبيه', 'اختر مجموعة واحدة على الأقل'); return; }
        }
      } else if (role === 'teacher') {
        if (assignments.length === 0) { Alert.alert('تنبيه', 'أضف تعييناً واحداً على الأقل'); return; }
      }
      // parent: linking is optional
      setStep(4); return;
    }
    if (step === 4) {
      return submit();
    }
  };

  const goBack = () => {
    if (busy) return;
    if (step === 1) return;
    setStep(step - 1);
  };

  const submit = async () => {
    if (!role) return;
    if (mode === 'institute' && !instituteId) { Alert.alert('خطأ', 'المؤسسة غير محددة'); return; }
    setBusy(true);
    try {
      // classIds inferred from role+instituteType
      let classIds: string[] | undefined;
      let sectionEnrollment: { gradeId: string; sectionId: string } | null = null;

      if (role === 'student') {
        if (instituteType === 'school') {
          sectionEnrollment = { gradeId: selGradeId, sectionId: selSectionId };
        } else {
          classIds = selClassIds;
        }
      } else if (role === 'teacher') {
        // Gather every targeted scope id for the create-user edge function:
        // - schools  → sectionIds (the section_id column carries it)
        // - institutes → classIds (the class_id column carries it)
        const all = new Set<string>();
        for (const a of assignments) {
          a.sectionIds.forEach((id) => all.add(id));
          a.classIds.forEach((id) => all.add(id));
        }
        classIds = Array.from(all);
      }

      const targetInstituteId = mode === 'platform' ? '' : instituteId;
      const result = await api.createUser(
        code.trim(), role, fullName.trim(), targetInstituteId,
        role === 'parent' ? childrenIds : undefined,
        classIds,
        targetInstituteId, callerUserId,
      );

      // After create: wire school-specific enrollment + teacher assignments
      if (result.userId) {
        if (role === 'student' && instituteType === 'school' && sectionEnrollment?.sectionId) {
          try {
            await api.enrollStudentInSection(
              result.userId, instituteId,
              sectionEnrollment.gradeId, sectionEnrollment.sectionId,
            );
          } catch {}
        }
        if (role === 'teacher' && assignments.length > 0) {
          // Flatten: one row per targeted (section | class). Schools use
          // sectionId (legacy convention — the API auto-fills class_id from
          // it on save). Institutes use classId directly.
          const rows: Array<{ subjectId: string; sectionId?: string; classId?: string }> = [];
          for (const a of assignments) {
            for (const sid of a.sectionIds) rows.push({ subjectId: a.subjectId, sectionId: sid });
            for (const cid of a.classIds) rows.push({ subjectId: a.subjectId, classId: cid });
          }
          if (rows.length > 0) {
            // Surface failures — silent catch was hiding real errors and
            // leaving teachers with zero assignments after "successful" create.
            try {
              await api.setTeacherAssignments(result.userId, instituteId, rows);
            } catch (e: any) {
              Alert.alert(
                'تنبيه',
                `تم إنشاء الحساب لكن فشل حفظ التعيينات: ${e?.message || ''}\n\nافتح ملف الأستاذ من شاشة المستخدمين وأضف التعيينات يدوياً.`,
              );
            }
          }
        }
      }

      haptics.success();
      setCreatedCode(code.trim());
      onCreated?.();
    } catch (e: any) {
      haptics.error();
      Alert.alert('خطأ', e?.message || 'فشل إنشاء الحساب');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!createdCode) return;
    const ok = await copyToClipboard(createdCode);
    if (ok) Alert.alert('تم', 'تم نسخ الرمز');
  };

  const addAnother = () => {
    const prevRole = role;
    reset();
    setRole(prevRole);
    setStep(2);
  };

  // Teacher draft helpers
  // School draft: subject + grade + ≥1 section.
  // Institute draft: subject + ≥1 class (قاعة). Either side rejects empty
  // selections so we never persist a tenant-less teacher_assignments row.
  const canAddDraft = !!draft.subjectId && (
    instituteType === 'school'
      ? !!draft.gradeId && draft.sectionIds.length > 0
      : draft.classIds.length > 0
  );
  const draftMissingMsg = instituteType === 'school'
    ? 'اختر مادة وصف وشعبة على الأقل'
    : 'اختر مادة وقاعة واحدة على الأقل';
  const commitDraft = () => {
    if (!canAddDraft) { Alert.alert('تنبيه', draftMissingMsg); return; }
    setAssignments((prev) => [...prev, { ...draft, id: Math.random().toString(36).slice(2) }]);
    setDraft({ id: '', subjectId: '', gradeId: '', sectionIds: [], classIds: [] });
  };
  const removeAssignment = (id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim();
    if (!q) return allStudents.slice(0, 30);
    return allStudents.filter((s: any) => searchMatch(s.full_name, q) || searchMatch(s.code, q)).slice(0, 50);
  }, [allStudents, studentSearch]);

  const gradesInStage = useMemo(() => grades.filter((g: any) => g.stage_id === selStageId), [grades, selStageId]);
  const sectionsInGrade = useMemo(() => sections.filter((s: any) => s.grade_id === selGradeId), [sections, selGradeId]);
  const draftGradesInStage = useMemo(() => {
    if (instituteType !== 'school') return [];
    return grades;
  }, [grades, instituteType]);
  const draftSectionsInGrade = useMemo(() => sections.filter((s: any) => s.grade_id === draft.gradeId), [sections, draft.gradeId]);

  return (
    <SwipeableSheet
      visible={visible}
      onClose={handleClose}
      maxHeight={0.92}
      overlayTapDisabled={busy}
      swipeDownDisabled={busy}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} disabled={busy} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{createdCode ? 'تم الإنشاء' : 'إضافة حساب'}</Text>
              {!createdCode && (
                <Text style={styles.subtitle}>
                  الخطوة {currentStepIndex} من {totalSteps}
                </Text>
              )}
            </View>
          </View>

          {/* Progress */}
          {!createdCode && (
            <View style={styles.progressRow}>
              {Array.from({ length: totalSteps }).map((_, i) => {
                const reached = i < currentStepIndex;
                const current = i === currentStepIndex - 1;
                return (
                  <View
                    key={i}
                    style={[styles.progressDot, reached && styles.progressDotReached, current && styles.progressDotCurrent]}
                  />
                );
              })}
            </View>
          )}

          <KeyboardAwareScroll style={{ maxHeight: 560 }} contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            {createdCode ? (
              <View style={styles.successBlock}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark" size={34} color="#fff" />
                </View>
                <Text style={styles.successTitle}>تم إنشاء الحساب</Text>
                <Text style={styles.successName}>{fullName.trim()}</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeLabel}>رمز الدخول</Text>
                  <Text style={styles.codeValue}>{createdCode}</Text>
                  <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
                    <Ionicons name="copy-outline" size={16} color={Colors.primary} />
                    <Text style={styles.copyBtnText}>نسخ الرمز</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.successHint}>شارك هذا الرمز مع المستخدم. لن يظهر مرة أخرى.</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, width: '100%' }}>
                  <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleClose}>
                    <Text style={styles.primaryBtnText}>تم</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={addAnother}>
                    <Ionicons name="add" size={16} color={Colors.primary} />
                    <Text style={styles.secondaryBtnText}>إضافة آخر</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {/* Step 1 — role */}
                {step === 1 && (
                  <View>
                    <Text style={styles.stepHeading}>نوع الحساب</Text>
                    <Text style={styles.stepSubheading}>اختر الدور الذي تريد إنشاؤه</Text>
                    <View style={{ gap: 10 }}>
                      {roles.map((r) => {
                        const meta = ROLE_META[r];
                        const active = role === r;
                        return (
                          <TouchableOpacity
                            key={r}
                            activeOpacity={0.9}
                            onPress={() => { haptics.selection(); setRole(r); }}
                            style={[styles.roleCard, active && styles.roleCardActive]}
                          >
                            <View style={[styles.roleIcon, { backgroundColor: meta.color + '20' }]}>
                              <Ionicons name={meta.icon} size={22} color={meta.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.roleName, active && { color: Colors.primary }]}>{meta.label}</Text>
                              <Text style={styles.roleDesc}>{meta.desc}</Text>
                            </View>
                            {active && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Step 2 — basic info */}
                {step === 2 && (
                  <View>
                    <Text style={styles.stepHeading}>بيانات الحساب</Text>
                    <Text style={styles.stepSubheading}>الاسم، الهاتف، ورمز الدخول</Text>

                    <Text style={styles.fieldLabel}>الاسم الكامل</Text>
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="مثال: محمد أحمد"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.input}
                    />

                    <Text style={styles.fieldLabel}>رقم الهاتف (اختياري)</Text>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="07xxxxxxxxx"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="phone-pad"
                      style={styles.input}
                    />

                    <Text style={styles.fieldLabel}>رمز الدخول</Text>
                    <View style={styles.codeRow}>
                      <TextInput
                        value={code}
                        onChangeText={(v) => setCode(v.toUpperCase())}
                        autoCapitalize="characters"
                        maxLength={12}
                        style={[styles.input, { flex: 1, textAlign: 'center', fontWeight: '800', letterSpacing: 2 }]}
                      />
                      <TouchableOpacity style={styles.regenBtn} onPress={() => { haptics.light(); setCode(generateCode()); }}>
                        <Ionicons name="refresh" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.hintSmall}>يمكن تعديله — احفظه وشاركه مع المستخدم.</Text>
                  </View>
                )}

                {/* Step 3 — linking (role-specific) OR review when no linking */}
                {step === 3 && needsLinking && (
                  <View>
                    <Text style={styles.stepHeading}>
                      {role === 'student' && 'الصف والشعبة'}
                      {role === 'teacher' && 'التعيينات'}
                      {role === 'parent' && 'ربط الأبناء'}
                    </Text>
                    <Text style={styles.stepSubheading}>
                      {role === 'student' && (instituteType === 'school' ? 'اختر المرحلة ثم الصف والشعبة' : 'اختر المجموعات')}
                      {role === 'teacher' && 'أضف المواد والشعب التي سيدرّسها'}
                      {role === 'parent' && 'اختياري — يمكن ربطهم لاحقاً'}
                    </Text>

                    {loadingData ? (
                      <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={Colors.primary} /></View>
                    ) : (
                      <>
                        {/* Student — school */}
                        {role === 'student' && instituteType === 'school' && (
                          <>
                            <Text style={styles.fieldLabel}>المرحلة</Text>
                            <View style={styles.chipRow}>
                              {stages.map((s: any) => {
                                const active = selStageId === s.id;
                                return (
                                  <TouchableOpacity
                                    key={s.id}
                                    style={[styles.chip, active && styles.chipActive]}
                                    onPress={() => { haptics.selection(); setSelStageId(s.id); }}
                                  >
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>

                            {selStageId && (
                              <>
                                <Text style={styles.fieldLabel}>الصف</Text>
                                <View style={styles.chipRow}>
                                  {gradesInStage.length === 0 ? (
                                    <Text style={styles.emptyText}>لا توجد صفوف في هذه المرحلة</Text>
                                  ) : gradesInStage.map((g: any) => {
                                    const active = selGradeId === g.id;
                                    return (
                                      <TouchableOpacity
                                        key={g.id}
                                        style={[styles.chip, active && styles.chipActive]}
                                        onPress={() => { haptics.selection(); setSelGradeId(g.id); }}
                                      >
                                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.name}</Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </>
                            )}

                            {selGradeId && (
                              <>
                                <Text style={styles.fieldLabel}>الشعبة</Text>
                                <View style={styles.chipRow}>
                                  {sectionsInGrade.length === 0 ? (
                                    <Text style={styles.emptyText}>لا توجد شعب. أضفها من شاشة إدارة الصفوف.</Text>
                                  ) : sectionsInGrade.map((sec: any) => {
                                    const active = selSectionId === sec.id;
                                    return (
                                      <TouchableOpacity
                                        key={sec.id}
                                        style={[styles.chip, active && styles.chipActive]}
                                        onPress={() => { haptics.selection(); setSelSectionId(sec.id); }}
                                      >
                                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{sec.name}</Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </>
                            )}
                          </>
                        )}

                        {/* Student — institute */}
                        {role === 'student' && instituteType === 'institute' && (
                          <>
                            <Text style={styles.fieldLabel}>المجموعات ({selClassIds.length} مختارة)</Text>
                            {classes.length === 0 ? (
                              <Text style={styles.emptyText}>لا توجد مجموعات بعد</Text>
                            ) : (
                              <View style={styles.chipRow}>
                                {classes.map((c: any) => {
                                  const active = selClassIds.includes(c.id);
                                  return (
                                    <TouchableOpacity
                                      key={c.id}
                                      style={[styles.chip, active && styles.chipActive]}
                                      onPress={() => {
                                        haptics.selection();
                                        setSelClassIds((prev) => active ? prev.filter((x) => x !== c.id) : [...prev, c.id]);
                                      }}
                                    >
                                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            )}
                          </>
                        )}

                        {/* Teacher */}
                        {role === 'teacher' && (
                          <>
                            {assignments.length > 0 && (
                              <View style={{ marginBottom: 12 }}>
                                <Text style={styles.fieldLabel}>التعيينات المضافة ({assignments.length})</Text>
                                {assignments.map((a) => {
                                  const sub = subjects.find((s: any) => s.id === a.subjectId);
                                  const grade = grades.find((g: any) => g.id === a.gradeId);
                                  const secNames = a.sectionIds
                                    .map((id) => sections.find((s: any) => s.id === id)?.name)
                                    .filter(Boolean).join('، ');
                                  const classNames = a.classIds
                                    .map((id) => classes.find((c: any) => c.id === id)?.name)
                                    .filter(Boolean).join('، ');
                                  return (
                                    <View key={a.id} style={styles.assignmentRow}>
                                      <View style={{ flex: 1 }}>
                                        <Text style={styles.assignmentText}>
                                          {sub?.name || '—'}
                                          {grade ? ` · ${grade.name}` : ''}
                                          {secNames ? ` · ${secNames}` : ''}
                                          {classNames ? ` · ${classNames}` : ''}
                                        </Text>
                                      </View>
                                      <TouchableOpacity onPress={() => removeAssignment(a.id)}>
                                        <Ionicons name="close-circle" size={20} color={Colors.error} />
                                      </TouchableOpacity>
                                    </View>
                                  );
                                })}
                              </View>
                            )}

                            <View style={styles.draftBox}>
                              <Text style={styles.draftTitle}>إضافة تعيين</Text>

                              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.fieldLabel}>المادة</Text>
                                <TouchableOpacity
                                  onPress={() => { haptics.selection(); setShowAddSubject((v) => !v); }}
                                  style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 }}
                                >
                                  <Ionicons name={showAddSubject ? 'remove-circle' : 'add-circle'} size={16} color={Colors.primary} />
                                  <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '700' }}>
                                    {showAddSubject ? 'إلغاء' : 'مادة جديدة'}
                                  </Text>
                                </TouchableOpacity>
                              </View>

                              {showAddSubject && (
                                <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                                  <TextInput
                                    value={newSubjectName}
                                    onChangeText={setNewSubjectName}
                                    placeholder="اسم المادة (مثل: الرياضيات)"
                                    placeholderTextColor={Colors.textMuted}
                                    style={[styles.input, { flex: 1, marginBottom: 0, textAlign: 'right' }]}
                                    autoFocus
                                    onSubmitEditing={handleAddSubject}
                                    editable={!addingSubject}
                                  />
                                  <TouchableOpacity
                                    onPress={handleAddSubject}
                                    disabled={addingSubject || !newSubjectName.trim()}
                                    style={{
                                      backgroundColor: Colors.primary,
                                      paddingHorizontal: 16,
                                      paddingVertical: 10,
                                      borderRadius: 10,
                                      opacity: addingSubject || !newSubjectName.trim() ? 0.5 : 1,
                                    }}
                                  >
                                    {addingSubject ? (
                                      <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>إضافة</Text>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              )}

                              <View style={styles.chipRow}>
                                {subjects.length === 0 ? (
                                  <Text style={styles.emptyText}>لا توجد مواد — اضغط "+ مادة جديدة" أعلاه لإضافة أول مادة</Text>
                                ) : subjects.map((s: any) => {
                                  const active = draft.subjectId === s.id;
                                  return (
                                    <TouchableOpacity
                                      key={s.id}
                                      style={[styles.chip, active && styles.chipActive]}
                                      onPress={() => setDraft({ ...draft, subjectId: s.id })}
                                    >
                                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>

                              {instituteType === 'school' && (
                                <>
                                  <Text style={styles.fieldLabel}>الصف</Text>
                                  <View style={styles.chipRow}>
                                    {draftGradesInStage.map((g: any) => {
                                      const active = draft.gradeId === g.id;
                                      return (
                                        <TouchableOpacity
                                          key={g.id}
                                          style={[styles.chip, active && styles.chipActive]}
                                          onPress={() => setDraft({ ...draft, gradeId: g.id, sectionIds: [] })}
                                        >
                                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.name}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                  {draft.gradeId && (
                                    <>
                                      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                        <Text style={[styles.fieldLabel, { marginTop: 0 }]}>الشعب ({draft.sectionIds.length} مختارة)</Text>
                                        {draftSectionsInGrade.length > 1 && (
                                          <TouchableOpacity
                                            onPress={() => {
                                              const allIds = draftSectionsInGrade.map((s: any) => s.id);
                                              const allSelected = allIds.every((id: string) => draft.sectionIds.includes(id));
                                              setDraft((d) => ({ ...d, sectionIds: allSelected ? [] : allIds }));
                                            }}
                                            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                                          >
                                            <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.primary }}>
                                              {draftSectionsInGrade.every((s: any) => draft.sectionIds.includes(s.id)) ? 'إلغاء الكل' : 'اختر الكل'}
                                            </Text>
                                          </TouchableOpacity>
                                        )}
                                      </View>
                                      <View style={styles.chipRow}>
                                        {draftSectionsInGrade.length === 0 ? (
                                          <Text style={styles.emptyText}>لا شعب في هذا الصف</Text>
                                        ) : draftSectionsInGrade.map((sec: any) => {
                                          const active = draft.sectionIds.includes(sec.id);
                                          return (
                                            <TouchableOpacity
                                              key={sec.id}
                                              style={[styles.chip, active && styles.chipActive]}
                                              onPress={() => {
                                                setDraft((d) => ({
                                                  ...d,
                                                  sectionIds: active
                                                    ? d.sectionIds.filter((x) => x !== sec.id)
                                                    : [...d.sectionIds, sec.id],
                                                }));
                                              }}
                                            >
                                              <Text style={[styles.chipText, active && styles.chipTextActive]}>{sec.name}</Text>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </View>
                                    </>
                                  )}
                                </>
                              )}

                              {/* Institute teachers: multi-class (قاعات) picker.
                                  Previously this section was skipped entirely so
                                  institute teachers ended up with assignments
                                  that had no tenant scope → couldn't upload
                                  galleries / videos / etc. */}
                              {instituteType === 'institute' && draft.subjectId && (
                                <>
                                  <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                    <Text style={[styles.fieldLabel, { marginTop: 0 }]}>القاعات ({draft.classIds.length} مختارة)</Text>
                                    {classes.length > 1 && (
                                      <TouchableOpacity
                                        onPress={() => {
                                          const allIds = classes.map((c: any) => c.id);
                                          const allSelected = allIds.every((id: string) => draft.classIds.includes(id));
                                          setDraft((d) => ({ ...d, classIds: allSelected ? [] : allIds }));
                                        }}
                                        style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                                      >
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.primary }}>
                                          {classes.every((c: any) => draft.classIds.includes(c.id)) ? 'إلغاء الكل' : 'اختر الكل'}
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                  <View style={styles.chipRow}>
                                    {classes.length === 0 ? (
                                      <Text style={styles.emptyText}>
                                        لا توجد قاعات بعد — أضف قاعة من "إدارة الصفوف/القاعات" قبل تعيين أستاذ
                                      </Text>
                                    ) : classes.map((c: any) => {
                                      const active = draft.classIds.includes(c.id);
                                      return (
                                        <TouchableOpacity
                                          key={c.id}
                                          style={[styles.chip, active && styles.chipActive]}
                                          onPress={() => {
                                            setDraft((d) => ({
                                              ...d,
                                              classIds: active
                                                ? d.classIds.filter((x) => x !== c.id)
                                                : [...d.classIds, c.id],
                                            }));
                                          }}
                                        >
                                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </>
                              )}

                              <TouchableOpacity
                                style={[styles.addDraftBtn, !canAddDraft && { opacity: 0.5 }]}
                                disabled={!canAddDraft}
                                onPress={commitDraft}
                              >
                                <Ionicons name="add-circle" size={18} color="#fff" />
                                <Text style={styles.addDraftText}>إضافة التعيين</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}

                        {/* Parent */}
                        {role === 'parent' && (
                          <>
                            <Text style={styles.fieldLabel}>ابحث عن الأبناء</Text>
                            <TextInput
                              value={studentSearch}
                              onChangeText={setStudentSearch}
                              placeholder="اسم الطالب..."
                              placeholderTextColor={Colors.textMuted}
                              style={styles.input}
                            />
                            <Text style={styles.fieldLabel}>النتائج ({childrenIds.length} مختار)</Text>
                            {filteredStudents.length === 0 ? (
                              <Text style={styles.emptyText}>لا نتائج</Text>
                            ) : filteredStudents.map((s: any) => {
                              const active = childrenIds.includes(s.id);
                              return (
                                <TouchableOpacity
                                  key={s.id}
                                  style={[styles.studentRow, active && styles.studentRowActive]}
                                  onPress={() => {
                                    haptics.selection();
                                    setChildrenIds((prev) => active ? prev.filter((x) => x !== s.id) : [...prev, s.id]);
                                  }}
                                >
                                  <View style={[styles.checkbox, active && styles.checkboxActive]}>
                                    {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                                  </View>
                                  <Text style={styles.studentName}>{s.full_name}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                  </View>
                )}

                {/* Step 3 for cafeteria/medical — review */}
                {step === 3 && !needsLinking && (
                  <ReviewBlock
                    role={role!}
                    fullName={fullName}
                    phone={phone}
                    code={code}
                  />
                )}

                {/* Step 4 — review */}
                {step === 4 && needsLinking && (
                  <ReviewBlock
                    role={role!}
                    fullName={fullName}
                    phone={phone}
                    code={code}
                    linkingSummary={(() => {
                      if (role === 'student' && instituteType === 'school') {
                        const g = grades.find((x: any) => x.id === selGradeId);
                        const s = sections.find((x: any) => x.id === selSectionId);
                        return g && s ? `${g.name} · ${s.name}` : '—';
                      }
                      if (role === 'student' && instituteType === 'institute') {
                        return classes.filter((c: any) => selClassIds.includes(c.id)).map((c: any) => c.name).join('، ') || '—';
                      }
                      if (role === 'teacher') {
                        return `${assignments.length} تعيين`;
                      }
                      if (role === 'parent') {
                        return `${childrenIds.length} ابن/ابنة`;
                      }
                      return '—';
                    })()}
                  />
                )}
              </>
            )}
          </KeyboardAwareScroll>

          {/* Footer actions */}
          {!createdCode && (
            <View style={styles.footer}>
              {step > 1 && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={goBack} disabled={busy}>
                  <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                  <Text style={styles.secondaryBtnText}>السابق</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }]}
                onPress={goNext}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>
                      {step === totalSteps ? 'إنشاء' : 'التالي'}
                    </Text>
                    {step !== totalSteps && <Ionicons name="chevron-back" size={16} color="#fff" />}
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

function ReviewBlock({
  role, fullName, phone, code, linkingSummary,
}: {
  role: Role; fullName: string; phone: string; code: string; linkingSummary?: string;
}) {
  const meta = ROLE_META[role];
  return (
    <View>
      <Text style={styles.stepHeading}>مراجعة وتأكيد</Text>
      <Text style={styles.stepSubheading}>راجع التفاصيل قبل الإنشاء</Text>

      <View style={styles.reviewCard}>
        <View style={styles.reviewHead}>
          <View style={[styles.roleIcon, { backgroundColor: meta.color + '20' }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewName}>{fullName || '—'}</Text>
            <Text style={styles.reviewRole}>{meta.label}</Text>
          </View>
        </View>

        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>الهاتف</Text>
          <Text style={styles.reviewValue}>{phone || '—'}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>رمز الدخول</Text>
          <Text style={[styles.reviewValue, { fontWeight: '800', letterSpacing: 1 }]}>{code}</Text>
        </View>
        {linkingSummary && (
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>الربط</Text>
            <Text style={styles.reviewValue}>{linkingSummary}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },

  progressRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingTop: 12 },
  progressDot: { flex: 1, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2 },
  progressDotReached: { backgroundColor: Colors.primary },
  progressDotCurrent: { backgroundColor: Colors.primary },

  stepHeading: { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  stepSubheading: { fontSize: 13, color: Colors.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 14 },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: Colors.text, textAlign: 'right',
  },
  hintSmall: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
  codeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  regenBtn: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#C7D2FE',
  },

  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 12,
  },
  roleCardActive: { borderColor: Colors.primary, borderWidth: 2, backgroundColor: '#EEF2FF' },
  roleIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  roleName: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  roleDesc: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: '#fff' },
  emptyText: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', padding: 10 },

  assignmentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 10, marginTop: 6,
  },
  assignmentText: { fontSize: 12, color: Colors.text, textAlign: 'right', fontWeight: '700' },
  draftBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: 12, padding: 12, marginTop: 10,
  },
  draftTitle: { fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  addDraftBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 10, borderRadius: 10, marginTop: 12,
  },
  addDraftText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, marginTop: 6,
  },
  studentRowActive: { borderColor: Colors.primary, backgroundColor: '#EEF2FF' },
  studentName: { fontSize: 13, fontWeight: '700', color: Colors.text, textAlign: 'right', flex: 1 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },

  reviewCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  reviewName: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  reviewRole: { fontSize: 11, color: Colors.textMuted, textAlign: 'right' },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  reviewLabel: { fontSize: 12, color: Colors.textMuted },
  reviewValue: { fontSize: 13, color: Colors.text, fontWeight: '700', textAlign: 'left', maxWidth: '65%' },

  successBlock: { alignItems: 'center', paddingVertical: 16 },
  successIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  successName: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  codeBox: {
    width: '100%',
    marginTop: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 12, color: Colors.textMuted },
  codeValue: { fontSize: 28, fontWeight: '800', color: Colors.primary, letterSpacing: 4, marginTop: 6 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  copyBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  successHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 10 },

  footer: {
    flexDirection: 'row', gap: 10,
    padding: 14, borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 12, borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.primary,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10,
  },
  secondaryBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 14 },
});
