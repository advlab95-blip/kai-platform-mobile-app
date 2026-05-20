import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Switch, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/colors';
import { api } from '../../services/api';
import { compressAvatar } from '../../utils/imageCompression';
import type { AdminAd, CreateAdInput } from '../../types';
import SwipeableSheet from '../shared/SwipeableSheet';
import KeyboardAwareScroll from '../shared/KeyboardAwareScroll';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  instituteId: string;
  actorId: string;
  ad?: AdminAd | null;
}

// YYYY-MM-DD <-> Date helpers. Kept deliberately simple — we don't need a
// full-blown picker; institute admins can type the date in Arabic or Latin digits.
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInput(str: string): string | null {
  const s = str.trim();
  if (!s) return null;
  // Accept YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  // Interpret as UTC midnight. Using local time shifts the stored day for users
  // east of UTC (e.g. Baghdad +03:00 turns 2026-05-01 into 2026-04-30T21:00Z).
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isSafeHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

export default function AdFormModal({
  visible, onClose, onSaved, instituteId, actorId, ad,
}: Props) {
  const isEdit = !!ad;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(ad?.title ?? '');
      setBody(ad?.body ?? '');
      setImageUrl(ad?.image_url ?? null);
      setLinkUrl(ad?.link_url ?? '');
      setStartsAt(toDateInput(ad?.starts_at));
      setExpiresAt(toDateInput(ad?.expires_at));
      setIsActive(ad?.is_active ?? true);
    }
  }, [visible, ad]);

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('تنبيه', 'يجب السماح بالوصول للصور');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setUploading(true);
      const compressed = await compressAvatar(res.assets[0].uri);
      const url = await api.uploadAdImage(compressed);
      setImageUrl(url);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => setImageUrl(null);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('تنبيه', 'العنوان إلزامي');
      return;
    }
    if (trimmedTitle.length > 200) {
      Alert.alert('تنبيه', 'العنوان طويل جداً (أقصى 200 حرف)');
      return;
    }
    if (body.length > 2000) {
      Alert.alert('تنبيه', 'النص طويل جداً (أقصى 2000 حرف)');
      return;
    }

    const startIso = fromDateInput(startsAt);
    const expiresIso = fromDateInput(expiresAt);
    if (startsAt && !startIso) {
      Alert.alert('تنبيه', 'صيغة تاريخ البدء يجب أن تكون YYYY-MM-DD');
      return;
    }
    if (expiresAt && !expiresIso) {
      Alert.alert('تنبيه', 'صيغة تاريخ الانتهاء يجب أن تكون YYYY-MM-DD');
      return;
    }
    if (startIso && expiresIso && new Date(expiresIso) <= new Date(startIso)) {
      Alert.alert('تنبيه', 'تاريخ الانتهاء يجب أن يكون بعد البدء');
      return;
    }

    const trimmedLink = linkUrl.trim();
    if (trimmedLink && !isSafeHttpsUrl(trimmedLink)) {
      Alert.alert('تنبيه', 'الرابط يجب أن يبدأ بـ https://');
      return;
    }

    const payload: CreateAdInput = {
      title: trimmedTitle,
      body: body.trim() || null,
      image_url: imageUrl,
      link_url: trimmedLink || null,
      is_active: isActive,
      starts_at: startIso ?? undefined,
      expires_at: expiresIso ?? null,
    };

    try {
      setSaving(true);
      if (isEdit && ad) {
        await api.updateAd(ad.id, payload);
      } else {
        await api.createAd(payload, instituteId, actorId);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل حفظ الإعلان');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploading;

  return (
    <SwipeableSheet
      visible={visible}
      onClose={onClose}
      maxHeight={0.92}
      overlayTapDisabled={busy}
      swipeDownDisabled={busy}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} accessibilityLabel="إغلاق" disabled={busy}>
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEdit ? 'تعديل إعلان' : 'إنشاء إعلان جديد'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAwareScroll contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Live preview */}
        <Text style={styles.sectionLabel}>معاينة</Text>
        <View style={styles.previewCard}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <View style={styles.previewNoImage}>
              <Ionicons name="megaphone" size={28} color={Colors.primary} />
            </View>
          )}
          <Text style={styles.previewTitle} numberOfLines={2}>
            {title || 'عنوان الإعلان'}
          </Text>
          {!!body && (
            <Text style={styles.previewBody} numberOfLines={3}>{body}</Text>
          )}
        </View>

        {/* Title */}
        <Text style={styles.label}>العنوان *</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="أدخل عنواناً جذاباً"
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          textAlign="right"
          maxLength={200}
        />
        <Text style={styles.counter}>{title.length} / 200</Text>

        {/* Body */}
        <Text style={styles.label}>النص</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="وصف مختصر"
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, styles.textarea]}
          textAlign="right"
          multiline
          numberOfLines={4}
          maxLength={2000}
        />
        <Text style={styles.counter}>{body.length} / 2000</Text>

        {/* Image */}
        <Text style={styles.label}>الصورة</Text>
        <View style={styles.imageRow}>
          <TouchableOpacity style={styles.imageBtn} onPress={pickImage} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="image-outline" size={18} color={Colors.primary} />
                <Text style={styles.imageBtnText}>
                  {imageUrl ? 'تغيير الصورة' : 'اختيار صورة'}
                </Text>
              </>
            )}
          </TouchableOpacity>
          {!!imageUrl && (
            <TouchableOpacity style={styles.imageRemove} onPress={removeImage}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </TouchableOpacity>
          )}
        </View>

        {/* Link */}
        <Text style={styles.label}>رابط عند الضغط (اختياري)</Text>
        <TextInput
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="https://..."
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          textAlign="right"
          autoCapitalize="none"
          keyboardType="url"
        />

        {/* Dates */}
        <Text style={styles.label}>تاريخ البدء (YYYY-MM-DD)</Text>
        <TextInput
          value={startsAt}
          onChangeText={setStartsAt}
          placeholder="2026-05-01"
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          textAlign="right"
          autoCapitalize="none"
        />

        <Text style={styles.label}>تاريخ الانتهاء (اختياري)</Text>
        <TextInput
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder="2026-06-01"
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          textAlign="right"
          autoCapitalize="none"
        />

        {/* Active */}
        <View style={styles.switchRow}>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: Colors.primary, false: Colors.border }}
            thumbColor="#fff"
          />
          <Text style={styles.switchLabel}>نشط</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving || uploading}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="megaphone" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>
                {isEdit ? 'حفظ التعديلات' : 'نشر الإعلان'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAwareScroll>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  body: { padding: 16, paddingBottom: 36 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 6 },

  previewCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 12, marginBottom: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  previewImage: { width: '100%', height: 140, borderRadius: 10, marginBottom: 10 },
  previewNoImage: {
    width: '100%', height: 140, borderRadius: 10,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  previewTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  previewBody: { fontSize: 13, color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },

  label: { fontSize: 13, fontWeight: '700', color: Colors.text, textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14, color: Colors.text,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  counter: { fontSize: 11, color: Colors.textMuted, textAlign: 'left', marginTop: 3 },

  imageRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  imageBtn: {
    flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primary + '10',
  },
  imageBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  imageRemove: {
    width: 44, height: 44, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },

  switchRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    marginTop: 16, marginBottom: 6,
  },
  switchLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },

  saveBtn: {
    marginTop: 20,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14, borderRadius: 12,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
