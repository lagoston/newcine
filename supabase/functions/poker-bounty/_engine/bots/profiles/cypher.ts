// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/bots/profiles/cypher.ts
/**
 * Cobra (cypher), "o caos como estilo": solta e agressiva, 3-bet leve, c-bet quase
 * sempre e overbet no river na carta de susto. Números do SPEC §3.2 e §3.6.
 */
import type { BotProfile } from '../../types.ts';

export const CYPHER_PROFILE: BotProfile = {
  id: 'cypher',
  rangeModel: 'static',
  iters: { flop: 400, turn: 400, river: 300 },
  noise: 0.04,
  epsilon: 0.08,
  epsilonFloor: 0.06,
  positionUse: 0.6,
  stinginess: 0,
  feFixed: 0.45,
  targets: { vpip: [42, 50], pfr: [32, 38], af: [3.5, 4.5] },
  preflop: {
    entry: { CO: 45, BTN: 65, SB: 55 },
    limpShare: 0.03,
    limpOnlySbVsPassiveBB: false,
    raiseOnlyTopPct: null,
    open: 2.5,
    openOOP: 3.0,
    iso: 3.5,
    isoPerExtraLimper: 1,
    threeBetPct: 12.5,
    threeBetBluffShare: 0.40,
    foldTo3bet: 0.55,
    foldTo4bet: 0.70,
    foldBBvsSteal: 0.35,
    callOpenPct: 30,
  },
  post: {
    cbetHU: 0.80,
    cbetPairOnly: false,
    barrelTurn: 0.60,
    riverAfterTwo: 0.65,
    checkRaise: 0.12,
    slowplay: 0.10,
    riverBluffShare: 0.52,
    scareCardOverbet: 0.80,
    callMarginPP: { pairPlus: -3, committed: -3, draw: -3, air: 0 },
    raiseValueFreq: 0.55,
    semibluffFreq: 0.45,
  },
  // River "1,0–1,5": 1,0 no valor fino, 1,5 no polarizado.
  sizings: { flopDry: 0.33, flopWet: 0.75, turn: 0.75, riverThin: 1.0, riverPolar: 1.5, monster: null, scareOverbet: 1.25 },
  pushFold: {
    maxBB: 12,
    shove: { CO: [45, 40, 35], BTN: [60, 55, 50], SB: [70, 65, 60] },
  },
  // Paga se pct ≤ 22 (× 1,5 no Veneno).
  callAllIn: { topPct: 22, eqVs: null, eqMarginPP: 0, icm3PP: 0 },
  model: { enabled: false, fe: { min: 0.45, max: 0.45 }, cbet: { min: 0.80, max: 0.80 }, callMarginPP: 0, foldBBvsSteal: 0 },
  // Veneno: perdeu ≥ 35% do cacife numa mão, ou blefe dela exposto → 6 mãos soltas.
  tilt: {
    kind: 'veneno',
    hands: 6,
    trigger: { lostPotBB: null, lostStackShare: 0.35, ownBluffExposed: true, bluffedByShown: false },
    effect: { vpipDelta: 12, pfrDelta: 10, bluffPP: 15, allInCallMul: 1.5, callMarginPP: 0, targeted: false },
  },
  showPolicy: { bluffWin: 0.30, strongFoldRiver: 0 },
  bounty: {
    carrier: { vpipDelta: 5, allInMarginPP: 0, tiltLostStackShare: 0.25 },
    hunterMarginPP: -5,
  },
  // Língua (nervoso) e cauda (confiante); fidelidade de tempo 0,70.
  tells: {
    bluffBet: { nervoso: 0.60, confiante: 0.10, calado: 0, neutro: 0.30 },
    valueBet: { nervoso: 0.20, confiante: 0.50, calado: 0, neutro: 0.30 },
    passiveDraw: { nervoso: 0.05, confiante: 0.40, calado: 0, neutro: 0.55 },
    rest: { nervoso: 0.05, confiante: 0.05, calado: 0, neutro: 0.90 },
  },
  think: {
    fidelity: 0.70,
    ranges: {
      bluff: { min: 400, max: 900 },
      monster: { min: 2000, max: 3000 },
      rest: { min: 600, max: 1200 },
    },
    tankChance: 0,
    tank: { min: 4000, max: 6000 },
  },
};
