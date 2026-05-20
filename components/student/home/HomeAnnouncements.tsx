// HomeAnnouncements — FlashList of up to 10 announcements (teal accent bar).
// Pure presentational. Empty state shows "no announcements yet". An eye-off
// icon on each card calls `onDismiss(id)` which the parent wires to the
// per-user dismissal store (does NOT delete globally — only hides for this
// student).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type Announcement = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

type Props = {
  announcements: Announcement[];
  onDismiss?: (id: string) => void;
};

export default function HomeAnnouncements({ announcements, onDismiss }: Props) {
  const { t } = useTranslation();

  return (
    <>
      <Text style={styles.sectionTitle}>{t('student.announcements')}</Text>
      {announcements.length === 0 ? (
        <Text style={styles.emptyText}>{t('student.noAnnouncements')}</Text>
      ) : (
        <FlashList
          data={announcements.slice(0, 10)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.announcementCard}>
              <LinearGradient
                colors={tokens.gradient.teal as unknown as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.announcementAccent}
              />
              <View style={styles.announcementBody}>
                <View style={styles.announcementHeader}>
                  {onDismiss ? (
                    <TouchableOpacity
                      onPress={() => { haptics.light(); onDismiss(item.id); }}
                      style={styles.trashBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="إخفاء التبليغ"
                    >
                      {/* This action only hides the announcement from THIS user's
                          feed (per-user dismissal table) — it does NOT delete the
                          announcement globally. Using a red trash icon led users
                          to believe they were destroying content for everyone, so
                          we use eye-off + muted color to communicate "hide". */}
                      <Ionicons name="eye-off-outline" size={16} color={tokens.color.text2} />
                    </TouchableOpacity>
                  ) : null}
                  <Text style={styles.announcementDate}>
                    {new Date(item.created_at).toLocaleDateString('ar-IQ')}
                  </Text>
                </View>
                <Text style={styles.announcementTitle}>{item.title}</Text>
                <Text style={styles.announcementContent} numberOfLines={2}>
                  {item.content}
                </Text>
              </View>
            </View>
          )}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: 0 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 20,
  },
  announcementCard: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  announcementAccent: {
    width: 4,
  },
  announcementBody: {
    flex: 1,
    padding: 14,
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  announcementDate: {
    fontSize: 9,
    color: tokens.color.text3,
    fontVariant: ['tabular-nums'],
  },
  trashBtn: {
    padding: 4,
    borderRadius: tokens.radius.sm,
  },
  announcementTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 3,
  },
  announcementContent: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    textAlign: 'right',
    lineHeight: 18,
  },
});
