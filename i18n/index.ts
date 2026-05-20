import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from '../locales/ar.json';

// Arabic-only mode — English removed per product decision.
// Legacy AsyncStorage('@language') is ignored; always force Arabic.
const initI18n = async () => {
  await i18n.use(initReactI18next).init({
    resources: {
      ar: { translation: ar },
    },
    lng: 'ar',
    fallbackLng: 'ar',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
};

initI18n();

export default i18n;

// Kept as a no-op so existing callers don't break.
export async function changeLanguage(_lang: 'ar') {
  await i18n.changeLanguage('ar');
}
