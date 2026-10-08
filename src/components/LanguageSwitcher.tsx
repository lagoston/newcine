import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { VELVET, PAPER, MIST, FOCUS_RING } from '../lib/oracleTheme';
import { LANGUAGES } from '../lib/languages';

// Troca de idioma da navbar, no tema noite: o globo com a sigla do idioma
// atual e um menu curto com os dois idiomas. Fecha no clique fora, no Esc
// e ao escolher.

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const current = LANGUAGES.find((lang) => i18n.language?.startsWith(lang.code)) || LANGUAGES[1];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t('common.changeLanguage', { defaultValue: 'Change language' })}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`flex items-center gap-1.5 h-10 px-2.5 rounded-xl border text-sm font-medium transition-all duration-300 ${FOCUS_RING} ${
          isOpen ? 'text-white bg-white/10 border-violet-400/40' : 'text-gray-300 hover:text-white hover:bg-white/10 border-transparent'
        }`}
      >
        <Globe className="w-[18px] h-[18px]" aria-hidden />
        <span className="text-xs font-semibold tracking-wide">{current.short}</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t('common.changeLanguage', { defaultValue: 'Change language' })}
          className="absolute right-0 mt-2 w-48 p-1.5 rounded-xl ring-1 ring-white/10 shadow-2xl shadow-black/60 z-50"
          style={{ background: VELVET }}
        >
          {LANGUAGES.map((language) => {
            const active = language.code === current.code;
            return (
              <button
                key={language.code}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => changeLanguage(language.code)}
                className={`w-full flex justify-start items-center gap-3 h-11 px-3 rounded-lg text-left text-sm transition ${FOCUS_RING} ${
                  active ? 'bg-violet-500/15' : 'hover:bg-white/5'
                }`}
                style={{ color: active ? PAPER : MIST }}
              >
                <span className="text-lg leading-none" aria-hidden>{language.flag}</span>
                <span className="flex-1 font-medium">{language.name}</span>
                {active && <Check className="w-4 h-4 text-violet-300" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
