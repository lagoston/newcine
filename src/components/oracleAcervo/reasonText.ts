import type { TFunction } from 'i18next';
import { MOOD_BY_KEY } from '../../lib/moods';
import type { Reason } from '../../lib/mesa/types';

// O porquê de um título do Acervo em UMA linha (09/11/2026). O servidor
// (mesa_acervo2 → mesa_reasons, a mesma lógica das cartas da Mesa que o Bruno
// aprovou) manda até três razões na ordem do oráculo; aqui sai a primeira que
// diz algo DESTE título, numa frase curta, pelas chaves acervo.reason.*:
//   "Você deu 9 a Interestelar · mesmo diretor", "Divide com Amnésia: neo-noir",
//   "Gustavo deu 9", "Na sua lista há 12 dias", "Em Catarse, sua média é 8,4",
//   "Fora das suas prateleiras: Romântico", "País novo pra você: Irã",
//   "Nenhuma nota sua nos anos 60", "Pouca gente viu: 870 votos".
// Fica de fora o que seria igual em toda a grade: "Escolha da casa" (sempre a
// mesma frase) e, numa prateleira de humor, as razões que só falam do humor
// (todas as 30 diriam "Em Mind-Blowing, sua média é 6,7").

const isPt = (lang: string) => lang.startsWith('pt');
const num = (v: unknown): number | null =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

const SHOWN: ReadonlySet<string> = new Set([
  'anchor_director', 'anchor_kw', 'watchlist', 'friend', 'mood_affinity',
  'cypher_mood', 'cypher_country', 'cypher_decade', 'hidden',
]);
const MOOD_ONLY: ReadonlySet<string> = new Set(['mood_affinity', 'cypher_mood']);

// A razão que aparece: a primeira útil. `moodShelf`: a grade é uma prateleira
// de um humor só (sem ocasião).
export function pickReason(reasons: Reason[], moodShelf: boolean): Reason | null {
  for (const r of reasons) {
    if (!r || !SHOWN.has(r.type)) continue;
    if (moodShelf && MOOD_ONLY.has(r.type)) continue;
    if (r.type === 'anchor_kw' && !list(r.facts?.themes_pt).length && !list(r.facts?.themes_en).length) continue;
    return r;
  }
  return null;
}

let regionNames: { lang: string; fmt: Intl.DisplayNames | null } | null = null;
export function countryName(code: string, lang: string): string {
  if (!regionNames || regionNames.lang !== lang) {
    let fmt: Intl.DisplayNames | null = null;
    try {
      fmt = new Intl.DisplayNames([isPt(lang) ? 'pt-BR' : 'en'], { type: 'region' });
    } catch {
      fmt = null;
    }
    regionNames = { lang, fmt };
  }
  try {
    return regionNames.fmt?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export const moodName = (t: TFunction, key: unknown): string => {
  const m = typeof key === 'string' ? MOOD_BY_KEY[key] : null;
  return m ? t(m.labelKey) : '';
};

// O título-âncora no idioma do site. Num título longo, o fim vira "…": a
// parte que diz a ligação ("· mesmo diretor", o tema) não pode ser a cortada
// pela linha do pôster (conferido nas capturas de 09/11: "Você deu 10 a A Vida
// Secreta de Walter Mitty · mesmo diretor" perdia o "mesmo diretor").
const ANCHOR_MAX = 26;
export const anchorTitle = (facts: Reason['facts'], lang: string): string => {
  const full = str(isPt(lang) ? facts.anchor_title_pt || facts.anchor_title_en : facts.anchor_title_en || facts.anchor_title_pt).trim();
  if (full.length <= ANCHOR_MAX) return full;
  const cut = full.slice(0, ANCHOR_MAX - 2);
  const space = cut.lastIndexOf(' ');
  return `${(space > 12 ? cut.slice(0, space) : cut).replace(/[\s:,.;–-]+$/, '')}…`;
};

// A frase. Sem dado para montar, devolve ''.
export function reasonText(t: TFunction, r: Reason, lang: string): string {
  const f = r.facts ?? {};
  const pt = isPt(lang);
  const fmt = (n: number | null, digits = 0) =>
    n === null ? '' : n.toLocaleString(pt ? 'pt-BR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  switch (r.type) {
    case 'anchor_director': {
      const title = anchorTitle(f, lang);
      return title ? t('acervo.reason.anchor_director', { rating: num(f.anchor_rating) ?? '', title }) : '';
    }
    case 'anchor_kw': {
      const title = anchorTitle(f, lang);
      const theme = list(pt ? f.themes_pt : f.themes_en)[0] ?? list(pt ? f.themes_en : f.themes_pt)[0] ?? '';
      return title && theme ? t('acervo.reason.anchor_kw', { title, theme }) : '';
    }
    case 'watchlist':
      return t('acervo.reason.watchlist', { count: Math.max(1, num(f.days) ?? 1) });
    case 'friend': {
      const name = str(f.username);
      if (!name) return '';
      const others = num(f.others) ?? 0;
      const vars = { name, rating: num(f.rating) ?? '', count: others };
      return others > 0 ? t('acervo.reason.friendMore', vars) : t('acervo.reason.friend', vars);
    }
    case 'mood_affinity': {
      const mood = moodName(t, f.mood);
      return mood ? t('acervo.reason.mood_affinity', { mood, avg: fmt(num(f.avg), 1) }) : '';
    }
    case 'cypher_mood': {
      const mood = moodName(t, f.mood);
      return mood ? t('acervo.reason.cypher_mood', { mood }) : '';
    }
    case 'cypher_country': {
      const code = str(f.country);
      return code ? t('acervo.reason.cypher_country', { country: countryName(code, lang) }) : '';
    }
    case 'cypher_decade': {
      const d = num(f.decade) ?? (Number.parseInt(str(f.decade), 10) || 0);
      return d ? t('acervo.reason.cypher_decade', { decade: d, decade2: String(d).slice(2) }) : '';
    }
    case 'hidden': {
      const votes = num(f.votes);
      return votes ? t('acervo.reason.hidden', { votes: fmt(votes) }) : '';
    }
    default:
      return '';
  }
}
