// AssignmentSheet — hierarchical picker for assigning a teacher to teach a
// subject in a class. Replaces the flat side-by-side dropdowns previously
// inlined into (institute)/users.tsx and (admin)/users.tsx UserDetailSheet.
//
// Flow for schools:   stage → grade → section → subject → confirm
// Flow for institutes: class → subject → confirm   (no stage/grade hierarchy)
//
// The component is purely presentational + local-state driven. The parent
// passes the school structure and gets back a single picked assignment on
// confirm. Server-side authorization is enforced inside api.setTeacherAssignments
// → assertCallerCanAdminInstitute, so no extra gate here.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../shared/SwipeableSheet';
import EmptyState from '../../shared/EmptyState';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import { LinearGradient } from 'expo-linear-gradient';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Public picked-shape — what parent receives when user confirms.
export interface PickedAssignment {
  subjectId: string;
  subjectName: string;
  // For schools: section_id is the canonical pick. grade/stage are kept
  // for breadcrumb labelling in the parent's list.
  sectionId?: string;
  sectionName?: string;
  gradeId?: string;
  gradeName?: string;
  stageId?: string;
  stageName?: string;
  // For institutes: class_id is the pick. className is the display.
  classId?: string;
  className?: string;
}

interface Stage { id: string; name: string; }
interface Grade { id: string; name: string; stage_id: string; }
interface Section { id: string; name: string; grade_id: string; }
interface Subject { id: string; name: string; }
interface Class { id: string; name: string; }

export interface AssignmentSheetProps {
  visible: boolean;
  onClose: () => void;
  onPicked: (picked: PickedAssignment) => void;
  /** 'school' enables stage→grade→section path; 'institute' uses flat class path. */
  instituteType: 'school' | 'institute';
  // School structure (only used when instituteType==='school')
  stages?: Stage[];
  grades?: Grade[];
  sections?: Section[];
  // Always used
  subjects: Subject[];
  // Institute structure (only used when instituteType==='institute')
  classes?: Class[];
  // Optional teacher label rendered at the top so admin always sees who they're assigning.
  teacherName?: string | null;
  /** Loading flag — when true we render skeleton instead of pickers. */
  loading?: boolean;
}

type Step = 'stage' | 'grade' | 'section' | 'subject' | 'class' | 'confirm';

export default function AssignmentSheet({
  visible,
  onClose,
  onPicked,
  instituteType,
  stages = [],
  grades = [],
  sections = [],
  subjects,
  classes = [],
  teacherName,
  loading = false,
}: AssignmentSheetProps) {
  // For schools: first step depends on how many stages exist. With 0 stages we
  // skip straight to the empty state. With exactly 1 stage we auto-select it
  // and start at grade. Otherwise admin picks.
  const initialStep: Step = instituteType === 'institute' ? 'class' : 'stage';

  const [step, setStep] = useState<Step>(initialStep);
  const [stage, setStage] = useState<Stage | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [klass, setKlass] = useState<Class | null>(null);

  // Reset internal state every time the sheet opens. Without this the second
  // open would show stale selections from the previous run.
  // Note: we depend on `visible` only — re-resetting on every stages array
  // identity change would clobber mid-flow selections (parents that pass
  // `arr || []` create a fresh empty array on every render).
  const stagesCount = stages.length;
  const firstStage = stages[0];
  useEffect(() => {
    if (!visible) return;
    setStage(null);
    setGrade(null);
    setSection(null);
    setSubject(null);
    setKlass(null);
    if (instituteType === 'institute') {
      setStep('class');
      return;
    }
    // Schools: auto-skip stage step when there's exactly one stage so admin
    // doesn't tap through a meaningless single-chip screen.
    if (stagesCount === 1 && firstStage) {
      setStage(firstStage);
      setStep('grade');
    } else {
      setStep('stage');
    }
    // We intentionally exclude `firstStage` (object identity) — only react
    // when the sheet opens / closes or the institute type flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, instituteType, stagesCount]);

  // Derived lists for the current step.
  const gradesForStage = useMemo(
    () => (stage ? grades.filter(g => g.stage_id === stage.id) : []),
    [grades, stage],
  );
  const sectionsForGrade = useMemo(
    () => (grade ? sections.filter(s => s.grade_id === grade.id) : []),
    [sections, grade],
  );

  // Breadcrumb path — only shows already-picked items so admin can see context.
  const breadcrumb = useMemo(() => {
    const parts: string[] = [];
    if (instituteType === 'school') {
      if (stage) parts.push(stage.name);
      if (grade) parts.push(grade.name);
      if (section) parts.push(section.name);
    } else {
      if (klass) parts.push(klass.name);
    }
    if (subject) parts.push(subject.name);
    return parts;
  }, [instituteType, stage, grade, section, klass, subject]);

  // Step navigation. goBack pops one level; cannot go back past the first step.
  const goBack = useCallback(() => {
    haptics.light();
    if (instituteType === 'institute') {
      // class → subject → confirm
      if (step === 'subject') { setSubject(null); setStep('class'); return; }
      if (step === 'confirm') { setStep('subject'); return; }
      return; // class is the first step
    }
    if (step === 'grade') { setGrade(null); setSection(null); setStep('stage'); return; }
    if (step === 'section') { setSection(null); setStep('grade'); return; }
    if (step === 'subject') { setSubject(null); setStep('section'); return; }
    if (step === 'confirm') { setStep('subject'); return; }
  }, [step, instituteType]);

  const canGoBack = instituteType === 'institute'
    ? step !== 'class'
    : step !== 'stage' && !(step === 'grade' && stages.length === 1);

  const handlePickStage = (s: Stage) => {
    haptics.selection();
    setStage(s);
    setGrade(null);
    setSection(null);
    setStep('grade');
  };
  const handlePickGrade = (g: Grade) => {
    haptics.selection();
    setGrade(g);
    setSection(null);
    setStep('section');
  };
  const handlePickSection = (s: Section) => {
    haptics.selection();
    setSection(s);
    setStep('subject');
  };
  const handlePickClass = (c: Class) => {
    haptics.selection();
    setKlass(c);
    setStep('subject');
  };
  const handlePickSubject = (s: Subject) => {
    haptics.selection();
    setSubject(s);
    setStep('confirm');
  };

  const handleConfirm = useCallback(() => {
    if (!subject) return;
    if (instituteType === 'school') {
      if (!stage || !grade || !section) return;
      haptics.medium();
      onPicked({
        subjectId: subject.id,
        subjectName: subject.name,
        sectionId: section.id,
        sectionName: section.name,
        gradeId: grade.id,
        gradeName: grade.name,
        stageId: stage.id,
        stageName: stage.name,
      });
    } else {
      if (!klass) return;
      haptics.medium();
      onPicked({
        subjectId: subject.id,
        subjectName: subject.name,
        classId: klass.id,
        className: klass.name,
      });
    }
    onClose();
  }, [subject, stage, grade, section, klass, instituteType, onPicked, onClose]);

  // Step title shown in the header — kept short so it fits one line in RTL.
  const stepTitle = (() => {
    switch (step) {
      case 'stage': return 'اختر المرحلة';
      case 'grade': return 'اختر الصف';
      case 'section': return 'اختر الشعبة';
      case 'class': return 'اختر الكروب';
      case 'subject': return 'اختر المادة';
      case 'confirm': return 'تأكيد التعيين';
    }
  })();

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.9}>
      <View style={[s.sheet, { minHeight: SCREEN_HEIGHT * 0.55 }]}>
        {/* Header — back chevron + title + close */}
        <View style={s.header}>
          {canGoBack ? (
            <TouchableOpacity onPress={goBack} style={s.headerBtn} accessibilityLabel="رجوع">
              <Ionicons name="chevron-forward" size={22} color={tokens.color.text} />
            </TouchableOpacity>
          ) : (
            <View style={s.headerBtn} />
          )}
          <Text style={s.headerTitle} numberOfLines={1}>{stepTitle}</Text>
          <TouchableOpacity onPress={onClose} style={s.headerBtn} accessibilityLabel="إغلاق">
            <Ionicons name="close" size={22} color={tokens.color.text} />
          </TouchableOpacity>
        </View>

        {/* Teacher banner — always visible so admin can't lose track of who they're editing */}
        {teacherName ? (
          <View style={s.teacherBanner}>
            <Ionicons name="school" size={16} color={tokens.color.brand600} />
            <Text style={s.teacherName} numberOfLines={1}>{teacherName}</Text>
          </View>
        ) : null}

        {/* Breadcrumb — shows the chain so admin always knows context */}
        {breadcrumb.length > 0 ? (
          <View style={s.breadcrumb}>
            {breadcrumb.map((label, i) => (
              <React.Fragment key={`${label}-${i}`}>
                <View style={s.crumbPill}>
                  <Text style={s.crumbText} numberOfLines={1}>{label}</Text>
                </View>
                {i < breadcrumb.length - 1 ? (
                  <Ionicons name="chevron-back" size={14} color={tokens.color.text3} />
                ) : null}
              </React.Fragment>
            ))}
          </View>
        ) : null}

        {/* Body — step-specific content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: tokens.spacing[4], paddingBottom: tokens.spacing[8] }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={{ paddingVertical: tokens.spacing[8] }}>
              <ActivityIndicator size="large" color={tokens.color.brand600} />
            </View>
          ) : (
            <StepBody
              step={step}
              instituteType={instituteType}
              stages={stages}
              gradesForStage={gradesForStage}
              sectionsForGrade={sectionsForGrade}
              subjects={subjects}
              classes={classes}
              picked={{ stage, grade, section, klass, subject }}
              onPickStage={handlePickStage}
              onPickGrade={handlePickGrade}
              onPickSection={handlePickSection}
              onPickClass={handlePickClass}
              onPickSubject={handlePickSubject}
              onConfirm={handleConfirm}
            />
          )}
        </ScrollView>
      </View>
    </SwipeableSheet>
  );
}

// ─── Step body ─────────────────────────────────────────────────────────────
// Pulled out into its own component to keep the parent file readable. It
// renders only the chips/list for the active step plus the confirm CTA.

interface StepBodyProps {
  step: Step;
  instituteType: 'school' | 'institute';
  stages: Stage[];
  gradesForStage: Grade[];
  sectionsForGrade: Section[];
  subjects: Subject[];
  classes: Class[];
  picked: {
    stage: Stage | null;
    grade: Grade | null;
    section: Section | null;
    klass: Class | null;
    subject: Subject | null;
  };
  onPickStage: (s: Stage) => void;
  onPickGrade: (g: Grade) => void;
  onPickSection: (sec: Section) => void;
  onPickClass: (c: Class) => void;
  onPickSubject: (sub: Subject) => void;
  onConfirm: () => void;
}

function StepBody({
  step,
  instituteType,
  stages,
  gradesForStage,
  sectionsForGrade,
  subjects,
  classes,
  picked,
  onPickStage,
  onPickGrade,
  onPickSection,
  onPickClass,
  onPickSubject,
  onConfirm,
}: StepBodyProps) {
  if (step === 'stage') {
    if (stages.length === 0) {
      return (
        <EmptyState
          icon="layers-outline"
          title="لا توجد مراحل دراسية"
          message="أضف المراحل أولاً من إعدادات إدارة الصفوف"
        />
      );
    }
    return <PickList items={stages.map(s => ({ id: s.id, label: s.name, raw: s }))} onPick={(it) => onPickStage(it.raw as Stage)} icon="layers" />;
  }

  if (step === 'grade') {
    if (gradesForStage.length === 0) {
      return (
        <EmptyState
          icon="school-outline"
          title="لا توجد صفوف في هذه المرحلة"
          message="ارجع للخلف واختر مرحلة أخرى، أو أضف صفوفاً من إعدادات إدارة الصفوف"
        />
      );
    }
    return <PickList items={gradesForStage.map(g => ({ id: g.id, label: g.name, raw: g }))} onPick={(it) => onPickGrade(it.raw as Grade)} icon="school" />;
  }

  if (step === 'section') {
    if (sectionsForGrade.length === 0) {
      return (
        <EmptyState
          icon="grid-outline"
          title="لا توجد شعب في هذا الصف"
          message="ارجع للخلف واختر صفاً آخر، أو أضف شعبة من إعدادات إدارة الصفوف"
        />
      );
    }
    return <PickList items={sectionsForGrade.map(sec => ({ id: sec.id, label: sec.name, raw: sec }))} onPick={(it) => onPickSection(it.raw as Section)} icon="grid" />;
  }

  if (step === 'class') {
    if (classes.length === 0) {
      return (
        <EmptyState
          icon="people-outline"
          title="لا توجد كروبات"
          message="أضف كروبات أولاً من إعدادات إدارة الصفوف"
        />
      );
    }
    return <PickList items={classes.map(c => ({ id: c.id, label: c.name, raw: c }))} onPick={(it) => onPickClass(it.raw as Class)} icon="people" />;
  }

  if (step === 'subject') {
    if (subjects.length === 0) {
      return (
        <EmptyState
          icon="book-outline"
          title="لا توجد مواد"
          message="أضف المواد أولاً من إعدادات إدارة الصفوف"
        />
      );
    }
    return <PickList items={subjects.map(sub => ({ id: sub.id, label: sub.name, raw: sub }))} onPick={(it) => onPickSubject(it.raw as Subject)} icon="book" />;
  }

  // Confirm
  const summaryLines: Array<{ label: string; value: string; icon: keyof typeof Ionicons.glyphMap }> = [];
  if (instituteType === 'school') {
    if (picked.stage) summaryLines.push({ label: 'المرحلة', value: picked.stage.name, icon: 'layers' });
    if (picked.grade) summaryLines.push({ label: 'الصف', value: picked.grade.name, icon: 'school' });
    if (picked.section) summaryLines.push({ label: 'الشعبة', value: picked.section.name, icon: 'grid' });
  } else {
    if (picked.klass) summaryLines.push({ label: 'الكروب', value: picked.klass.name, icon: 'people' });
  }
  if (picked.subject) summaryLines.push({ label: 'المادة', value: picked.subject.name, icon: 'book' });

  return (
    <View style={{ gap: tokens.spacing[3] }}>
      <Text style={s.confirmTitle}>هل التعيين التالي صحيح؟</Text>
      <View style={s.confirmCard}>
        {summaryLines.map((line) => (
          <View key={line.label} style={s.confirmRow}>
            <View style={s.confirmIcon}>
              <Ionicons name={line.icon} size={18} color={tokens.color.brand600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.confirmLabel}>{line.label}</Text>
              <Text style={s.confirmValue} numberOfLines={2}>{line.value}</Text>
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity onPress={onConfirm} activeOpacity={0.85}>
        <LinearGradient
          colors={tokens.gradient.brand as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.confirmBtn}
        >
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={s.confirmBtnText}>تأكيد التعيين</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── PickList ──────────────────────────────────────────────────────────────
// Vertical list of selectable rows — shared across stage/grade/section/subject/class.
// Single source of styling so steps stay visually consistent.

interface PickItem { id: string; label: string; raw: any; }
function PickList({ items, onPick, icon }: { items: PickItem[]; onPick: (it: PickItem) => void; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={{ gap: tokens.spacing[2] }}>
      {items.map((it) => (
        <TouchableOpacity
          key={it.id}
          onPress={() => onPick(it)}
          activeOpacity={0.85}
          style={s.row}
          accessibilityRole="button"
          accessibilityLabel={it.label}
        >
          <View style={s.rowIcon}>
            <Ionicons name={icon} size={18} color={tokens.color.brand600} />
          </View>
          <Text style={s.rowLabel} numberOfLines={2}>{it.label}</Text>
          <Ionicons name="chevron-back" size={20} color={tokens.color.text3} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sheet: {
    backgroundColor: tokens.color.bg,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: tokens.radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface2,
  },
  headerTitle: {
    flex: 1,
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'center',
  },
  teacherBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: tokens.spacing[2],
    marginHorizontal: tokens.spacing[4],
    marginTop: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.brand50,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.brand100,
  },
  teacherName: {
    flex: 1,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.brand700,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  breadcrumb: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacing[1],
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[3],
  },
  crumbPill: {
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
    backgroundColor: tokens.color.brand100,
    borderRadius: tokens.radius.pill,
  },
  crumbText: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.brand700,
    writingDirection: 'rtl',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[4],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: tokens.radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.brand50,
  },
  rowLabel: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  confirmTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: tokens.spacing[2],
  },
  confirmCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing[4],
    gap: tokens.spacing[3],
  },
  confirmRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: tokens.spacing[3],
  },
  confirmIcon: {
    width: 36, height: 36, borderRadius: tokens.radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.brand50,
  },
  confirmLabel: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  confirmValue: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing[2],
    paddingVertical: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    ...tokens.shadow.brand,
  },
  confirmBtnText: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: '#fff',
    writingDirection: 'rtl',
  },
});
