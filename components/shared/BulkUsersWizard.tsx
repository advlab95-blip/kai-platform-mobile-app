import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../../constants/colors';
import { api } from '../../services/api';
import useAuthStore from '../../stores/authStore';
import {
  parseTeachersSchool, parseTeachersInstitute,
  parseStudentsSchool, parseStudentsInstitute,
  type ParsedTeacher, type ParsedStudent, type ValidationError,
} from '../../utils/excelParser';
import {
  processTeachers, processStudents, extractParents,
  countUniqueTeachers, countUniqueParents,
  type ProcessedTeacher, type ProcessedStudent, type ProcessedParent,
} from '../../utils/bulkUserProcessor';
import { generateUniqueCodes } from '../../utils/secureCodeGenerator';
import {
  exportTeacherCodes, exportStudentCodes, exportParentCodes,
  downloadTeacherTemplate, downloadStudentTemplate,
} from '../../utils/excelExport';

type InstitutionType = 'school' | 'institute';

interface Props {
  institutionId: string;
  institutionName: string;
  institutionType: InstitutionType;
  // Shown above step 1 when the parent screen is the super admin (picker upstream).
  headerExtra?: React.ReactNode;
}

type TeacherCreated = { name: string; code: string; assignments: string; userId: string };
type TeacherFailed = { name: string; reason: string };
type StudentCreated = { name: string; code: string; class: string; userId: string };
type StudentFailed = { name: string; reason: string };
type ParentCreated = { name: string; code: string; children: string[]; phone: string; userId: string };
type ParentFailed = { name: string; reason: string; phone: string };

export default function BulkUsersWizard({
  institutionId, institutionName, institutionType, headerExtra,
}: Props) {
  const { userId } = useAuthStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [teachersDone, setTeachersDone] = useState(false);
  const [studentsDone, setStudentsDone] = useState(false);

  // ── Teachers state ──────────────────────────────────
  const [teacherFileName, setTeacherFileName] = useState<string>('');
  const [parsedTeachers, setParsedTeachers] = useState<ParsedTeacher[]>([]);
  const [teacherErrors, setTeacherErrors] = useState<ValidationError[]>([]);
  const [processedTeachers, setProcessedTeachers] = useState<ProcessedTeacher[]>([]);
  const [teacherBusy, setTeacherBusy] = useState(false);
  const [teacherProgress, setTeacherProgress] = useState({ done: 0, total: 0 });
  const [teacherCreated, setTeacherCreated] = useState<TeacherCreated[]>([]);
  const [teacherFailed, setTeacherFailed] = useState<TeacherFailed[]>([]);

  // ── Students state ──────────────────────────────────
  const [studentFileName, setStudentFileName] = useState<string>('');
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [studentErrors, setStudentErrors] = useState<ValidationError[]>([]);
  const [processedStudents, setProcessedStudents] = useState<ProcessedStudent[]>([]);
  const [processedParents, setProcessedParents] = useState<ProcessedParent[]>([]);
  const [studentBusy, setStudentBusy] = useState(false);
  const [studentProgress, setStudentProgress] = useState({ done: 0, total: 0 });
  const [studentCreated, setStudentCreated] = useState<StudentCreated[]>([]);
  const [studentFailed, setStudentFailed] = useState<StudentFailed[]>([]);
  const [parentCreated, setParentCreated] = useState<ParentCreated[]>([]);
  const [parentFailed, setParentFailed] = useState<ParentFailed[]>([]);

  // Reset all state when institution changes (used by the super admin picker).
  useEffect(() => {
    setStep(1);
    setTeachersDone(false); setStudentsDone(false);
    setTeacherFileName(''); setParsedTeachers([]); setTeacherErrors([]);
    setProcessedTeachers([]); setTeacherCreated([]); setTeacherFailed([]);
    setTeacherProgress({ done: 0, total: 0 });
    setStudentFileName(''); setParsedStudents([]); setStudentErrors([]);
    setProcessedStudents([]); setProcessedParents([]);
    setStudentCreated([]); setStudentFailed([]); setParentCreated([]); setParentFailed([]);
    setStudentProgress({ done: 0, total: 0 });
  }, [institutionId]);

  // ── Step 1: upload teachers ─────────────────────────
  const pickTeacherFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      setTeacherFileName(asset.name || 'teachers.xlsx');

      const parser = institutionType === 'school' ? parseTeachersSchool : parseTeachersInstitute;
      const { teachers, errors } = await parser(asset.uri);

      if (teachers.length === 0 && errors.length === 0) {
        Alert.alert('ملف فارغ', 'الملف لا يحتوي على بيانات صالحة');
        return;
      }

      setParsedTeachers(teachers);
      setTeacherErrors(errors);

      // Pre-generate codes so the preview can show exactly what each account will get.
      const uniqueCount = countUniqueTeachers(teachers);
      const existing = await api.getAllExistingCodes();
      const codes = await generateUniqueCodes(uniqueCount, existing);
      setProcessedTeachers(processTeachers(teachers, codes));
    } catch (e: any) {
      Alert.alert('خطأ بقراءة الملف', e?.message || String(e));
    }
  }, [institutionType]);

  const createTeachers = useCallback(async () => {
    if (!userId) { Alert.alert('خطأ', 'الجلسة منتهية'); return; }
    if (processedTeachers.length === 0) return;
    setTeacherBusy(true);
    setTeacherProgress({ done: 0, total: processedTeachers.length });
    try {
      const res = await api.bulkCreateTeachers({
        teachers: processedTeachers,
        institutionId, institutionType, createdBy: userId,
        onProgress: (done, total) => setTeacherProgress({ done, total }),
      });
      setTeacherCreated(res.created);
      setTeacherFailed(res.failed);
      setTeachersDone(true);
    } catch (e: any) {
      Alert.alert('فشل الإنشاء', e?.message || String(e));
    } finally {
      setTeacherBusy(false);
    }
  }, [processedTeachers, institutionId, institutionType, userId]);

  // ── Step 2: upload students ─────────────────────────
  const pickStudentFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      setStudentFileName(asset.name || 'students.xlsx');

      const parser = institutionType === 'school' ? parseStudentsSchool : parseStudentsInstitute;
      const { students, errors } = await parser(asset.uri);

      if (students.length === 0 && errors.length === 0) {
        Alert.alert('ملف فارغ', 'الملف لا يحتوي على بيانات صالحة');
        return;
      }

      setParsedStudents(students);
      setStudentErrors(errors);

      const existing = await api.getAllExistingCodes();
      // Student codes first, then parent codes — all drawn from the same
      // generator so no student/parent collision inside this batch.
      const studentCodes = await generateUniqueCodes(students.length, existing);
      const merged = [...existing, ...studentCodes];
      const parentCodes = await generateUniqueCodes(countUniqueParents(students), merged);

      const ps = processStudents(students, studentCodes);
      setProcessedStudents(ps);
      setProcessedParents(extractParents(ps, parentCodes));
    } catch (e: any) {
      Alert.alert('خطأ بقراءة الملف', e?.message || String(e));
    }
  }, [institutionType]);

  const createStudents = useCallback(async () => {
    if (!userId) { Alert.alert('خطأ', 'الجلسة منتهية'); return; }
    if (processedStudents.length === 0) return;
    const total = processedStudents.length + processedParents.length;
    setStudentBusy(true);
    setStudentProgress({ done: 0, total });
    try {
      const res = await api.bulkCreateStudents({
        students: processedStudents,
        parents: processedParents,
        institutionId, institutionType, createdBy: userId,
        onProgress: (done, t) => setStudentProgress({ done, total: t }),
      });
      setStudentCreated(res.studentsCreated);
      setStudentFailed(res.studentsFailed);
      setParentCreated(res.parentsCreated);
      setParentFailed(res.parentsFailed);
      setStudentsDone(true);
      setStep(3);
    } catch (e: any) {
      Alert.alert('فشل الإنشاء', e?.message || String(e));
    } finally {
      setStudentBusy(false);
    }
  }, [processedStudents, processedParents, institutionId, institutionType, userId]);

  // ── Exports ─────────────────────────────────────────
  const handleExportTeachers = useCallback(async () => {
    try {
      const rows = [
        ...teacherCreated.map(t => ({ name: t.name, code: t.code, assignments: t.assignments, status: 'تم الإنشاء' })),
        ...teacherFailed.map(t => ({ name: t.name, code: '—', assignments: '—', status: `فشل: ${t.reason}` })),
      ];
      await exportTeacherCodes(rows, institutionName);
    } catch (e: any) { Alert.alert('فشل التصدير', e?.message || String(e)); }
  }, [teacherCreated, teacherFailed, institutionName]);

  const handleExportStudents = useCallback(async () => {
    try {
      const rows = [
        ...studentCreated.map(s => ({ name: s.name, code: s.code, className: s.class, status: 'تم الإنشاء' })),
        ...studentFailed.map(s => ({ name: s.name, code: '—', className: '—', status: `فشل: ${s.reason}` })),
      ];
      await exportStudentCodes(rows, institutionName);
    } catch (e: any) { Alert.alert('فشل التصدير', e?.message || String(e)); }
  }, [studentCreated, studentFailed, institutionName]);

  const handleExportParents = useCallback(async () => {
    try {
      const rows = [
        ...parentCreated.map(p => ({ name: p.name, code: p.code, children: p.children.join('، '), phone: p.phone, status: 'تم الإنشاء' })),
        ...parentFailed.map(p => ({ name: p.name, code: '—', children: '—', phone: p.phone, status: `فشل: ${p.reason}` })),
      ];
      await exportParentCodes(rows, institutionName);
    } catch (e: any) { Alert.alert('فشل التصدير', e?.message || String(e)); }
  }, [parentCreated, parentFailed, institutionName]);

  const uniqueTeacherCount = useMemo(() => processedTeachers.length, [processedTeachers]);
  const totalAssignments = useMemo(
    () => processedTeachers.reduce((sum, t) => sum + t.assignments.length, 0),
    [processedTeachers]
  );

  const teacherProgressPct = teacherProgress.total > 0
    ? Math.round((teacherProgress.done / teacherProgress.total) * 100) : 0;
  const studentProgressPct = studentProgress.total > 0
    ? Math.round((studentProgress.done / studentProgress.total) * 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {headerExtra}

      {/* Stepper */}
      <View style={styles.stepperCard}>
        <Text style={styles.title}>إنشاء حسابات جماعي</Text>
        <Text style={styles.subtitle}>{institutionName} · {institutionType === 'school' ? 'مدرسة' : 'معهد'}</Text>

        <View style={styles.stepsRow}>
          <StepIndicator num={1} label="الأساتذة" active={step === 1} done={teachersDone} />
          <StepIndicator num={2} label="الطلاب" active={step === 2} done={studentsDone} locked={!teachersDone} />
          <StepIndicator num={3} label="التحميل" active={step === 3} done={studentsDone} locked={!studentsDone} />
        </View>

        <View style={styles.stepButtons}>
          <StepButton label="1. الأساتذة" active={step === 1} onPress={() => setStep(1)} />
          <StepButton label="2. الطلاب" active={step === 2} onPress={() => teachersDone && setStep(2)} disabled={!teachersDone} />
          <StepButton label="3. التحميل" active={step === 3} onPress={() => studentsDone && setStep(3)} disabled={!studentsDone} />
        </View>
      </View>

      {/* Step 1 */}
      {step === 1 && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="school" size={22} color={Colors.teacher} />
            <Text style={styles.cardTitle}>الخطوة 1: الأساتذة</Text>
          </View>

          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => downloadTeacherTemplate(institutionType)}>
            <Ionicons name="download-outline" size={18} color={Colors.primary} />
            <Text style={[styles.btnText, { color: Colors.primary }]}>حمّل القالب الفارغ</Text>
          </TouchableOpacity>

          {institutionType === 'school' && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: '#92400E', textAlign: 'right', fontWeight: '700' }}>
                💡 للأساتذة في الإعدادية: اكتب الصف مع الفرع
              </Text>
              <Text style={{ fontSize: 10, color: '#92400E', textAlign: 'right', marginTop: 2 }}>
                مثال: "السادس - علمي" — يمكن تكرار اسم الأستاذ لعدة تعيينات
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={pickTeacherFile} disabled={teacherBusy}>
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
            <Text style={[styles.btnText, { color: '#fff' }]}>
              {teacherFileName ? `📄 ${teacherFileName}` : 'ارفع ملف الأساتذة'}
            </Text>
          </TouchableOpacity>

          {/* Preview */}
          {(parsedTeachers.length > 0 || teacherErrors.length > 0) && !teachersDone && (
            <>
              <Text style={styles.sectionHead}>📊 المعاينة</Text>
              <View style={styles.statsRow}>
                <Stat label="أستاذ فريد" value={uniqueTeacherCount} color={Colors.success} />
                <Stat label="ربط (صف/مادة)" value={totalAssignments} color={Colors.info} />
                <Stat label="مرفوض" value={teacherErrors.length} color={Colors.error} />
              </View>

              {teacherErrors.length > 0 && (
                <View style={styles.errorsBlock}>
                  <Text style={styles.errorHead}>❌ أسطر مرفوضة ({teacherErrors.length})</Text>
                  {teacherErrors.slice(0, 30).map((e, i) => (
                    <View key={i} style={styles.errorRow}>
                      <Text style={styles.errorLine}>سطر {e.row} · {e.field}</Text>
                      <Text style={styles.errorMsg}>{e.message}</Text>
                    </View>
                  ))}
                  {teacherErrors.length > 30 && (
                    <Text style={styles.errorMore}>+{teacherErrors.length - 30} أخرى…</Text>
                  )}
                </View>
              )}

              {processedTeachers.length > 0 && (
                <View style={styles.previewBlock}>
                  <Text style={styles.previewHead}>✅ مقبولين ({processedTeachers.length})</Text>
                  {processedTeachers.slice(0, 20).map((t, i) => (
                    <View key={i} style={styles.previewRow}>
                      <Text style={styles.previewName}>👨‍🏫 {t.full_name}</Text>
                      <Text style={styles.previewMeta}>
                        {t.assignments.map(a =>
                          institutionType === 'school'
                            ? `${a.subject}: ${a.class_name} ${a.section}`
                            : `${a.subject}: ${a.level} - ${a.group}`
                        ).join('، ')}
                      </Text>
                      <Text style={styles.previewCode}>🔑 {t.code}</Text>
                    </View>
                  ))}
                  {processedTeachers.length > 20 && (
                    <Text style={styles.errorMore}>+{processedTeachers.length - 20} أخرى…</Text>
                  )}
                </View>
              )}

              {processedTeachers.length > 0 && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnSuccess]}
                  onPress={createTeachers}
                  disabled={teacherBusy}
                >
                  {teacherBusy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[styles.btnText, { color: '#fff' }]}>✅ إنشاء {processedTeachers.length} حساب</Text>}
                </TouchableOpacity>
              )}
            </>
          )}

          {teacherBusy && (
            <View style={styles.progressWrap}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${teacherProgressPct}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {teacherProgress.done} / {teacherProgress.total} ({teacherProgressPct}%)
              </Text>
            </View>
          )}

          {/* Results */}
          {teachersDone && (
            <View style={styles.resultBlock}>
              <Text style={styles.resultHead}>
                ✅ تم إنشاء {teacherCreated.length} حساب
                {teacherFailed.length > 0 ? ` · فشل ${teacherFailed.length}` : ''}
              </Text>
              {teacherFailed.length > 0 && (
                <View style={styles.errorsBlock}>
                  {teacherFailed.slice(0, 20).map((f, i) => (
                    <View key={i} style={styles.errorRow}>
                      <Text style={styles.errorLine}>❌ {f.name}</Text>
                      <Text style={styles.errorMsg}>{f.reason}</Text>
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleExportTeachers}>
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={[styles.btnText, { color: '#fff' }]}>تحميل أكواد الأساتذة</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnNext]} onPress={() => setStep(2)}>
                <Text style={[styles.btnText, { color: '#fff' }]}>الخطوة 2: الطلاب ←</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="people" size={22} color={Colors.student} />
            <Text style={styles.cardTitle}>الخطوة 2: الطلاب</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.infoText}>✅ الأساتذة مسجّلين ({teacherCreated.length})</Text>
            <Text style={styles.infoText}>✅ الصفوف/المجموعات جاهزة</Text>
          </View>

          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => downloadStudentTemplate(institutionType)}>
            <Ionicons name="download-outline" size={18} color={Colors.primary} />
            <Text style={[styles.btnText, { color: Colors.primary }]}>حمّل قالب الطلاب</Text>
          </TouchableOpacity>

          {institutionType === 'school' && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: '#92400E', textAlign: 'right', fontWeight: '700' }}>
                💡 لطلاب الإعدادية: اكتب الصف مع الفرع
              </Text>
              <Text style={{ fontSize: 10, color: '#92400E', textAlign: 'right', marginTop: 2 }}>
                مثال: "السادس - علمي" أو "الخامس - أدبي"
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={pickStudentFile} disabled={studentBusy}>
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
            <Text style={[styles.btnText, { color: '#fff' }]}>
              {studentFileName ? `📄 ${studentFileName}` : 'ارفع ملف الطلاب'}
            </Text>
          </TouchableOpacity>

          {(parsedStudents.length > 0 || studentErrors.length > 0) && !studentsDone && (
            <>
              <Text style={styles.sectionHead}>📊 المعاينة</Text>
              <View style={styles.statsRow}>
                <Stat label="طالب" value={processedStudents.length} color={Colors.success} />
                <Stat label="ولي أمر فريد" value={processedParents.length} color={Colors.info} />
                <Stat label="مرفوض" value={studentErrors.length} color={Colors.error} />
              </View>
              {processedParents.filter(p => p.children.length > 1).length > 0 && (
                <Text style={styles.noteLine}>
                  📌 {processedParents.filter(p => p.children.length > 1).length} ولي أمر لهم أكثر من ابن (حساب واحد)
                </Text>
              )}

              {studentErrors.length > 0 && (
                <View style={styles.errorsBlock}>
                  <Text style={styles.errorHead}>❌ أسطر مرفوضة ({studentErrors.length})</Text>
                  {studentErrors.slice(0, 30).map((e, i) => (
                    <View key={i} style={styles.errorRow}>
                      <Text style={styles.errorLine}>سطر {e.row} · {e.field}</Text>
                      <Text style={styles.errorMsg}>{e.message}</Text>
                    </View>
                  ))}
                  {studentErrors.length > 30 && (
                    <Text style={styles.errorMore}>+{studentErrors.length - 30} أخرى…</Text>
                  )}
                </View>
              )}

              {processedStudents.length > 0 && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnSuccess]}
                  onPress={createStudents}
                  disabled={studentBusy}
                >
                  {studentBusy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[styles.btnText, { color: '#fff' }]}>
                        ✅ إنشاء {processedStudents.length} طالب + {processedParents.length} ولي أمر
                      </Text>}
                </TouchableOpacity>
              )}
            </>
          )}

          {studentBusy && (
            <View style={styles.progressWrap}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${studentProgressPct}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {studentProgress.done} / {studentProgress.total} ({studentProgressPct}%)
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            <Text style={styles.cardTitle}>الخطوة 3: التحميل</Text>
          </View>
          <View style={styles.resultBlock}>
            <Text style={styles.resultHead}>✅ تم بنجاح!</Text>
            <Text style={styles.infoText}>
              {teacherCreated.length} أستاذ · {studentCreated.length} طالب · {parentCreated.length} ولي أمر
            </Text>
            {(teacherFailed.length + studentFailed.length + parentFailed.length) > 0 && (
              <Text style={[styles.infoText, { color: Colors.error }]}>
                فشل: {teacherFailed.length + studentFailed.length + parentFailed.length} حساب (راجع الملفات)
              </Text>
            )}
          </View>

          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleExportTeachers}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={[styles.btnText, { color: '#fff' }]}>تحميل أكواد الأساتذة ({teacherCreated.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleExportStudents}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={[styles.btnText, { color: '#fff' }]}>تحميل أكواد الطلاب ({studentCreated.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleExportParents}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={[styles.btnText, { color: '#fff' }]}>تحميل أكواد أولياء الأمور ({parentCreated.length})</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function StepIndicator({ num, label, active, done, locked }: {
  num: number; label: string; active: boolean; done: boolean; locked?: boolean;
}) {
  const color = done ? Colors.success : active ? Colors.primary : locked ? Colors.textMuted : Colors.textSecondary;
  return (
    <View style={styles.stepIndicator}>
      <View style={[styles.stepDot, { backgroundColor: color }]}>
        {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900' }}>{num}</Text>}
      </View>
      <Text style={[styles.stepLabel, { color }]}>{label}</Text>
    </View>
  );
}

function StepButton({ label, active, onPress, disabled }: {
  label: string; active: boolean; onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.stepBtn,
        active && { backgroundColor: Colors.primary },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.stepBtnText, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.stat, { borderColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 14 },
  stepperCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  stepIndicator: { alignItems: 'center', flex: 1 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { marginTop: 6, fontSize: 12, fontWeight: '700' },
  stepButtons: { flexDirection: 'row', marginTop: 14, gap: 6 },
  stepBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  stepBtnText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: Colors.text },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 10,
  },
  btnPrimary: { backgroundColor: Colors.primary },
  btnSecondary: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  btnSuccess: { backgroundColor: Colors.success },
  btnNext: { backgroundColor: Colors.info, marginTop: 8 },
  btnText: { fontSize: 14, fontWeight: '800' },
  sectionHead: { fontSize: 14, fontWeight: '900', color: Colors.text, marginTop: 16, marginBottom: 8, textAlign: 'right' },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  errorsBlock: { marginTop: 12, backgroundColor: '#FEF2F2', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA' },
  errorHead: { fontSize: 13, fontWeight: '800', color: Colors.error, marginBottom: 6, textAlign: 'right' },
  errorRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#FECACA' },
  errorLine: { fontSize: 12, fontWeight: '800', color: Colors.error, textAlign: 'right' },
  errorMsg: { fontSize: 11, color: '#991B1B', textAlign: 'right', marginTop: 2 },
  errorMore: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 6 },
  previewBlock: { marginTop: 12 },
  previewHead: { fontSize: 13, fontWeight: '800', color: Colors.success, marginBottom: 6, textAlign: 'right' },
  previewRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  previewName: { fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  previewMeta: { fontSize: 11, color: Colors.textSecondary, textAlign: 'right', marginTop: 2 },
  previewCode: { fontSize: 12, fontWeight: '900', color: Colors.primary, textAlign: 'right', marginTop: 2 },
  progressWrap: { marginTop: 14 },
  progressBar: { height: 10, backgroundColor: Colors.background, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  progressText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 6 },
  resultBlock: { marginTop: 12 },
  resultHead: { fontSize: 15, fontWeight: '900', color: Colors.success, textAlign: 'right', marginBottom: 6 },
  infoBlock: { backgroundColor: Colors.background, padding: 10, borderRadius: 10, marginBottom: 12 },
  infoText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 2 },
  noteLine: { fontSize: 12, color: Colors.info, textAlign: 'right', marginTop: 6 },
});
