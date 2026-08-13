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
      // ORDEM CORRIGIDA: localStorage primeiro. Antes era ['navigator', 'localStorage'],
      // o que significava que a escolha manual do usuário era salva corretamente mas
      // NUNCA consultada, porque o idioma do navegador/SO sempre "ganhava" primeiro.
      // Agora: se o usuário já escolheu um idioma antes, isso prevalece. Só quem
      // nunca escolheu (visitante novo) cai no idioma do navegador como antes.
      order: ['localStorage', 'navigator'],
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