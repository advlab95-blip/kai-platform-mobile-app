import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Linking,
  Alert,
  ScrollView,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import type { AdminAd } from '../../types';

const SEEN_KEY = 'seen_ad_overlay_v1';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function isSafeExternalUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

async function loadSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function markSeen(adId: string) {
  try {
    const seen = await loadSeen();
    if (!seen.includes(adId)) {
      seen.push(adId);
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-200)));
    }
  } catch { /* silent */ }
}

/**
 * Full-screen ad overlay that appears once per ad on app open. Picks the most
 * recent active ad the user hasn't dismissed yet, shows it as a modal with
 * image + title + body + optional CTA + close X. Dismissal is sticky in
 * AsyncStorage so the same ad never shows twice on the same device.
 *
 * Mounted in RootLayout so it triggers for every authenticated role.
 */
export default function AdOverlay() {
  const { userId, role, isInitialized } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const [ad, setAd] = useState<AdminAd | null>(null);
  const [visible, setVisible] = useState(false);
  const lastCheckRef = useRef<number>(0);

  const checkForAd = async (force = false) => {
    if (!userId || !role || !isInitialized) return;
    // Non-admin roles must have a resolved institute — otherwise getActiveAds
    // silently downgrades to global-only ads and we'd miss tenant-targeted ones.
    if (role !== 'admin' && !userInstituteId) return;
    // Throttle: don't recheck more than once per 60s on foreground events.
    // First call after auth ready bypasses the throttle (force=true).
    if (!force && Date.now() - lastCheckRef.current < 60_000) return;
    lastCheckRef.current = Date.now();

    try {
      // Platform admins don't have an institute; pass empty so the client-side
      // filter only returns global ads (owner_institute_id NULL + no targets).
      const ads = await api.getActiveAds(userInstituteId || '');
      if (!ads || ads.length === 0) return;
      const seen = await loadSeen();
      // Newest unseen ad
      const candidate = ads.find((a) => !seen.includes(a.id));
      if (!candidate) return;
      setAd(candidate);
      setVisible(true);
      // Bump views once when the overlay actually appears
      api.incrementAdViews(candidate.id);
    } catch { /* silent */ }
  };

  // Trigger on auth ready and on every app foreground transition
  useEffect(() => {
    if (!isInitialized || !userId || !role) return;
    if (role !== 'admin' && !userInstituteId) return;
    checkForAd(true);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkForAd();
    });
    return () => sub.remove();
  }, [isInitialized, userId, role, userInstituteId]);

  const handleDismiss = async () => {
    if (ad) await markSeen(ad.id);
    setVisible(false);
    setTimeout(() => setAd(null), 300);
  };

  const handleCta = async () => {
    if (!ad?.link_url) return;
    if (!isSafeExternalUrl(ad.link_url)) {
      Alert.alert('تنبيه', 'الرابط غير صالح');
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(ad.link_url);
      if (canOpen) {
        await Linking.openURL(ad.link_url);
        await handleDismiss();
      }
    } catch {
      Alert.alert('تنبيه', 'تعذّر فتح الرابط');
    }
  };

  if (!ad) return null;

  const hasImage = !!ad.image_url;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          {/* Close X — top-left in RTL */}
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="إغلاق الإعلان"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
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
                    colors={['transparent', 'rgba(0,0,0,0.55)']}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              ) : (
                <LinearGradient
                  colors={['#020024', '#2F2FBA', '#00D4FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientHeader}
                >
                  <Ionicons name="megaphone" size={48} color="#fff" />
                </LinearGradient>
              )}

              <View style={styles.body}>
                <Text style={styles.title}>{ad.title}</Text>
                {!!ad.body && <Text style={styles.bodyText}>{ad.body}</Text>}

                {ad.link_url ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={handleCta}
                    style={styles.ctaWrap}
                  >
                    <LinearGradient
                      colors={[Colors.primary, '#1E40AF']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cta}
                    >
                      <Ionicons name="open-outline" size={18} color="#fff" />
                      <Text style={styles.ctaText}>عرض المزيد</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  onPress={handleDismiss}
                  style={styles.dismissBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dismissText}>إغلاق</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,0,36,0.85)',
  },
  safe: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  imageWrap: {
    width: '100%',
    height: SCREEN_H * 0.32,
    backgroundColor: '#0F172A',
  },
  image: { width: '100%', height: '100%' },
  gradientHeader: {
    width: '100%',
    height: SCREEN_H * 0.22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    lineHeight: 30,
    marginBottom: 10,
  },
  bodyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 22,
    marginBottom: 20,
  },
  ctaWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  cta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
  },
  dismissBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
});
