/**
 * Cópia de TESTE do roteiro do treino (falas/tutorial.md, 03/11/2026), só para o
 * test-match conferir startTutorialHand. O roteiro de verdade é do pacote B
 * (src/lib/poker/tutorial/script.ts).
 */
import type { PlayerAction, TutorialScript } from '../../../src/lib/poker/index.ts';

export const SAMPLE_TUTORIAL: TutorialScript = {
  id: 'tutorial-v1',
  stack: 2000,
  blinds: { smallBlind: 25, bigBlind: 50, ante: 0 },
  hands: [
    {
      buttonId: 'human',
      preset: {
        holeCards: { human: ['9s', '9d'], bogart: ['7h', '6h'], fincher: ['Ks', 'Jc'], cypher: ['8d', '3c'] },
        board: ['9c', 'Kd', '4h', '2c', '7s'],
      },
      bots: {
        cypher: [{ type: 'fold' }],
        bogart: [{ type: 'call' }, { type: 'check' }, { type: 'call' }, { type: 'check' }, { type: 'bet', amount: 125 }],
        fincher: [{ type: 'check' }, { type: 'bet', amount: 75 }, { type: 'check' }, { type: 'call' }],
      },
      human: [
        { street: 'preflop', allowed: ['call'], suggested: { type: 'call' }, hintLineId: 'TU1-04' },
        { street: 'flop', allowed: ['call'], suggested: { type: 'call' }, hintLineId: 'TU1-09' },
        { street: 'turn', allowed: ['check'], suggested: { type: 'check' }, hintLineId: 'TU1-13' },
        { street: 'river', allowed: ['call'], suggested: { type: 'call' }, hintLineId: 'TU1-16' },
      ],
      beats: [{ at: 'handStart', lineIds: ['TU1-01', 'TU1-02'], waitTap: true }],
    },
    {
      buttonId: 'bogart',
      preset: {
        holeCards: { human: ['8c', '3d'], bogart: ['Ac', 'Jc'], fincher: ['Th', '4s'], cypher: ['7s', '2d'] },
        board: ['Kd', 'Qs', '5c', '9h', '4d'],
      },
      bots: {
        bogart: [{ type: 'call' }, { type: 'fold' }],
        fincher: [{ type: 'fold' }],
        cypher: [{ type: 'raise', amount: 250 }],
      },
      human: [{ street: 'preflop', allowed: ['fold'], suggested: { type: 'fold' }, hintLineId: 'TU2-02' }],
      beats: [{ at: 'handStart', lineIds: ['TU2-01'] }],
    },
    {
      buttonId: 'fincher',
      preset: {
        holeCards: { human: ['6d', '5d'], bogart: ['Js', '3h'], fincher: ['9c', '2h'], cypher: ['Qh', 'Jc'] },
        board: ['Ks', '4c', '3d', '8s', 'Ah'],
      },
      bots: {
        bogart: [{ type: 'fold' }],
        fincher: [{ type: 'fold' }],
        cypher: [{ type: 'raise', amount: 150 }, { type: 'bet', amount: 100 }, { type: 'fold' }],
      },
      human: [
        { street: 'preflop', allowed: ['call'], suggested: { type: 'call' }, hintLineId: 'TU3-04' },
        { street: 'flop', allowed: ['raise'], suggested: { type: 'raise', amount: 350 }, hintLineId: 'TU3-09' },
      ],
      beats: [{ at: 'handEnd', lineIds: ['TU3-11'] }],
    },
  ],
};

export function suggested(i: 0 | 1 | 2, step: number): PlayerAction {
  return SAMPLE_TUTORIAL.hands[i].human[step].suggested;
}
