import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTranslation } from 'react-i18next';
import ServicesTabIcon from '../../components/shared/ServicesTabIcon';
import TabLabel from '../../components/shared/TabLabel';
import { haptics } from '../../utils/haptics';

export default function AdminLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
          backgroundColor: Colors.background,
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          shadowColor: 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 0,
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
      <Tabs.Screen name="services" options={{ title: t(`common.services`), tabBarAccessibilityLabel: t('common.services'), tabBarIcon: ({ color }) => <ServicesTabIcon color={color} size={tabIconSize} /> }} />
      <Tabs.Screen name="users" options={{ title: t('admin.users'), tabBarAccessibilityLabel: t('admin.users'), tabBarIcon: ({ color }) => <Ionicons name="people" size={tabIconSize} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: t('common.settings'), tabBarAccessibilityLabel: t('common.settings'), tabBarIcon: ({ color }) => <Ionicons name="settings" size={tabIconSize} color={color} /> }} />

      {/* Hidden screens — accessed from Services Hub */}
      <Tabs.Screen name="finance" options={{ href: null }} />
      <Tabs.Screen name="features" options={{ href: null }} />
      <Tabs.Screen name="archive" options={{ href: null }} />
      <Tabs.Screen name="branches" options={{ href: null }} />
      <Tabs.Screen name="fees" options={{ href: null }} />
      <Tabs.Screen name="leave-requests" options={{ href: null }} />
      <Tabs.Screen name="devices" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="audit" options={{ href: null }} />
      <Tabs.Screen name="ai-limits" options={{ href: null }} />
      <Tabs.Screen name="ai-reports" options={{ href: null }} />
      <Tabs.Screen name="institutions" options={{ href: null }} />
      <Tabs.Screen name="exam-schedule" options={{ href: null }} />
      <Tabs.Screen name="exam-schedule-builder" options={{ href: null }} />
      {/* Platform admin ops (added 2026-05-16) — all hidden, reached via Services Hub */}
      <Tabs.Screen name="impersonation" options={{ href: null }} />
      <Tabs.Screen name="subscriptions" options={{ href: null }} />
      <Tabs.Screen name="broadcasts" options={{ href: null }} />
      <Tabs.Screen name="system-health" options={{ href: null }} />
      <Tabs.Screen name="institute-activity" options={{ href: null }} />
      <Tabs.Screen name="support-inbox" options={{ href: null }} />
      <Tabs.Screen name="moderation" options={{ href: null }} />
      <Tabs.Screen name="failed-logins" options={{ href: null }} />
      <Tabs.Screen name="changelog-editor" options={{ href: null }} />
      <Tabs.Screen name="bulk-feature-toggle" options={{ href: null }} />
      <Tabs.Screen name="tenant-comparison" options={{ href: null }} />
    </Tabs>
  );
}
