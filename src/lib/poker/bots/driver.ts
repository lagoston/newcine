/**
 * Ponto único em que a camada de partida pede a decisão de um bot. O bot recebe só o
 * BotView (montado de `publicView`) e o fluxo de RNG da decisão
 * `${seed}:bot:${mão}:${nºAção}:${assento}` (§3.7); devolve a ação e o grupo da mão
 * (privado, para tells e logs de teste).
 */
import type { PlayerAction } from '../engine.ts';
import { createRng } from '../rng.ts';
import type { HandBucket, RivalId } from '../types.ts';
import type { MatchStateX } from '../match/internal.ts';
import { handInfo } from './buckets.ts';
import { decide } from './decide.ts';
import { modelView } from './model.ts';
import { applyMods } from './policy.ts';
import type { BotCtx } from './policy.ts';
import { randomAction } from './random.ts';
import { buildBotView } from './view.ts';

export interface BotChoice {
  action: PlayerAction;
  bucket: HandBucket;
  monster: boolean;
  pairPlus: boolean;
}

/** 'real' = perfis do §3.2 (padrão); 'random' = bot provisório do A1 (testes). */
let mode: 'real' | 'random' = 'real';
export function setBotMode(m: 'real' | 'random'): void {
  mode = m;
}

export function botCtxFor(st: MatchStateX, botId: RivalId, seat: number): BotCtx {
  const cfg = st.config;
  const prof = cfg.profiles[botId];
  const mem = st.bots[botId];
  const live = !!cfg.prize && st.capturedHand === null && st.holderId !== null;
  const isCarrier = live && st.holderId === botId;
  const huntingId = live && st.holderId !== botId ? st.holderId : null;
  return {
    profile: applyMods(prof, mem.tilt, isCarrier, cfg.difficulty),
    mem,
    model: prof.model.enabled ? modelView(mem.model, cfg.difficulty.adaptDelay) : undefined,
    difficulty: cfg.difficulty,
    rng: createRng(`${cfg.seed}:bot:${st.game.handNumber}:${st.actionNo}:${seat}`),
    isCarrier,
    huntingId,
  };
}

export function defaultBotChoice(st: MatchStateX, botId: RivalId): BotChoice {
  const v = buildBotView(st, botId);
  const ctx = botCtxFor(st, botId, v.seat);
  if (mode === 'random') return { action: randomAction(v, ctx.rng), ...handInfo(v.hole, v.board) };
  return decide(v, ctx);
}
