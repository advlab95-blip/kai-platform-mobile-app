// ContentLiveModal — fullscreen live stream player modal (presentational).
// Parent passes the selected live record and lifecycle handlers (onShow/onClose) — this component only renders.

import React from 'react';
import { View, Text, Modal, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import { haptics } from '../../../utils/haptics';

type Props = {
  visible: boolean;
  selectedLive: any | null;
  onShow?: () => void;
  onClose: () => void;
};

export default function ContentLiveModal({ visible, selectedLive, onShow, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onShow={onShow}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <TouchableOpacity
            onPress={() => { haptics.light(); onClose(); }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>البث المباشر</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{selectedLive?.users?.full_name || selectedLive?.teacher_name || 'الأستاذ'}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        {(() => {
          const streamUrl = selectedLive?.hls_url || selectedLive?.url;
          if (streamUrl) {
            return (
              <ExpoVideo
                source={{ uri: streamUrl }}
                style={{ flex: 1 }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
              />
            );
          }
          if (selectedLive?.cloudflare_uid) {
            const cfAccountId = process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID || '';
            const playerUrl = `https://customer-${cfAccountId}.cloudflarestream.com/${selectedLive.cloudflare_uid}/iframe`;
            if (Platform.OS === 'web') {
              return (
                <View style={{ flex: 1 }}>
                  {React.createElement('iframe' as any, {
                    src: playerUrl,
                    style: { flex: 1, width: '100%', height: '100%', border: 0 },
                    allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture',
                    allowFullScreen: true,
                  })}
                </View>
              );
            }
            return (
              <WebView
                source={{ uri: playerUrl }}
                style={{ flex: 1 }}
                allowsInlineMediaPlayback
                javaScriptEnabled
                mediaPlaybackRequiresUserAction={false}
              />
            );
          }
          return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="videocam-outline" size={64} color="#ccc" />
              <Text style={{ color: '#999', marginTop: 12, fontSize: 14 }}>
                البث سيبدأ قريباً...
              </Text>
            </View>
          );
        })()}
      </SafeAreaView>
    </Modal>
  );
}
