/**
 * O que os créditos mostram (SPEC §7.6), montado pelo controlador de cada modo.
 */
import type { Card } from '../cards.ts';
import type { HandKind } from '../evaluator.ts';
import type { PlayerId, Rarity, RivalId, TitleId } from '../types.ts';
import type { PokerPrize } from './apiTypes.ts';
import type { TournamentPrize, TournamentRewards } from './tournament.ts';

export interface CreditsData {
  mode: 'free' | 'bounty' | 'friends';
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
  /** Partida que já tinha terminado ao abrir a mesa: direto aos créditos, sem despedida. */
  instant?: boolean;
  /**
   * Pôster Poker (03/11/2026): o torneio da semana. `won` = 1º lugar (leva o pôster);
   * `rewards` vem da resposta final da Edge (pôster, item da Cobra, o que foi apostado).
   */
  tournament?: {
    prize: TournamentPrize | null;
    won: boolean;
    rewards: TournamentRewards | null;
    stake: { kind: 'chips' | 'poster'; title?: string; filePath?: string; effect?: string } | null;
  } | null;
  /**
   * Mesa com amigos (fase 3): quem venceu a mesa e para onde foi cada pôster apostado
   * (`returned` = voltou ao dono; `transferred` = foi para quem venceu; `lost` = ficou
   * com o oráculo que venceu).
   */
  friends?: {
    winner: { name: string; me: boolean; oracle: RivalId | null };
    stakes: {
      title: string;
      titleEn: string;
      filePath: string;
      effect: string;
      rarity: Rarity;
      outcome: 'returned' | 'transferred' | 'lost';
      owner: string;
      mine: boolean;
      to: string | null;
      toMe: boolean;
      oracle: RivalId | null;
    }[];
  } | null;
  /** Casual de devolução (fase 3): o pôster que voltou para a coleção. */
  recovered?: { title: string; titleEn: string; filePath: string; effect: string; rarity: Rarity } | null;
}
