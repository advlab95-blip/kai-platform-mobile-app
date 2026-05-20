// Cafeteria home — orchestration only.
// Data flow:
//   useCafeteriaStore (Zustand) → items / orders / loadItems / loadOrders / updateOrderStatus
//   useDataStore.userInstituteId is the multi-tenant guard for every read.
//   Feature gate: useFeatureFlag('cafeteria'). When off → <LockedScreen />.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useCafeteriaStore from '../../stores/cafeteriaStore';
import { useProfilePic } from '../../hooks/useProfilePic';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { tokens } from '../../constants/designTokens';
import { nextStatus } from '../../utils/cafeteriaStatus';

import HomeHero from '../../components/cafeteria/home/HomeHero';
import StatsRow from '../../components/cafeteria/home/StatsRow';
import Shortcuts from '../../components/cafeteria/home/Shortcuts';
import RecentOrders from '../../components/cafeteria/home/RecentOrders';
import LockedScreen from '../../components/cafeteria/shared/LockedScreen';
import NotificationPanel from '../../components/shared/NotificationPanel';
import useNotificationStore from '../../stores/notificationStore';

export default function CafeteriaHome() {
  const { t } = useTranslation();
  const { userName, userId } = useAuthStore();
  const { avatarUrl, pickAndUploadAvatar } = useProfilePic(userId);
  const { userInstituteId } = useDataStore();
  const { items, orders, loadItems, loadOrders, updateOrderStatus, subscribeToItems } = useCafeteriaStore();
  const { unreadCount, loadNotifications } = useNotificationStore();
  const [refreshing, setRefreshing] = useState(false);
  const [notifPanelVisible, setNotifPanelVisible] = useState(false);
  const isEnabled = useFeatureFlag('cafeteria');

  useEffect(() => {
    if (userInstituteId) {
      loadItems(userInstituteId);
      loadOrders(userInstituteId);
    }
  }, [userInstituteId]);

  // Realtime menu sync — when the menu screen (or another device) edits
  // cafeteria_items, the home stats card stays in sync. Server filter is on
  // institute_id so cross-tenant traffic stays at zero.
  useEffect(() => {
    if (!userInstituteId) return;
    const unsubscribe = subscribeToItems(userInstituteId);
    return unsubscribe;
  }, [userInstituteId, subscribeToItems]);

  // Lazy: only fetch notifications when the bell is tapped (matches admin pattern).
  const handleBellPress = useCallback(() => {
    if (userId) loadNotifications(userId, 'cafeteria', userInstituteId || undefined);
    setNotifPanelVisible(true);
  }, [userId, userInstituteId, loadNotifications]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userInstituteId) {
        await Promise.all([loadItems(userInstituteId), loadOrders(userInstituteId)]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [userInstituteId]);

  const newOrders = useMemo(
    () => orders.filter((o: any) => o.status === 'new' || o.status === 'pending'),
    [orders],
  );
  const recentOrders = useMemo(() => orders.slice(0, 4), [orders]);

  const handleStatusChange = useCallback(
    async (orderId: string, currentStatus: string) => {
      const next = nextStatus(currentStatus);
      if (next === currentStatus) return;
      try {
        if (userInstituteId) await updateOrderStatus(orderId, next, userInstituteId);
      } catch (err: any) {
        Alert.alert(t('common.error'), err?.message || t('cafeteria.updateFailed'));
      }
    },
    [userInstituteId, updateOrderStatus, t],
  );

  if (!isEnabled) return <LockedScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FadeSlideIn style={styles.flex}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tokens.color.o600}
            />
          }
        >
          <HomeHero
            userName={userName}
            avatarUrl={avatarUrl}
            onAvatarPress={pickAndUploadAvatar}
            onBellPress={handleBellPress}
            unreadCount={unreadCount}
          />

          <View style={styles.content}>
            <StatsRow newOrdersCount={newOrders.length} itemsCount={items.length} />
            <Shortcuts newOrdersCount={newOrders.length} />
            <RecentOrders orders={recentOrders} onAdvance={handleStatusChange} />
            <View style={styles.bottomSpacer} />
          </View>
        </ScrollView>
      </FadeSlideIn>

      <NotificationPanel
        visible={notifPanelVisible}
        onClose={() => setNotifPanelVisible(false)}
        userId={userId}
        title={t('common.notifications', { defaultValue: 'الإشعارات' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing[4], paddingTop: tokens.spacing[4] },
  bottomSpacer: { height: 30 },
});
