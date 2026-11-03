/**
 * Decisão do bot (SPEC §3.5): síncrona, pura e determinística (o RNG vem no contexto).
 * features → política (push/fold, pré-flop ou pós-flop) → ε (segunda opção da própria
 * política) → travas → valor legal. thinkMs e cue saem depois, em tells.ts.
 *
 * Pôster Poker (03/11/2026, Golpe de Mestre): com o flop aberto antes das apostas do
 * pré-flop, o bot decide pelo caminho de pós-flop (equidade com o board que ele vê, faixas
 * pela ação do pré-flop); as tabelas de pré-flop e de push/fold não enxergam o board.
 */
import type { BotView } from '../types.ts';
import type { BotChoice } from './driver.ts';
import { handInfo } from './buckets.ts';
import { features } from './features.ts';
import { guardrails, toLegalAmount } from './guardrails.ts';
import type { BotCtx, Ranked } from './policy.ts';
import { postflop } from './postflop.ts';
import { preflop } from './preflop.ts';
import { pushFold } from './pushfold.ts';

export function decide(v: BotView, ctx: BotCtx): BotChoice {
  const f = features(v);
  const P = ctx.profile;
  const info = handInfo(v.hole, v.board, v.extraCards);
  let r: Ranked;
  if (v.street === 'preflop' && v.board.length < 3) r = f.effBB <= P.pushFold.maxBB ? pushFold(v, f, P, ctx) : preflop(v, f, P, ctx);
  else r = postflop(v, f, P, ctx, info.bucket, info.monster, info.pairPlus);
  let pick = r.ranked[0];
  if (r.ranked[1] && ctx.rng.nextFloat() < P.epsilon) pick = r.ranked[1];   // erro plausível
  pick = guardrails(pick, v, f, r.eq, info.bucket);
  return { action: toLegalAmount(pick, v), ...info };
}
