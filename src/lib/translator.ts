const DEEPL_API_KEY = import.meta.env.VITE_DEEPL_API_KEY;
const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';

export type SupportedLanguage = 'en' | 'pt' | 'es';

export async function translateText(text: string, targetLang: SupportedLanguage): Promise<string> {
  if (targetLang === 'en') {
    return text;
  }

  if (!DEEPL_API_KEY) {
    console.warn('DeepL API key not configured, returning original text');
    return text;
  }

  try {
    const response = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text: text,
        target_lang: targetLang === 'pt' ? 'PT-BR' : targetLang.toUpperCase(),
        preserve_formatting: '1',
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepL API error: ${response.status}`);
    }

    const data = await response.json();
    return data.translations?.[0]?.text || text;
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}

export function getCurrentLanguage(): SupportedLanguage {
  const i18nLang = localStorage.getItem('i18nextLng') || 'en';

  if (i18nLang.startsWith('pt')) return 'pt';
  if (i18nLang.startsWith('es')) return 'es';
  return 'en';
}

export async function autoTranslate(text: string): Promise<string> {
  const currentLang = getCurrentLanguage();
  return translateText(text, currentLang);
}
