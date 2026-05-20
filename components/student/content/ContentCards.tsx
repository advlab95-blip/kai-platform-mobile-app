// ContentCards — pure presentational row cards for the student content feed.
// Exports: PulsingLiveDot, VideoCard, LiveCard, GalleryCard, VoiceCard, MaterialCard.
// All state lives in the parent (content.tsx); these emit press handlers via props.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

// Pulsing red LIVE dot — drives the "live now" visual on live stream rows.
export function PulsingLiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.liveDot, { opacity }]} />;
}

type VideoCardProps = {
  item: any;
  thumbnailUrl: string | null;
  formattedDate: string;
  onPress: () => void;
};

export function VideoCard({ item, thumbnailUrl, formattedDate, onPress }: VideoCardProps) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity style={styles.videoCard} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.videoThumbWrap}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.videoThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        ) : (
          <View style={[styles.videoThumb, styles.videoThumbPlaceholder]}>
            <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.7)" />
          </View>
        )}
        <View style={styles.videoPlayChip}>
          <Ionicons name="play" size={14} color={tokens.color.purple} />
        </View>
      </View>
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>{item.title || t('student.lecture')}</Text>
        <Text style={styles.videoTeacher} numberOfLines={1}>{item.users?.full_name || ''}</Text>
        <Text style={styles.videoDate}>{formattedDate}</Text>
      </View>
    </TouchableOpacity>
  );
}

type LiveCardProps = {
  item: any;
  joinable: boolean;
  onPress: () => void;
};

export function LiveCard({ item, joinable, onPress }: LiveCardProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.liveCard}>
      <View style={styles.liveBadge}>
        <PulsingLiveDot />
        <Text style={styles.liveBadgeText}>{t('student.liveLabel')}</Text>
      </View>
      <View style={styles.liveInfo}>
        <Text style={styles.liveTitle} numberOfLines={1}>{item.title || 'بث مباشر'}</Text>
        <Text style={styles.liveTeacher} numberOfLines={1}>{item.users?.full_name || 'الأستاذ'}</Text>
      </View>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.joinBtnWrap}>
        {joinable ? (
          <LinearGradient
            colors={tokens.gradient.student}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.joinBtn}
          >
            <Text style={styles.joinBtnText}>{t('student.joinLabel')}</Text>
            <Ionicons name="enter-outline" size={16} color="#fff" />
          </LinearGradient>
        ) : (
          <View style={[styles.joinBtn, styles.joinBtnDisabled]}>
            <Text style={styles.joinBtnDisabledText}>{t('student.joinLabel')}</Text>
            <Ionicons name="enter-outline" size={16} color={tokens.color.text3} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

type GalleryCardProps = {
  item: any;
  count: number;
  onPress: () => void;
};

export function GalleryCard({ item, count, onPress }: GalleryCardProps) {
  return (
    <TouchableOpacity style={styles.galleryItem} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.galleryImageWrap}>
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={styles.galleryImage} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        ) : (
          <View style={[styles.galleryImage, styles.galleryPlaceholder]}>
            <Ionicons name="images" size={30} color={tokens.color.text3} />
          </View>
        )}
        {count > 0 && (
          <View style={styles.galleryCountBadge}>
            <Ionicons name="images" size={11} color={tokens.color.text2} />
            <Text style={styles.galleryCountText}>{count}</Text>
          </View>
        )}
      </View>
      <Text style={styles.galleryTitle} numberOfLines={1}>{item.title || 'ألبوم'}</Text>
    </TouchableOpacity>
  );
}

type VoiceCardProps = {
  item: any;
  isPlaying: boolean;
  formattedDate: string;
  onPress: () => void;
};

export function VoiceCard({ item, isPlaying, formattedDate, onPress }: VoiceCardProps) {
  return (
    <View style={styles.voiceCard}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.voicePlayBtn, { backgroundColor: isPlaying ? tokens.color.danger : tokens.color.teal600 }]}
        onPress={onPress}
      >
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#fff" />
      </TouchableOpacity>
      <View style={styles.voiceInfo}>
        <Text style={styles.voiceTitle} numberOfLines={1}>{item.title || item.sender_name || 'رسالة صوتية'}</Text>
        <Text style={styles.voiceDuration}>{item.duration ? `${Math.round(item.duration)}s` : ''}</Text>
      </View>
      <Text style={styles.voiceDate}>{formattedDate}</Text>
    </View>
  );
}

type MaterialCardProps = {
  item: any;
  isPdfChatEnabled: boolean;
  onViewPdf: () => void;
  onAskAi: () => void;
  onReserveBooklet: () => void;
};

export function MaterialCard({ item, isPdfChatEnabled, onViewPdf, onAskAi, onReserveBooklet }: MaterialCardProps) {
  const { t } = useTranslation();
  const isPdf = item.type === 'pdf';
  if (isPdf) {
    return (
      <View style={styles.materialCard}>
        <View style={[styles.materialIcon, { backgroundColor: tokens.color.dangerBg }]}>
          <Ionicons name="document-attach" size={24} color={tokens.color.danger} />
        </View>
        <View style={styles.materialInfo}>
          <Text style={styles.materialTitle} numberOfLines={2}>{item.title || 'ملف PDF'}</Text>
          <View style={[styles.pdfChip, { backgroundColor: tokens.color.dangerBg }]}>
            <Text style={[styles.pdfChipText, { color: tokens.color.danger }]}>PDF</Text>
          </View>
        </View>
        <View style={styles.pdfBtnCol}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.pdfBtn, { backgroundColor: tokens.color.dangerBg }]}
            onPress={onViewPdf}
          >
            <Ionicons name="eye" size={12} color={tokens.color.danger} />
            <Text style={[styles.pdfBtnText, { color: tokens.color.danger }]}>{t('student.viewBtn')}</Text>
          </TouchableOpacity>
          {isPdfChatEnabled && (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.pdfBtn, { backgroundColor: tokens.color.purpleBg }]}
              onPress={onAskAi}
            >
              <Ionicons name="chatbubble-ellipses" size={12} color={tokens.color.purple} />
              <Text style={[styles.pdfBtnText, { color: tokens.color.purple }]}>{t('student.askAI')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }
  // Booklet card
  return (
    <View style={styles.materialCard}>
      {item.cover_url ? (
        <Image
          source={{ uri: item.cover_url }}
          style={styles.bookletCover}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      ) : (
        <View style={[styles.bookletCover, styles.bookletCoverPlaceholder]}>
          <Ionicons name="book" size={28} color={tokens.color.teal600} />
        </View>
      )}
      <View style={styles.materialInfo}>
        <Text style={styles.materialTitle} numberOfLines={2}>{item.title || 'ملزمة'}</Text>
        <Text style={styles.materialPrice}>
          {item.price ? `${item.price} د.ع` : 'مجاني'}
        </Text>
      </View>
      <TouchableOpacity activeOpacity={0.85} onPress={onReserveBooklet} style={styles.reserveBtnWrap}>
        <LinearGradient
          colors={tokens.gradient.student}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.reserveBtn}
        >
          <Ionicons name="bookmark" size={14} color="#fff" />
          <Text style={styles.reserveBtnText}>{t('student.reserveBooklet')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Videos — 16:10 thumbnail on the right (RTL: image leading)
  videoCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...tokens.shadow.sm,
  },
  videoThumbWrap: {
    position: 'relative',
  },
  videoThumb: {
    width: 128,
    height: 80, // 16:10
    backgroundColor: tokens.color.surface3,
  },
  videoThumbPlaceholder: {
    backgroundColor: tokens.color.text2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayChip: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.purpleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoInfo: {
    flex: 1,
    padding: 12,
    alignItems: 'flex-end',
  },
  videoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  videoTeacher: {
    fontSize: 11,
    color: tokens.color.text2,
    marginTop: 3,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  videoDate: {
    fontSize: 10,
    color: tokens.color.text3,
    marginTop: 3,
  },
  // Live
  liveCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...tokens.shadow.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.danger,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  liveInfo: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  liveTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  liveTeacher: {
    fontSize: 11,
    color: tokens.color.text2,
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  joinBtnWrap: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: tokens.radius.md,
  },
  joinBtnDisabled: {
    backgroundColor: tokens.color.surface2,
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  joinBtnDisabledText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.color.text3,
  },
  // Gallery — square cover + count badge
  galleryItem: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  galleryImageWrap: {
    position: 'relative',
  },
  galleryImage: {
    width: '100%',
    aspectRatio: 1, // square
    backgroundColor: tokens.color.surface2,
  },
  galleryPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryCountBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.color.surface2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  galleryCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.color.text2,
  },
  galleryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    padding: 12,
    writingDirection: 'rtl',
  },
  // Voice — 48x48 play circle
  voiceCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...tokens.shadow.sm,
  },
  voicePlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.shadow.teal,
  },
  voiceInfo: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  voiceTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  voiceDuration: {
    fontSize: 11,
    color: tokens.color.text2,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  voiceDate: {
    fontSize: 10,
    color: tokens.color.text3,
  },
  // Materials — booklet + PDF cards
  materialCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...tokens.shadow.sm,
  },
  materialIcon: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.teal100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookletCover: {
    width: 56,
    height: 72,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface2,
  },
  bookletCoverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.teal100,
  },
  materialInfo: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  materialTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  materialPrice: {
    fontSize: 12,
    color: tokens.color.teal700,
    fontWeight: '800',
  },
  pdfChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
    alignSelf: 'flex-end',
  },
  pdfChipText: {
    fontSize: 10,
    fontWeight: '900',
  },
  pdfBtnCol: {
    alignItems: 'stretch',
    gap: 6,
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.sm,
  },
  pdfBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  reserveBtnWrap: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    ...tokens.shadow.teal,
  },
  reserveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: tokens.radius.md,
  },
  reserveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
});
