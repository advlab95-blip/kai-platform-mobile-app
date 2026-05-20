import React, { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import ExamCreateSheet from '../content/sheets/ExamCreateSheet';
import { QUESTION_TYPE_KEYS, type QuestionType } from '../content/_helpers';
import useAuthStore from '../../../stores/authStore';
import useDataStore from '../../../stores/dataStore';
import useTeacherStore from '../../../stores/teacherStore';
import { api } from '../../../services/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

/**
 * Wraps ExamCreateSheet with all the state + handlers needed to create an exam
 * from the teacher exams screen. Mirrors content.tsx logic so the manual flow
 * stays consistent — same field shapes, same per-target loop, same RPC.
 */
export default function ManualExamCreator({ visible, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { selectedTargets, loadExams } = useTeacherStore();

  const QUESTION_TYPES = QUESTION_TYPE_KEYS.map((qt) => ({ ...qt, label: t(qt.labelKey) }));

  const [examStep, setExamStep] = useState(1);
  const [examTitle, setExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('30');
  const [examQuestions, setExamQuestions] = useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentQuestionType, setCurrentQuestionType] = useState<QuestionType>('mcq');
  const [currentPoints, setCurrentPoints] = useState('5');
  const [currentOptions, setCurrentOptions] = useState(['', '', '', '']);
  const [currentCorrectIndex, setCurrentCorrectIndex] = useState(0);
  const [currentCorrectAnswer, setCurrentCorrectAnswer] = useState('');
  const [currentModelAnswer, setCurrentModelAnswer] = useState('');
  const [currentRubric, setCurrentRubric] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setExamStep(1);
    setExamTitle('');
    setExamDuration('30');
    setExamQuestions([]);
    setCurrentQuestion('');
    setCurrentQuestionType('mcq');
    setCurrentPoints('5');
    setCurrentOptions(['', '', '', '']);
    setCurrentCorrectIndex(0);
    setCurrentCorrectAnswer('');
    setCurrentModelAnswer('');
    setCurrentRubric('');
  }, []);

  const handleAddQuestion = () => {
    if (!currentQuestion.trim()) {
      Alert.alert(t('common.error'), 'اكتب نص السؤال أولاً');
      return;
    }
    const q: any = {
      id: Date.now().toString(),
      content: currentQuestion,
      type: currentQuestionType,
      points: currentPoints.trim() === '' ? 5 : (parseInt(currentPoints) >= 0 ? parseInt(currentPoints) : 5),
    };
    if (currentQuestionType === 'mcq') {
      if (currentOptions.some((o) => !o.trim())) {
        Alert.alert(t('common.error'), 'املأ كل الخيارات الأربعة');
        return;
      }
      q.options = [...currentOptions];
      q.correctIndex = currentCorrectIndex;
    }
    if (currentQuestionType === 'tf') {
      q.correctAnswer = currentCorrectIndex === 0;
    }
    if (currentQuestionType === 'short' || currentQuestionType === 'fill') {
      if (!currentCorrectAnswer.trim()) {
        Alert.alert(t('common.error'), 'أدخل الإجابة الصحيحة');
        return;
      }
      q.correctAnswer = currentCorrectAnswer.trim();
    }
    if (currentQuestionType === 'essay') {
      q.rubric = currentRubric.trim() || '';
      q.modelAnswer = currentModelAnswer.trim() || '';
    }
    setExamQuestions([...examQuestions, q]);
    setCurrentQuestion('');
    setCurrentOptions(['', '', '', '']);
    setCurrentCorrectIndex(0);
    setCurrentCorrectAnswer('');
    setCurrentModelAnswer('');
    setCurrentRubric('');
    setCurrentPoints('5');
  };

  const handleCreate = async () => {
    if (!examTitle.trim() || examQuestions.length === 0) {
      Alert.alert(t('common.error'), 'أدخل العنوان وأضف سؤالاً واحداً على الأقل');
      return;
    }
    if (!userId || !userInstituteId) {
      Alert.alert(t('common.error'), 'جلسة الأستاذ غير مكتملة — أعد تسجيل الدخول.');
      return;
    }
    if (selectedTargets.length === 0) {
      Alert.alert(t('common.error'), 'اختر صف/شعبة واحدة على الأقل قبل الحفظ.');
      return;
    }
    setSaving(true);
    try {
      const totalPoints = examQuestions.reduce((sum: number, q: any) => sum + (q.points || 0), 0);
      const duration = parseInt(examDuration);
      for (const tgt of selectedTargets) {
        await api.createExam(
          examTitle, userId, tgt.classId || '', userInstituteId,
          examQuestions, totalPoints, isNaN(duration) ? 30 : duration,
          'draft', tgt.sectionId || null, tgt.subjectId || null,
        );
      }
      Alert.alert(t('common.success'), 'تم إنشاء الامتحان — افتحه ثم فعّل النشر للطلاب');
      reset();
      onClose();
      if (userId) {
        try { await loadExams(userId); } catch {}
      }
      onCreated?.();
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل إنشاء الامتحان');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ExamCreateSheet
      visible={visible}
      onClose={() => { reset(); onClose(); }}
      examStep={examStep}
      setExamStep={setExamStep}
      examTitle={examTitle}
      setExamTitle={setExamTitle}
      examDuration={examDuration}
      setExamDuration={setExamDuration}
      questionTypes={QUESTION_TYPES}
      currentQuestion={currentQuestion}
      setCurrentQuestion={setCurrentQuestion}
      currentQuestionType={currentQuestionType}
      setCurrentQuestionType={setCurrentQuestionType}
      currentPoints={currentPoints}
      setCurrentPoints={setCurrentPoints}
      currentOptions={currentOptions}
      setCurrentOptions={setCurrentOptions}
      currentCorrectIndex={currentCorrectIndex}
      setCurrentCorrectIndex={setCurrentCorrectIndex}
      currentCorrectAnswer={currentCorrectAnswer}
      setCurrentCorrectAnswer={setCurrentCorrectAnswer}
      currentModelAnswer={currentModelAnswer}
      setCurrentModelAnswer={setCurrentModelAnswer}
      currentRubric={currentRubric}
      setCurrentRubric={setCurrentRubric}
      examQuestions={examQuestions}
      setExamQuestions={setExamQuestions}
      onAddQuestion={handleAddQuestion}
      onCreate={handleCreate}
      saving={saving}
      onValidateStep1={() => {
        if (!examTitle.trim()) { Alert.alert(t('common.error'), 'أدخل عنوان الامتحان'); return; }
        if (selectedTargets.length === 0) { Alert.alert(t('common.error'), 'اختر صف/شعبة قبل المتابعة'); return; }
        setExamStep(2);
      }}
      onValidateStep2={() => {
        if (examQuestions.length === 0) { Alert.alert(t('common.error'), 'أضف سؤالاً واحداً على الأقل'); return; }
        setExamStep(3);
      }}
    />
  );
}
