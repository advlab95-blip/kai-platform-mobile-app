import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  RefreshControl, TextInput,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { haptics } from '../../utils/haptics';
import { searchMatch } from '../../hooks/useSmartSearch';
import EmptyState from '../../components/shared/EmptyState';
import BehaviorNoteSheet from '../../components/teacher/students/BehaviorNoteSheet';
import TopBottomStudents from '../../components/teacher/students/TopBottomStudents';

// One row returned by api.getTeacherAssignmentsResolved — covers both the
// teacher_assignments path and the legacy student_classes fallback.
interface TeacherTarget {
  assignment_id: string;
  class_id: string | null;
  section_id: string | null;
  section_name: string | null;
  grade_name: string | null;
  class_name: string | null;
  subject_name: string | null;
  subject_id?: string | null;
  display_name: string;
}

// One bucket in the class-level list — collapses all section assignments
// that share a class_id into a single drilldown entry. classKey is the
// stable id we navigate by; it's class_id when present, otherwise section_id
// (legacy school schema stores classes.id in the section_id column).
interface ClassBucket {
  classKey: string;
  className: string;
  subjects: string[];      // dedupe subjects across sections
  sections: TeacherTarget[]; // sections / sub-assignments under this class
}

interface Student { id: string; full_name: string; }

interface StudentDetailExtras {
  code: string | null;
  examSessions: Array<{
    id: string;
    exam_id: string;
    score: number | null;
    max_score: number | null;
    status: string | null;
    title: string;
    graded_at: string | null;
  }>;
  assignmentRate: {
    total: number;
    submitted: number;
    percentage: number;
  } | null;
}

export default function TeacherStudents() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { t } = useTranslation();

  const [targets, setTargets] = useState<TeacherTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // ── Drilldown levels ──
  // 1) classes → 2) sections (only for chosen class) → 3) students → 4) student detail
  const [selectedClass, setSelectedClass] = useState<ClassBucket | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<TeacherTarget | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStudents = searchQuery.trim()
    ? students.filter(s => searchMatch(s.full_name, searchQuery))
    : students;

  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [attendance, setAttendance] = useState<{ percentage: number; present: number; late: number; absent: number; total: number } | null>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [extras, setExtras] = useState<StudentDetailExtras | null>(null);

  // Behavior note bottom-sheet — opens from the student detail screen so the
  // teacher can log observations that the institute admin sees on the
  // (institute)/behavior-notes list in real time.
  const [behaviorSheetOpen, setBehaviorSheetOpen] = useState(false);

  // Group flat targets into class buckets — drilldown step 1 list source.
  // Falls back gracefully when class_id is missing (legacy school rows).
  const classBuckets: ClassBucket[] = useMemo(() => {
    const map = new Map<string, ClassBucket>();
    for (const tgt of targets) {
      const classKey = tgt.class_id || tgt.section_id;
      if (!classKey) continue;
      const className = tgt.class_name || tgt.grade_name || tgt.display_name || '—';
      const existing = map.get(classKey);
      if (existing) {
        existing.sections.push(tgt);
        if (tgt.subject_name && !existing.subjects.includes(tgt.subject_name)) {
          existing.subjects.push(tgt.subject_name);
        }
      } else {
        map.set(classKey, {
          classKey,
          className,
          subjects: tgt.subject_name ? [tgt.subject_name] : [],
          sections: [tgt],
        });
      }
    }
    return Array.from(map.values());
  }, [targets]);

  const loadTargets = useCallback(async () => {
    if (!userId) return;
    setLoadingTargets(true);
    try {
      const data = await api.getTeacherAssignmentsResolved(userId);
      setTargets((data as any) || []);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل تحميل الصفوف');
    } finally {
      setLoadingTargets(false);
    }
  }, [userId, t]);

  useEffect(() => { loadTargets(); }, [loadTargets]);

  const loadStudentsForTarget = async (tgt: TeacherTarget) => {
    // Prefer section_id so school-side queries hit enrollments.section_id
    // (the most specific scope). Fall back to class_id for institutes.
    const queryId = tgt.section_id || tgt.class_id;
    if (!queryId) {
      Alert.alert(
        t('common.warning', { defaultValue: 'تنبيه' }),
        t('teacherStudents.noClassId', { defaultValue: 'هذه الشعبة غير مرتبطة بصف قابل للاستعلام' }),
      );
      return;
    }
    setSelectedTarget(tgt);
    setSearchQuery('');
    setLoadingStudents(true);
    try {
      const data = await api.getStudentsByClass(queryId, userInstituteId || undefined);
      setStudents((data as any) || []);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل تحميل الطلاب');
    } finally {
      setLoadingStudents(false);
    }
  };

  // Auto-skip the section step when a class bucket has exactly one section —
  // tapping a class with a single section would otherwise feel like a dead step.
  const openClass = async (bucket: ClassBucket) => {
    setSelectedClass(bucket);
    if (bucket.sections.length === 1) {
      await loadStudentsForTarget(bucket.sections[0]);
    }
  };

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (selectedTarget) await loadStudentsForTarget(selectedTarget);
      else await loadTargets();
    } finally {
      setRefreshing(false);
    }
  }, [selectedTarget, loadTargets]);

  // Pull rich student detail in parallel. All sub-queries are wrapped so a single
  // failure (e.g. RLS reject on one table) doesn't blank the whole sheet.
  const openStudentDetail = async (student: Student) => {
    setDetailStudent(student);
    setDetailLoading(true);
    setExtras(null);
    setAttendance(null);
    setGrades([]);
    try {
      const teacherSubjectName = selectedTarget?.subject_name || null;
      const [att, gr, ext] = await Promise.allSettled([
        api.getAttendanceSummary(student.id, userInstituteId || undefined),
        api.getStudentGrades(student.id, undefined, userId || undefined, userInstituteId || undefined),
        loadStudentExtras(student.id, teacherSubjectName),
      ]);
      setAttendance(att.status === 'fulfilled' ? (att.value as any) : null);
      // Filter grades to this teacher's subject when we have one — keeps the
      // sheet focused on the teacher's own subject and avoids leaking other
      // teachers' marks into this view.
      const rawGrades = gr.status === 'fulfilled' ? (gr.value as any[]) : [];
      const scopedGrades = teacherSubjectName
        ? rawGrades.filter(g =>
          (g.subject_name && g.subject_name === teacherSubjectName) ||
          (g.subject && g.subject === teacherSubjectName),
        )
        : rawGrades;
      setGrades(scopedGrades.length > 0 ? scopedGrades : rawGrades);
      setExtras(ext.status === 'fulfilled' ? ext.value : null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Per-teacher slice of exam scores + assignment submission rate. Everything
  // scoped by institute_id + teacher_id so cross-tenant / cross-teacher leaks
  // can't happen even if RLS is misconfigured upstream.
  const loadStudentExtras = async (studentId: string, _teacherSubjectName: string | null): Promise<StudentDetailExtras> => {
    const client = supabase;
    const instituteId = userInstituteId || undefined;
    const teacherId = userId || undefined;

    // 1) login code — small lookup, fail-soft
    let code: string | null = null;
    try {
      const { data } = await client
        .from('user_codes').select('code').eq('user_id', studentId).maybeSingle();
      code = (data as any)?.code || null;
    } catch { /* ignore */ }

    // 2) exam_sessions limited to THIS teacher's exams. Two-step query because
    //    exam_sessions has no teacher_id column directly.
    let examSessions: StudentDetailExtras['examSessions'] = [];
    if (teacherId && instituteId) {
      try {
        const { data: teacherExams } = await client
          .from('exams').select('id, title')
          .eq('teacher_id', teacherId).eq('institute_id', instituteId)
          .limit(500);
        const examIds = (teacherExams || []).map((e: any) => e.id);
        const titleByExam: Record<string, string> = {};
        for (const e of (teacherExams || []) as any[]) titleByExam[e.id] = e.title || '—';
        if (examIds.length > 0) {
          const { data: sessions } = await client
            .from('exam_sessions')
            .select('id, exam_id, score, max_score, status, graded_at')
            .eq('student_id', studentId)
            .in('exam_id', examIds)
            .order('graded_at', { ascending: false })
            .limit(100);
          examSessions = (sessions || []).map((s: any) => ({
            id: s.id,
            exam_id: s.exam_id,
            score: s.score,
            max_score: s.max_score,
            status: s.status,
            title: titleByExam[s.exam_id] || '—',
            graded_at: s.graded_at,
          }));
        }
      } catch { /* ignore */ }
    }

    // 3) assignment submission rate — denominator = teacher's published
    //    assignments for any class the student is in. Cheaper to compute as
    //    "this teacher's assignments where class_id ∈ student classes".
    let assignmentRate: StudentDetailExtras['assignmentRate'] = null;
    if (teacherId && instituteId) {
      try {
        const [studentClassesRes, enrollmentsRes] = await Promise.all([
          client.from('student_classes').select('class_id').eq('student_id', studentId),
          client.from('enrollments').select('class_id').eq('user_id', studentId).eq('status', 'active'),
        ]);
        const classIds = Array.from(new Set([
          ...((studentClassesRes.data || []) as any[]).map(r => r.class_id).filter(Boolean),
          ...((enrollmentsRes.data || []) as any[]).map(r => r.class_id).filter(Boolean),
        ])) as string[];
        if (classIds.length > 0) {
          const { data: assignments } = await client
            .from('assignments').select('id')
            .eq('teacher_id', teacherId).eq('institute_id', instituteId)
            .eq('is_published', true)
            .in('class_id', classIds).limit(500);
          const assignmentIds = (assignments || []).map((a: any) => a.id);
          let submitted = 0;
          if (assignmentIds.length > 0) {
            const { data: subs } = await client
              .from('assignment_submissions').select('id, status')
              .eq('student_id', studentId).in('assignment_id', assignmentIds)
              .limit(500);
            submitted = (subs || []).filter((s: any) =>
              s.status === 'submitted' || s.status === 'graded' || s.status === 'returned',
            ).length;
          }
          const total = assignmentIds.length;
          assignmentRate = {
            total,
            submitted,
            percentage: total > 0 ? Math.round((submitted / total) * 100) : 0,
          };
        } else {
          assignmentRate = { total: 0, submitted: 0, percentage: 0 };
        }
      } catch { /* ignore */ }
    }

    return { code, examSessions, assignmentRate };
  };

  // ── Render: Student detail ─────────────────────────────
  if (detailStudent) {
    const exams = extras?.examSessions || [];
    const gradedExams = exams.filter(e => e.score != null && e.max_score && e.max_score > 0);
    const examAvg = gradedExams.length > 0
      ? Math.round(gradedExams.reduce((sum, e) => sum + ((e.score || 0) / (e.max_score || 1) * 100), 0) / gradedExams.length)
      : null;

    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <View style={s.headerRow}>
          <TouchableOpacity
            onPress={() => { setDetailStudent(null); setAttendance(null); setGrades([]); setExtras(null); }}
            style={s.backBtn}
          >
            <Ionicons name="arrow-forward" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{detailStudent.full_name}</Text>
          <View style={{ width: 36 }} />
        </View>
        {detailLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} size="large" />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* Profile chip */}
            <View style={[s.detailCard, { alignItems: 'center', paddingVertical: 18 }]}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tokens.color.brand100, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Ionicons name="person" size={36} color={tokens.color.brand500} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '900', color: tokens.color.text }}>{detailStudent.full_name}</Text>
              {extras?.code ? (
                <Text style={{ fontSize: 12, color: tokens.color.text3, marginTop: 4, letterSpacing: 1 }}>
                  {t('teacherStudents.code', { defaultValue: 'الرمز' })}: {extras.code}
                </Text>
              ) : null}
              {selectedTarget?.subject_name ? (
                <View style={{ marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: tokens.color.brand100 }}>
                  <Text style={{ fontSize: 11, color: tokens.color.brand500, fontWeight: '700' }}>{selectedTarget.subject_name}</Text>
                </View>
              ) : null}
              {/* Quick action: write a behavior note. Routes through the
                  same behavior_notes table the institute admin reads from. */}
              <TouchableOpacity
                onPress={() => { haptics.medium(); setBehaviorSheetOpen(true); }}
                style={s.behaviorBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="document-text-outline" size={16} color={tokens.color.brand500} />
                <Text style={s.behaviorBtnText}>إضافة ملاحظة سلوكية</Text>
              </TouchableOpacity>
            </View>

            {/* Attendance */}
            <View style={s.detailCard}>
              <Text style={s.sectionTitle}>{t('student.attendance', { defaultValue: 'الحضور' })}</Text>
              {attendance ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                  <View style={s.statBox}><Text style={s.statValue}>{attendance.percentage}%</Text><Text style={s.statLabel}>{t('student.rate', { defaultValue: 'النسبة' })}</Text></View>
                  <View style={s.statBox}><Text style={[s.statValue, { color: '#059669' }]}>{attendance.present}</Text><Text style={s.statLabel}>{t('student.present', { defaultValue: 'حاضر' })}</Text></View>
                  <View style={s.statBox}><Text style={[s.statValue, { color: '#F59E0B' }]}>{attendance.late}</Text><Text style={s.statLabel}>{t('student.late', { defaultValue: 'متأخر' })}</Text></View>
                  <View style={s.statBox}><Text style={[s.statValue, { color: '#EF4444' }]}>{attendance.absent}</Text><Text style={s.statLabel}>{t('student.absent', { defaultValue: 'غائب' })}</Text></View>
                </View>
              ) : <Text style={s.emptyHint}>{t('teacherStudents.noAttendance', { defaultValue: 'لا توجد بيانات حضور' })}</Text>}
            </View>

            {/* Exams (teacher's exams only) */}
            <View style={s.detailCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={s.sectionTitle}>{t('teacherStudents.examsByMe', { defaultValue: 'امتحاناتي' })}</Text>
                {examAvg != null ? (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: tokens.color.brand100 }}>
                    <Text style={{ fontSize: 11, color: tokens.color.brand500, fontWeight: '800' }}>
                      {t('teacherStudents.avg', { defaultValue: 'المعدل' })}: {examAvg}%
                    </Text>
                  </View>
                ) : null}
              </View>
              {exams.length === 0 ? (
                <Text style={s.emptyHint}>{t('teacherStudents.noExams', { defaultValue: 'لا توجد امتحانات بعد' })}</Text>
              ) : (
                exams.slice(0, 20).map((e) => (
                  <View key={e.id} style={s.gradeRow}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.primary }}>
                      {e.score != null ? `${e.score}${e.max_score ? `/${e.max_score}` : ''}` : (e.status || '—')}
                    </Text>
                    <Text
                      style={{ flex: 1, textAlign: 'right', fontSize: 13, color: Colors.text, marginHorizontal: 10 }}
                      numberOfLines={1}
                    >
                      {e.title}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* Assignment submission rate */}
            <View style={s.detailCard}>
              <Text style={s.sectionTitle}>{t('teacherStudents.assignments', { defaultValue: 'الواجبات' })}</Text>
              {extras?.assignmentRate ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                  <View style={s.statBox}>
                    <Text style={s.statValue}>{extras.assignmentRate.percentage}%</Text>
                    <Text style={s.statLabel}>{t('teacherStudents.submissionRate', { defaultValue: 'نسبة التسليم' })}</Text>
                  </View>
                  <View style={s.statBox}>
                    <Text style={[s.statValue, { color: '#059669' }]}>{extras.assignmentRate.submitted}</Text>
                    <Text style={s.statLabel}>{t('teacherStudents.submitted', { defaultValue: 'مُسلَّم' })}</Text>
                  </View>
                  <View style={s.statBox}>
                    <Text style={[s.statValue, { color: tokens.color.text3 }]}>{extras.assignmentRate.total}</Text>
                    <Text style={s.statLabel}>{t('teacherStudents.total', { defaultValue: 'الإجمالي' })}</Text>
                  </View>
                </View>
              ) : <Text style={s.emptyHint}>{t('teacherStudents.noAssignments', { defaultValue: 'لا توجد واجبات' })}</Text>}
            </View>

            {/* Manual grades */}
            <View style={s.detailCard}>
              <Text style={s.sectionTitle}>{t('student.grades', { defaultValue: 'الدرجات' })}</Text>
              {grades.length === 0 ? (
                <Text style={s.emptyHint}>{t('teacherStudents.noGrades', { defaultValue: 'لا توجد درجات بعد' })}</Text>
              ) : (
                grades.slice(0, 20).map((g: any, i: number) => (
                  <View key={g.id || i} style={s.gradeRow}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.primary }}>
                      {g.score ?? '—'}{g.max_score ? `/${g.max_score}` : ''}
                    </Text>
                    <Text
                      style={{ flex: 1, textAlign: 'right', fontSize: 13, color: Colors.text, marginHorizontal: 10 }}
                      numberOfLines={1}
                    >
                      {g.category_name || g.subject_name || g.subject || g.description || '—'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
        {detailStudent && userInstituteId ? (
          <BehaviorNoteSheet
            visible={behaviorSheetOpen}
            onClose={() => setBehaviorSheetOpen(false)}
            studentId={detailStudent.id}
            studentName={detailStudent.full_name}
            instituteId={userInstituteId}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  // ── Render: Students list (step 3) ─────────────────────
  if (selectedTarget) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <View style={s.headerRow}>
          <TouchableOpacity
            onPress={() => {
              setSelectedTarget(null);
              setStudents([]);
              setSearchQuery('');
              // If we auto-skipped the section step (single-section class),
              // back also unwinds the class selection so we return to step 1.
              if (selectedClass && selectedClass.sections.length === 1) setSelectedClass(null);
            }}
            style={s.backBtn}
          >
            <Ionicons name="arrow-forward" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{selectedTarget.display_name}</Text>
          <View style={{ width: 36 }} />
        </View>
        {loadingStudents ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} size="large" />
        ) : (
          <>
            {students.length > 5 && (
              <View style={s.searchBar}>
                <Ionicons name="search" size={16} color={tokens.color.text3} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: tokens.color.text }}
                  placeholder={`بحث بين ${students.length} طالب...`}
                  placeholderTextColor={tokens.color.text3}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  textAlign="right"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={tokens.color.text3} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {userId && userInstituteId ? (
              <TopBottomStudents
                students={students}
                teacherId={userId}
                instituteId={userInstituteId}
                subjectName={selectedTarget.subject_name}
              />
            ) : null}
            <FlashList
              data={filteredStudents}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <Ionicons name={searchQuery ? 'search-outline' : 'people-outline'} size={56} color={tokens.color.text3} />
                  <Text style={{ fontSize: 13, color: tokens.color.text3, marginTop: 12 }}>
                    {searchQuery
                      ? `لا نتائج لـ "${searchQuery}"`
                      : t('teacherStudents.noStudents', { defaultValue: 'لا يوجد طلاب في هذه الشعبة' })}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={s.studentCard} onPress={() => openStudentDetail(item)} activeOpacity={0.7}>
                  <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
                  <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: tokens.color.text }}>{item.full_name}</Text>
                  </View>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.brand100, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={20} color={tokens.color.brand500} />
                  </View>
                </TouchableOpacity>
              )}
            />
          </>
        )}
      </SafeAreaView>
    );
  }

  // ── Render: Sections list (step 2) ─────────────────────
  if (selectedClass) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => setSelectedClass(null)} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{selectedClass.className}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={s.subhead}>
            {t('teacherStudents.pickSection', { defaultValue: 'اختر شعبة لعرض طلابها' })}
          </Text>
          {selectedClass.sections.map(tgt => (
            <TouchableOpacity
              key={tgt.assignment_id}
              style={s.classCard}
              onPress={() => loadStudentsForTarget(tgt)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
              <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: tokens.color.text }}>
                  {tgt.section_name || tgt.display_name}
                </Text>
                {tgt.subject_name ? (
                  <Text style={{ fontSize: 11, color: tokens.color.text3, marginTop: 3 }}>{tgt.subject_name}</Text>
                ) : null}
              </View>
              <View style={{ width: 44, height: 44, borderRadius: tokens.radius.md, backgroundColor: tokens.color.brand100, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="git-branch" size={20} color={tokens.color.brand500} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: Classes list (step 1, default) ─────────────
  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero
        title={t('teacherStudents.myStudents', { defaultValue: 'طلابي' })}
        subtitle={t('teacherStudents.pickClassHint', { defaultValue: 'اختر صفاً لعرض طلابه وتفاصيلهم' })}
        fallbackRoute="/(teacher)/services"
      />
      {loadingTargets ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} size="large" />
      ) : classBuckets.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title={t('teacherAITools.noAssignments', { defaultValue: 'ما عندك أي تعيين بعد' })}
          message="بمجرد ما تنعطيك صفوف من قبل الإدارة، راح تظهر هنا."
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {classBuckets.map(bucket => (
            <TouchableOpacity
              key={bucket.classKey}
              style={s.classCard}
              onPress={() => openClass(bucket)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
              <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: tokens.color.text }}>{bucket.className}</Text>
                <Text style={{ fontSize: 11, color: tokens.color.text3, marginTop: 3 }}>
                  {bucket.sections.length} {t('teacherStudents.sections', { defaultValue: 'شعبة' })}
                  {bucket.subjects.length > 0 ? ` • ${bucket.subjects.join('، ')}` : ''}
                </Text>
              </View>
              <View style={{ width: 44, height: 44, borderRadius: tokens.radius.md, backgroundColor: tokens.color.brand100, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people" size={22} color={tokens.color.brand500} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10, backgroundColor: tokens.color.surface, borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  title: { fontSize: 18, fontWeight: '900', color: tokens.color.text, flex: 1, textAlign: 'right' },
  subhead: { fontSize: 12, color: tokens.color.text3, textAlign: 'right', marginBottom: 10 },
  backBtn: { width: 36, height: 36, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface2, alignItems: 'center', justifyContent: 'center' },
  classCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: tokens.color.border },
  studentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: tokens.color.border2 },
  detailCard: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: tokens.color.border },
  behaviorBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: tokens.color.brand100, borderWidth: 1, borderColor: tokens.color.brand100 },
  behaviorBtnText: { fontSize: 12, fontWeight: '800', color: tokens.color.brand500 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: tokens.color.text, textAlign: 'right' },
  statBox: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: '900', color: tokens.color.text },
  statLabel: { fontSize: 10, color: tokens.color.text3, marginTop: 4 },
  emptyHint: { fontSize: 12, color: tokens.color.text3, textAlign: 'center', paddingVertical: 16 },
  gradeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: tokens.color.border2 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg,
    paddingHorizontal: 12, paddingVertical: 12,
    marginHorizontal: 16, marginTop: 8,
    borderWidth: 1, borderColor: tokens.color.border,
  },
});
