import React from 'react';
import { View, TouchableOpacity, Modal, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Colors } from '../../../../constants/colors';

export interface PdfViewerModalProps {
  visible: boolean;
  onClose: () => void;
  pdfUrl: string;
}

export default function PdfViewerModal({ visible, onClose, pdfUrl }: PdfViewerModalProps) {
  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 10 }}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close-circle" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1 }}>
            {React.createElement('iframe' as any, {
              src: pdfUrl,
              style: { flex: 1, width: '100%', height: '100%', border: 0 },
            })}
          </View>
        ) : (
          <WebView
            source={{ uri: pdfUrl }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => (
              <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} size="large" />
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
