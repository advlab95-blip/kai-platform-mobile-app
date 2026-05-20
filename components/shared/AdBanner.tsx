import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import type { AdminAd } from '../../types';
import { api } from '../../services/api';

interface Props {
  ad: AdminAd;
  onDismiss?: (adId: string) => void;
}

const DISMISSED_KEY = 'dismissed_ads_v1';

// Module-scope so remounts (tab switches, list re-renders) don't double-count.
// Persists for the life of the JS bundle — exactly one view-bump per ad per session.
const viewedAdIds = new Set<string>();

// Only allow https links. Matches the server-side CHECK constraint on admin_ads.link_url.
function isSafeExternalUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

/**
 * Ad card for the student/teacher/etc. home feed. Renders either an image-dominant
 * design (when image_url is set) or a clean text card otherwise. Press → open link
 * (if link_url) and bump the server-side views counter. Dismiss is local-only
 * (AsyncStorage) so one user can hide an ad without affecting anyone else.
 */
export default function AdBanner({ ad, onDismiss }: Props) {
  useEffect(() => {
    if (viewedAdIds.has(ad.id)) return;
    viewedAdIds.add(ad.id);
    api.incrementAdViews(ad.id);
  }, [ad.id]);

  const handlePress = async () => {
    if (!ad.link_url) return;
    // Defense in depth: server rejects non-https on write, but an older row or
    // misconfigured data must never open arbitrary schemes (javascript:, intent://, etc).
    if (!isSafeExternalUrl(ad.link_url)) {
      Alert.alert('تنبيه', 'الرابط غير صالح');
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(ad.link_url);
      if (canOpen) await Linking.openURL(ad.link_url);
    } catch {
      Alert.alert('تنبيه', 'تعذّر فتح الرابط');
    }
  };

  const handleDismiss = async () => {
    try {
      const raw = await AsyncStorage.getItem(DISMISSED_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(ad.id)) list.push(ad.id);
      await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(list));
    } catch { /* silent */ }
    onDismiss?.(ad.id);
  };

  const hasImage = !!ad.image_url;

  return (
    <TouchableOpacity
      activeOpacity={ad.link_url ? 0.85 : 1}
      onPress={handlePress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={ad.title}
    >
      {hasImage ? (
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: ad.image_url! }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)']}
            style={styles.imageOverlay}
          />
          <View style={styles.imageText}>
            <Text style={styles.titleOnImage} numberOfLines={2}>{ad.title}</Text>
            {!!ad.body && (
              <Text style={styles.bodyOnImage} numberOfLines={2}>{ad.body}</Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.textCard}>
          <View style={styles.iconBubble}>
            <Ionicons name="megaphone" size={22} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titleText} numberOfLines={2}>{ad.title}</Text>
            {!!ad.body && (
              <Text style={styles.bodyText} numberOfLines={3}>{ad.body}</Text>
            )}
          </View>
        </View>
      )}

      {/* Dismiss */}
      <TouchableOpacity
        onPress={handleDismiss}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="إخفاء الإعلان"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.95)" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    position: 'relative',
  },
  imageWrap: { width: '100%', height: 180, position: 'relative' },
  image: { width: '100%', height: '100%' },
  imageOverlay: { ...StyleSheet.absoluteFillObject },
  imageText: { position: 'absolute', bottom: 12, left: 14, right: 14 },
  titleOnImage: { fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'right' },
  bodyOnImage: {
    fontSize: 13, color: 'rgba(255,255,255,0.9)', textAlign: 'right', marginTop: 4,
  },

  textCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
  },
  iconBubble: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  titleText: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  bodyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },

  close: {
    position: 'absolute',
    top: 8, left: 8,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
});

/**
 * Helper used by feed screens: filter out ads the user has dismissed locally.
 * Use as: `setAds((await api.getActiveAds(id)).filter(a => !dismissed.includes(a.id)))`
 */
export async function loadDismissedAdIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
