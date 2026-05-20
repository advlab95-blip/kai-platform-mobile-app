// Cafeteria settings — orchestration only.
// Persistence is hoisted into useCafeteriaSettings (Supabase first, AsyncStorage fallback;
// local-first save then Supabase upsert). Logout uses ConfirmSheet (in AccountCard).
// Feature gate: useFeatureFlag('cafeteria') → <LockedScreen />.
import React from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useCafeteriaSettings } from '../../hooks/useCafeteriaSettings';
import WorkingHoursCard from '../../components/cafeteria/settings/WorkingHoursCard';
import NotificationsCard from '../../components/cafeteria/settings/NotificationsCard';
import AccountCard from '../../components/cafeteria/settings/AccountCard';
import LockedScreen from '../../components/cafeteria/shared/LockedScreen';
import InteractionSettings from '../../components/shared/InteractionSettings';
import ThemeSettings from '../../components/shared/ThemeSettings';
import LanguageSettings from '../../components/shared/LanguageSettings';
import PrivacyTermsGroup from '../../components/shared/PrivacyTermsGroup';

export default function CafeteriaSettings() {
  const { t } = useTranslation();
  const { userName } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const isEnabled = useFeatureFlag('cafeteria');
  const {
    settings,
    setNotifOrders,
    setNotifLowStock,
    setAutoClose,
    setWorkingHoursFrom,
    setWorkingHoursTo,
  } = useCafeteriaSettings(userInstituteId);

  if (!isEnabled) return <LockedScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('cafeteria.settingsTitle')}
        gradient={tokens.gradient.cafeteria}
        glowAccent="rgba(249,115,22,0.35)"
        showBack={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        <WorkingHoursCard
          from={settings.workingHoursFrom}
          to={settings.workingHoursTo}
          onChangeFrom={setWorkingHoursFrom}
          onChangeTo={setWorkingHoursTo}
        />

        <NotificationsCard
          notifOrders={settings.notifOrders}
          notifLowStock={settings.notifLowStock}
          autoClose={settings.autoClose}
          onChangeNotifOrders={setNotifOrders}
          onChangeNotifLowStock={setNotifLowStock}
          onChangeAutoClose={setAutoClose}
        />

        {/* Theme + Language are null-renderers (Arabic-only / light-only).
            InteractionSettings owns its own card chrome — render as-is. */}
        <ThemeSettings />
        <LanguageSettings />
        <InteractionSettings />

        <PrivacyTermsGroup flush />

        <AccountCard userName={userName} instituteName={null} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  scrollContent: {
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[4],
    paddingBottom: 40,
  },
  title: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[4],
  },
});
