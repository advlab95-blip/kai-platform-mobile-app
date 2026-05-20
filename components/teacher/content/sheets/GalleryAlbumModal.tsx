import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../../constants/colors';
import { styles } from '../styles';

export interface GalleryAlbumModalProps {
  visible: boolean;
  onClose: () => void;
  albumTitle: string;
  galleryImages: string[];
  galleryUploading: boolean;
  uploadProgress: string | null;
  onUploadImage: () => void;
  onDeleteImage: (imageUrl: string) => void;
}

/**
 * Full-screen modal showing one gallery album: upload-image button + image grid.
 * Long-press on image triggers delete (parent handles).
 */
export default function GalleryAlbumModal({
  visible,
  onClose,
  albumTitle,
  galleryImages,
  galleryUploading,
  uploadProgress,
  onUploadImage,
  onDeleteImage,
}: GalleryAlbumModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
          }}
        >
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="arrow-forward" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text }}>
            {albumTitle || t('student.album')}
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <TouchableOpacity
            style={[styles.addBtn, galleryUploading && { opacity: 0.6 }]}
            onPress={onUploadImage}
            disabled={galleryUploading}
          >
            {galleryUploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={18} color="#fff" />
                <Text style={styles.addBtnText}>رفع صورة</Text>
              </>
            )}
          </TouchableOpacity>
          {uploadProgress && (
            <Text
              style={{
                textAlign: 'center',
                color: Colors.primary,
                fontWeight: '700',
                fontSize: 12,
                marginTop: 8,
              }}
            >
              {uploadProgress}
            </Text>
          )}
          {galleryImages.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Ionicons name="images-outline" size={64} color="#E2E8F0" />
              <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 14 }}>
                لا توجد صور — اضغط "رفع صورة"
              </Text>
            </View>
          ) : (
            <>
              <Text
                style={{
                  textAlign: 'right',
                  color: Colors.textMuted,
                  fontSize: 12,
                  marginTop: 8,
                  marginBottom: 8,
                }}
              >
                {galleryImages.length} صورة
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {galleryImages.map((imgUrl, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onLongPress={() => onDeleteImage(imgUrl)}
                    activeOpacity={0.8}
                    style={{
                      width: '31%',
                      aspectRatio: 1,
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: '#F1F5F9',
                    }}
                  >
                    <Image
                      source={{ uri: imgUrl }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        borderRadius: 10,
                        width: 20,
                        height: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="trash-outline" size={10} color="#fff" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Text
                style={{
                  textAlign: 'center',
                  color: Colors.textMuted,
                  fontSize: 10,
                  marginTop: 12,
                }}
              >
                اضغط مطولاً على أي صورة لحذفها
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
