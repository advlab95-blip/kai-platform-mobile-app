import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useTranslation } from 'react-i18next';
import TabLabel from '../../components/shared/TabLabel';
import { haptics } from '../../utils/haptics';

export default function CafeteriaLayout() {
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
        tabBarLabelStyle: {
          fontSize: tabFontSize,
          fontWeight: '700',
        },
        tabBarLabel: ({ color, focused, children }) => (
          <TabLabel label={children as string} color={color} fontSize={tabFontSize} focused={focused} />
        ),
      }}
      screenListeners={{ tabPress: () => { haptics.selection(); } }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('common.home'),
          tabBarAccessibilityLabel: t('common.home'),
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={tabIconSize} color={color} />
          ),
        }}
      />
      {/* Hidden — accessed via home shortcuts */}
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="menu" options={{ href: null }} />
      <Tabs.Screen name="sales" options={{ href: null }} />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('common.settings'),
          tabBarAccessibilityLabel: t('common.settings'),
          tabBarIcon: ({ color }) => (
            <Ionicons name="settings" size={tabIconSize} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
