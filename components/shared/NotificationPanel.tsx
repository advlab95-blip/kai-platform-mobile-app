import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import useNotificationStore from '../../stores/notificationStore';
import { haptics } from '../../utils/haptics';
import SwipeableSheet from './SwipeableSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  userId: string | null;
  /** Title shown in the header — each role passes its own localized string. */
  title?: string;
  /** Optional message for the empty state ("سيظهر هنا كل إشعار جديد" by default). */
  emptyHint?: string;
};

/**
 * Unified bottom-sheet notification panel reused by every role (admin,
 * institute, teacher, parent, student, cafeteria, medical). Keeping a single
 * source of truth stops the panels from drifting into 5 different designs.
 */
export default function NotificationPanel({ visible, onClose, userId, title, emptyHint }: Props) {
  const { t } = useTranslation();
  const { notifications, unreadCount, markAsRead, markAllRead, deleteOne, deleteAll } =
    useNotificationStore();

  const headerTitle = title || t('common.notifications', { defaultValue: 'الإشعارات' });

  // Auto-mark all unread as read the moment the panel opens — the user asked
  // for the bell to act as the read button (no separate "قراءة الكل" tap).
  // markedRef ensures we only fire once per open cycle.
  const markedRef = useRef(false);
  useEffect(() => {
    if (visible && !markedRef.current && userId && unreadCount > 0) {
      markedRef.current = true;
      markAllRead(userId);
    }
    if (!visible) markedRef.current = false;
  }, [visible, userId, unreadCount, markAllRead]);

  return (
    <SwipeableSheet visible={visible} onClose={onClose} sheetStyle={s.sheet}>
      <View style={s.inner}>
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.iconCircle}>
                <Ionicons name="notifications" size={18} color={Colors.primary} />
              </View>
              <View>
                <Text style={s.title}>{headerTitle}</Text>
                <Text style={s.subtitle}>
                  {unreadCount > 0 ? `${unreadCount} غير مقروءة` : 'لا يوجد جديد'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {notifications.length > 0 && (
            <View style={s.actionsRow}>
              {/* "قراءة الكل" removed — opening the panel auto-marks all read.
                  Trash deletes immediately (no confirmation) per teacher feedback. */}
              <TouchableOpacity
                style={[s.actionChip, s.actionChipDanger]}
                onPress={() => {
                  haptics.medium();
                  if (userId) deleteAll(userId);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={14} color={Colors.error} />
                <Text style={[s.actionChipText, { color: Colors.error }]}>حذف الكل</Text>
              </TouchableOpacity>
            </View>
          )}

          {notifications.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={40} color="#CBD5E1" />
              </View>
              <Text style={s.emptyTitle}>لا توجد إشعارات</Text>
              <Text style={s.emptySub}>{emptyHint || 'سيظهر هنا كل إشعار جديد'}</Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={[s.notifRow, !item.is_read && s.notifRowUnread]}>
                  <TouchableOpacity
                    onPress={() => {
                      if (!item.is_read && userId) markAsRead(item.id, userId);
                    }}
                    activeOpacity={0.7}
                    style={s.notifContent}
                  >
                    <View style={[s.notifIcon, !item.is_read && s.notifIconUnread]}>
                      <Ionicons
                        name="notifications"
                        size={16}
                        color={item.is_read ? Colors.textMuted : Colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.notifTitle}>{item.title}</Text>
                      <Text style={s.notifMsg} numberOfLines={2}>
                        {item.message}
                      </Text>
                    </View>
                    {!item.is_read && <View style={s.unreadDot} />}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      haptics.light();
                      if (userId) deleteOne(item.id, userId);
                    }}
                    style={s.deleteBtn}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
      </View>
    </SwipeableSheet>
  );
}

const s = StyleSheet.create({
  sheet: {
    paddingHorizontal: 18,
  },
  inner: {
    paddingHorizontal: 0,
    paddingBottom: 8,
    flexShrink: 1,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textAlign: 'right' },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
  },
  actionChipDanger: { backgroundColor: '#FEE2E2' },
  actionChipText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  emptyState: { alignItems: 'center', paddingVertical: 50 },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  emptySub: { fontSize: 11, color: Colors.textMuted },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  notifRowUnread: { backgroundColor: 'rgba(238,242,255,0.35)' },
  notifContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIconUnread: { backgroundColor: '#EEF2FF' },
  notifTitle: { fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  notifMsg: { fontSize: 11, color: Colors.textSecondary, textAlign: 'right', marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
