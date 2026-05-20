import { Tabs } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useTranslation } from 'react-i18next';
import TabLabel from '../../components/shared/TabLabel';
import { haptics } from '../../utils/haptics';

export default function MedicalLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isSmallPhone = width < 360;
  const tabIconSize = isTablet ? 28 : isSmallPhone ? 20 : 22;
  const tabFontSize = isTablet ? 13 : isSmallPhone ? 9 : 11;
  const tabPaddingHorizontal = isTablet ? 24 : isSmallPhone ? 2 : 6;
  const tabBarBaseHeight = isTablet ? 76 : isSmallPhone ? 60 : 66;
  // Pill (centered "records" tab) sizes scale with the device too.
  const pillSize = isTablet ? 64 : isSmallPhone ? 44 : 52;
  const pillIconSize = isTablet ? 30 : isSmallPhone ? 20 : 24;
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
      <Tabs.Screen
        name="records"
        options={{
          title: t('medical.records'),
          tabBarAccessibilityLabel: t('medical.records'),
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: pillSize,
                height: pillSize,
                borderRadius: pillSize / 2,
                backgroundColor: focused ? Colors.medical : '#E2E8F0',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                shadowColor: Colors.medical,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: focused ? 0.4 : 0,
                shadowRadius: 8,
                elevation: focused ? 6 : 0,
              }}
            >
              <Ionicons
                name="document-text"
                size={pillIconSize}
                color={focused ? '#fff' : Colors.textMuted}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('common.reports'),
          tabBarAccessibilityLabel: t('common.reports'),
          tabBarIcon: ({ color }) => (
            <Ionicons name="analytics" size={tabIconSize} color={color} />
          ),
        }}
      />

      {/* Hidden screens */}
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="visits" options={{ href: null }} />
      <Tabs.Screen name="medications" options={{ href: null }} />
      <Tabs.Screen name="vaccinations" options={{ href: null }} />
      <Tabs.Screen name="critical" options={{ href: null }} />
    </Tabs>
  );
}
