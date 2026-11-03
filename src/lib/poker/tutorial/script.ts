/**
 * Roteiro do treino 'tutorial-v1' (SPEC §2.8; roteiro do roteirista em falas-src/06-tutorial.txt
 * e tutorial.pt.tpl, 03/11/2026). O Raposo explica, o Sapo erra e a Cobra corrige.
 *
 * Só dados: quem executa é `startTutorialHand` (pacote A) e quem mostra é a interface (D).
 * O preset é constante do código e nunca vem do cliente na partida valendo.
 *
 * Quando cada beat toca (contrato com a interface):
 * - 'handStart': cartas dadas, ANTES de qualquer ação de bot (as falas anunciam o que vem);
 * - { afterHumanStep: n }: logo depois da ação n da pessoa, ANTES das respostas dos bots;
 * - 'flop' | 'turn' | 'river': com as cartas da rua na mesa e os bots que falam antes da
 *   pessoa já tendo agido, logo antes da vez dela (as falas comentam o que aconteceu);
 * - 'showdown': cartas abertas e pote entregue; 'handEnd': por último (o "Continuar" leva à
 *   próxima mão). Beats com o mesmo `at` tocam na ordem do array.
 * A interface espera os balões de um beat acabarem antes de seguir a animação, e só abre
 * a vez da pessoa (`onHumanTurn(true)`) depois do beat da rua; aí mostra `hintLineId`.
 *
 * Toques por mão (ações + "Continuar"): mão 1 = 4 + 2, mão 2 = 1 + 1, mão 3 = 2 + 1.
 */
import type { PlayerAction } from '../engine.ts';
import type { TutorialScript } from '../types.ts';

export const TUTORIAL_SCRIPT: TutorialScript = {
  id: 'tutorial-v1',
  stack: 2000,
  blinds: { smallBlind: 25, bigBlind: 50, ante: 0 },
  hands: [
    // Mão 1 · Pagar e passar · ganhar com trinca de noves (pote final 750)
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
      beats: [
        { at: 'handStart', lineIds: ['TU1-01', 'TU1-02', 'TU1-03'], highlight: 'holeCards', waitTap: true },
        { at: { afterHumanStep: 0 }, lineIds: ['TU1-05', 'TU1-06'] },
        { at: 'flop', lineIds: ['TU1-07', 'TU1-08'], highlight: 'board' },
        { at: { afterHumanStep: 1 }, lineIds: ['TU1-10', 'TU1-11'] },
        { at: 'turn', lineIds: ['TU1-12'], highlight: 'actions' },
        { at: 'river', lineIds: ['TU1-14', 'TU1-15'] },
        { at: 'showdown', lineIds: ['TU1-17', 'TU1-18'], highlight: 'handName' },
        { at: 'handEnd', lineIds: ['TU1-19'], highlight: 'pot', waitTap: true },
      ],
    },
    // Mão 2 · Desistir · ver o blefe da Cobra derrubar o A-J do Sapo
    {
      buttonId: 'bogart',
      preset: {
        holeCards: { human: ['8c', '3d'], bogart: ['Ac', 'Jc'], fincher: ['Th', '4s'], cypher: ['7s', '2d'] },
        board: ['Kd', '9h', '5c', 'Qs', '6h'],   // não sai: a mão acaba antes do flop
      },
      bots: {
        bogart: [{ type: 'call' }, { type: 'fold' }],
        fincher: [{ type: 'fold' }],
        cypher: [{ type: 'raise', amount: 250 }],
      },
      human: [
        { street: 'preflop', allowed: ['fold'], suggested: { type: 'fold' }, hintLineId: 'TU2-02' },
      ],
      beats: [
        { at: 'handStart', lineIds: ['TU2-01'], highlight: 'holeCards' },
        { at: { afterHumanStep: 0 }, lineIds: ['TU2-03', 'TU2-04', 'TU2-05'] },
        { at: 'handEnd', lineIds: ['TU2-06', 'TU2-07', 'TU2-08'] },
        { at: 'handEnd', lineIds: ['TU2-09'], waitTap: true },
      ],
    },
    // Mão 3 · Aumentar · o seu semi-blefe faz a Cobra largar (você leva 500)
    {
      buttonId: 'fincher',
      preset: {
        holeCards: { human: ['6d', '5d'], bogart: ['Js', '3h'], fincher: ['9c', '2h'], cypher: ['Qh', 'Jc'] },
        board: ['Ks', '4c', '3d', 'Jh', '8s'],   // turn e river não saem
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
      beats: [
        { at: 'handStart', lineIds: ['TU3-01', 'TU3-02', 'TU3-03'], highlight: 'holeCards' },
        { at: 'flop', lineIds: ['TU3-05', 'TU3-06', 'TU3-07'], highlight: 'board' },
        { at: 'flop', lineIds: ['TU3-08'] },
        { at: { afterHumanStep: 1 }, lineIds: ['TU3-10'] },
        { at: 'handEnd', lineIds: ['TU3-11', 'TU3-12', 'TU3-13'] },
        // TU3-15 ("Toma uma ficha de presente") só toca uma vez na vida: o Diretor a pula se
        // `story['once.tu3-15']` já existir (ex.: quem refaz o treino por "Como jogar").
        { at: 'handEnd', lineIds: ['TU3-14', 'TU3-15'], waitTap: true },
      ],
    },
  ],
};

/**
 * "Corta. Tomada dois." (roteirista): se a pessoa tocar num botão apagado, a ação NÃO
 * acontece; a interface mostra esta fala do Raposo e a decisão se repete (não conta toque).
 * Chave: `${mão}:${passo}:${tipo da ação}` (mão e passo começam em 0). All-in usa a fala do
 * aumento; apostar onde a aula é passar usa a de "apostar".
 */
export const TUTORIAL_CORRECTIONS: Record<string, string> = {
  '0:0:fold': 'TU1-C1', '0:0:raise': 'TU1-C2', '0:0:allIn': 'TU1-C2',
  '0:1:fold': 'TU1-C3', '0:1:raise': 'TU1-C4', '0:1:allIn': 'TU1-C4',
  '0:2:bet': 'TU1-C5', '0:2:allIn': 'TU1-C5', '0:2:fold': 'TU1-C6',
  '0:3:raise': 'TU1-C7', '0:3:allIn': 'TU1-C7', '0:3:fold': 'TU1-C8',
  '1:0:call': 'TU2-C1', '1:0:raise': 'TU2-C2', '1:0:allIn': 'TU2-C2',
  '2:0:fold': 'TU3-C1', '2:0:raise': 'TU3-C2', '2:0:allIn': 'TU3-C2',
  '2:1:call': 'TU3-C3', '2:1:fold': 'TU3-C4', '2:1:allIn': 'TU3-09',
};

/** Fala de "tomada dois" para um toque fora do roteiro, se houver. */
export function tutorialCorrection(hand: 0 | 1 | 2, step: number, action: PlayerAction['type']): string | null {
  return TUTORIAL_CORRECTIONS[`${hand}:${step}:${action}`] ?? null;
}
