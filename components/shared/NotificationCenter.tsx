import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import useNotificationStore from '../../stores/notificationStore';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import SwipeableSheet from './SwipeableSheet';
import type { Notification, NotificationCategory } from '../../types';

type Tab = 'all' | 'unread' | NotificationCategory;

const TABS: { id: Tab; label: string }[] = [
  { id: 'all',       label: 'الكل' },
  { id: 'unread',    label: 'غير مقروء' },
  { id: 'academic',  label: 'أكاديمي' },
  { id: 'financial', label: 'مالي' },
  { id: 'admin',     label: 'إداري' },
  { id: 'urgent',    label: 'عاجل' },
];

// Icon per category — small visual anchor in the row.
const CATEGORY_ICON: Record<NotificationCategory, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  academic:  { name: 'school-outline',       color: '#4F46E5' },
  financial: { name: 'card-outline',         color: '#F59E0B' },
  admin:     { name: 'megaphone-outline',    color: '#0EA5E9' },
  urgent:    { name: 'alert-circle-outline', color: '#EF4444' },
  social:    { name: 'chatbubble-outline',   color: '#10B981' },
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ visible, onClose }: Props) {
  const router = useRouter();
  const { userId, role } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const {
    notifications, isLoading, unreadCount,
    loadNotifications, markAsRead, markAllRead,
  } = useNotificationStore();
  const [activeTab, setActiveTab] = useState<Tab>('all');

  // Reload when opened — cheap (cached page) and keeps badge in sync if
  // the user was offline while triggers fired.
  useEffect(() => {
    if (!visible || !userId || !role) return;
    loadNotifications(userId, role, userInstituteId || undefined);
  }, [visible, userId, role, userInstituteId, loadNotifications]);

  // Auto-mark all unread as read the moment the center opens — the user asked
  // for the bell itself to act as the read-all action. The "تعليم الكل" button
  // stays as a backup for the rare case the auto-mark fails. markedRef ensures
  // we only fire once per open cycle, never on reload.
  const markedRef = React.useRef(false);
  useEffect(() => {
    if (visible && !markedRef.current && userId && unreadCount > 0) {
      markedRef.current = true;
      markAllRead(userId);
    }
    if (!visible) markedRef.current = false;
  }, [visible, userId, unreadCount, markAllRead]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return notifications;
    if (activeTab === 'unread') return notifications.filter((n) => !n.is_read);
    return notifications.filter((n) => inferCategory(n) === activeTab);
  }, [notifications, activeTab]);

  const handleTap = async (n: Notification) => {
    if (!n.is_read && userId) await markAsRead(n.id, userId);
    const route = (n.data as any)?.route;
    if (typeof route === 'string' && route.length > 0) {
      onClose();
      // Give the modal a beat to dismiss so the navigation animation isn't clipped.
      setTimeout(() => {
        try { router.push(route as any); } catch { /* ignore invalid route */ }
      }, 120);
    }
  };

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق">
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>الإشعارات</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={() => userId && markAllRead(userId)}
            accessibilityRole="button"
            accessibilityLabel="تعليم الكل كمقروء"
          >
            <Text style={styles.markAll}>تعليم الكل</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <FlatList
          horizontal
          data={TABS}
          keyExtractor={(t) => t.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
          inverted
          renderItem={({ item }) => {
            const active = activeTab === item.id;
            const count = item.id === 'unread'
              ? unreadCount
              : item.id !== 'all'
                ? notifications.filter((n) => inferCategory(n) === item.id && !n.is_read).length
                : 0;
            return (
              <TouchableOpacity
                onPress={() => setActiveTab(item.id)}
                style={[styles.tab, active && styles.tabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {item.label}
                </Text>
                {count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* List */}
      {isLoading && notifications.length === 0 ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="notifications-off-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>لا توجد إشعارات</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => {
            const cat = inferCategory(item);
            const icon = CATEGORY_ICON[cat] ?? CATEGORY_ICON.admin;
            return (
              <TouchableOpacity
                onPress={() => handleTap(item)}
                style={[styles.row, !item.is_read && styles.rowUnread]}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}: ${item.message}`}
              >
                {!item.is_read && <View style={styles.unreadDot} />}
                <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.rowMsg} numberOfLines={2}>{item.message}</Text>
                  <Text style={styles.rowTime}>{formatTime(item.created_at)}</Text>
                </View>
                <View style={[styles.iconCircle, { backgroundColor: icon.color + '15' }]}>
                  <Ionicons name={icon.name} size={18} color={icon.color} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SwipeableSheet>
  );
}

// Fallback: use stored category if present, else derive from `type`.
function inferCategory(n: Notification): NotificationCategory {
  if (n.category) return n.category;
  const t = n.type || '';
  if (['grade', 'exam', 'assignment', 'attendance', 'absence'].includes(t)) return 'academic';
  if (['fee', 'payment', 'installment'].includes(t)) return 'financial';
  if (['announcement', 'admin_user_created', 'ad'].includes(t)) return 'admin';
  if (['medical', 'emergency', 'urgent'].includes(t)) return 'urgent';
  if (['message', 'chat'].includes(t)) return 'social';
  return 'admin';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'الآن';
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} س`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `قبل ${days} ي`;
  return d.toLocaleDateString('ar-IQ');
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text },
  markAll: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  tabsWrap: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  badge: {
    minWidth: 18, paddingHorizontal: 4, height: 18, borderRadius: 9,
    backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    marginHorizontal: 12, marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  rowUnread: { backgroundColor: Colors.primary + '08' },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  rowTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  rowMsg: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right' },
  rowTime: { fontSize: 10, color: Colors.textMuted, textAlign: 'right' },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});
