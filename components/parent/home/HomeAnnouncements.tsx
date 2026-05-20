// First 5 announcements feed on parent home (brief §7.1).
// Each card: violet accent bar + title + 2-line body + Arabic date + trash to dismiss.
import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface Props {
  announcements: Announcement[];
  onDismiss?: (id: string) => void;
}

function HomeAnnouncements({ announcements, onDismiss }: Props) {
  const { t } = useTranslation();
  const slice = useMemo(() => announcements.slice(0, 5), [announcements]);

  return (
    <>
      <Text style={styles.sectionTitle}>
        {t('parent.latestAnnouncements', { defaultValue: 'آخر الإعلانات' })}
      </Text>
      {slice.length === 0 ? (
        <Text style={styles.empty}>
          {t('parent.noAnnouncements', { defaultValue: 'لا توجد إعلانات حالياً' })}
        </Text>
      ) : (
        slice.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.accent} />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.content} numberOfLines={2}>{item.content}</Text>
              <Text style={styles.date}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString('ar-IQ') : ''}
              </Text>
            </View>
            {onDismiss ? (
              <TouchableOpacity
                onPress={() => { haptics.light(); onDismiss(item.id); }}
                style={styles.dismissBtn}
                accessibilityLabel="إخفاء الإعلان"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={16} color={tokens.color.text3} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[3],
  },
  empty: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: tokens.spacing[5],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginBottom: 10,
  },
  accent: { width: 4, backgroundColor: tokens.color.p600 },
  body: { flex: 1, padding: 14 },
  dismissBtn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: tokens.color.border2,
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 3,
  },
  content: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    textAlign: 'right',
    lineHeight: 18,
  },
  date: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 4,
  },
});

export default memo(HomeAnnouncements);
