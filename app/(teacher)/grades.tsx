import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, ActivityIndicator, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import PrimaryButton from '../../components/teacher/buttons/PrimaryButton';
import FAB from '../../components/teacher/buttons/FAB';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';
import Stepper from '../../components/teacher/grades/Stepper';
import GradesHero from '../../components/teacher/grades/GradesHero';
import CategoryList from '../../components/teacher/grades/CategoryList';
import TargetPicker from '../../components/teacher/grades/TargetPicker';
import GradeSummaryStrip from '../../components/teacher/grades/GradeSummaryStrip';
import GradeEntryHeader from '../../components/teacher/grades/GradeEntryHeader';
import GradeMatrix from '../../components/teacher/grades/GradeMatrix';
import NewCategorySheet from '../../components/teacher/grades/sheets/NewCategorySheet';
import StudentProgressSheet from '../../components/teacher/grades/sheets/StudentProgressSheet';
import BulkPasteSheet from '../../components/teacher/grades/sheets/BulkPasteSheet';
import { useGradesController } from '../../components/teacher/grades/useGradesController';
import { searchMatch } from '../../hooks/useSmartSearch';

const GRADE_TYPE_KEYS = [
  { key: 'monthly', labelKey: 'teacherGrades.monthly', icon: 'calendar', color: tokens.color.info },
  { key: 'midterm', labelKey: 'teacherGrades.midterm', icon: 'school', color: tokens.color.warning },
  { key: 'final', labelKey: 'teacherGrades.final', icon: 'trophy', color: tokens.color.danger },
  { key: 'oral', labelKey: 'teacherGrades.oral', icon: 'mic', color: tokens.color.purple },
  { key: 'practical', labelKey: 'teacherGrades.practical', icon: 'flask', color: tokens.color.success },
  { key: 'homework', labelKey: 'teacherGrades.homework', icon: 'document-text', color: tokens.color.pink },
];

/**
 * Teacher grades — 3-stage flow:
 *   1. Pick category (e.g. "امتحان شهر نوفمبر")
 *   2. Pick the target (section + subject from teacher_assignments)
 *   3. Fill scores for each student in that section; save bulk + publish
 *
 * Targets come from teacher_assignments — NOT from the generic `classes` list,
 * because a teacher may only teach one subject in a class and grades must be
 * scoped to that subject. State, effects, and Supabase calls live in
 * `useGradesController` so this file stays orchestration-only.
 */
export default function TeacherGrades() {
  const { t } = useTranslation();
  const c = useGradesController();
  const GRADE_TYPES = GRADE_TYPE_KEYS.map(gt => ({ ...gt, label: t(gt.labelKey) }));

  // Bulk-paste sheet — opt-in shortcut for teachers entering many grades from
  // Excel/Sheets. Pre-fills the matrix; the regular Save button still runs.
  const [bulkPasteOpen, setBulkPasteOpen] = React.useState(false);

  // Stage 1 = pick category, Stage 2 = pick target + enter scores, Stage 3 = confirm publish
  const currentStage: 1 | 2 | 3 = !c.selectedCat ? 1 : 2;

  // ═══════════════════════════════════════════════════════════════
  // Stage 2: category picked → target picker + students grid
  // ═══════════════════════════════════════════════════════════════
  if (c.selectedCat) {
    // Filter students by search query
    const filteredStudents = c.students.filter((stu: any) => {
      if (!c.searchQuery.trim()) return true;
      return searchMatch(stu.full_name || stu.name, c.searchQuery);
    });

    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <GradeEntryHeader
            categoryName={c.selectedCat.name}
            maxScore={c.selectedCat.max_score}
            onBack={c.exitStageTwo}
          />

          <Stepper stage={currentStage} />

          <TargetPicker
            searchQuery={c.searchQuery}
            onSearchChange={c.setSearchQuery}
            targets={c.targets}
            targetKey={c.targetKey}
            onTargetSelect={c.setTargetKey}
          />

          {/* Live summary strip — filled count + average + publish status */}
          {c.selectedTarget && c.students.length > 0 && (
            <GradeSummaryStrip
              filledCount={c.filledCount}
              totalStudents={c.students.length}
              avgScore={c.avgScore}
              isPublished={c.isPublished}
              publishing={c.publishing}
              onTogglePublish={c.handlePublish}
            />
          )}

          {/* Bulk paste shortcut — only useful once a target with students is loaded. */}
          {c.selectedTarget && c.students.length > 0 && (
            <TouchableOpacity
              onPress={() => setBulkPasteOpen(true)}
              activeOpacity={0.85}
              style={s.bulkPasteBtn}
            >
              <Ionicons name="clipboard-outline" size={14} color={tokens.color.brand500} />
              <Text style={s.bulkPasteText}>إدخال درجات بالجملة (Excel)</Text>
            </TouchableOpacity>
          )}

          <GradeMatrix
            loading={c.loadingStudents}
            hasTarget={!!c.selectedTarget}
            students={filteredStudents}
            searchQuery={c.searchQuery}
            gradeEntries={c.gradeEntries}
            focusedStudentId={c.focusedStudentId}
            maxScore={c.selectedCat.max_score}
            scoreBorderColor={c.scoreBorderColor}
            onChangeEntry={c.setEntry}
            onFocusStudent={c.setFocusedStudentId}
            onOpenProgress={c.setProgressStudent}
          />

          {/* Save sticky button — full-width PrimaryButton.
              Label shifts when there's nothing to save so the disabled state
              reads as a hint, not a dead button. */}
          {c.students.length > 0 && c.selectedTarget && (
            <View style={s.bottomBar}>
              <PrimaryButton
                label={c.filledCount === 0
                  ? 'أدخل درجات الطلاب أولاً'
                  : `حفظ ${c.filledCount} درجة`}
                onPress={c.handleSaveAllGrades}
                loading={c.saving}
                disabled={c.saving || c.filledCount === 0}
                gradient="success"
                icon="checkmark-circle"
                fullWidth
              />
            </View>
          )}
        </KeyboardAvoidingView>

        <StudentProgressSheet
          student={c.progressStudent}
          onClose={() => c.setProgressStudent(null)}
        />

        {c.selectedCat && (
          <BulkPasteSheet
            visible={bulkPasteOpen}
            onClose={() => setBulkPasteOpen(false)}
            students={c.students.map((s: any) => ({ id: s.id, full_name: s.full_name || s.name }))}
            maxScore={c.selectedCat.max_score}
            onApply={c.setEntry}
          />
        )}

        <ConfirmSheet
          visible={c.confirmState.visible}
          title={c.confirmState.title}
          message={c.confirmState.message}
          confirmLabel={c.confirmState.confirmLabel}
          destructive={c.confirmState.destructive}
          onConfirm={c.confirmState.onConfirm}
          onClose={c.closeConfirm}
        />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Stage 1: Categories list
  // ═══════════════════════════════════════════════════════════════
  if (c.loading) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <TeacherInnerHero title={t('teacherGrades.enterGrades')} fallbackRoute="/(teacher)/services" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={tokens.color.brand500} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TeacherInnerHero title={t('teacherGrades.enterGrades')} fallbackRoute="/(teacher)/services" />

      <Stepper stage={1} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={c.refreshing} onRefresh={c.onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <GradesHero targets={c.targets} categoryCount={c.categories.length} />

        <CategoryList
          categories={c.categories}
          gradeTypes={GRADE_TYPES}
          onPickCategory={c.setSelectedCat}
          onAddCategory={() => c.setShowNewCat(true)}
        />
      </ScrollView>

      {/* FAB on stage 1 only */}
      <FAB
        icon="add"
        gradient="brand"
        onPress={() => c.setShowNewCat(true)}
        accessibilityLabel="فئة تقييم جديدة"
      />

      <NewCategorySheet
        visible={c.showNewCat}
        onClose={() => c.setShowNewCat(false)}
        name={c.newCatName}
        onNameChange={c.setNewCatName}
        type={c.newCatType}
        onTypeChange={c.setNewCatType}
        maxScore={c.newCatMax}
        onMaxScoreChange={c.setNewCatMax}
        gradeTypes={GRADE_TYPES}
        creating={c.creatingCat}
        onCreate={c.handleCreateCategory}
      />

      <ConfirmSheet
        visible={c.confirmState.visible}
        title={c.confirmState.title}
        message={c.confirmState.message}
        confirmLabel={c.confirmState.confirmLabel}
        destructive={c.confirmState.destructive}
        onConfirm={c.confirmState.onConfirm}
        onClose={c.closeConfirm}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: tokens.color.surface,
    borderTopWidth: 1, borderTopColor: tokens.color.border2,
  },
  bulkPasteBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: tokens.color.brand100,
    borderWidth: 1,
    borderColor: tokens.color.brand100,
  },
  bulkPasteText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.color.brand500,
  },
});
