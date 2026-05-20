// ContentMediaModals — small wrappers for the video player and gallery detail sheet.
// Pure presentational; the parent supplies the selected record + close handler.

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import SmartVideoPlayer from '../../shared/SmartVideoPlayer';
import SwipeableSheet from '../../shared/SwipeableSheet';
import ContentGalleryViewer from './ContentGalleryViewer';

type VideoModalProps = {
  visible: boolean;
  selectedVideo: any | null;
  userId?: string | null;
  instituteId?: string | null;
  onClose: () => void;
};

export function ContentVideoModal({ visible, selectedVideo, userId, instituteId, onClose }: VideoModalProps) {
  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        {selectedVideo && (
          <SmartVideoPlayer
            videoId={selectedVideo.id}
            bunnyVideoId={selectedVideo.bunny_video_id}
            title={selectedVideo.title || 'محاضرة'}
            version={selectedVideo.version || 1}
            studentId={userId || undefined}
            instituteId={instituteId || undefined}
            onClose={onClose}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

type GallerySheetProps = {
  visible: boolean;
  selectedGallery: any | null;
  onClose: () => void;
};

export function ContentGallerySheet({ visible, selectedGallery, onClose }: GallerySheetProps) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <View style={styles.sheetBody}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { haptics.light(); onClose(); }}>
            <Ionicons name="close" size={24} color={tokens.color.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{selectedGallery?.title || 'ألبوم'}</Text>
        </View>
        {selectedGallery && (
          <ContentGalleryViewer gallery={selectedGallery} />
        )}
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.color.text,
  },
});
