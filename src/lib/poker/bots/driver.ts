/**
 * Ponto único em que a camada de partida pede a decisão de um bot. Recebe só o BotView
 * (montado de `publicView`) e o fluxo de RNG da decisão; devolve a ação e o grupo da mão
 * (privado, para tells e logs de teste).
 */
import type { Card } from '../cards.ts';
import { rankOf } from '../cards.ts';
import type { PlayerAction } from '../engine.ts';
import { createRng } from '../rng.ts';
import type { HandBucket, RivalId } from '../types.ts';
import type { MatchStateX } from '../match/internal.ts';
import { bucketOf, categoryOf, isMonster } from './buckets.ts';
import { randomAction } from './random.ts';
import { buildBotView } from './view.ts';

export interface BotChoice {
  action: PlayerAction;
  bucket: HandBucket;
  monster: boolean;
  pairPlus: boolean;
}

/** Estratégia trocável (testes e simulador): por padrão, o bot do perfil. */
export type BotStrategy = (st: MatchStateX, botId: RivalId) => BotChoice;

export function handInfo(hole: readonly Card[], board: readonly Card[]): { bucket: HandBucket; monster: boolean; pairPlus: boolean } {
  const bucket = bucketOf(hole, board);
  const pairPlus = board.length === 0 ? rankOf(hole[0]) === rankOf(hole[1]) : categoryOf([...hole, ...board]) >= 1;
  return { bucket, monster: isMonster(hole, board, bucket), pairPlus };
}

export function defaultBotChoice(st: MatchStateX, botId: RivalId): BotChoice {
  const v = buildBotView(st, botId);
  const rng = createRng(`${st.config.seed}:bot:${st.game.handNumber}:${st.actionNo}:${v.seat}`);
  const action = randomAction(v, rng);
  return { action, ...handInfo(v.hole, v.board) };
}
