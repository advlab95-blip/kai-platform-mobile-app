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
import { styles } from '../styles';

export interface VideoEditSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  setTitle: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}

export default function VideoEditSheet({
  visible,
  onClose,
  title,
  setTitle,
  saving,
  onSave,
}: VideoEditSheetProps) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85} minHeight={0.5}>
      <View style={styles.sheetBody}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>تعديل الفيديو</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="عنوان الفيديو"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            textAlign="right"
          />
          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>حفظ التعديل</Text>
            )}
          </TouchableOpacity>
        </View>
    </SwipeableSheet>
  );
}
