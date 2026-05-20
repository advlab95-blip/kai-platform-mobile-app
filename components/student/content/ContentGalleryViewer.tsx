// ContentGalleryViewer — gallery detail viewer (used inside the gallery SwipeableSheet).
// Self-contained: fetches images for the given gallery.id and renders thumbnails + fullscreen modal.
// Extracted as-is from content.tsx (no logic changes).

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystemImport from 'expo-file-system';
import * as SharingImport from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../services/supabase';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

export default function ContentGalleryViewer({ gallery }: { gallery: any }) {
  const { t } = useTranslation();
  const [images, setImages] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fullImage, setFullImage] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('galleries').select('images').eq('id', gallery.id).single();
        setImages(data?.images || []);
      } catch (err) {
        console.error('[Gallery load]:', err);
        setImages(gallery.images || []);
      }
      setLoading(false);
    })();
  }, [gallery.id]);

  const handleDownload = async (url: string) => {
    try {
      haptics.light();
      const fileName = url.split('/').pop() || 'image.jpg';
      const fileUri = (FileSystemImport.documentDirectory ?? '') + fileName;
      const { uri } = await FileSystemImport.downloadAsync(url, fileUri);
      await SharingImport.shareAsync(uri);
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert(t('common.error'), t('student.downloadFailed'));
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: tokens.color.text }}>{gallery.title || t('student.album')}</Text>
        <Text style={{ fontSize: 12, color: tokens.color.text3, marginTop: 4 }}>
          {gallery.created_at ? new Date(gallery.created_at).toLocaleDateString('ar-IQ') : ''}
        </Text>
        <Text style={{ fontSize: 12, color: tokens.color.text2, marginTop: 2 }}>{t('student.photoCount', { count: images.length })}</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={tokens.color.teal600} />
      ) : images.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <Ionicons name="images-outline" size={64} color={tokens.color.surface3} />
          <Text style={{ color: tokens.color.text3, marginTop: 12 }}>{t('student.noPhotos')}</Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8 }}>
            {images.map((imgUrl: string, idx: number) => (
              <TouchableOpacity
                key={idx}
                onPress={() => { haptics.light(); setFullImage(imgUrl); }}
                style={{ width: '32%', aspectRatio: 1, borderRadius: tokens.radius.md, overflow: 'hidden', backgroundColor: tokens.color.surface2 }}
              >
                <Image source={{ uri: imgUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              </TouchableOpacity>
            ))}
          </View>
          {/* Full image viewer */}
          <Modal visible={!!fullImage} animationType="fade" transparent>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setFullImage(null)} style={{ position: 'absolute', top: Platform.OS === 'ios' ? 54 : 34, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => fullImage && handleDownload(fullImage)} style={{ position: 'absolute', top: Platform.OS === 'ios' ? 54 : 34, left: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="download-outline" size={22} color="#fff" />
              </TouchableOpacity>
              {fullImage && <Image source={{ uri: fullImage }} style={{ width: '95%', height: '70%' }} contentFit="contain" cachePolicy="memory-disk" transition={200} />}
            </View>
          </Modal>
        </>
      )}
    </ScrollView>
  );
}
