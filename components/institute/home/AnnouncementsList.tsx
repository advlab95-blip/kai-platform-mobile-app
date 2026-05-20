// AnnouncementsList — renders the latest 10 announcements as AnnouncementCards.
// Pure presentational; long-press triggers parent's delete handler. Empty state included.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/theme';
import AnnouncementCard, { type AnnTone } from '../AnnouncementCard';

type AnnouncementMap = { tone: AnnTone; chip: string };

type Props = {
  announcements: any[];
  deletingAnnId: string | null;
  mapAnnouncement: (role: string) => AnnouncementMap;
  onLongPressAnnouncement: (id: string, title: string) => void;
};

export default function AnnouncementsList({
  announcements,
  deletingAnnId,
  mapAnnouncement,
  onLongPressAnnouncement,
}: Props) {
  const { t } = useTranslation();

  if (announcements.length === 0) {
    return <Text style={styles.emptyText}>{t('institute.noAnnouncements')}</Text>;
  }

  return (
    <View style={{ gap: 10 }}>
      {announcements.slice(0, 10).map((item: any, idx: number) => {
        const m = mapAnnouncement(item.target_role);
        const dimmed = deletingAnnId === item.id;
        return (
          <View key={item.id} style={{ opacity: dimmed ? 0.5 : 1 }}>
            <AnnouncementCard
              title={item.title}
              content={item.content}
              chip={m.chip}
              date={new Date(item.created_at).toLocaleDateString('ar-IQ')}
              tone={m.tone}
              delay={idx * 60}
              onLongPress={() => onLongPressAnnouncement(item.id, item.title)}
              onDelete={() => onLongPressAnnouncement(item.id, item.title)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 13,
    color: tokens.text[3],
    textAlign: 'center',
    paddingVertical: 20,
  },
});
