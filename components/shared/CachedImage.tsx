import React from 'react';
import { Image as ExpoImage } from 'expo-image';
import { StyleProp, ImageStyle } from 'react-native';

interface CachedImageProps {
  source: { uri: string } | number;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none';
  placeholder?: string;
  transition?: number;
}

/**
 * Cached image component using expo-image.
 * Automatically caches images on disk — loads instantly on repeat views.
 * Drop-in replacement for React Native's Image component.
 */
export default function CachedImage({
  source,
  style,
  contentFit = 'cover',
  placeholder,
  transition = 200,
}: CachedImageProps) {
  return (
    <ExpoImage
      source={source}
      style={style}
      contentFit={contentFit}
      placeholder={placeholder}
      transition={transition}
      cachePolicy="disk"
    />
  );
}
