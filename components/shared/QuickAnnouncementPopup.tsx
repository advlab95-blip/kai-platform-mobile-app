import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  I18nManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useQuickAnnouncementPopup } from '../../hooks/useQuickAnnouncementPopup';

const { height: SCREEN_H } = Dimensions.get('window');

/**
 * Centered modal popup for "quick announcements" sent by the admin. Mounted
 * once at the root layout level so it shows for every authenticated role on
 * the first app open after a new announcement is published. Dismissal is
 * persisted per-user in the DB (announcement_dismissals) + per-session in
 * AsyncStorage so the same popup never repeats.
 *
 * Distinct from AdOverlay (which surfaces `admin_ads` — image/CTA promos).
 * This component handles plain text announcements with title + body only.
 */
export default function QuickAnnouncementPopup() {
  const { popup, visible, dismiss } = useQuickAnnouncementPopup();

  if (!popup) return null;

  // In RTL the visual "top-left" is rendered by setting `start` on the absolute
  // position so it tracks the logical layout direction automatically. We use
  // an explicit `right` value when not RTL and `left` value when RTL so the
  // close button sits at the corner OPPOSITE to where the eye would normally
  // read first — matching the request ("X top-left in RTL, top-right in LTR").
  const closeBtnPosition = I18nManager.isRTL
    ? { left: 14 }
    : { right: 14 };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            {/* Close X — corner button. Hit slop expanded for accessibility. */}
            <TouchableOpacity
              onPress={dismiss}
              style={[styles.closeBtn, closeBtnPosition]}
              accessibilityRole="button"
              accessibilityLabel="إغلاق الإعلان"
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <Ionicons name="close" size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Hero ribbon — uses the platform gradient so the popup feels
                native to KAI without a custom image. */}
            <LinearGradient
              colors={['#020024', '#2F2FBA', '#00D4FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroBar}
            >
              <View style={styles.iconBubble}>
                <Ionicons name="megaphone" size={28} color="#fff" />
              </View>
            </LinearGradient>

            <ScrollView
              contentContainerStyle={styles.bodyScroll}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.title} numberOfLines={3}>
                {popup.title}
              </Text>
              <Text style={styles.body}>{popup.content}</Text>
            </ScrollView>

            <TouchableOpacity
              onPress={dismiss}
              style={styles.confirmBtnWrap}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="حسناً"
            >
              <LinearGradient
                colors={[Colors.primary, '#1E40AF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmText}>حسناً</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,0,36,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 420,
    maxHeight: SCREEN_H * 0.78,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 14,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    zIndex: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBar: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 19,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    lineHeight: 28,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 24,
    marginBottom: 8,
  },
  confirmBtnWrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },
  confirmBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});
