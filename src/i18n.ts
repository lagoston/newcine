import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enTranslations from './locales/en.json';
import ptTranslations from './locales/pt.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations
      },
      pt: {
        translation: ptTranslations
      }
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'pt'],
    detection: {
      order: ['navigator', 'localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      convertDetectedLanguage: (lng) => {
        if (lng.startsWith('pt')) return 'pt';
        return 'en';
      }
    },
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  });

export default i18n;