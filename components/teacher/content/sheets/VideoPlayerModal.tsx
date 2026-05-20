import React from 'react';
import { View, Text, TouchableOpacity, Modal, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import { useTranslation } from 'react-i18next';

export interface VideoPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  playingVideo: any;
  embedUrl: string | null;
  playUrl: string | null;
}

/**
 * Video player modal — embed iframe on web, expo-av on mobile.
 * URL resolution lives in the parent (bunnyService) and is passed down.
 */
export default function VideoPlayerModal({
  visible,
  onClose,
  playingVideo,
  embedUrl,
  playUrl,
}: VideoPlayerModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text
            style={{ fontSize: 14, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' }}
            numberOfLines={1}
          >
            {playingVideo?.title || t('teacherContent.videos')}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        {playingVideo && (embedUrl || playUrl) ? (
          Platform.OS === 'web' ? (
            <View style={{ flex: 1 }}>
              {React.createElement('iframe' as any, {
                src: embedUrl,
                style: { flex: 1, width: '100%', height: '100%', border: 0 },
                allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture',
                allowFullScreen: true,
              })}
            </View>
          ) : (
            <ExpoVideo
              source={{ uri: playUrl || '' }}
              style={{ flex: 1 }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              onError={(err) => {
                console.error('[video player]', err);
                Alert.alert(t('common.error'), 'فشل تشغيل الفيديو');
              }}
            />
          )
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="videocam-off-outline" size={64} color="rgba(255,255,255,0.3)" />
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 12 }}>
              الفيديو غير متوفر للتشغيل
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
