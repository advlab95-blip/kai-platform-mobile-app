import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';
import TargetsPicker from '../../../shared/TargetsPicker';
import { styles } from '../styles';

export interface GalleryCreateSheetProps {
  visible: boolean;
  onClose: () => void;

  galleryTitle: string;
  setGalleryTitle: (v: string) => void;

  galleryCoverUri?: string | null;
  onPickCover?: () => void;

  selectedTargetsCount: number;

  saving: boolean;
  onCreate: () => void;
}

export default function GalleryCreateSheet({
  visible,
  onClose,
  galleryTitle,
  setGalleryTitle,
  galleryCoverUri,
  onPickCover,
  selectedTargetsCount,
  saving,
  onCreate,
}: GalleryCreateSheetProps) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.9} minHeight={0.6}>
      <View style={styles.sheetBody}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>إنشاء ألبوم</Text>
        </View>
        <KeyboardAwareScroll
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          <TextInput
            style={styles.input}
            placeholder="اسم الألبوم"
            placeholderTextColor={Colors.textMuted}
            value={galleryTitle}
            onChangeText={setGalleryTitle}
            textAlign="right"
          />

          {onPickCover && (
            <TouchableOpacity
              onPress={onPickCover}
              activeOpacity={0.7}
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: Colors.border,
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              {galleryCoverUri ? (
                <View style={{ alignItems: 'center' }}>
                  <Image
                    source={{ uri: galleryCoverUri }}
                    style={{ width: 120, height: 120, borderRadius: 10 }}
                    contentFit="cover"
                  />
                  <Text style={{ marginTop: 8, color: Colors.primary, fontWeight: '700', fontSize: 12 }}>
                    تغيير صورة الغلاف
                  </Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
                  <Text style={{ marginTop: 6, color: Colors.text, fontWeight: '700', fontSize: 13 }}>
                    إضافة صورة غلاف
                  </Text>
                  <Text style={{ marginTop: 2, color: Colors.textMuted, fontSize: 11 }}>
                    اختياري — تكدر تنشئ الألبوم بدون صورة
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          <TargetsPicker />

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              (saving || selectedTargetsCount === 0) && { opacity: 0.5 },
              { marginTop: 14 },
            ]}
            onPress={onCreate}
            disabled={saving || selectedTargetsCount === 0}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {selectedTargetsCount === 0
                  ? 'اختر الهدف أولاً'
                  : `إنشاء للـ ${selectedTargetsCount} ${selectedTargetsCount === 1 ? 'هدف' : 'أهداف'}`}
              </Text>
            )}
          </TouchableOpacity>
        </KeyboardAwareScroll>
      </View>
    </SwipeableSheet>
  );
}
