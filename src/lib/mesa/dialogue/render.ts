/**
 * Slots, contagem de caracteres e duração dos balões (SPEC §3.3 e §3.4). Porte do
 * `render.ts` do pôquer (05/11/2026): mesma regra de "falta slot → fala inelegível",
 * mesma maiúscula em começo de frase e o mesmo `balloonMs`, copiado igual.
 *
 * Nome da pessoa ou de amigo NUNCA vira slot: a lista abaixo é fechada, e o
 * `check-lines.ts` recusa qualquer outro `{...}`.
 */
import { DE_PAIS, MOOD_NAME, OCCASION_NAME, WEEKDAY_NAME } from './slots.ts';
import type { Lang } from './types.ts';

/** Tetos de tamanho (§3.3, item 7), com cada slot no tamanho máximo. */
export const BALLOON_MAX = 88;
export const REACTION_MAX = 60;
export const MIRROR_MAX = 90;

const longest = (xs: string[]): number => Math.max(...xs.map((x) => x.length));

/** Peso máximo de cada slot na conta dos caracteres, por língua. */
export function tokenMax(lang: Lang): Record<string, number> {
  const moods = longest(Object.values(MOOD_NAME[lang]));
  return {
    estreante: lang === 'pt' ? 'estreante'.length : 'partner'.length,
    humor_subindo: moods,
    humor_fraco: moods,
    humor: moods,
    ocasiao: longest(Object.values(OCCASION_NAME[lang])),
    dias: 3,
    contagem: 2,
    falta: 2,
    personagem: 28,
    nota: 2,
    titulo: 32,
    dia_semana: longest(WEEKDAY_NAME[lang]),
    duracao: 6,
    decada: 9,
    ano: 4,
    votos: 5,
    votos_mais_um: 5,
    nota_publico: 3,
    de_pais: longest(Object.values(DE_PAIS[lang])),
    diretor: 28,
  };
}

/** Os slots permitidos (a lista do §3.4). */
export const SLOT_NAMES: readonly string[] = Object.keys(tokenMax('pt'));

/** Caracteres com cada slot no tamanho máximo. */
export function measure(text: string, lang: Lang = 'pt'): number {
  const max = tokenMax(lang);
  return text.replace(/\{([a-z_|]+)\}/g, (m, k: string) => 'x'.repeat(max[k] ?? m.length)).length;
}

/** Lista os slots usados num texto. */
export function varsOf(text: string): string[] {
  return [...text.matchAll(/\{([a-z_|]+)\}/g)].map((m) => m[1]);
}

function capitalizeFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Troca os slots. Devolve null quando falta algum, ou quando um valor passa do
 * máximo da tabela (a fala estouraria o balão): nos dois casos a fala fica
 * inelegível e o Diretor sorteia outra. `{titulo}` chega já cortado com "…".
 */
export function renderText(text: string, values: Record<string, string | undefined>, lang: Lang): string | null {
  const max = tokenMax(lang);
  let missing = false;
  const out = text.replace(/\{([a-z_|]+)\}/g, (_m, key: string, offset: number) => {
    const val = values[key];
    if (val === undefined || val === '' || max[key] === undefined || val.length > max[key]) {
      missing = true;
      return '';
    }
    const before = text.slice(0, offset);
    const sentenceStart = before.trim() === '' || /[.!?…]\s*$/.test(before);
    return sentenceStart ? capitalizeFirst(val) : val;
  });
  if (missing) return null;
  // Em inglês, "a 8" vira "an 8" (a nota chega por slot; o artigo fica na fala).
  return lang === 'en' ? out.replace(/\b([Aa]) (8|11|18)\b/g, '$1n $2') : out;
}

/** Duração de um balão: 1,2 s + 55 ms por caractere, entre 2,2 e 6 s (o `balloonMs` do pôquer). */
export function balloonMs(text: string): number {
  return Math.min(6000, Math.max(2200, 1200 + 55 * text.length));
}
