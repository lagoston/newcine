/**
 * Variáveis das falas, contagem de caracteres e duração dos balões (SPEC §6.1 e §7.3).
 *
 * Variáveis: {premio} (com artigo, vem do contexto), {mao} (handPhrase), {estreante}
 * ("estreante" até Protagonista, depois "colega"), {apelido}, {titulo}, {lider} e
 * {portador} (nome do oráculo com artigo), {cacife}, {mao_n} e {o|a} (só quando o alvo
 * é outro oráculo). Nome de usuário NUNCA.
 */
import type { PlayerId, RivalId, TitleId } from '../types.ts';
import { longestHandPhrase } from './handNames.ts';
import type { Lang } from './handNames.ts';

export const MAX_CHARS = 88;
export const SHORT_CHARS = 44;

export const ORACLE_NAME: Record<Lang, Record<string, string>> = {
  pt: { bogart: 'Sapo', cypher: 'Cobra', fincher: 'Raposo' },
  en: { bogart: 'Frog', cypher: 'Snake', fincher: 'Fox' },
};
const PT_ARTICLE: Record<string, string> = { bogart: 'o', cypher: 'a', fincher: 'o' };

export const TITLE_NAME: Record<Lang, Record<TitleId, string>> = {
  pt: { figurante: 'Figurante', duble: 'Dublê', coadjuvante: 'Coadjuvante', protagonista: 'Protagonista',
        estrela: 'Estrela', lenda: 'Lenda da Sessão' },
  en: { figurante: 'Extra', duble: 'Stunt Double', coadjuvante: 'Supporting Role', protagonista: 'Lead',
        estrela: 'Star', lenda: 'Legend of the Session' },
};
export const TITLE_ORDER: TitleId[] = ['figurante', 'duble', 'coadjuvante', 'protagonista', 'estrela', 'lenda'];

const NICK: Record<Lang, Record<string, string>> = {
  pt: { bogart: 'girino', cypher: 'criatura' },
  en: { bogart: 'tadpole', cypher: 'creature' },
};

/** Peso máximo de cada variável na conta dos 88/44 caracteres. */
export function tokenMax(lang: Lang): Record<string, number> {
  const names = Object.values(ORACLE_NAME[lang]);
  const withArticle = Math.max(...names.map((n) => n.length + (lang === 'pt' ? 2 : 4)));
  return {
    premio: 30,
    mao: longestHandPhrase(lang),
    estreante: lang === 'pt' ? 'estreante'.length : 'partner'.length,
    apelido: lang === 'pt' ? 'estreante'.length : 'partner'.length,
    titulo: Math.max(...Object.values(TITLE_NAME[lang]).map((t) => t.length)),
    lider: withArticle,
    portador: withArticle,
    cacife: 6,   // "12.000"
    mao_n: 2,
    'o|a': 1,
  };
}

/** Caracteres com cada variável no tamanho máximo. */
export function measure(text: string, lang: Lang = 'pt'): number {
  const max = tokenMax(lang);
  return text.replace(/\{([a-z_|]+)\}/g, (m, k: string) => 'x'.repeat(max[k] ?? m.length)).length;
}

export interface RenderVars {
  lang: Lang;
  speaker: RivalId | 'human';
  title: TitleId;
  premio?: string;
  mao?: string;
  lider?: PlayerId;
  portador?: PlayerId;
  cacife?: number;
  maoN?: number;
  target?: PlayerId;          // alvo, para {o|a}
}

function isColleague(title: TitleId): boolean {
  return TITLE_ORDER.indexOf(title) >= TITLE_ORDER.indexOf('protagonista');
}

function formatNumber(n: number, lang: Lang): string {
  const s = String(Math.round(Math.abs(n)));
  const sep = lang === 'pt' ? '.' : ',';
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

function oracleWithArticle(id: PlayerId, lang: Lang): string | null {
  const n = ORACLE_NAME[lang][id];
  if (!n) return null;
  return lang === 'pt' ? `${PT_ARTICLE[id] ?? 'o'} ${n}` : `the ${n}`;
}

function capitalizeFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Troca as variáveis. Devolve null quando falta alguma (a fala fica inelegível).
 * Uma variável no começo de frase ganha maiúscula ("Croac. Uma trinca de setes").
 */
export function renderText(text: string, v: RenderVars): string | null {
  let missing = false;
  const out = text.replace(/\{([a-z_|]+)\}/g, (_m, key: string, offset: number) => {
    let val: string | null = null;
    switch (key) {
      case 'premio': val = v.premio ?? null; break;
      case 'mao': val = v.mao ?? null; break;
      case 'estreante':
        val = v.lang === 'pt' ? (isColleague(v.title) ? 'colega' : 'estreante') : (isColleague(v.title) ? 'partner' : 'kid');
        break;
      case 'apelido':
        val = NICK[v.lang][String(v.speaker)]
          ?? (v.lang === 'pt' ? (isColleague(v.title) ? 'colega' : 'estreante') : (isColleague(v.title) ? 'partner' : 'kid'));
        break;
      case 'titulo': val = TITLE_NAME[v.lang][v.title] ?? null; break;
      case 'lider': val = v.lider ? oracleWithArticle(v.lider, v.lang) : null; break;
      case 'portador': val = v.portador ? oracleWithArticle(v.portador, v.lang) : null; break;
      case 'cacife': val = v.cacife !== undefined ? formatNumber(v.cacife, v.lang) : null; break;
      case 'mao_n': val = v.maoN !== undefined ? String(v.maoN) : null; break;
      case 'o|a': val = v.target && PT_ARTICLE[v.target] ? PT_ARTICLE[v.target] : null; break;
      default: val = null;
    }
    if (val === null) {
      missing = true;
      return '';
    }
    const before = text.slice(0, offset);
    const sentenceStart = before.trim() === '' || /[.!?…]\s*$/.test(before);
    return sentenceStart ? capitalizeFirst(val) : val;
  });
  return missing ? null : out;
}

/** Lista as variáveis usadas num texto. */
export function varsOf(text: string): string[] {
  return [...text.matchAll(/\{([a-z_|]+)\}/g)].map((m) => m[1]);
}

/**
 * Duração de um balão (§7.3): 1,2 s + 55 ms por caractere, entre 2,2 e 6 s. A despedida
 * tem ritmo próprio (roteirista): 0,8 s + 40 ms por caractere. "Rápido" encurta, mas
 * nunca abaixo de 1,8 s, para dar tempo de ler.
 */
export function balloonMs(text: string, opts: { farewell?: boolean; speed?: 'normal' | 'fast' | 'turbo' } = {}): number {
  const n = text.length;
  let ms = opts.farewell ? 800 + 40 * n : Math.min(6000, Math.max(2200, 1200 + 55 * n));
  if (opts.speed === 'fast' || opts.speed === 'turbo') ms = Math.max(1800, Math.round(ms * 0.6));
  return ms;
}
