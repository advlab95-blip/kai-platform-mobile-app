import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { useEffect } from 'react';
import { Colors } from '../../constants/colors';
import { useTranslation } from 'react-i18next';
import ServicesTabIcon from '../../components/shared/ServicesTabIcon';
import TabLabel from '../../components/shared/TabLabel';
import { haptics } from '../../utils/haptics';
import { offlineQueue } from '../../utils/offlineQueue';
import { api } from '../../services/api';

export default function StudentLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Register the executor for queued assignment submissions. The offline
  // queue auto-flushes on connectivity-rising edge, but the executor must
  // be registered before that happens.
  useEffect(() => {
    offlineQueue.registerExecutor('assignment_submission', async (item) => {
      try {
        await api.submitAssignment(item.payload.submissionId);
        return true;
      } catch {
        return false;
      }
    });
    // Best-effort flush on mount in case we came back online while killed.
    offlineQueue.flush().catch(() => {});
    return () => {
      offlineQueue.unregisterExecutor('assignment_submission');
    };
  }, []);

  const isTablet = width >= 768;
  const isSmallPhone = width < 360;
  const tabIconSize = isTablet ? 28 : isSmallPhone ? 20 : 22;
  const tabFontSize = isTablet ? 13 : isSmallPhone ? 9 : 11;
  const tabPaddingHorizontal = isTablet ? 24 : isSmallPhone ? 2 : 6;
  const tabBarBaseHeight = isTablet ? 76 : isSmallPhone ? 60 : 66;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarHideOnKeyboard: true,
        animation: 'fade',
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          shadowColor: 'transparent',
          height: tabBarBaseHeight + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 4,
          paddingHorizontal: tabPaddingHorizontal,
        },
        tabBarLabelStyle: { fontSize: tabFontSize, fontWeight: '700' },
        tabBarLabel: ({ color, focused, children }) => (
          <TabLabel label={children as string} color={color} fontSize={tabFontSize} focused={focused} />
        ),
      }}
      screenListeners={{ tabPress: () => { haptics.selection(); } }}
    >
      <Tabs.Screen name="index" options={{ title: t('common.home'), tabBarAccessibilityLabel: t('common.home'), tabBarIcon: ({ color }) => <Ionicons name="home" size={tabIconSize} color={color} /> }} />
      <Tabs.Screen name="services" options={{ title: t('common.services'), tabBarAccessibilityLabel: t('common.services'), tabBarIcon: ({ color }) => <ServicesTabIcon color={color} size={tabIconSize} /> }} />
      {/* Content tab — replaced stats in the bottom bar per user request */}
      <Tabs.Screen name="content" options={{ title: t('common.content', { defaultValue: 'المحتوى' }), tabBarAccessibilityLabel: t('common.content', { defaultValue: 'المحتوى' }), tabBarIcon: ({ color }) => <Ionicons name="book" size={tabIconSize} color={color} /> }} />
      {/* Settings replaces schedule in the bottom bar; schedule moves to Services hub */}
      <Tabs.Screen name="settings" options={{ title: t('common.settings', { defaultValue: 'الإعدادات' }), tabBarAccessibilityLabel: t('common.settings', { defaultValue: 'الإعدادات' }), tabBarIcon: ({ color }) => <Ionicons name="settings" size={tabIconSize} color={color} /> }} />

      {/* Hidden screens — accessed from Services Hub (stats is now here) */}
      <Tabs.Screen name="stats" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="assignments" options={{ href: null }} />
      <Tabs.Screen name="exams" options={{ href: null }} />
      <Tabs.Screen name="certificates" options={{ href: null }} />
      <Tabs.Screen name="ai" options={{ href: null }} />
      <Tabs.Screen name="ai-chat" options={{ href: null }} />
      <Tabs.Screen name="class-chat" options={{ href: null }} />
      <Tabs.Screen name="ai-tools" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="subject-detail" options={{ href: null }} />
      <Tabs.Screen name="exam-schedule" options={{ href: null }} />
      <Tabs.Screen name="leave-request" options={{ href: null }} />
      <Tabs.Screen name="my-behavior" options={{ href: null }} />
      <Tabs.Screen name="attendance-history" options={{ href: null }} />
      <Tabs.Screen name="my-fees" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="bookmarks" options={{ href: null }} />
    </Tabs>
  );
}
