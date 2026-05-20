// ContentPdfViewerModal — fullscreen PDF viewer (web iframe / native WebView).
// Pure presentational. Parent owns visibility state and the URL.

import React from 'react';
import { View, Modal, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type Props = {
  visible: boolean;
  url: string;
  onClose: () => void;
};

export default function ContentPdfViewerModal({ visible, url, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 10 }}>
          <TouchableOpacity onPress={() => { haptics.light(); onClose(); }} accessibilityLabel="إغلاق" accessibilityRole="button">
            <Ionicons name="close-circle" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1 }}>
            {React.createElement('iframe' as any, {
              src: url,
              style: { flex: 1, width: '100%', height: '100%', border: 0 },
            })}
          </View>
        ) : (
          <WebView
            source={{ uri: url }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => <ActivityIndicator style={{ flex: 1 }} color={tokens.color.teal600} size="large" />}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
