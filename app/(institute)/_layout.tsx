import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import ServicesTabIcon from '../../components/shared/ServicesTabIcon';
import TabLabel from '../../components/shared/TabLabel';
import { haptics } from '../../utils/haptics';
import { tokens } from '../../constants/theme';

// Wraps each tab icon so the active tab gets a 3px indicator bar above it.
// Keeps the touch target untouched — indicator is purely visual (pointerEvents: none).
function TabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={iconStyles.wrap}>
      <View
        pointerEvents="none"
        style={[
          iconStyles.indicator,
          { backgroundColor: focused ? tokens.brand[500] : 'transparent' },
        ]}
      />
      {children}
    </View>
  );
}

// Tab bar background — solid translucent white (BlurView removed to keep build OTA-safe).
function GlassTabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.96)' }]} />
    </View>
  );
}

export default function InstituteLayout() {
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
        tabBarActiveTintColor: tokens.brand[500],
        tabBarInactiveTintColor: tokens.text[3],
        tabBarHideOnKeyboard: true,
        animation: 'fade',
        tabBarBackground: () => <GlassTabBarBackground />,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          shadowColor: 'transparent',
          height: tabBarBaseHeight + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 6,
          paddingHorizontal: tabPaddingHorizontal,
        },
        tabBarLabelStyle: { fontSize: tabFontSize, fontWeight: '700' },
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
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Ionicons name="home" size={tabIconSize} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: t('common.services'),
          tabBarAccessibilityLabel: t('common.services'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <ServicesTabIcon color={color} size={tabIconSize} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('common.schedule'),
          tabBarAccessibilityLabel: t('common.schedule'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Ionicons name="calendar" size={tabIconSize} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('common.settings'),
          tabBarAccessibilityLabel: t('common.settings'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Ionicons name="settings" size={tabIconSize} color={color} />
            </TabIcon>
          ),
        }}
      />

      {/* Hidden screens */}
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="certificates" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="promotion" options={{ href: null }} />
      <Tabs.Screen name="archive" options={{ href: null }} />
      <Tabs.Screen name="users" options={{ href: null }} />
      <Tabs.Screen name="ads" options={{ href: null }} />
      <Tabs.Screen name="classes" options={{ href: null }} />
      {/* voice — legacy standalone voice broadcast page, replaced by voice-in-chat
          inside (institute)/chat.tsx (1-1 + group). Kept routed (with a redirect)
          to handle any stale deep links; no UI entry points reach it. */}
      <Tabs.Screen name="voice" options={{ href: null }} />
      <Tabs.Screen name="finance" options={{ href: null }} />
      <Tabs.Screen name="exam-schedule" options={{ href: null }} />
      <Tabs.Screen name="exam-schedule-builder" options={{ href: null }} />
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="leave-requests" options={{ href: null }} />
      {/* Institute ops expansion (2026-05-16) — all hidden, reached via Services Hub */}
      <Tabs.Screen name="audit" options={{ href: null }} />
      <Tabs.Screen name="help-support" options={{ href: null }} />
      <Tabs.Screen name="payroll" options={{ href: null }} />
      <Tabs.Screen name="academic-calendar" options={{ href: null }} />
      <Tabs.Screen name="ann-templates" options={{ href: null }} />
      <Tabs.Screen name="roles" options={{ href: null }} />
      <Tabs.Screen name="bulk-import" options={{ href: null }} />
      <Tabs.Screen name="behavior-notes" options={{ href: null }} />
      <Tabs.Screen name="library" options={{ href: null }} />
      <Tabs.Screen name="bus-routes" options={{ href: null }} />
    </Tabs>
  );
}

const iconStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  indicator: {
    position: 'absolute',
    top: -2,
    width: 24,
    height: 3,
    borderRadius: 2,
  },
});
