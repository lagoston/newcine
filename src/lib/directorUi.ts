import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { Lang } from './directorTools';

// Peças comuns das telas da Conta Diretor (16/11/2026).

export const PANEL: React.CSSProperties = {
  background: 'rgba(28,20,51,0.62)',
  border: '1px solid rgba(243,234,211,0.08)',
};

// o latão da claquete: a cor das ações da Sala
export const BRASS = '#F5C451';

// A Sala é interna: os textos ficam no próprio arquivo, em pt e en.
export function useDirectorLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith('pt') ? 'pt' : 'en';
}
