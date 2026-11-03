/**
 * Números padrão da mesa (SPEC §2.2, §2.6, §2.7 e §3.4).
 *
 * A fonte de verdade é `poker_settings` no banco. Isto é uma cópia idêntica só para
 * jogar offline (partida livre sem rede) e para os testes/simulador. Mudou lá, muda aqui.
 */
import type { BlindLevel } from './engine.ts';
import type { DifficultyRow, LevelInfo, PokerSettings, Rarity } from './types.ts';

/**
 * Dificuldade pública por raridade (§3.4). Só mexe em ε e no atraso de adaptação do
 * Raposo; as iterações nunca mudam. `stars` 0 = sem estrelas (mesa livre).
 */
export const DEFAULT_DIFFICULTY: Record<Rarity | 'free', DifficultyRow> = {
  free: { stars: 0, epsilonMul: 1.0, adaptDelay: 12 },
  common: { stars: 1, epsilonMul: 1.3, adaptDelay: 16 },
  rare: { stars: 2, epsilonMul: 1.15, adaptDelay: 14 },
  epic: { stars: 3, epsilonMul: 1.0, adaptDelay: 12 },
  legendary: { stars: 4, epsilonMul: 0.85, adaptDelay: 9 },
};

export const DEFAULT_SETTINGS: PokerSettings = {
  startStack: 2000,
  handsPerLevel: 5,
  // Veredito Q1 (03/11/2026): degraus de ~×1,4; ante = BB/4 a partir do nível 3 (soma = 1 BB com 4 vivos).
  levels: [
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
