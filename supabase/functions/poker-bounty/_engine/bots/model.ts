// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/bots/model.ts
/**
 * Modelo do Raposo (SPEC §3.5): contadores por oponente, só com ações públicas e cartas
 * abertas. Esta versão (A1) só cria os contadores; a atualização entra no A2.
 */
import type { OppCounters } from '../types.ts';

export function emptyCounters(): OppCounters {
  return {
    hands: 0, vpip: 0, pfr: 0,
    nCbetFaced: 0, foldToCbet: 0,
    postBets: 0, postCalls: 0,
    riverBetsShown: 0, riverBluffsShown: 0,
    pfShoves: 0,
    raw: { hands: 0, cbetFaced: 0, riverBetsShown: 0 },
  };
}
