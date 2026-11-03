// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/tutorialRunner.ts
/**
 * Treino (SPEC §2.8): cada mão é uma mesa nova, com o botão do roteiro, cacifes iguais,
 * cartas do preset e bots seguindo a fila. Semente fixa 'tutorial-v1'.
 * O preset é constante do código: o servidor nem aceita o modo `tutorial`.
 */
import { DEFAULT_DIFFICULTY, DEFAULT_SETTINGS } from '../config.ts';
import { DEFAULT_PROFILES } from '../bots/profile.ts';
import type { MatchConfig, MatchStep, TutorialScript } from '../types.ts';
import { emitMatchStarted, initialState, runUntilHuman } from './runner.ts';

export const TUTORIAL_SEED = 'tutorial-v1';

export function tutorialConfig(script: TutorialScript): MatchConfig {
  const { smallBlind, bigBlind, ante } = script.blinds;
  return {
    mode: 'tutorial',
    seed: TUTORIAL_SEED,
    settings: { ...DEFAULT_SETTINGS, startStack: script.stack, handsPerLevel: 1000, levels: [[smallBlind, bigBlind, ante]] },
    seats: { human: 0, bogart: 1, fincher: 2, cypher: 3 },
    profiles: { bogart: DEFAULT_PROFILES.bogart, cypher: DEFAULT_PROFILES.cypher, fincher: DEFAULT_PROFILES.fincher },
    paramsVersion: { bogart: 0, cypher: 0, fincher: 0 },
    difficulty: DEFAULT_DIFFICULTY.free,
    loan: 0,
    prize: null,
    memory: null,
    tutorial: script,
  };
}

/** Mão `i` do treino a partir de uma config de treino (createMatch usa com i = 0). */
export function startTutorialFrom(cfg: MatchConfig, i: 0 | 1 | 2): MatchStep {
  const script = cfg.tutorial;
  if (!script) throw new Error('treino sem roteiro (MatchConfig.tutorial)');
  const hand = script.hands[i];
  const st = initialState({ ...cfg, mode: 'tutorial', loan: 0, prize: null }, cfg.seats[hand.buttonId]);
  st.tutorialHand = i;
  const ctx = { st, ev: [], record: true, decisions: 0, maxDecisions: 200 };
  emitMatchStarted(ctx);
  runUntilHuman(ctx);
  return { state: ctx.st, events: ctx.ev };
}

export function startTutorialHand(script: TutorialScript, i: 0 | 1 | 2): MatchStep {
  return startTutorialFrom(tutorialConfig(script), i);
}
