import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';
import TargetsPicker from '../../../shared/TargetsPicker';
import { styles } from '../styles';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface HomeworkCreateSheetProps {
  visible: boolean;
  onClose: () => void;

  homeworkTitle: string;
  setHomeworkTitle: (v: string) => void;

  homeworkDescription: string;
  setHomeworkDescription: (v: string) => void;

  homeworkDueDate: string;
  setHomeworkDueDate: (v: string) => void;

  homeworkFile: { uri: string; name: string } | null;

  onPickFile: () => void;

  homeworkSaving: boolean;
  selectedTargetsCount: number;
  onSave: () => void;
}

export default function HomeworkCreateSheet({
  visible,
  onClose,
  homeworkTitle,
  setHomeworkTitle,
  homeworkDescription,
  setHomeworkDescription,
  homeworkDueDate,
  setHomeworkDueDate,
  homeworkFile,
  onPickFile,
  homeworkSaving,
  selectedTargetsCount,
  onSave,
}: HomeworkCreateSheetProps) {
  const { t } = useTranslation();
  const titleEmpty = !homeworkTitle.trim();
  const noTarget = selectedTargetsCount === 0;
  const blocked = titleEmpty || noTarget || homeworkSaving;
  const buttonLabel = homeworkSaving
    ? null
    : titleEmpty
      ? 'أدخل عنوان الواجب'
      : noTarget
        ? 'اختر الهدف أولاً'
        : `حفظ للـ ${selectedTargetsCount} ${selectedTargetsCount === 1 ? 'هدف' : 'أهداف'}`;
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <View style={[styles.sheetBody, { flex: undefined, paddingBottom: 0 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>إضافة واجب</Text>
        </View>

        <KeyboardAwareScroll
          style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
            <Text style={styles.fieldLabel}>عنوان الواجب *</Text>
            <TextInput
              style={styles.input}
              placeholder="عنوان الواجب"
              placeholderTextColor={Colors.textMuted}
              value={homeworkTitle}
              onChangeText={setHomeworkTitle}
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>الوصف / التفاصيل</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              placeholder="تفاصيل الواجب..."
              placeholderTextColor={Colors.textMuted}
              value={homeworkDescription}
              onChangeText={setHomeworkDescription}
              multiline
              textAlign="right"
              textAlignVertical="top"
            />

            <TargetsPicker label="انشر الواجب لـ" />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>تاريخ التسليم (اختياري)</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: 2026-04-15"
              placeholderTextColor={Colors.textMuted}
              value={homeworkDueDate}
              onChangeText={setHomeworkDueDate}
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>مرفق (اختياري)</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#F1F5F9' }]} onPress={onPickFile}>
              <Ionicons name="attach" size={18} color={Colors.primary} />
              <Text style={[styles.addBtnText, { color: Colors.primary }]}>
                {homeworkFile ? homeworkFile.name : t('teacherContent.selectFile')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addBtn, { marginTop: 16 }, blocked && { opacity: 0.5 }]}
              disabled={blocked}
              onPress={onSave}
            >
              {homeworkSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>{buttonLabel}</Text>
                </>
              )}
          </TouchableOpacity>
        </KeyboardAwareScroll>
      </View>
    </SwipeableSheet>
  );
}
