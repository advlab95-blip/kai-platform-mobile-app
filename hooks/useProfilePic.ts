import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { bunnyStorage } from '../services/bunny';
import { compressAvatar } from '../utils/imageCompression';

export function useProfilePic(userId: string | null) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Load avatar on mount
  useEffect(() => {
    if (!userId) return;
    api.getProfilePic(userId).then((url) => {
      if (url) setAvatarUrl(url);
    });
  }, [userId]);

  const pickAndUploadAvatar = useCallback(async () => {
    if (!userId) return;

    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert('تنبيه', 'يجب السماح بالوصول للصور');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploading(true);
      const compressed = await compressAvatar(result.assets[0].uri);
      const imageUrl = await bunnyStorage.uploadImage(compressed, 'avatars');
      await api.saveProfilePic(userId, imageUrl);
      setAvatarUrl(imageUrl);
      Alert.alert('تم', 'تم تحديث الصورة الشخصية');
    } catch (err: any) {
      // Always log the full error — without this, role-specific avatar bugs
      // (e.g. the cafeteria-role 'no_institute' regression) are invisible
      // because Alert only shows the short message.
      console.error('[useProfilePic] avatar upload failed', {
        userId,
        message: err?.message,
        name: err?.name,
        status: err?.status,
        details: err?.details,
        stack: err?.stack?.split('\n').slice(0, 4).join(' | '),
      });
      // Surface a more actionable Arabic message when the underlying failure
      // is an edge-function 5xx — the only common cause is missing/invalid
      // Bunny secrets on the upload-media function. Plain `err.message`
      // ("upload failed (502): ...") is too cryptic for non-developers.
      const raw = String(err?.message || '');
      let friendly = raw || 'فشل رفع الصورة';
      if (/\b50\d\b/.test(raw) || /upload failed/i.test(raw)) {
        friendly = 'فشل رفع الصورة — تحقّق من الاتصال أو حاول مرة ثانية. لو تكرّر الخطأ، أبلغ الإدارة.';
      } else if (/session/i.test(raw) || /الجلسة/.test(raw)) {
        friendly = 'الجلسة منتهية — سجّل الدخول من جديد';
      }
      Alert.alert('خطأ', friendly);
    } finally {
      setUploading(false);
    }
  }, [userId]);

  return { avatarUrl, uploading, pickAndUploadAvatar };
}
