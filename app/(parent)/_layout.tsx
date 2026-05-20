import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTranslation } from 'react-i18next';
import ServicesTabIcon from '../../components/shared/ServicesTabIcon';
import TabLabel from '../../components/shared/TabLabel';
import { haptics } from '../../utils/haptics';

export default function ParentLayout() {
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
      <Tabs.Screen name="services" options={{ title: t(`common.services`), tabBarAccessibilityLabel: t('common.services'), tabBarIcon: ({ color }) => <ServicesTabIcon color={color} size={tabIconSize} /> }} />
      <Tabs.Screen name="attendance" options={{ title: t('parent.attendance'), tabBarAccessibilityLabel: t('parent.attendance'), tabBarIcon: ({ color }) => <Ionicons name="checkmark-circle" size={tabIconSize} color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: t('parent.tabCommunication', { defaultValue: 'التواصل' }), tabBarAccessibilityLabel: t('parent.tabCommunication', { defaultValue: 'التواصل' }), tabBarIcon: ({ color }) => <Ionicons name="chatbubbles" size={tabIconSize} color={color} /> }} />

      {/* Hidden screens — accessed from Services Hub */}
      <Tabs.Screen name="academic" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="finance" options={{ href: null }} />
      <Tabs.Screen name="medical" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="grades" options={{ href: null }} />
      <Tabs.Screen name="exam-schedule" options={{ href: null }} />
      <Tabs.Screen name="leave-requests" options={{ href: null }} />
      <Tabs.Screen name="behavior" options={{ href: null }} />
      <Tabs.Screen name="assignments" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="meetings" options={{ href: null }} />
      <Tabs.Screen name="permission-slips" options={{ href: null }} />
    </Tabs>
  );
}
