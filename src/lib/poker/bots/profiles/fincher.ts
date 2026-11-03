/**
 * Raposo (fincher), "décadas de mesa": apertado e agressivo, aposta pela textura e lê o
 * oponente (modelo bayesiano com prior e decaimento). Números do SPEC §3.2 e §3.6.
 */
import type { BotProfile } from '../../types.ts';

export const FINCHER_PROFILE: BotProfile = {
  id: 'fincher',
  rangeModel: 'bayes',
  iters: { flop: 800, turn: 800, river: 600 },
  noise: 0.015,
  epsilon: 0.03,
  epsilonFloor: 0.025,
  positionUse: 1,
  stinginess: 0,
  feFixed: null,             // fold equity vem do modelo (model.fe)
  targets: { vpip: [30, 36], pfr: [24, 29], af: [2.5, 3.0] },
  preflop: {
    entry: { CO: 30, BTN: 48, SB: 42 },
    limpShare: 0.05,
    limpOnlySbVsPassiveBB: true,
    raiseOnlyTopPct: null,
    open: 2.2,
    openOOP: 2.2,
    iso: 4,
    isoPerExtraLimper: 1,
    threeBetPct: 8,
    threeBetBluffShare: 0.30,
    foldTo3bet: 0.45,
    foldTo4bet: 0.55,
    foldBBvsSteal: 0.45,
    callOpenPct: 22,
  },
  post: {
    cbetHU: 0.60,
    cbetPairOnly: false,
    barrelTurn: 0.45,
    riverAfterTwo: 0.50,
    checkRaise: 0.09,
    slowplay: 0.20,
    riverBluffShare: 'balanced',
    scareCardOverbet: 0,
    callMarginPP: { pairPlus: 0, committed: 0, draw: 0, air: 0 },   // ± modelo (model.callMarginPP)
    raiseValueFreq: 0.45,
    semibluffFreq: 0.30,
  },
  sizings: { flopDry: 0.33, flopWet: 0.66, turn: 0.66, riverThin: 0.5, riverPolar: 1.0, monster: null, scareOverbet: 1.25 },
  pushFold: {
    maxBB: 12,
    shove: { CO: [40, 30, 22], BTN: [55, 45, 40], SB: [70, 62, 58] },
  },
  // Paga se eq contra a faixa do agressor ≥ odds (+4 pp de ICM com 3 vivos).
  callAllIn: { topPct: null, eqVs: 'aggressorRange', eqMarginPP: 0, icm3PP: 4 },
  model: { enabled: true, fe: { min: 0.05, max: 0.75 }, cbet: { min: 0.45, max: 0.85 }, callMarginPP: 10, foldBBvsSteal: 0.10 },
  // Orgulho: blefe exposto contra ele → 8 mãos pagando 10 pp mais leve contra quem blefou.
  tilt: {
    kind: 'orgulho',
    hands: 8,
    trigger: { lostPotBB: null, lostStackShare: null, ownBluffExposed: false, bluffedByShown: true },
    effect: { vpipDelta: 0, pfrDelta: 0, bluffPP: 0, allInCallMul: 1, callMarginPP: -10, targeted: true },
  },
  showPolicy: { bluffWin: 0.15, strongFoldRiver: 0.35 },
  bounty: {
    carrier: { vpipDelta: 0, allInMarginPP: 6, tiltLostStackShare: null },
    hunterMarginPP: -5,
  },
  // Anel de fumaça (confiante) ~90% confiável; vitrine (nervoso) sem relação com a mão.
  tells: {
    riverNuts: { confiante: 0.30, nervoso: 0.25, neutro: 0.45, calado: 0 },
    rest: { confiante: 0.003, nervoso: 0.25, neutro: 0.747, calado: 0 },
  },
  think: {
    fidelity: 1,
    ranges: { rest: { min: 1200, max: 2500 } },
    tankChance: 0.08,          // sorteado sem relação com a mão
    tank: { min: 4000, max: 6000 },
  },
};
