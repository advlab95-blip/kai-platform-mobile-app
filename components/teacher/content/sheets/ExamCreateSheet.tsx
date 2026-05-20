import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';
import TargetsPicker from '../../../shared/TargetsPicker';
import { styles } from '../styles';
import type { QuestionType } from '../_helpers';

export interface QuestionTypeItem {
  key: QuestionType;
  label: string;
}

export interface ExamCreateSheetProps {
  visible: boolean;
  onClose: () => void;

  examStep: number;
  setExamStep: (n: number) => void;

  examTitle: string;
  setExamTitle: (v: string) => void;

  examDuration: string;
  setExamDuration: (v: string) => void;

  questionTypes: QuestionTypeItem[];
  currentQuestion: string;
  setCurrentQuestion: (v: string) => void;
  currentQuestionType: QuestionType;
  setCurrentQuestionType: (v: QuestionType) => void;
  currentPoints: string;
  setCurrentPoints: (v: string) => void;

  currentOptions: string[];
  setCurrentOptions: (v: string[]) => void;
  currentCorrectIndex: number;
  setCurrentCorrectIndex: (v: number) => void;

  currentCorrectAnswer: string;
  setCurrentCorrectAnswer: (v: string) => void;

  currentModelAnswer: string;
  setCurrentModelAnswer: (v: string) => void;

  currentRubric: string;
  setCurrentRubric: (v: string) => void;

  examQuestions: any[];
  setExamQuestions: (v: any[]) => void;

  onAddQuestion: () => void;
  onCreate: () => void;
  saving: boolean;
  onValidateStep1: () => void;
  onValidateStep2: () => void;
}

export default function ExamCreateSheet(props: ExamCreateSheetProps) {
  const { t } = useTranslation();
  const {
    visible,
    onClose,
    examStep,
    setExamStep,
    examTitle,
    setExamTitle,
    examDuration,
    setExamDuration,
    questionTypes,
    currentQuestion,
    setCurrentQuestion,
    currentQuestionType,
    setCurrentQuestionType,
    currentPoints,
    setCurrentPoints,
    currentOptions,
    setCurrentOptions,
    currentCorrectIndex,
    setCurrentCorrectIndex,
    currentCorrectAnswer,
    setCurrentCorrectAnswer,
    currentModelAnswer,
    setCurrentModelAnswer,
    currentRubric,
    setCurrentRubric,
    examQuestions,
    setExamQuestions,
    onAddQuestion,
    onCreate,
    saving,
    onValidateStep1,
    onValidateStep2,
  } = props;

  const stepLabels = [
    { step: 1, label: 'المعلومات', icon: 'create-outline' as const },
    { step: 2, label: 'الأسئلة', icon: 'help-circle-outline' as const },
    { step: 3, label: 'المراجعة', icon: 'checkmark-circle-outline' as const },
  ];

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.92} minHeight={0.6}>
        <View style={styles.sheetBody}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {examStep === 1
                ? t('teacherContent.examTitle')
                : examStep === 2
                  ? t('teacherContent.addQuestions')
                  : t('teacherAITools.reviewQuestions')}
            </Text>
          </View>

          {/* Step progress indicator — gives the teacher a clear sense of where
              they are in the 3-step wizard. Each pill shows step number, icon,
              and label; the active step uses the brand color, completed steps
              are checked, future steps are muted. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 12, gap: 4 }}>
            {stepLabels.map((s, idx) => {
              const active = examStep === s.step;
              const done = examStep > s.step;
              return (
                <React.Fragment key={s.step}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <View
                      style={{
                        width: 30, height: 30, borderRadius: 15,
                        backgroundColor: active ? Colors.primary : done ? Colors.success : '#E2E8F0',
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: active ? 2 : 0,
                        borderColor: active ? Colors.primary : 'transparent',
                      }}
                    >
                      {done ? (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      ) : (
                        <Text style={{ fontSize: 12, fontWeight: '900', color: active ? '#fff' : '#64748B' }}>
                          {s.step}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: active ? '900' : '700',
                        color: active ? Colors.primary : done ? Colors.success : '#94A3B8',
                        marginTop: 4,
                      }}
                    >
                      {s.label}
                    </Text>
                  </View>
                  {idx < stepLabels.length - 1 && (
                    <View
                      style={{
                        flex: 1, height: 2, marginHorizontal: 2, marginBottom: 14,
                        backgroundColor: examStep > s.step ? Colors.success : '#E2E8F0',
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          <KeyboardAwareScroll showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {examStep === 1 && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="عنوان الامتحان"
                  placeholderTextColor={Colors.textMuted}
                  value={examTitle}
                  onChangeText={setExamTitle}
                  textAlign="right"
                />
                <TextInput
                  style={styles.input}
                  placeholder="المدة (دقائق)"
                  placeholderTextColor={Colors.textMuted}
                  value={examDuration}
                  onChangeText={setExamDuration}
                  keyboardType="numeric"
                  textAlign="right"
                />
                <TargetsPicker label="انشر الامتحان لـ" />
                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={onValidateStep1}>
                  <Text style={styles.primaryBtnText}>التالي</Text>
                </TouchableOpacity>
              </>
            )}

            {examStep === 2 && (
              <>
                <Text style={styles.fieldLabel}>نوع السؤال</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {questionTypes.map((qt) => (
                    <TouchableOpacity
                      key={qt.key}
                      style={[styles.classChip, currentQuestionType === qt.key && styles.classChipActive]}
                      onPress={() => setCurrentQuestionType(qt.key)}
                    >
                      <Text
                        style={[
                          styles.classChipText,
                          currentQuestionType === qt.key && styles.classChipTextActive,
                        ]}
                      >
                        {qt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="نص السؤال"
                  placeholderTextColor={Colors.textMuted}
                  value={currentQuestion}
                  onChangeText={setCurrentQuestion}
                  multiline
                  textAlign="right"
                  textAlignVertical="top"
                />

                <TextInput
                  style={styles.input}
                  placeholder="الدرجة"
                  placeholderTextColor={Colors.textMuted}
                  value={currentPoints}
                  onChangeText={setCurrentPoints}
                  keyboardType="numeric"
                  textAlign="right"
                />

                {currentQuestionType === 'mcq' && (
                  <>
                    {currentOptions.map((opt, i) => (
                      <View key={i} style={styles.optionRow}>
                        <TouchableOpacity
                          style={[styles.radioBtn, currentCorrectIndex === i && styles.radioBtnActive]}
                          onPress={() => setCurrentCorrectIndex(i)}
                        >
                          {currentCorrectIndex === i && <View style={styles.radioDot} />}
                        </TouchableOpacity>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          placeholder={`الخيار ${i + 1}`}
                          placeholderTextColor={Colors.textMuted}
                          value={opt}
                          onChangeText={(v) => {
                            const opts = [...currentOptions];
                            opts[i] = v;
                            setCurrentOptions(opts);
                          }}
                          textAlign="right"
                        />
                      </View>
                    ))}
                  </>
                )}

                {currentQuestionType === 'tf' && (
                  <View style={styles.tfRow}>
                    <TouchableOpacity
                      style={[styles.tfBtn, currentCorrectIndex === 0 && styles.tfBtnActive]}
                      onPress={() => setCurrentCorrectIndex(0)}
                    >
                      <Text
                        style={[styles.tfBtnText, currentCorrectIndex === 0 && styles.tfBtnTextActive]}
                      >
                        صح
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tfBtn, currentCorrectIndex === 1 && styles.tfBtnActive]}
                      onPress={() => setCurrentCorrectIndex(1)}
                    >
                      <Text
                        style={[styles.tfBtnText, currentCorrectIndex === 1 && styles.tfBtnTextActive]}
                      >
                        خطأ
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {currentQuestionType === 'short' && (
                  <>
                    <Text style={styles.fieldLabel}>الإجابة النموذجية</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="اكتب الإجابة الصحيحة"
                      placeholderTextColor={Colors.textMuted}
                      value={currentCorrectAnswer}
                      onChangeText={setCurrentCorrectAnswer}
                      textAlign="right"
                    />
                  </>
                )}

                {currentQuestionType === 'fill' && (
                  <>
                    <Text style={styles.fieldLabel}>الكلمة المفقودة</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="اكتب الكلمة الصحيحة لملء الفراغ"
                      placeholderTextColor={Colors.textMuted}
                      value={currentCorrectAnswer}
                      onChangeText={setCurrentCorrectAnswer}
                      textAlign="right"
                    />
                  </>
                )}

                {currentQuestionType === 'essay' && (
                  <>
                    <Text style={styles.fieldLabel}>الإجابة النموذجية (اختياري)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="اكتب الإجابة النموذجية للمقال"
                      placeholderTextColor={Colors.textMuted}
                      value={currentModelAnswer}
                      onChangeText={setCurrentModelAnswer}
                      multiline
                      textAlign="right"
                      textAlignVertical="top"
                    />
                    <Text style={styles.fieldLabel}>معايير التقييم (اختياري)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="مثال: يجب أن يتضمن 3 نقاط رئيسية..."
                      placeholderTextColor={Colors.textMuted}
                      value={currentRubric}
                      onChangeText={setCurrentRubric}
                      multiline
                      textAlign="right"
                      textAlignVertical="top"
                    />
                  </>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: Colors.success }]}
                  onPress={onAddQuestion}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>إضافة السؤال</Text>
                </TouchableOpacity>

                {examQuestions.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.fieldLabel}>الأسئلة المضافة ({examQuestions.length})</Text>
                    {examQuestions.map((q, i) => (
                      <View key={q.id} style={styles.questionPreview}>
                        <Text style={styles.questionPreviewText}>
                          {i + 1}. {q.content} ({q.points} درجة)
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            setExamQuestions(
                              examQuestions.filter((_: any, idx: number) => idx !== i),
                            );
                          }}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.stepBtnRow}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={() => setExamStep(1)}
                  >
                    <Text style={[styles.stepBtnText, { color: Colors.text }]}>السابق</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={onValidateStep2}>
                    <Text style={styles.stepBtnText}>مراجعة</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {examStep === 3 && (
              <>
                <View style={styles.reviewCard}>
                  <Text style={styles.reviewLabel}>العنوان</Text>
                  <Text style={styles.reviewValue}>{examTitle}</Text>
                  <Text style={styles.reviewLabel}>المدة</Text>
                  <Text style={styles.reviewValue}>{examDuration} دقيقة</Text>
                  <Text style={styles.reviewLabel}>عدد الأسئلة</Text>
                  <Text style={styles.reviewValue}>{examQuestions.length}</Text>
                  <Text style={styles.reviewLabel}>مجموع الدرجات</Text>
                  <Text style={styles.reviewValue}>
                    {examQuestions.reduce((s: number, q: any) => s + (q.points || 0), 0)}
                  </Text>
                </View>

                <View style={styles.stepBtnRow}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={() => setExamStep(2)}
                  >
                    <Text style={[styles.stepBtnText, { color: Colors.text }]}>تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.stepBtn, saving && { opacity: 0.6 }]}
                    onPress={onCreate}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.stepBtnText}>حفظ الامتحان</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </KeyboardAwareScroll>
        </View>
    </SwipeableSheet>
  );
}
