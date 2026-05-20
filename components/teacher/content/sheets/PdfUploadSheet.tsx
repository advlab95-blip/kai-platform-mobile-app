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
import { styles } from '../styles';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface PdfUploadSheetProps {
  visible: boolean;
  onClose: () => void;

  pdfTitle: string;
  setPdfTitle: (v: string) => void;

  classes: { id: string; name: string }[];
  pdfClassIds: string[];
  toggleClassId: (id: string) => void;

  pdfFile: { uri: string; name: string } | null;
  onPickFile: () => void;

  pdfSaving: boolean;
  onUpload: () => void;
}

export default function PdfUploadSheet({
  visible,
  onClose,
  pdfTitle,
  setPdfTitle,
  classes,
  pdfClassIds,
  toggleClassId,
  pdfFile,
  onPickFile,
  pdfSaving,
  onUpload,
}: PdfUploadSheetProps) {
  const { t } = useTranslation();
  const titleEmpty = !pdfTitle.trim();
  const fileMissing = !pdfFile;
  const blocked = titleEmpty || fileMissing || pdfSaving;
  const buttonLabel = pdfSaving
    ? null
    : titleEmpty
      ? 'أدخل عنوان الملف'
      : fileMissing
        ? 'اختر ملف PDF'
        : 'رفع';
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <View style={[styles.sheetBody, { flex: undefined, paddingBottom: 0 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>رفع ملف PDF</Text>
        </View>

        <KeyboardAwareScroll
          style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
            <Text style={styles.fieldLabel}>عنوان الملف *</Text>
            <TextInput
              style={styles.input}
              placeholder="عنوان الملف"
              placeholderTextColor={Colors.textMuted}
              value={pdfTitle}
              onChangeText={setPdfTitle}
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>الصف (اختياري)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {classes.map((cls) => (
                <TouchableOpacity
                  key={cls.id}
                  style={[styles.classChip, pdfClassIds.includes(cls.id) && styles.classChipActive]}
                  onPress={() => toggleClassId(cls.id)}
                >
                  <Text
                    style={[
                      styles.classChipText,
                      pdfClassIds.includes(cls.id) && styles.classChipTextActive,
                    ]}
                  >
                    {cls.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: '#FEE2E2' }]}
              onPress={onPickFile}
            >
              <Ionicons name="document-attach" size={18} color="#EF4444" />
              <Text style={[styles.addBtnText, { color: '#EF4444' }]}>
                {pdfFile ? pdfFile.name : t('teacherContent.selectPdf')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addBtn, { marginTop: 16 }, blocked && { opacity: 0.5 }]}
              disabled={blocked}
              onPress={onUpload}
            >
              {pdfSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>{buttonLabel}</Text>
                </>
              )}
          </TouchableOpacity>
        </KeyboardAwareScroll>
      </View>
    </SwipeableSheet>
  );
}
