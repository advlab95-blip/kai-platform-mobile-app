import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';
import TargetsPicker from '../../../shared/TargetsPicker';
import { styles } from '../styles';

export interface VideoUploadSheetProps {
  visible: boolean;
  onClose: () => void;
  videoTitle: string;
  setVideoTitle: (v: string) => void;
  pickedFile: { name: string; size: number; uri: string } | null;
  uploadProgress: string | null;
  saving: boolean;
  selectedTargetsCount: number;
  onPickFile: () => void;
  onUpload: () => void;
}

export default function VideoUploadSheet({
  visible,
  onClose,
  videoTitle,
  setVideoTitle,
  pickedFile,
  uploadProgress,
  saving,
  selectedTargetsCount,
  onPickFile,
  onUpload,
}: VideoUploadSheetProps) {
  const titleEmpty = !videoTitle.trim();
  const fileMissing = !pickedFile?.uri;
  const noTarget = selectedTargetsCount === 0;
  const blocked = titleEmpty || fileMissing || noTarget || saving;
  const buttonLabel = saving
    ? null
    : titleEmpty
      ? 'أدخل عنوان الفيديو'
      : noTarget
        ? 'اختر الهدف أولاً'
        : fileMissing
          ? 'اختر ملف الفيديو'
          : `رفع الفيديو لـ ${selectedTargetsCount} ${selectedTargetsCount === 1 ? 'هدف' : 'أهداف'}`;
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85} minHeight={0.5}>
      <KeyboardAwareScroll
        style={styles.sheetBody}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>رفع فيديو</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="عنوان الفيديو"
            placeholderTextColor={Colors.textMuted}
            value={videoTitle}
            onChangeText={setVideoTitle}
            textAlign="right"
          />
          <TargetsPicker label="انشر الفيديو لـ" />
          <TouchableOpacity style={[styles.filePickerBtn, { marginTop: 12 }]} onPress={onPickFile}>
            <Ionicons name="cloud-upload-outline" size={28} color={Colors.primary} />
            {pickedFile ? (
              <>
                <Text style={[styles.filePickerText, { color: Colors.text }]}>{pickedFile.name}</Text>
                <Text style={[styles.filePickerText, { fontSize: 10 }]}>
                  {(pickedFile.size / (1024 * 1024)).toFixed(2)} MB
                </Text>
              </>
            ) : (
              <Text style={styles.filePickerText}>اختر ملف الفيديو</Text>
            )}
          </TouchableOpacity>
          {uploadProgress && (
            <View style={{ backgroundColor: '#EEF2FF', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'center' }}>
                {uploadProgress}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, blocked && { opacity: 0.5 }]}
            onPress={onUpload}
            disabled={blocked}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cloud-upload" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{buttonLabel}</Text>
              </View>
            )}
          </TouchableOpacity>
      </KeyboardAwareScroll>
    </SwipeableSheet>
  );
}
