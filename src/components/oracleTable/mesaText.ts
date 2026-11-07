import type { TFunction } from 'i18next';
import { MOOD_BY_KEY } from '../../lib/moods';
import type { AskRef, Reason, TitleLite } from '../../lib/mesa/types';

// Os textos que a Mesa monta a partir do payload (05/11/2026): nome do título
// na língua da pessoa, a linha de meta, o nome da pergunta e o porquê
// (SPEC §5.8). O servidor manda fatos; a frase é montada aqui, pelas chaves
// mesa.reason.*, para pt e en ficarem iguais em conteúdo.

const isPt = (lang: string) => lang.startsWith('pt');

export function cardTitle(t: Pick<TitleLite, 'title_pt' | 'title_en'>, lang: string): string {
  return (isPt(lang) ? t.title_pt || t.title_en : t.title_en || t.title_pt) || '';
}

export function posterSrc(t: Pick<TitleLite, 'poster_path' | 'poster_path_pt'>, lang: string, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500'): string | null {
  const path = (isPt(lang) && t.poster_path_pt) || t.poster_path;
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

// 144 → "2h24"; 95 → "1h35"; 48 → "48 min".
export function duration(min: number | null | undefined): string {
  if (!min || min <= 0) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// "1980 · 2h24 · Filme" ou "2019 · 3 temporadas · episódios de 45 min".
export function metaLine(t: TitleLite, tr: TFunction): string {
  const parts: string[] = [];
  if (t.year) parts.push(String(t.year));
  if (t.media_type === 'tv') {
    if (t.seasons) parts.push(tr('mesa.reading.seasons', { count: t.seasons }));
    if (t.ep_runtime) parts.push(tr('mesa.reading.episodes', { min: t.ep_runtime }));
    else parts.push(tr('mesa.reading.kindTv'));
  } else {
    const d = duration(t.runtime);
    if (d) parts.push(d);
    parts.push(tr('mesa.reading.kindMovie'));
  }
  return parts.join(' · ');
}

export function moodName(tr: TFunction, key: string | null | undefined): string {
  const m = key ? MOOD_BY_KEY[key] : null;
  return m ? tr(m.labelKey) : key ?? '';
}

// O id de i18n de uma pergunta: 'occ:chuva' → 'chuva'; 'season:christmas' → 'christmas'.
export function askI18nId(key: string): string {
  return key.split(':')[1] ?? key;
}

export function askName(tr: TFunction, key: string | null | undefined, short = false): string {
  if (!key) return '';
  if (key.startsWith('mood:')) return moodName(tr, key.slice(5));
  return tr(`mesa.occasions.${askI18nId(key)}.${short ? 'short' : 'name'}`);
}

export function askKeyOf(ask: AskRef | null): string | null {
  return ask?.key ?? null;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

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

// O porquê em uma linha (SPEC §5.8). Sem dado para montar, devolve ''.
export function reasonText(tr: TFunction, r: Reason, lang: string): string {
  const f = r.facts ?? {};
  const pt = isPt(lang);
  const anchorTitle = () => str(pt ? f.anchor_title_pt || f.anchor_title_en : f.anchor_title_en || f.anchor_title_pt);
  const themes = () => list(pt ? f.themes_pt : f.themes_en).slice(0, 2).join(', ');
  const fmtNum = (n: number | null, digits = 0) =>
    n === null ? '' : n.toLocaleString(pt ? 'pt-BR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  switch (r.type) {
    case 'anchor_director':
      return tr('mesa.reason.anchor_director', { rating: num(f.anchor_rating) ?? '', title: anchorTitle() });
    case 'anchor_kw': {
      const th = themes();
      return th ? tr('mesa.reason.anchor_kw', { rating: num(f.anchor_rating) ?? '', title: anchorTitle(), themes: th }) : tr('mesa.reason.anchor_kw', { rating: num(f.anchor_rating) ?? '', title: anchorTitle(), themes: '' }).replace(/ · $/, '');
    }
    case 'watchlist': {
      const days = num(f.days) ?? 1;
      return days <= 0 ? tr('mesa.reason.watchlistToday') : tr('mesa.reason.watchlist', { count: days });
    }
    case 'friend': {
      const others = num(f.others) ?? 0;
      const vars = { name: str(f.username), rating: num(f.rating) ?? '', count: others };
      return others > 0 ? tr('mesa.reason.friendOthers', vars) : tr('mesa.reason.friend', vars);
    }
    case 'mood_affinity':
      return tr('mesa.reason.mood_affinity', { mood: moodName(tr, str(f.mood)), avg: fmtNum(num(f.avg), 1) });
    case 'cypher_mood':
      return tr('mesa.reason.cypher_mood', { mood: moodName(tr, str(f.mood)) });
    case 'cypher_country':
      return tr('mesa.reason.cypher_country', { country: countryName(str(f.country), lang) });
    case 'cypher_decade': {
      const d = num(f.decade) ?? (Number.parseInt(str(f.decade), 10) || 0);
      return tr('mesa.reason.cypher_decade', { decade: d, decade2: String(d).slice(2) });
    }
    case 'hidden':
      return tr('mesa.reason.hidden', { votes: fmtNum(num(f.votes)) });
    case 'occasion_runtime':
      return tr('mesa.reason.occasion_runtime', { duration: duration(num(f.minutes)) });
    case 'occasion_episode':
      return tr('mesa.reason.occasion_episode', { min: num(f.minutes) ?? '' });
    case 'occasion_binge':
      return tr('mesa.reason.occasion_binge', { hours: num(f.hours) ?? '', seasons: num(f.seasons) ?? '' });
    case 'occasion_comment':
      return tr(`mesa.reason.occasion_comment.${str(f.oracle) || 'fincher'}`);
    case 'occasion_tone': {
      const occ = str(f.occasion);
      return tr('mesa.reason.occasion_tone', { occasion: occ ? tr(`mesa.occasions.${occ}.name`) : '', themes: themes() });
    }
    case 'mood_ask':
      return tr('mesa.reason.mood_ask', { mood: moodName(tr, str(f.mood)) });
    case 'recognition':
      return tr('mesa.reason.recognition', { mood: moodName(tr, str(f.mood)) });
    case 'espelho_best':
      return tr('mesa.reason.espelho_best');
    case 'reveal':
      return tr('mesa.reason.reveal', { count: Math.max(1, num(f.missing) ?? 1), mood: moodName(tr, str(f.mood)) });
    case 'house':
      return tr('mesa.reason.house');
    default:
      return '';
  }
}
