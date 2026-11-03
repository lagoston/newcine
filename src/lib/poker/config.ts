/**
 * Números padrão da mesa (SPEC §2.2, §2.6, §2.7 e §3.4).
 *
 * A fonte de verdade é `poker_settings` no banco. Isto é uma cópia idêntica só para
 * jogar offline (partida livre sem rede) e para os testes/simulador. Mudou lá, muda aqui.
 */
import type { BlindLevel } from './engine.ts';
import type { DifficultyRow, EffectParams, LevelInfo, PokerSettings, PosterEffectId, Rarity } from './types.ts';

/**
 * Dificuldade pública por raridade (§3.4). Só mexe em ε e no atraso de adaptação do
 * Raposo; as iterações nunca mudam. `stars` 0 = sem estrelas (mesa livre).
 * Calibração A3 (03/11/2026): multiplicadores mais abertos (eram 1,3 / 1,15 / 1,0 / 0,85
 * e 16 / 14 / 12 / 9 mãos) e pisos de ε mais baixos nos perfis: com a tabela antiga a
 * captura do médio dava ~35% em todas as raridades (meta 45–50 → 25–30).
 */
export const DEFAULT_DIFFICULTY: Record<Rarity | 'free', DifficultyRow> = {
  free: { stars: 0, epsilonMul: 1.0, adaptDelay: 12 },
  common: { stars: 1, epsilonMul: 2.4, adaptDelay: 18 },
  rare: { stars: 2, epsilonMul: 1.7, adaptDelay: 15 },
  epic: { stars: 3, epsilonMul: 1.0, adaptDelay: 12 },
  legendary: { stars: 4, epsilonMul: 0.3, adaptDelay: 6 },
};

export const DEFAULT_SETTINGS: PokerSettings = {
  startStack: 2000,
  handsPerLevel: 5,
  // Veredito Q1 (03/11/2026): degraus de ~×1,4; ante = BB/4 a partir do nível 3 (soma = 1 BB com 4 vivos).
  // Calibração A3 (03/11/2026): dois níveis iniciais mais fundos (10/20 e 20/40) antes de
  // 25/50; o resto da tabela não mudou. Com 40 BB de saída, quem empurra toda mão vivia de roubar
  // 1,5 BB e vencia 18% (meta < 15%), e a partida durava 23 mãos (meta 30–40). Mudou
  // aqui, muda em poker_settings.levels.
  levels: [
    [10, 20, 0],
    [20, 40, 0],
    [25, 50, 0],
    [35, 70, 0],
    [50, 100, 25],
    [70, 140, 35],
    [100, 200, 50],
    [150, 300, 75],
    [200, 400, 100],
    [300, 600, 150],
    [400, 800, 200],
    [600, 1200, 300],
    [800, 1600, 400],
    [1200, 2400, 600],
  ],
  loanAmount: 500,
  maxAttempts: 3,
  // Veredito Q2: comum e raro = Sapo, épico = Cobra, lendário = Raposo.
  carrierByRarity: { common: 'bogart', rare: 'bogart', epic: 'cypher', legendary: 'fincher' },
  difficulty: DEFAULT_DIFFICULTY,
};

/**
 * Pôster Poker (03/11/2026, BRIEF2): números de cada efeito do pôster mágico do torneio.
 * Efeitos de mão lançam 2 vezes: a 1ª numa mão sorteada entre 3 e 9, a 2ª `gapHands` +
 * 0..`spread` mãos depois (no tell, 8). hand_bounty e opal: 1 vez, entre as mãos 3 e 8.
 * eight_aces: 1 vez, no começo (firstHand é ignorado). Bônus em fichas de mesa.
 * `poker_settings.effects` sobrepõe campo a campo (effectParams, com limites).
 */
export const DEFAULT_EFFECTS: Record<PosterEffectId, EffectParams> = {
  early_flop: { casts: 2, firstHand: [3, 9], gapHands: 6, spread: 3 },
  double_pot: { casts: 2, firstHand: [3, 9], gapHands: 6, spread: 3 },
  blackjack: { casts: 2, firstHand: [3, 9], gapHands: 6, spread: 3, amount: 500 },
  reveal_one: { casts: 2, firstHand: [3, 9], gapHands: 6, spread: 3 },
  sixth_card: { casts: 2, firstHand: [3, 9], gapHands: 6, spread: 3 },
  tell: { casts: 2, firstHand: [3, 9], gapHands: 8, spread: 3, hands: 3 },
  hand_bounty: { casts: 1, firstHand: [3, 8], gapHands: 0, spread: 0, amount: 800 },
  opal: { casts: 1, firstHand: [3, 8], gapHands: 0, spread: 0, amount: 1000 },
  eight_aces: { casts: 1, firstHand: [1, 1], gapHands: 0, spread: 0 },
};

/** Efeitos que valem uma vez só na partida (o banco não consegue pedir mais). */
const ONCE: ReadonlySet<PosterEffectId> = new Set(['hand_bounty', 'opal', 'eight_aces']);

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

/** Números do efeito: DEFAULT_EFFECTS mesclado com `settings.effects`, dentro de limites sensatos. */
export function effectParams(settings: PokerSettings | undefined, effect: PosterEffectId): EffectParams {
  const base = DEFAULT_EFFECTS[effect];
  const o = settings?.effects?.[effect] ?? {};
  const fh = Array.isArray(o.firstHand) && o.firstHand.length === 2 ? o.firstHand : base.firstHand;
  const lo = clampInt(fh[0], 1, 40, base.firstHand[0]);
  const hi = clampInt(fh[1], lo, 60, Math.max(lo, base.firstHand[1]));
  const out: EffectParams = {
    casts: clampInt(o.casts, 0, ONCE.has(effect) ? 1 : 6, base.casts),
    firstHand: [lo, hi],
    gapHands: clampInt(o.gapHands, 1, 40, Math.max(1, base.gapHands)),
    spread: clampInt(o.spread, 0, 10, base.spread ?? 3),
  };
  if (base.amount !== undefined) out.amount = clampInt(o.amount, 0, 5000, base.amount);
  if (base.hands !== undefined) out.hands = clampInt(o.hands, 1, 10, base.hands);
  return out;
}

// ---------------------------------------------------------------------------
// Mesa de amigos (pacote E3, 03/11/2026): vários pôsteres, o mesmo efeito acumula
// ---------------------------------------------------------------------------

/**
 * Ordem fixa dos efeitos numa mesa com vários (não depende da ordem em que os pôsteres
 * chegaram): é a ordem dos `effectCast` no começo da mão e a dos bônus no fim
 * (Dinheiro dobrado → 21 → Raymond → opala). O Dinheiro dobrado só dobra os POTES; os
 * outros bônus nunca são dobrados.
 */
export const EFFECT_ORDER: readonly PosterEffectId[] = [
  'eight_aces', 'early_flop', 'reveal_one', 'sixth_card', 'tell', 'double_pot', 'blackjack', 'hand_bounty', 'opal',
];
/** Máximo de pôsteres de efeito numa mesa (4 pessoas × 2). */
export const MAX_TABLE_EFFECTS = 8;
/** A partir deste número de pôsteres iguais, mais um não muda nada (teto de cada efeito). */
export const STACK_CAP: Record<PosterEffectId, number> = {
  early_flop: 3, double_pot: 3, blackjack: 3, reveal_one: 3, sixth_card: 3, tell: 3, hand_bounty: 3, opal: 3, eight_aces: 1,
};

/**
 * Números do efeito com `level` pôsteres iguais na mesa (1 = igual ao torneio). Regras
 * (03/11/2026; teto no 3º pôster igual — STACK_CAP):
 *  - early_flop, double_pot, blackjack, reveal_one, sixth_card: MAIS LANÇADAS — casts × level
 *    (2 → 4 → 6) e as lançadas mais perto umas das outras (gapHands − 1 por pôster a mais,
 *    mínimo 3). Cada lançada continua igual (o 21 paga o mesmo, a leitura vira 1 carta, o
 *    river vem com 2, o pote dobra uma vez).
 *  - tell: MAIS MÃOS DE TIQUE — hands × level (3 → 6 → 9), mesmas 2 lançadas, com o intervalo
 *    crescendo junto (gapHands + mãos a mais) para as janelas não se encostarem.
 *  - hand_bounty, opal: MAIS LANÇADAS EM SEQUÊNCIA — até `level` (1 → 2 → 3); a seguinte só
 *    lança 2 mãos depois de alguém levar a anterior (Raymond: nova jogada-alvo; opala: nova
 *    carta). O bônus de cada uma é o de sempre.
 *  - eight_aces: NÃO ACUMULA (o baralho já é o do Ace: 60 cartas; mais ases deixariam o
 *    avaliador com seis e sete iguais e o jogo virava loteria).
 */
export function stackedParams(settings: PokerSettings | undefined, effect: PosterEffectId, level: number): EffectParams {
  const base = effectParams(settings, effect);
  const lv = Math.max(1, Math.min(STACK_CAP[effect], Math.floor(level) || 1));
  if (lv === 1) return base;
  const out: EffectParams = { ...base, firstHand: [base.firstHand[0], base.firstHand[1]] };
  switch (effect) {
    case 'tell': {
      const hands = Math.min(9, (base.hands ?? 3) * lv);
      out.hands = hands;
      out.gapHands = base.gapHands + (hands - (base.hands ?? 3));
      break;
    }
    case 'hand_bounty':
    case 'opal':
      out.casts = base.casts === 0 ? 0 : Math.min(3, lv);   // 0 = desligado no banco: continua desligado
      out.gapHands = 2;
      out.spread = 0;
      break;
    case 'eight_aces':
      break;
    default:
      out.casts = Math.min(6, base.casts * lv);
      out.gapHands = Math.max(3, base.gapHands - (lv - 1));
      break;
  }
  return out;
}

/** Lista de efeitos da mesa → efeitos distintos (na ordem fixa) com o número de pôsteres de cada. */
export function effectLevels(list: readonly PosterEffectId[] | undefined): { effect: PosterEffectId; level: number }[] {
  const count = new Map<PosterEffectId, number>();
  for (const e of (list ?? []).slice(0, MAX_TABLE_EFFECTS)) if (DEFAULT_EFFECTS[e]) count.set(e, (count.get(e) ?? 0) + 1);
  return EFFECT_ORDER.filter((e) => count.has(e)).map((effect) => ({ effect, level: count.get(effect)! }));
}

/**
 * Nível da mão `handNumber` (1 = primeira mão da partida). O nível vale pelo número da
 * mão, não por relógio nem por eliminações (§2.2); depois do último, fica nele.
 * Mão 0 (mesa criada, nenhuma mão ainda) ou valor inválido conta como mão 1.
 */
export function levelFor(handNumber: number, settings: PokerSettings = DEFAULT_SETTINGS): LevelInfo {
  const levels = settings.levels;
  if (levels.length === 0) throw new Error('poker_settings.levels vazio');
  const perLevel = Math.max(1, Math.floor(settings.handsPerLevel) || 1);
  const hand = Number.isFinite(handNumber) ? Math.max(1, Math.floor(handNumber)) : 1;
  const index = Math.min(levels.length - 1, Math.floor((hand - 1) / perLevel));
  const [sb, bb, ante] = levels[index];
  const isLast = index === levels.length - 1;
  const following = isLast ? null : levels[index + 1];
  return {
    index,
    sb,
    bb,
    ante,
    handsLeft: isLast ? 0 : (index + 1) * perLevel - hand + 1,
    next: following ? { sb: following[0], bb: following[1], ante: following[2] } : null,
  };
}

/** Converte o nível para o formato do motor (`setBlinds`). */
export function blindsFor(level: LevelInfo): BlindLevel {
  return { smallBlind: level.sb, bigBlind: level.bb, ante: level.ante };
}
