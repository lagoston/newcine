import type React from 'react';
import type { Movie } from '../../lib/tmdb';
import { FOCUS_RING } from '../../lib/oracleTheme';

// O menu do título em partes (18/11/2026, Protocolo Reborn, render.md A4).
// O MovieDetailsModal.tsx era um arquivo só de 3 mil linhas com 47 estados:
// cada resposta do banco (21 chamadas ao abrir) re-renderizava a ficha
// inteira, 7 a 11 vezes por abertura. Agora ele é a casca (camadas, Esc,
// biblioteca) e cada seção desta pasta cuida do próprio dado e só ela
// re-renderiza quando ele chega. Aqui ficam as constantes e as funções puras
// que mais de uma seção usa. Mesma aparência e mesmo comportamento de antes.

// 18/11/2026 (otimização): quanto o menu espera pelos detalhes completos do
// título (quem abre pela Home ou pela busca troca o item da lista por eles logo
// depois) antes de buscar à parte o orçamento e a classificação.
export const DETAILS_GRACE_MS = 1500;

// Um episódio e uma temporada como vêm do movie_cache.seasons_data.
export interface SeasonEpisode {
  episode_number: number;
  name?: string;
  air_date?: string | null;
  runtime?: number | null;
  vote_average?: number;
  overview?: string;
}
export interface TitleSeason {
  season_number: number;
  name?: string;
  episode_count?: number;
  air_date?: string | null;
  poster_path?: string | null;
  overview?: string;
  episodes?: SeasonEpisode[];
}

// O título como o menu recebe: o Movie do lib/tmdb mais os campos que vêm
// junto quando ele sai da linha inteira do cache.
export type TitleMovie = Movie & {
  seasons?: TitleSeason[];
  backdrop_path?: string | null;
  content_ratings?: unknown;
};

export const mediaTypeOf = (movie: Pick<Movie, 'media_type'>): 'movie' | 'tv' => (movie.media_type === 'tv' ? 'tv' : 'movie');

// As mesmas 9 categorias usadas pra organizar as prateleiras na Biblioteca
// dos Oráculos (ver OracleLibraries.tsx) — "random-surprise" não entra por
// ser uma pool coringa, não uma categoria de verdade. Cada uma com a sua cor
// clara (texto e pontinho), pensada pro fundo noite.
export const MOOD_TAG_CONFIG: Record<string, { labelKey: string; color: string }> = {
  'adventures': { labelKey: 'oracle.moods.adventures', color: '#7DD3FC' },
  'catharsis': { labelKey: 'oracle.moods.catharsis', color: '#93C5FD' },
  'adrenaline': { labelKey: 'oracle.moods.adrenaline', color: '#FCA5A5' },
  'mind-blowing': { labelKey: 'oracle.moods.mindBlowing', color: '#F9A8D4' },
  'laugh-out-loud': { labelKey: 'oracle.moods.laughOutLoud', color: '#86EFAC' },
  'drug-trip': { labelKey: 'oracle.moods.drugTrip', color: '#6EE7B7' },
  'romantic': { labelKey: 'oracle.moods.romantic', color: '#FDBA74' },
  'dark-and-scary': { labelKey: 'oracle.moods.darkScary', color: '#D1D5DB' },
  'family-time': { labelKey: 'oracle.moods.familyTime', color: '#FDE047' },
};

// Gêneros mostrados embaixo do título: no máximo 3, sem os que repetem o
// que quase todo filme é ou o que a prateleira já diz — Drama, Família e
// Aventura (na série, "Action & Adventure" vira só Ação). Thriller vira
// Suspense em português. Pelo id do TMDB e, no cache sem id, pelo nome.
// A mesma cor, mais clara (misturada com branco): os gêneros que "saem"
// da prateleira usam o tom dela, mais suave.
export const lighten = (hex: string, amount: number): string => {
  const n = hex.replace('#', '');
  const channel = (i: number) => {
    const v = parseInt(n.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount);
  };
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
};

const HIDDEN_GENRE_IDS = new Set([18, 10751, 12]);
const HIDDEN_GENRE_NAMES = new Set(['drama', 'família', 'familia', 'family', 'aventura', 'aventuras', 'adventure']);
export const displayGenres = (genres: { id?: number; name: string }[] | undefined, isPt: boolean): string[] => {
  const out: string[] = [];
  for (const genre of genres || []) {
    const name = (genre.name || '').trim();
    const lower = name.toLowerCase();
    if (!name || (genre.id && HIDDEN_GENRE_IDS.has(genre.id)) || HIDDEN_GENRE_NAMES.has(lower)) continue;
    let label = name;
    if (genre.id === 53 || lower === 'thriller') label = isPt ? 'Suspense' : 'Thriller';
    else if (genre.id === 10759 || lower === 'action & adventure' || lower === 'ação e aventura') label = isPt ? 'Ação' : 'Action';
    if (!out.includes(label)) out.push(label);
    if (out.length === 3) break;
  }
  return out;
};

// Padroniza QUALQUER classificação de origem (americana, britânica, etc.)
// pra escala brasileira única (L, +10, +12, +14, +16, +18). Não existe
// "+13" oficial no ClassInd — "PG-13" arredonda pra +14, o balde real mais
// próximo. Qualquer coisa não reconhecida (incluindo "NR") volta null:
// melhor não mostrar nada do que mostrar um selo enganoso.
export const standardizeCertification = (raw: string): string | null => {
  const upper = raw.trim().toUpperCase();
  if (upper === 'L') return 'L';
  if (['10', '12', '14', '16', '18'].includes(upper)) return `+${upper}`;
  const usMap: Record<string, string> = { 'G': 'L', 'PG': '+10', 'PG-13': '+14', 'R': '+16', 'NC-17': '+18' };
  if (usMap[upper]) return usMap[upper];
  const ukMap: Record<string, string> = { 'U': 'L', '12A': '+12', '15': '+16' };
  if (ukMap[upper]) return ukMap[upper];
  return null;
};

// Cores oficiais do selo ClassInd: Livre=verde, 10=azul, 12=amarelo,
// 14=laranja, 16=vermelho, 18=preto (com contorno, pra não sumir na noite).
export const certificationClasses = (standardized: string): string => {
  if (standardized === '+18') return 'bg-black text-white ring-1 ring-white/40';
  if (standardized === '+16') return 'bg-red-600 text-white';
  if (standardized === '+14') return 'bg-orange-500 text-white';
  if (standardized === '+12') return 'bg-yellow-400 text-gray-900';
  if (standardized === '+10') return 'bg-blue-500 text-white';
  return 'bg-green-600 text-white';
};

export const countryFlag = (countryCode: string) => {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode.toUpperCase().split('').map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// Posições das bolhas dos amigos sobre o pôster. A 5ª fica logo à direita
// de onde nasce o balão do oráculo (canto inferior esquerdo), "quase
// raspando" sem sobrepor.
export const FRIEND_POSITIONS: React.CSSProperties[] = [
  { top: '14%', left: '8%' },
  { top: '24%', right: '10%' },
  { top: '48%', left: '6%' },
  { top: '62%', right: '8%' },
  { bottom: '4%', left: '52%' },
];

// Fundo translúcido dos balões e selos sobre o pôster.
export const BUBBLE_BG = 'rgba(18,13,34,0.94)';

export interface FriendRating {
  user_id: string;
  username: string;
  avatar_url: string | null;
  rating: number | null;
  review_title?: string | null;
  is_watchlist_only?: boolean;
}

// Seções do corpo: um fio fino em cima e o respiro.
export const SECTION_CLASS = 'pt-6 mt-6 border-t border-white/[0.07]';

// Ações rápidas: ícone em cima, nome embaixo, sem contorno.
export const QUICK_ACTION = `flex-col gap-1.5 w-[5.5rem] py-2 rounded-xl text-xs font-medium hover:bg-white/[0.06] active:bg-white/[0.09] transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`;
