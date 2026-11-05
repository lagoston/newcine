/**
 * As regras de escrita das falas (SPEC §3.3), em forma de dados, para o lint
 * (`scripts/mesa/check-lines.ts`) e os testes do Diretor (`scripts/mesa/test-director.ts`).
 * O Diretor não importa este arquivo: ele não vai para o pacote do site (05/11/2026).
 */
import { MOOD_NAME, OCCASION_IDS, WEEKDAY_KEY } from './slots.ts';
import type { Beat } from './types.ts';

/** Palavras que flexionariam gênero para a pessoa (regra 2). Proibidas na boca de qualquer um. */
export const GENDER_PT = /(?<![\p{L}-])(sozinh[oa]s?|cansad[oa]s?|pront[oa]s?|bem-vind[oa]s?|convidad[oa]s?|amig[oa]s?|obrigad[oa]s?|preparad[oa]s?|assustad[oa]s?|animad[oa]s?|sentad[oa]s?|deitad[oa]s?|apaixonad[oa]s?|querid[oa]s?|acompanhad[oa]s?|meu caro)(?![\p{L}])/iu;

/** "minha cara" é o Fincher falando com a Cypher: só nas trocas, e só na boca dele. */
export const MINHA_CARA = /\bminha cara\b/i;

/** Nomes de pessoas que nunca podem aparecer (contas de teste e o dono do site). */
export const FORBIDDEN_NAMES = /\b(bruno|tonico|lagostom)\b/i;

export const EM_DASH = /[—–]/;
export const EMOJI = /\p{Extended_Pictographic}/u;

/** Artigo antes de nome de diretor (regra 2): gênero desconhecido. */
export const ARTICLE_BEFORE_DIRECTOR = /(?<![\p{L}])(o|a|os|as|do|da|dos|das|pelo|pela|no|na|ao|à)\s+\{diretor\}/iu;

/** Lastro (regra 4): expressão → condição que a fala precisa declarar. */
export interface Claim { name: string; pt: RegExp; en: RegExp; cond: string; onlyWho?: string; needNot?: string }
export const CLAIMS: Claim[] = [
  { name: 'cara de 10', pt: /cara de (10|dez)\b/i, en: /looks? like a (10|ten)\b/i, cond: 'p10hi' },
  { name: 'pouca gente', pt: /pouca gente/i, en: /\b(barely anyone|hardly anyone|few people|few saw|barely seen)\b/i, cond: 'hidden' },
  { name: 'bomba/vaiado/reprovado', pt: /(?<![\p{L}])(bomba|vaiad[oa]s?|reprovad[oa]s?)(?![\p{L}])/iu, en: /\b(bomb|flop|booed|failing grade|failed)\b/i, cond: 'bomb' },
  { name: 'preto e branco', pt: /preto e branco/i, en: /black and white/i, cond: 'bw' },
  { name: 'três horas / longo', pt: /(três horas|(?<![\p{L}])long[oa]s?(?![\p{L}]))/iu, en: /\b(three hours|long)\b/i, cond: 'long' },
  { name: 'você nunca entra', pt: /você (quase )?nunca entra|você evita/i, en: /\b(you (hardly|almost)? ?never step|hardly ever step|you avoid)\b/i, cond: 'weak_mood' },
  { name: 'nada da sua estante', pt: /nada (da|na) sua estante/i, en: /nothing on your shelf/i, cond: 'newcountry' },
  { name: 'aposto (força)', pt: /(?<![\p{L}])(aposto|aposta segura|boto a mão no fogo)(?![\p{L}])/iu, en: /\b(i bet|safe bet|hand in the fire)\b/i, cond: '', onlyWho: 'bogart', needNot: 'ressalva' },
];

/** A Cobra nunca promete nota nem diz a força da carta dela (regra 5). */
export const CYPHER_PROMISE_PT = [
  /(?<![\p{L}])(garanto|garantia|certeza|prometo)(?![\p{L}])/iu,
  /(\d+|\{nota\}|dez|nove|oito|sete|seis)\s+(pra|para)\s+(você|vc)/i,
  /você vai (dar|amar|gostar|curtir)/i,
  /pelo menos \d/i,
  /cara de (10|dez)/i,
];
export const CYPHER_PROMISE_EN = [
  /\b(guarantee|promise|for sure|certain|certainly)\b/i,
  /\byou'?ll (give|love|rate|like)\b/i,
  /\bat least \d/i,
  /looks? like a (10|ten)\b/i,
];

/** Bordões da casa: só com `once=week` ou `once=life` (regra 6). */
export const CATCHPHRASE_PT = /os meus acordaram|nunca dormiram|37 fichas/i;
export const CATCHPHRASE_EN = /mine woke up|never slept|37 chips/i;

/** Tetos (regra 7). */
export const REACTION_BEATS: readonly Beat[] = ['want', 'refuse', 'pass', 'replace', 'notSeen'];

/** Situações de troca e os fatos que elas garantem (para o lastro das trocas). */
export const SITUATIONS: Record<string, string[]> = {
  fincher_bw: ['bw'], fincher_old: ['old'], fincher_long_bogart_short: ['long'], bogart_long: ['long'],
  cypher_older_than_fincher: [], cypher_bomb: ['bomb'], cypher_hidden: ['hidden'], cypher_anime: ['anime'],
  cypher_br: ['br'], cypher_newmood: ['newmood'], bogart_p10hi: ['p10hi'], bogart_sequel: ['sequel'],
  bogart_huge: ['huge'], same_country_two: [], three_moods_same: [], series_on_table: ['series'],
  espelho4_from_bogart: [], espelho4_from_fincher: [], watchlist_on_table: ['watchlist'],
};

/** Todas as condições que o Diretor sabe calcular (um nome fora daqui é erro de digitação). */
export function knownCond(c: string): boolean {
  const name = c.startsWith('!') ? c.slice(1) : c;
  const plain = new Set([
    // tiragem
    'n0', 'n1_9', 'recon', 'colega', 'persona', 'almost', 'persona_new', 'code_changed', 'first_visit', 'returning',
    'mood_rising', 'weak_mood', 'verdict_pending', 'espelho4', 'reveal', 'yesterday_unflipped',
    'yesterday_cypher_closed', 'yesterday_all', 'weekend', 'ask', 'mood_ask', 'daily', 'passed_any', 'all_flipped',
    'cypher_closed',
    // carta
    'bw', 'long', 'series', 'hidden', 'bomb', 'p10hi', 'anime', 'br', 'sequel', 'huge', 'newmood', 'newcountry',
    'ressalva', 'watchlist', 'old', 'second', 'nopred',
    // veredito
    'exact', 'near', 'over', 'under', 'ten', 'r10', 'r_low', 'r_high', 'asked', 'yesterday_card', 'today_card',
    // passar a vez
    'refused', 'empty', 'colo',
    // sistema
    'error', 'empty_all', 'offline', 'midnight',
    ...Object.keys(SITUATIONS),
  ]);
  if (plain.has(name)) return true;
  if (/^day:/.test(name)) return WEEKDAY_KEY.includes(name.slice(4));
  if (/^hour:/.test(name)) return ['late', 'morning', 'afternoon', 'night'].includes(name.slice(5));
  if (/^event:/.test(name)) return ['halloween', 'christmas'].includes(name.slice(6));
  if (/^ask:/.test(name)) return OCCASION_IDS.includes(name.slice(4));
  if (/^mood:/.test(name)) return name.slice(5) in MOOD_NAME.pt;
  return false;
}
