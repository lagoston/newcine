/**
 * Sapo (bogart), "o pão-duro do pântano": limper, larga demais, paga até o fim com par
 * depois de investir e só aposta grande com monstro. Números do SPEC §3.2 e §3.6.
 * Faixas da tabela (metas) estão em `targets`; o resto é ponto de partida da calibração.
 */
import type { BotProfile } from '../../types.ts';

export const BOGART_PROFILE: BotProfile = {
  id: 'bogart',
  rangeModel: 'random',
  iters: { flop: 200, turn: 200, river: 150 },
  noise: 0.10,
  epsilon: 0.15,
  epsilonFloor: 0.12,
  positionUse: 0,
  stinginess: 0.6,
  feFixed: 0.10,
  targets: { vpip: [22, 28], pfr: [4, 8], af: [0.8, 1.2] },
  preflop: {
    entry: { CO: 15, BTN: 22, SB: 30 },
    limpShare: 0.70,
    limpOnlySbVsPassiveBB: false,
    raiseOnlyTopPct: 4,
    // "4 (só top 4%)": o Sapo só aumenta com o top 4%, sempre para 4 BB.
    open: 4,
    openOOP: 4,
    iso: 4,
    isoPerExtraLimper: 1,
    threeBetPct: 2,            // QQ+, AK
    threeBetBluffShare: 0,
    foldTo3bet: 0.40,
    foldTo4bet: 0.20,
    foldBBvsSteal: 0.75,
    callOpenPct: 18,
  },
  post: {
    cbetHU: 0.35,
    cbetPairOnly: true,
    barrelTurn: 0.25,
    riverAfterTwo: 0.30,
    checkRaise: 0.02,
    slowplay: 0.35,
    riverBluffShare: 0.04,
    scareCardOverbet: 0,
    callMarginPP: { pairPlus: 0, committed: -8, draw: 10, air: 5 },
    raiseValueFreq: 0.15,
    semibluffFreq: 0.02,
  },
  sizings: { flopDry: 0.33, flopWet: 0.33, turn: 0.5, riverThin: 0.5, riverPolar: 0.5, monster: 1.0, scareOverbet: 1.25 },
  pushFold: {
    maxBB: 10,
    shove: { CO: [35, 10, 10], BTN: [35, 10, 10], SB: [35, 10, 10] },
  },
  // Paga se pct ≤ 5 ou se eq(aleatória) ≥ odds + 5 pp.
  callAllIn: { topPct: 5, eqVs: 'random', eqMarginPP: 5, icm3PP: 0 },
  model: { enabled: false, fe: { min: 0.10, max: 0.10 }, cbet: { min: 0.35, max: 0.35 }, callMarginPP: 0, foldBBvsSteal: 0 },
  // Emburrado: perdeu pote ≥ 20 BB → VPIP −3 por 4 mãos.
  tilt: {
    kind: 'emburrado',
    hands: 4,
    trigger: { lostPotBB: 20, lostStackShare: null, ownBluffExposed: false, bluffedByShown: false },
    effect: { vpipDelta: -3, pfrDelta: 0, bluffPP: 0, allInCallMul: 1, callMarginPP: 0, targeted: false },
  },
  showPolicy: { bluffWin: 0, strongFoldRiver: 0 },   // nunca mostra
  bounty: {
    carrier: { vpipDelta: -5, allInMarginPP: 8, tiltLostStackShare: null },
    hunterMarginPP: -5,
  },
  // Fidelidade de tempo 0,85; tell confiável a ~90%.
  tells: {
    bigBetMonster: { calado: 0.95, nervoso: 0, confiante: 0, neutro: 0.05 },
    bigBetNoMonster: { calado: 0, nervoso: 0.90, confiante: 0, neutro: 0.10 },
    callWeakPair: { calado: 0, nervoso: 0.90, confiante: 0.05, neutro: 0.05 },
    otherPairPlus: { calado: 0.02, nervoso: 0.03, confiante: 0.85, neutro: 0.10 },
    otherNoPair: { calado: 0, nervoso: 0.05, confiante: 0.10, neutro: 0.85 },
  },
  think: {
    fidelity: 0.85,
    ranges: {
      strong: { min: 500, max: 1000 },
      doubt: { min: 2500, max: 4000 },
      rest: { min: 800, max: 1600 },
    },
    tankChance: 0,
    tank: { min: 4000, max: 6000 },
  },
};
