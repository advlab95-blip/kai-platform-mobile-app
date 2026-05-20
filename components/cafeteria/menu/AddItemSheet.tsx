// Add new menu item sheet — name + price + category + optional image upload.
// Validation rules preserved from the original menu.tsx:
//   - name.trim() must be non-empty
//   - price must parse to > 0
// Category and image_url are persisted (cafeteria_items table extended with both columns).
import React, { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image as RNImage,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import SwipeableSheet from '../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../shared/KeyboardAwareScroll';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import { bunnyStorage } from '../../../services/bunny';
import { compressImage } from '../../../utils/imageCompress';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    name: string,
    price: number,
    category: string,
    imageUrl: string | null,
  ) => Promise<void>;
}

function AddItemSheet({ visible, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const reset = useCallback(() => {
    setName('');
    setPrice('');
    setCategory('');
    setImageUri(null);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
    reset();
  }, [submitting, onClose, reset]);

  const handlePickImage = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), 'يجب السماح بالوصول للصور');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setImageUri(result.assets[0].uri);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل اختيار الصورة');
    }
  }, [t]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('cafeteria.enterProductName'));
      return;
    }
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert(t('common.error'), t('cafeteria.enterValidPrice'));
      return;
    }
    setSubmitting(true);
    haptics.selection();
    try {
      let uploadedUrl: string | null = null;
      if (imageUri) {
        setUploadingImg(true);
        try {
          // Compress before upload — cuts iPhone-photo upload bytes by ~85%.
          // compressImage never throws; on failure it returns the original uri.
          const compressed = await compressImage(imageUri, { maxWidth: 1200, quality: 0.7 });
          uploadedUrl = await bunnyStorage.uploadImage(compressed, 'cafeteria');
        } finally {
          setUploadingImg(false);
        }
      }
      await onSubmit(name.trim(), parsed, category.trim(), uploadedUrl);
      reset();
      onClose();
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل الإضافة');
    } finally {
      setSubmitting(false);
    }
  }, [name, price, category, imageUri, onSubmit, onClose, reset, t]);

  return (
    <SwipeableSheet visible={visible} onClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <KeyboardAwareScroll
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} accessibilityRole="button" accessibilityLabel="إغلاق">
                <Ionicons name="close" size={24} color={tokens.color.text} />
              </TouchableOpacity>
              <Text style={styles.title}>{t('cafeteria.newProduct')}</Text>
            </View>

            <TouchableOpacity
              onPress={handlePickImage}
              activeOpacity={0.8}
              style={styles.imagePicker}
              accessibilityRole="button"
              accessibilityLabel="إضافة صورة"
            >
              {imageUri ? (
                <RNImage source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image" size={28} color={tokens.color.o600} />
                  <Text style={styles.imageHint}>إضافة صورة المنتج (اختياري)</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>{t('cafeteria.productName')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('cafeteria.productName')}
              placeholderTextColor={tokens.color.text3}
              value={name}
              onChangeText={setName}
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>{t('cafeteria.productPrice')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('cafeteria.productPrice')}
              placeholderTextColor={tokens.color.text3}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>
              {t('cafeteria.productCategory', { defaultValue: 'الفئة' })}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t('cafeteria.productCategoryPlaceholder', {
                defaultValue: 'مشروبات / مأكولات / حلويات',
              })}
              placeholderTextColor={tokens.color.text3}
              value={category}
              onChangeText={setCategory}
              textAlign="right"
            />

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.submit, submitting && styles.submitDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('cafeteria.addLabel')}
            >
              <LinearGradient
                colors={tokens.gradient.orange}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitGradient}
              >
                {submitting ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    {uploadingImg && <Text style={styles.submitText}>جاري رفع الصورة…</Text>}
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.submitText}>{t('cafeteria.addLabel')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScroll>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  container: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  imagePicker: {
    height: 140,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface2,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imageHint: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
  },
  imagePreview: { width: '100%', height: '100%' },
  fieldLabel: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
    textAlign: 'right',
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    marginBottom: 6,
  },
  submit: {
    marginTop: 14,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    ...tokens.shadow.cafeteria,
  },
  submitDisabled: { opacity: 0.6 },
  submitGradient: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
  },
});

export default memo(AddItemSheet);
