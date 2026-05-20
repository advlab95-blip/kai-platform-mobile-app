import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { bunnyStorage } from '../../services/bunny';
import { compressCover } from '../../utils/imageCompression';

interface Props {
  size?: number;
  editable?: boolean;
}

export default function InstituteLogo({ size = 40, editable = false }: Props) {
  const { userInstituteId, institutes } = useDataStore();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const instName = institutes.find(i => i.id === userInstituteId)?.name || '';

  useEffect(() => {
    if (userInstituteId) {
      api.getInstituteLogo(userInstituteId).then(url => setLogoUrl(url)).catch(() => {});
    }
  }, [userInstituteId]);

  const handleUpload = async () => {
    if (!editable || !userInstituteId) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const compressed = await compressCover(result.assets[0].uri);
      const url = await bunnyStorage.uploadImage(compressed, `logos/${userInstituteId}`);
      await api.saveInstituteLogo(userInstituteId, url);
      setLogoUrl(url);
      Alert.alert('تم', 'تم تحديث اللوقو');
    } catch (err: any) { Alert.alert('خطأ', err.message || 'فشل رفع اللوقو'); }
    setUploading(false);
  };

  const Wrapper = editable ? TouchableOpacity : View;

  return (
    <Wrapper onPress={editable ? handleUpload : undefined} style={{ alignItems: 'center', gap: 4 }} accessibilityLabel={editable ? 'تغيير اللوقو' : instName} accessibilityRole={editable ? 'button' : 'image'}>
      {uploading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : logoUrl ? (
        <Image source={{ uri: logoUrl }} style={{ width: size, height: size, borderRadius: size / 4 }} contentFit="contain" />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="business" size={size * 0.5} color={Colors.primary} />
        </View>
      )}
      {/* No label — tap the icon to upload */}
    </Wrapper>
  );
}
