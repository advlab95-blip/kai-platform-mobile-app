import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useNotificationStore from '../../stores/notificationStore';
import NotificationCenter from './NotificationCenter';

interface Props {
  color?: string;
  size?: number;
  style?: any;
}

// Reusable bell + badge. Opens NotificationCenter on tap. Existing screens
// keep their ad-hoc panels; new screens can drop this in.
export default function NotificationBell({ color = 'rgba(255,255,255,0.85)', size = 22, style }: Props) {
  const { unreadCount } = useNotificationStore();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.btn, style]}
        accessibilityRole="button"
        accessibilityLabel={unreadCount > 0 ? `الإشعارات، ${unreadCount} غير مقروء` : 'الإشعارات'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="notifications-outline" size={size} color={color} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
          </View>
        )}
      </TouchableOpacity>
      <NotificationCenter visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
