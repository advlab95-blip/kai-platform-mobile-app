import { useEffect } from 'react';
import useAuthStore from '../stores/authStore';
import useDataStore from '../stores/dataStore';
import useNotificationStore from '../stores/notificationStore';

// Thin hook: loads notifications on mount and subscribes to realtime inserts.
// Existing screens already drive the store directly — this exists so new
// screens can get the bell wired up in one line without duplicating the
// mount/subscribe dance.
export function useNotifications() {
  const { userId, role } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const {
    notifications, unreadCount, isLoading,
    loadNotifications, markAsRead, markAllRead, subscribeToRealtime,
  } = useNotificationStore();

  useEffect(() => {
    if (!userId || !role) return;
    loadNotifications(userId, role, userInstituteId || undefined);
    const unsub = subscribeToRealtime(userId, role, userInstituteId || undefined);
    return unsub;
  }, [userId, role, userInstituteId, loadNotifications, subscribeToRealtime]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: (notifId: string) => (userId ? markAsRead(notifId, userId) : Promise.resolve()),
    markAllRead: () => (userId ? markAllRead(userId) : Promise.resolve()),
    reload: () =>
      userId && role
        ? loadNotifications(userId, role, userInstituteId || undefined)
        : Promise.resolve(),
  };
}

export default useNotifications;
