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
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';
import TargetsPicker from '../../../shared/TargetsPicker';
import { styles } from '../styles';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface MaterialCreateSheetProps {
  visible: boolean;
  onClose: () => void;

  materialTitle: string;
  setMaterialTitle: (v: string) => void;

  materialPrice: string;
  setMaterialPrice: (v: string) => void;

  materialCoverUri: string | null;

  onPickCover: () => void;

  saving: boolean;
  selectedTargetsCount: number;
  onCreate: () => void;
}

export default function MaterialCreateSheet({
  visible,
  onClose,
  materialTitle,
  setMaterialTitle,
  materialPrice,
  setMaterialPrice,
  materialCoverUri,
  onPickCover,
  saving,
  selectedTargetsCount,
  onCreate,
}: MaterialCreateSheetProps) {
  const titleEmpty = !materialTitle.trim();
  const noTarget = selectedTargetsCount === 0;
  const blocked = titleEmpty || noTarget || saving;
  const buttonLabel = saving
    ? null
    : titleEmpty
      ? 'أدخل عنوان الملزمة'
      : noTarget
        ? 'اختر الهدف أولاً'
        : `إضافة للـ ${selectedTargetsCount} ${selectedTargetsCount === 1 ? 'هدف' : 'أهداف'}`;
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <View style={[styles.sheetBody, { flex: undefined, paddingBottom: 0 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>إضافة ملزمة</Text>
        </View>
        <KeyboardAwareScroll
          style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          <TextInput
            style={styles.input}
            placeholder="عنوان الملزمة"
            placeholderTextColor={Colors.textMuted}
            value={materialTitle}
            onChangeText={setMaterialTitle}
            textAlign="right"
          />
          <TextInput
            style={styles.input}
            placeholder="السعر (د.ع) — اتركه فارغاً للمجاني"
            placeholderTextColor={Colors.textMuted}
            value={materialPrice}
            onChangeText={setMaterialPrice}
            keyboardType="numeric"
            textAlign="right"
          />
          <TargetsPicker label="انشر الملزمة لـ" />
          {/* Cover image picker */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>صورة الغلاف (اختياري)</Text>
          <TouchableOpacity style={styles.filePickerBtn} onPress={onPickCover}>
            {materialCoverUri ? (
              <Image
                source={{ uri: materialCoverUri }}
                style={{ width: 80, height: 80, borderRadius: 10 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
              />
            ) : (
              <>
                <Ionicons name="image-outline" size={28} color={Colors.primary} />
                <Text style={styles.filePickerText}>اختر صورة الغلاف</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, blocked && { opacity: 0.5 }]}
            onPress={onCreate}
            disabled={blocked}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{buttonLabel}</Text>
              </View>
            )}
          </TouchableOpacity>
        </KeyboardAwareScroll>
      </View>
    </SwipeableSheet>
  );
}
