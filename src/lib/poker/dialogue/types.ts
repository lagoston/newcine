/**
 * Tipos do Diretor de falas e do banco de falas (SPEC §6.1 e §8, pacote B).
 *
 * Não muda nada em `../types.ts` (congelado). O que o roteirista acrescentou ao banco
 * e não cabia no §6.1 foi resolvido aqui (03/11/2026):
 * - cue `fora` (o falante não está na mão) virou o campo `out` da fala;
 * - gatilhos sem par no §6.2 (créditos de quem levou a mesa, convite do Intervalo,
 *   créditos do empréstimo, "você mostra primeiro") ganharam nomes próprios no fim de `Trigger`;
 * - `requires.minMatches` (arco que só toca depois de N partidas na vida).
 */
import type { Cue, MatchMode, PlayerId, PrizeKind, PublicEvent, Rarity, RivalId, TableView, TitleId } from '../types.ts';

/** 'slow' (Pôster Poker, 03/11/2026: a mesa ficou mais lenta) vale como 'normal' para as falas. */
export type Speed = 'slow' | 'normal' | 'fast' | 'turbo';

export type Trigger =
  // §6.2
  | 'firstVisit' | 'matchStart' | 'bountyIntro' | 'sapoLoan' | 'bountyTaunt' | 'bountyAtRisk' | 'bountySteal'
  | 'bountyWon' | 'bountyLost' | 'deal' | 'flop' | 'limp' | 'call' | 'fold' | 'bet' | 'bigBet' | 'overbet'
  | 'checkRaise' | '3bet' | 'isolate' | 'allIn' | 'foldToPlayer' | 'playerFold' | 'playerBigBet' | 'playerAllIn'
  | 'potWon' | 'potLostToPlayer' | 'valueShown' | 'bluffShown' | 'playerBluffShown' | 'heroFoldShown'
  | 'playerBluffCaught' | 'catchBluff' | 'badBeatAgainstMe' | 'badBeatForMe' | 'playerBadBeat' | 'playerStreak'
  | 'readPlayer' | 'headsUp' | 'blindsUp' | 'tiltStart' | 'tiltEnd' | 'prideStart' | 'eliminated'
  | 'eliminatesOracle' | 'oracleOut' | 'eliminatesPlayer' | 'playerWinsMatch' | 'playerLosesMatch' | 'rankUp'
  | 'rateMove' | 'beautifulError' | 'lesson' | 'secretTell' | 'banter' | 'idle' | 'rematch' | 'playerLeaves'
  | 'tutorial' | 'contextTip' | 'intervalReturn' | 'recap' | 'quipAnswer'
  // acrescentados pelo pacote B (03/11/2026) para falas do banco final
  | 'showdown' | 'tableWinner' | 'intervalInvite' | 'loanCredits'
  // Pôster Poker (pacote H, 03/11/2026): o torneio da semana e os efeitos do pôster
  | 'tournamentIntro'   // abertura: o pôster da semana (variantes: raridade, efeito)
  | 'stakePoster'       // abertura: a pessoa apostou um pôster da coleção
  | 'cobraItem'         // a caixinha da Cobra (variantes: abertura, meio, ganhou, perdeu)
  | 'effectCast'        // o "CATCHAW" (variantes: efeito; 'explica' = 1ª vez na vida)
  | 'effectReveal'      // cartas fechadas abertas pelo efeito (reveal_one)
  | 'effectBonus'       // fichas da casa (variantes: efeito; 'humano' quando foi a pessoa)
  | 'tellMark'          // o tique de Le Chiffre numa aposta de oráculo (variantes: blefe, valor)
  | 'tournamentWon' | 'tournamentLost'   // créditos do torneio
  | 'stakeBack' | 'stakeLost';            // créditos: o pôster apostado volta ou fica com a Cobra

/** Gatilhos de ação de bot: toda fala de ator neles precisa de `cue` (§6.6). */
export const BOT_ACTION_TRIGGERS: readonly Trigger[] = [
  'limp', 'call', 'fold', 'bet', 'bigBet', 'overbet', 'checkRaise', '3bet', 'isolate', 'allIn', 'foldToPlayer',
];

export type Role = 'actor' | 'victim' | 'bystander' | 'winner' | 'loser' | 'carrier' | 'eliminated' | 'any';
export type Emote = 'excl' | 'quest' | 'dots' | 'sweat' | 'vein' | 'heart' | 'star' | 'hat' | 'note' | 'zzz' | 'broken';

export interface LineRequires {
  alive?: RivalId[];
  caller?: RivalId;
  titleAtLeast?: TitleId;
  storyNot?: string;
  storyHas?: string;
  /** Só depois de N partidas na vida (`lifetimeMatches`). */
  minMatches?: number;
}

export interface Line {
  id: string;                         // 'B21', 'C40', 'F57', 'QB1a'…
  speaker: RivalId;
  on: Trigger;
  variant?: string[];                 // condições nomeadas (todas precisam valer)
  role: Role;
  /**
   * Com o falante NA MÃO, só sai com um destes cues (o último cue dele na mão; quem ainda
   * não agiu conta como `neutro`). Ausente = não depende de cue.
   */
  cue?: Cue[];
  /**
   * O cue `fora` do roteirista: 'also' = também sai com o falante fora da mão (desistiu,
   * eliminado); 'only' = só sai com ele fora da mão. Ausente = indiferente quando não há `cue`;
   * com `cue`, fora da mão não sai.
   */
  out?: 'also' | 'only';
  curta?: boolean;                    // ≤ 44 caracteres em pt (calculado e conferido no teste)
  once?: 'match' | 'session' | 'life';
  requires?: LineRequires;
  story?: string;                     // ao tocar, marca a chave (poker_mark_story)
  priority: 1 | 2 | 3;
  weight?: number;                    // padrão 1
  emote?: Emote;
  pt: string;                         // ≤ 88 caracteres ({premio} conta 30)
}

export interface Exchange {           // troca atômica: começa ou não; se começa, vai até o fim
  id: string; on: Trigger; variant?: string[]; once?: 'match' | 'session' | 'life';
  requires?: LineRequires; story?: string; priority: 1 | 2 | 3;
  between: 'hands' | 'afterHumanFold' | 'any';   // 'any' só para P1 (ex.: despedida)
  parts: { speaker: RivalId; pt: string }[];     // 2 ou 3 balões (1 só nas despedidas)
  /** Despedida da pessoa eliminada: ritmo próprio (0,8 s + 40 ms por caractere). */
  farewell?: boolean;
}

/** Inglês por id: texto, null (só pt) ou, para trocas, um texto por balão. */
export type EnglishBank = Record<string, string | null | string[]>;

export interface QuipDef { id: string; pt: string; en: string }
export interface QuipPack { id: string; quips: QuipDef[] }

export interface DialogueBank {
  lines: Line[];
  exchanges: Exchange[];
  en: EnglishBank;
  quipPacks: Record<string, QuipPack>;
}

export interface SpeechItem {
  lineId: string;
  speaker: RivalId | 'human';
  text: string;
  priority: 1 | 2 | 3;
  emote?: Emote;
  durationMs: number;
  exchange?: { id: string; part: number; of: number };
  curta: boolean;
  /** Onde o balão nasce: a interface pode tratar a despedida e o treino à parte. */
  scene?: 'opening' | 'table' | 'farewell' | 'credits' | 'tutorial' | 'quip' | 'card';
  /** Só com `debug: true` nas opções (testes): de onde veio a fala. */
  debug?: { trigger: Trigger; role: Role | 'exchange' | 'quip' | 'tutorial'; cue?: Cue; hand: number; eventI: number;
            actorId?: PlayerId };
}

export interface TableContext {
  mode: MatchMode; lang: 'pt' | 'en'; title: TitleId; lifetimeMatches: number;
  matchInSession: number; returning: boolean; localHour: number; nemesis?: RivalId; customer?: RivalId;
  /** Memória do Raposo (partida anterior). `callsMuch` foi acrescentado pelo pacote B para a F07. */
  memory?: { riverBluffHigh?: boolean; foldsMuch?: boolean; callsMuch?: boolean };
  /** `name` já com artigo no idioma da mesa ("o baralho Noir" / "the Noir deck"). */
  prize?: { name: string; kind: PrizeKind; rarity: Rarity };
  story: Record<string, string>; speed: Speed; talk: 'all' | 'important' | 'none';
  view: TableView; reducedMotion: boolean;
  /**
   * Pôster Poker (03/11/2026): o que só a interface sabe do torneio (o resto vem em
   * `matchStarted.tournament`). `stake`: como a pessoa pagou a entrada; 'poster' = apostou
   * um pôster da coleção, da raridade do torneio (vai embora se ela não vencer).
   */
  tournament?: { stake: 'chips' | 'poster' };
}

/** Momentos que não vêm de `PublicEvent` (créditos, botões, Intervalo). */
export type DirectorMoment =
  | { t: 'rankUp'; title: TitleId }
  | { t: 'tableWinner'; winnerId: PlayerId }   // livre: resultado do simulateRest, nos créditos
  | { t: 'rematch' }
  | { t: 'playerLeaves' }
  | { t: 'intervalReturn' };

/** Dados do cartão "Anteriormente em…" (§7.8). */
export interface RecapInfo {
  handNumber: number;
  bb: number;
  stacks: Partial<Record<PlayerId, number>>;   // só quem está vivo
  holderId?: PlayerId | null;                  // portador do prêmio (partida valendo)
  someoneOut?: boolean;                        // algum oráculo já caiu
}

/** LRU e "uma vez por sessão", guardados em `poker.dialogue.v1` (storage.ts). */
export interface DialogueMemory {
  v: 1;
  lru: [id: string, at: number][];      // mais recente no fim; até 300
  session: { at: number; ids: string[] };
}
export interface DialogueStorage {
  load(): DialogueMemory;
  save(m: DialogueMemory): void;
  now(): number;
}

export interface DirectorOptions {
  mode: MatchMode;
  lang: 'pt' | 'en';
  talk: 'all' | 'important' | 'none';
  speed: Speed;
  story: Record<string, string>;
  lifetimeMatches: number;
  matchInSession: number;
  reducedMotion: boolean;
  /** Pacote de Réplicas equipado (padrão 'quips-padrao'). */
  quipPack?: string;
  /** A partida abre logo depois do cartão de Intervalo (a abertura vira `intervalReturn`). */
  afterInterval?: boolean;
  // --- só para testes ---
  bank?: DialogueBank;
  rng?: () => number;
  /** null desliga o localStorage (LRU e sessão ficam só na memória). */
  storage?: DialogueStorage | null;
  debug?: boolean;
}

export interface Director {
  onEvent(e: PublicEvent, ctx: TableContext): void;
  onHumanTurn(open: boolean): void; onIdleTick(msParada: number): void; onDrawer(open: boolean): void;
  onQuip(quipId: string, target: RivalId): void; onTutorialBeat(lineIds: string[]): void;
  next(nowMs: number): SpeechItem | null;      // um balão por vez; a interface chama em loop
  skip(): void; storyTouched(): string[];       // chaves para poker_mark_story no fim da partida
  // --- acréscimos do pacote B (opcionais para quem só usa o §8) ---
  onMoment(m: DirectorMoment): void;
  /** Fala para um cartão (fora do orçamento): a recapitulação do Raposo ou o convite do Intervalo. */
  cardLine(kind: 'recap' | 'intervalInvite', ctx: TableContext, info?: RecapInfo): SpeechItem | null;
}
