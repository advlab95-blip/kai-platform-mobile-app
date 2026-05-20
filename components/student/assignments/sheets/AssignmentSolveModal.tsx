// AssignmentSolveModal — full-screen Modal for solving a structured assignment (MCQ / TF / text).
// Pure controlled view: parent owns answers, current index, save logic, submit logic.

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../../constants/designTokens';
import { haptics } from '../../../../utils/haptics';
import PrimaryButton from '../../../teacher/buttons/PrimaryButton';

type Props = {
  visible: boolean;
  assignment: any;
  questions: any[];
  answers: Record<string, string>;
  currentQIndex: number;
  saveError: boolean;
  submitting: boolean;
  onClose: () => void;
  onChangeAnswer: (questionId: string, answer: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
};

export default function AssignmentSolveModal({
  visible,
  assignment,
  questions,
  answers,
  currentQIndex,
  saveError,
  submitting,
  onClose,
  onChangeAnswer,
  onPrev,
  onNext,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const q = questions[currentQIndex];
  const opts = q?.options?.choices || (q?.type === 'true_false' ? ['صح', 'خطأ'] : []);

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.solveHeader}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel={t('common.close', { defaultValue: 'إغلاق' })}
            >
              <Ionicons name="close" size={22} color={tokens.color.text} />
            </TouchableOpacity>
            <Text style={[styles.solveTitle, { flex: 1, marginHorizontal: 10 }]} numberOfLines={1}>{assignment?.title}</Text>
            <Text style={styles.progressCounter}>{currentQIndex + 1}/{questions.length}</Text>
          </View>

          {saveError && (
            <View style={styles.saveErrorBanner}>
              <Ionicons name="cloud-offline-outline" size={18} color={tokens.color.danger} />
              <Text style={styles.saveErrorText}>
                {t('student.assignmentSaveFailed', { defaultValue: 'فشل حفظ الإجابة في السيرفر — إجابتك محفوظة محلياً، تأكد من الاتصال' })}
              </Text>
            </View>
          )}

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
            {q && (
              <View>
                <View style={styles.questionCard}>
                  <Text style={styles.questionNum}>{t('student.questionNumber', { number: currentQIndex + 1 })}</Text>
                  <Text style={styles.questionText}>{q.content}</Text>
                  <Text style={styles.questionPoints}>{t('student.pointsLabel', { points: q.points })}</Text>
                </View>

                {/* MCQ / True-False */}
                {(q.type === 'mcq' || q.type === 'true_false') && opts.map((opt: string, i: number) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.optionBtn, answers[q.id] === opt && styles.optionSelected]}
                    onPress={() => { haptics.selection(); onChangeAnswer(q.id, opt); }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.optionRadio, answers[q.id] === opt && styles.optionRadioSelected]} />
                    <Text style={[styles.optionText, answers[q.id] === opt && { color: tokens.color.teal700, fontWeight: tokens.font.weight.heavy }]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* Short answer / Essay / Fill blank */}
                {['short_answer', 'essay', 'fill_blank'].includes(q.type) && (
                  <TextInput
                    style={[styles.answerInput, q.type === 'essay' && { height: 120 }]}
                    value={answers[q.id] || ''}
                    onChangeText={(text) => onChangeAnswer(q.id, text)}
                    placeholder={t('student.writeYourAnswer')}
                    placeholderTextColor={tokens.color.text3}
                    textAlign="right"
                    multiline={q.type === 'essay'}
                  />
                )}
              </View>
            )}
          </ScrollView>

          {/* Navigation */}
          <View style={styles.navBar}>
            <TouchableOpacity
              style={[styles.navBtn, currentQIndex === 0 && { opacity: 0.3 }]}
              onPress={onPrev}
              disabled={currentQIndex === 0}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-forward" size={20} color={tokens.color.teal700} />
              <Text style={styles.navBtnText}>{t('student.previousBtn')}</Text>
            </TouchableOpacity>

            {currentQIndex === questions.length - 1 ? (
              <PrimaryButton
                label={t('student.submitBtn')}
                onPress={onSubmit}
                icon="checkmark-done"
                gradient="success"
                loading={submitting}
              />
            ) : (
              <TouchableOpacity
                style={styles.navBtn}
                onPress={onNext}
                activeOpacity={0.85}
              >
                <Text style={styles.navBtnText}>{t('student.nextBtn')}</Text>
                <Ionicons name="arrow-back" size={20} color={tokens.color.teal700} />
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  solveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  solveTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  progressCounter: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text3,
    minWidth: 40,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  saveErrorBanner: {
    backgroundColor: tokens.color.dangerBg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveErrorText: {
    flex: 1,
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  questionCard: {
    backgroundColor: tokens.color.teal50,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[5],
    marginBottom: 20,
    borderWidth: 1,
    borderColor: tokens.color.teal100,
  },
  questionNum: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.teal700,
    marginBottom: 8,
  },
  questionText: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    lineHeight: 26,
    writingDirection: 'rtl',
  },
  questionPoints: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.teal600,
    textAlign: 'right',
    marginTop: 6,
    fontWeight: tokens.font.weight.bold,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    gap: 12,
  },
  optionSelected: {
    borderColor: tokens.color.teal600,
    backgroundColor: tokens.color.teal50,
  },
  optionRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2,
    borderColor: tokens.color.surface3,
  },
  optionRadioSelected: {
    borderColor: tokens.color.teal600,
    backgroundColor: tokens.color.teal600,
  },
  optionText: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  answerInput: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlignVertical: 'top',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 10,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.teal50,
    borderWidth: 1,
    borderColor: tokens.color.teal100,
  },
  navBtnText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.teal700,
  },
});
