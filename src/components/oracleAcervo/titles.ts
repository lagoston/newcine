import type { AcervoItem } from '../../lib/mesa/acervoApi';

// Nome e pôster de um título do Acervo no idioma do site (05/11/2026): em pt,
// o título e o pôster brasileiros quando existem; em en, o original.
export const titleOf = (item: Pick<AcervoItem, 'title_pt' | 'title_en'>, lang: string) =>
  (lang.startsWith('pt') ? item.title_pt || item.title_en : item.title_en || item.title_pt) || '';

export const posterOf = (item: Pick<AcervoItem, 'poster_path' | 'poster_path_pt'>, lang: string) =>
  (lang.startsWith('pt') && item.poster_path_pt) || item.poster_path;
