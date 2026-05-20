import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useNotificationStore from '../../stores/notificationStore';

// Tab icon for the Services tab. Shows a dot (not a count) only when there
// are unread notifications mapped to one of the service cards inside. The
// per-card badges inside the services hub carry the actual numbers — the tab
// indicator is just a "there's something to see" cue. Avoids the misleading
// double-counting where the tab said "66" but no single card explained why.
const SERVICE_TYPES = new Set([
  'announcement', 'message', 'chat', 'exam', 'exam_schedule', 'homework',
  'assignment', 'grade', 'attendance', 'promotion', 'schedule', 'timetable',
  'certificate', 'payment', 'finance',
]);

export default function ServicesTabIcon({ color, size }: { color: string; size: number }) {
  const unreadByType = useNotificationStore(s => s.unreadByType);
  const hasUnread = Object.entries(unreadByType).some(([t, n]) => SERVICE_TYPES.has(t) && (n || 0) > 0);
  return (
    <View style={{ width: size + 10, height: size + 6 }}>
      <Ionicons name="grid" size={size} color={color} />
      {hasUnread && <View style={s.dot} />}
    </View>
  );
}

const s = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
