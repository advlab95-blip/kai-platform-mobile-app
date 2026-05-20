import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';
import TagChip from '../chips/TagChip';
import { styles } from './styles';

export interface GalleryCardProps {
  item: any;
  onOpen: (item: any) => void;
  onToggleVisibility: (item: any) => void;
  onShowViewers: (item: any) => void;
}

export default function GalleryCard({
  item,
  onOpen,
  onToggleVisibility,
  onShowViewers,
}: GalleryCardProps) {
  const { t } = useTranslation();
  const images: string[] = item.images || [];

  return (
    <TouchableOpacity style={styles.galleryCard} onPress={() => onOpen(item)} activeOpacity={0.8}>
      {images.length > 0 ? (
        <Image
          source={{ uri: images[0] }}
          style={styles.galleryThumb}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      ) : (
        <View style={styles.galleryThumb}>
          <Ionicons name="images" size={28} color={Colors.textMuted} />
        </View>
      )}
      <Text style={styles.galleryName}>{item.title || item.name || t('student.album')}</Text>
      <View style={{ marginTop: 4 }}>
        <TagChip tone="pink" icon="images" label={`${images.length} صورة`} />
      </View>
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          padding: 5,
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: 12,
        }}
        onPress={(e) => {
          e.stopPropagation?.();
          onToggleVisibility(item);
        }}
      >
        <Ionicons
          name={item.is_hidden ? 'eye-off' : 'eye'}
          size={16}
          color={item.is_hidden ? tokens.color.orange : tokens.color.success}
        />
      </TouchableOpacity>
      {/* Viewers — who opened this album */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 6,
          left: 40,
          padding: 5,
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: 12,
        }}
        onPress={(e) => {
          e.stopPropagation?.();
          onShowViewers(item);
        }}
      >
        <Ionicons name="people-outline" size={16} color={tokens.color.brand500} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
