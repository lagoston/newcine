import i18n, { type BackendModule, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 18/11/2026 (otimização): idioma sob demanda. Antes os dois JSON (pt e en,
// ≈335 KB) iam dentro do pacote principal e toda abertura interpretava os dois;
// agora cada idioma é um pedaço separado do build e a pessoa baixa só o dela.
// No app (Capacitor) os pedaços estão dentro do APK: carregam na hora, sem rede.
//
// Os import() dos idiomas ficam no main.tsx (a entrada), e não aqui: este
// arquivo é importado pelo app inteiro, e o nome com hash de cada idioma muda a
// cada texto novo. Se o nome morasse aqui, mudar um texto trocaria o nome de
// quase todos os arquivos do site (e o celular baixaria tudo de novo).
export type LocaleLoaders = Record<string, () => Promise<{ default: ResourceKey }>>;

export function initI18n(loaders: LocaleLoaders) {
  const lazyLocales: BackendModule = {
    type: 'backend',
    init() {},
    read(language, _namespace, callback) {
      const load = loaders[language];
      if (!load) {
        callback(null, {});
        return;
      }
      load().then(
        (mod) => callback(null, mod.default),
        (error) => callback(error, null)
      );
    },
  };

  // Trocar de idioma (i18n.changeLanguage) continua igual: o i18next baixa o
  // outro idioma e só então troca.
  return i18n
    .use(lazyLocales)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      // Sem idioma de reserva: com 'en' aqui, quem usa pt baixaria o en também.
      // pt e en têm as mesmas chaves (só as formas de plural ordinal diferem).
      fallbackLng: false,
      supportedLngs: ['en', 'pt'],
      load: 'currentOnly',
      detection: {
        // ORDEM CORRIGIDA: localStorage primeiro. Antes era ['navigator', 'localStorage'],
        // o que significava que a escolha manual do usuário era salva corretamente mas
        // NUNCA consultada, porque o idioma do navegador/SO sempre "ganhava" primeiro.
        // Agora: se o usuário já escolheu um idioma antes, isso prevalece. Só quem
        // nunca escolheu (visitante novo) cai no idioma do navegador como antes.
        // (O index.html repete esta regra para pré-carregar o idioma certo.)
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
}

export default i18n;
