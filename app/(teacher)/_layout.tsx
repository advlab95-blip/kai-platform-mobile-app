import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTranslation } from 'react-i18next';
import ServicesTabIcon from '../../components/shared/ServicesTabIcon';
import TabLabel from '../../components/shared/TabLabel';
import { haptics } from '../../utils/haptics';

export default function TeacherLayout() {
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
      <Tabs.Screen name="services" options={{ title: t('common.services'), tabBarAccessibilityLabel: t('common.services'), tabBarIcon: ({ color }) => <ServicesTabIcon color={color} size={tabIconSize} /> }} />
      <Tabs.Screen name="content" options={{ title: t('common.content'), tabBarAccessibilityLabel: t('common.content'), tabBarIcon: ({ color }) => <Ionicons name="book" size={tabIconSize} color={color} /> }} />
      {/* Schedule swapped into the bottom nav (was settings). Per user request:
          "زر الاعدادات اللي موجوده بقسم الخدمات تخلي تحت بالنافيكيشن بار بمكان الجدول"
          → schedule now lives in the bottom bar, settings moved into Services hub. */}
      <Tabs.Screen name="schedule" options={{ title: t('common.schedule'), tabBarAccessibilityLabel: t('common.schedule'), tabBarIcon: ({ color }) => <Ionicons name="calendar" size={tabIconSize} color={color} /> }} />

      {/* Hidden screens — accessed from Services Hub */}
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="assignments" options={{ href: null }} />
      <Tabs.Screen name="ai-lessons" options={{ href: null }} />
      <Tabs.Screen name="voice" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="class-chat" options={{ href: null }} />
      <Tabs.Screen name="ai-tools" options={{ href: null }} />
      <Tabs.Screen name="live" options={{ href: null }} />
      <Tabs.Screen name="grades" options={{ href: null }} />
      <Tabs.Screen name="exams" options={{ href: null }} />
      <Tabs.Screen name="students" options={{ href: null }} />
      <Tabs.Screen name="exam-schedule" options={{ href: null }} />
      <Tabs.Screen name="leave-request" options={{ href: null }} />
      <Tabs.Screen name="my-week" options={{ href: null }} />
    </Tabs>
  );
}
