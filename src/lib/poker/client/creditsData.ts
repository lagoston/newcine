/**
 * O que os créditos mostram (SPEC §7.6), montado pelo controlador de cada modo.
 */
import type { Card } from '../cards.ts';
import type { HandKind } from '../evaluator.ts';
import type { PlayerId, Rarity, RivalId, TitleId } from '../types.ts';
import type { PokerPrize } from './apiTypes.ts';

export interface CreditsData {
  mode: 'free' | 'bounty';
  place: number;
  reason: 'won' | 'eliminated' | 'forfeit' | 'abandoned';
  eliminatedBy: PlayerId | null;
  eliminatedHand: number | null;
  /** Livre: quem levou a mesa (undefined = ainda calculando). */
  tableWinner?: PlayerId | null;
  bestHand: { cards: Card[]; kind: HandKind; royal?: boolean } | null;
  biggestPot: number;
  title: { id: TitleId; rankUp: boolean } | null;
  marks: string[];
  prize: PokerPrize | null;
  captured: boolean;
  loan: boolean;
  retry: { n: number; max: number } | null;
  tomorrow: { rarity: Rarity; carrier: RivalId } | null;
}
