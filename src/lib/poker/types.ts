/**
 * Contratos compartilhados do poker "O Grande Blefe" (SPEC §2.8, §3.1, §3.2, §3.5, §4.3, §4.4, §4.5).
 *
 * Congelado no F0 (03/11/2026): mudar qualquer tipo daqui exige acordo entre os pacotes.
 * Só tipos: nada aqui existe em tempo de execução.
 *
 * Ordem das declarações: cada tipo vem depois dos que ele usa, porque o ESLint do
 * projeto (no-use-before-define) também vale para tipos. O conteúdo é o do SPEC.
 */
import type { Card } from './cards.ts';
import type { BlindLevel, LegalActions, PlayerAction, PlayerStatus, Street, BoardStreet,
              RecordedActionType, GameState, ActionRecord, PokerEvent } from './engine.ts';
// HandKind mora no avaliador (o motor só o importa, não o reexporta).
import type { HandKind } from './evaluator.ts';

// ---------------------------------------------------------------------------
// Identificadores (§4.3)
// ---------------------------------------------------------------------------

export type RivalId = 'bogart' | 'cypher' | 'fincher' | (string & {});   // rival novo = mais um id
export type PlayerId = 'human' | RivalId;
// Pacote E3 (03/11/2026): 'friends' = mesa com amigos (até 4 pessoas; os lugares que sobram ficam com oráculos).
export type MatchMode = 'free' | 'bounty' | 'tutorial' | 'friends';
export type Cue = 'confiante' | 'nervoso' | 'calado' | 'neutro';
export type SizeClass = 'small' | 'medium' | 'big' | 'overbet';   // <0,5 · 0,5–0,75 · ≥0,75 ou ≥30% do cacife · >1,0 pote
export type StyleLabel = 'pedra' | 'solto' | 'pagaTudo' | 'blefador';
export type TiltKind = 'veneno' | 'orgulho' | 'emburrado';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type PrizeKind = 'tickets' | 'special_tickets' | 'poster' | 'avatar_frame' | 'banner' | 'tag'
                      | 'deck' | 'table' | 'rival' | 'poker_quip';
export type TitleId = 'figurante' | 'duble' | 'coadjuvante' | 'protagonista' | 'estrela' | 'lenda';

// ---------------------------------------------------------------------------
// Pôster Poker (03/11/2026, tarde): o torneio da semana e o pôster mágico
//
// Pedido do Bruno: o pôquer vira um jogo à parte ("Pôster Poker"). O antigo prêmio
// do dia (modo interno 'bounty') passa a ser o TORNEIO DA SEMANA (troca toda quinta,
// 00h00 de Brasília): um dos 9 pôsteres exclusivos do pôquer, intrável, sempre com o
// efeito "gold". Quem vence a mesa (1º lugar) leva o pôster — não há mais portador
// nem captura no torneio (`MatchConfig.prize` fica null). O pôster flutua sobre a mesa
// e, em mãos sorteadas pela semente, "lança" o seu efeito (evento `effectCast`).
// O nome interno do modo continua 'bounty' (banco, Edge e protocolo).
// ---------------------------------------------------------------------------

/** Os 9 efeitos, um por pôster do torneio. */
export type PosterEffectId =
  | 'early_flop'   // Golpe de Mestre: o flop vira antes das apostas do pré-flop
  | 'double_pot'   // A Cor do Dinheiro: a casa dobra o pote da mão
  | 'blackjack'    // Quebrando a Banca: no fim da mão as cartas fechadas viram; a mais perto de 21 ganha um bônus
  | 'hand_bounty'  // Rain Man: o primeiro a fechar uma mão com a jogada-alvo ganha um bônus
  | 'eight_aces'   // Cassino: 8 ases a mais no baralho (2 de cada naipe) a partida inteira
  | 'reveal_one'   // Cartas na Mesa: uma carta de cada jogador vira para todos
  | 'sixth_card'   // Onze Homens e um Segredo: o river vem com uma sexta carta comunitária
  | 'opal'         // Joias Brutas: uma carta vira a opala; quem levar um pote com ela na mão ganha um bônus
  | 'tell';        // 007 Cassino Royale: por N mãos, cada aposta de oráculo mostra o tique (blefe ou valor)

/** Números de cada efeito (padrão em config.ts DEFAULT_EFFECTS; o banco pode sobrepor). */
export interface EffectParams {
  casts: number;            // quantas vezes lança na partida (efeitos de mão); 1 para os de uma vez só
  firstHand: [number, number];   // a 1ª lançada cai numa mão sorteada neste intervalo (inclusive)
  gapHands: number;         // mínimo de mãos entre duas lançadas
  amount?: number;          // bônus em fichas de mesa (blackjack, hand_bounty, opal)
  hands?: number;           // duração em mãos (tell)
  spread?: number;          // pacote E (03/11/2026): folga sorteada 0..spread além de gapHands (padrão 3)
}

/**
 * Pacote E3 (03/11/2026): ids dos lugares de pessoas na mesa de amigos, na ordem de entrada
 * na sala (p1 = quem criou, no lugar 0). Nenhum lugar se chama 'human' numa mesa de amigos;
 * cada aparelho troca o próprio id por 'human' com povEvents/povView (match/pov.ts).
 */
export type PersonSeatId = 'p1' | 'p2' | 'p3' | 'p4';
/** Situação de cada pessoa numa mesa de amigos. */
export type PersonStatus = 'playing' | 'out' | 'left';
export type EndReasonPublic = 'won' | 'eliminated' | 'forfeit' | 'abandoned';
/** Ação feita pelo servidor no lugar de uma pessoa (estouro do relógio, ausente, quem saiu). */
export type AutoActionKind = 'timeout' | 'away' | 'left';

export interface TournamentConfig {
  prizeId: string;          // poker_prizes.id do pôster da semana
  rarity: Rarity;
  effect: PosterEffectId;
  cobraItem: boolean;       // a Cobra trouxe um item secreto (sorteio do servidor); só visual e concessão
}

/** Dados públicos de cada lançada (o que a mesa mostra na hora do "CATCHAW"). */
export type EffectCastData =
  | { effect: 'early_flop' }
  | { effect: 'double_pot' }
  | { effect: 'blackjack'; amount: number }
  | { effect: 'hand_bounty'; target: HandKind; amount: number }
  | { effect: 'eight_aces'; added: Card[] }
  | { effect: 'reveal_one' }
  | { effect: 'sixth_card' }
  | { effect: 'opal'; card: Card; amount: number }
  | { effect: 'tell'; hands: number };

// ---------------------------------------------------------------------------
// Ajustes da mesa e níveis (§4.3, §2.2, §3.4)
// ---------------------------------------------------------------------------

export interface DifficultyRow { stars: 0 | 1 | 2 | 3 | 4; epsilonMul: number; adaptDelay: number }
export interface PokerSettings {
  startStack: number; handsPerLevel: number; levels: [sb: number, bb: number, ante: number][];
  loanAmount: number; maxAttempts: number;
  carrierByRarity: Record<Rarity, RivalId>; difficulty: Record<Rarity | 'free', DifficultyRow>;
  effects?: Partial<Record<PosterEffectId, Partial<EffectParams>>>;   // Pôster Poker; ausente = DEFAULT_EFFECTS
}
/**
 * `index` começa em 0 (a interface mostra "Nível index+1"). `handsLeft` = mãos deste
 * nível ainda por jogar, contando a atual; 0 no último nível (quando `next` é null).
 */
export interface LevelInfo { index: number; sb: number; bb: number; ante: number; handsLeft: number;
                             next: { sb: number; bb: number; ante: number } | null }

// ---------------------------------------------------------------------------
// Treino (§2.8) — o roteiro é um dado; o motor só executa
// ---------------------------------------------------------------------------

export interface TutorialBeat {
  at: 'handStart' | 'flop' | 'turn' | 'river' | 'showdown' | 'handEnd' | { afterHumanStep: number };
  lineIds: string[];                      // até 3; trocas atômicas permitidas
  highlight?: 'holeCards' | 'board' | 'pot' | 'actions' | 'handName' | 'blinds';
  waitTap?: boolean;                      // exige "Continuar" (conta como toque)
}
export interface HumanStep {
  street: Street;
  allowed: Array<PlayerAction['type']>;   // os outros botões ficam apagados
  suggested: PlayerAction;                // botão com destaque
  hintLineId: string;                     // fala do banco (Raposo) mostrada antes da vez
}
export type ScriptedAction = PlayerAction | { type: 'checkOrFold' };
export interface TutorialHand {
  buttonId: PlayerId;
  preset: { holeCards: Record<PlayerId, [Card, Card]>; board: [Card, Card, Card, Card, Card] };
  bots: Partial<Record<RivalId, ScriptedAction[]>>;  // fila por bot, consumida na ordem em que ele age
  human: HumanStep[];                                // ≤ 6 passos, contando os "Continuar"
  beats: TutorialBeat[];                             // falas e destaques por momento
}
export interface TutorialScript {
  id: string;                                   // 'tutorial-v1'
  stack: number;                                // 2000 para todos, a cada mão
  blinds: BlindLevel;                           // {smallBlind:25, bigBlind:50, ante:0}
  hands: [TutorialHand, TutorialHand, TutorialHand];
}

// ---------------------------------------------------------------------------
// Modelo do Raposo (§3.5) — só ações públicas e cartas abertas
// ---------------------------------------------------------------------------

export interface OppCounters {         // floats com decaimento; n* = oportunidades
  hands: number; vpip: number; pfr: number;
  nCbetFaced: number; foldToCbet: number;
  postBets: number; postCalls: number;
  riverBetsShown: number; riverBluffsShown: number;   // apostas de river vistas no showdown (ou mostradas)
  pfShoves: number;
  raw: { hands: number; cbetFaced: number; riverBetsShown: number };   // contagens sem decaimento (amostra mínima)
}

// ---------------------------------------------------------------------------
// Perfil do bot (§3.2 e §3.3)
//
// O SPEC dá só a tabela; a forma abaixo foi completada no F0 (03/11/2026) para caber
// tudo o que a tabela, o §3.5 (algoritmo) e o §3.6 (tells e tempo) usam.
// `poker_bot_params.params` é um Partial profundo disto, filtrado por mergeProfile/LIMITS.
// Percentuais ("top X%") vão de 0 a 100; frequências e probabilidades, de 0 a 1;
// margens em pontos percentuais (pp) de equidade; tamanhos em fração do pote; abertura em BB.
// ---------------------------------------------------------------------------

export type RangeModel = 'random' | 'static' | 'bayes';
/** Posições em que o bot pode abrir/empurrar (no BB ele só defende). */
export type EntryPos = 'CO' | 'BTN' | 'SB';
/** Grupo da mão no board (§3.5, `bots/buckets.ts`). */
export type HandBucket = 'nuts' | 'strong' | 'medium' | 'weak' | 'draw' | 'air';
/** Situações das tabelas de tell (§3.6). Cada bot usa só as suas. */
export type TellSituation =
  | 'bigBetMonster' | 'bigBetNoMonster' | 'callWeakPair' | 'otherPairPlus' | 'otherNoPair'   // Sapo
  | 'bluffBet' | 'valueBet' | 'passiveDraw'                                                 // Cobra
  | 'riverNuts'                                                                              // Raposo
  | 'rest';
/** Situações das faixas de tempo de pensar (§3.6). */
export type ThinkSituation = 'strong' | 'doubt' | 'bluff' | 'monster' | 'rest';
export interface MinMax { min: number; max: number }

export interface BotProfile {
  id: RivalId;
  rangeModel: RangeModel;
  iters: { flop: number; turn: number; river: number };
  noise: number;                         // σ na equidade
  epsilon: number; epsilonFloor: number; // ε_final = max(epsilon × epsilonMul, epsilonFloor) (§3.4)
  positionUse: number;                   // fora de posição: eq × (1 − 0,05 × positionUse)
  stinginess: number;                    // "dor" do Sapo
  feFixed: number | null;                // null = fold equity vem do modelo (model.fe)
  /** Metas de calibração (VPIP/PFR em %, AF em razão); o sim --strict confere. */
  targets: { vpip: [min: number, max: number]; pfr: [min: number, max: number]; af: [min: number, max: number] };
  preflop: {
    entry: Record<EntryPos, number>;     // top %
    limpShare: number;
    limpOnlySbVsPassiveBB: boolean;      // Raposo: limp só no SB contra BB passivo
    raiseOnlyTopPct: number | null;      // Sapo: só aumenta com o top 4%
    open: number; openOOP: number; iso: number; isoPerExtraLimper: number;   // em BB
    threeBetPct: number; threeBetBluffShare: number;
    foldTo3bet: number; foldTo4bet: number;
    foldBBvsSteal: number;
    callOpenPct: number;                 // top %
  };
  post: {
    cbetHU: number; cbetPairOnly: boolean;
    barrelTurn: number; riverAfterTwo: number;
    checkRaise: number; slowplay: number;
    riverBluffShare: number | 'balanced';   // 'balanced' = s/(1+2s), s = aposta/pote
    scareCardOverbet: number;
    callMarginPP: { pairPlus: number; committed: number; draw: number; air: number };
    raiseValueFreq: number; semibluffFreq: number;
  };
  sizings: {
    flopDry: number; flopWet: number; turn: number;
    riverThin: number; riverPolar: number;  // valor fino / polarizado (Cobra: 1,0–1,5)
    monster: number | null;                 // Sapo: ≥ 1,0 só com monstro; null = tamanho normal
    scareOverbet: number;                   // Cobra: 1,25× pote na carta de susto
  };
  pushFold: {
    maxBB: number;
    shove: Record<EntryPos, [le5: number, from5to8: number, from8to12: number]>;   // top % por faixa de effBB
  };
  /** Diante de all-in (push/fold e "paga all-in com ≥ 10 BB efetivos"). */
  callAllIn: {
    topPct: number | null;                       // Sapo 5, Cobra 22 (× tilt)
    eqVs: 'random' | 'aggressorRange' | null;    // também paga se eq ≥ odds + eqMarginPP
    eqMarginPP: number;
    icm3PP: number;                              // Raposo: +4 pp com 3 vivos
  };
  /** Leitura do oponente (só o Raposo liga; o simulador desliga para medir o ganho). */
  model: { enabled: boolean; fe: MinMax; cbet: MinMax; callMarginPP: number; foldBBvsSteal: number };
  tilt: {
    kind: TiltKind;
    hands: number;
    trigger: { lostPotBB: number | null; lostStackShare: number | null; ownBluffExposed: boolean; bluffedByShown: boolean };
    effect: { vpipDelta: number; pfrDelta: number; bluffPP: number; allInCallMul: number;
              callMarginPP: number; targeted: boolean };   // targeted = só contra quem causou (Orgulho)
  };
  showPolicy: { bluffWin: number; strongFoldRiver: number };
  bounty: {
    carrier: { vpipDelta: number; allInMarginPP: number; tiltLostStackShare: number | null };
    hunterMarginPP: number;                      // todos, contra o portador
  };
  tells: Partial<Record<TellSituation, Record<Cue, number>>>;
  think: { fidelity: number; ranges: Partial<Record<ThinkSituation, MinMax>>; tankChance: number; tank: MinMax };
}

// ---------------------------------------------------------------------------
// O que o bot vê (§3.1)
// ---------------------------------------------------------------------------

export interface BotView {
  selfId: RivalId; seat: number; hole: [Card, Card];
  street: Street; board: Card[]; pot: number; toCall: number; stack: number; streetBet: number;
  legal: LegalActions;
  players: { id: PlayerId; seat: number; stack: number; status: PlayerStatus; streetBet: number;
             totalBet: number; hasCards: boolean }[];
  buttonId: PlayerId; sbId: PlayerId; bbId: PlayerId; blinds: BlindLevel; handNumber: number;
  actions: ActionRecord[];                       // ações públicas desta mão
  // Só cartas abertas. Pacote E (03/11/2026): 1 OU 2 cartas por jogador (1 = carta virada
  // pelo efeito reveal_one do Pôster Poker); quem precisa da mão inteira confere o tamanho.
  shownThisHand: Record<string, Card[]>;
  match: { holderId: PlayerId | null; captured: boolean; alive: number; levelIndex: number; handsToNextLevel: number };
  extraCards?: Card[];                           // pacote E: cartas a mais no baralho (Cassino: 8 ases; público)
}

// ---------------------------------------------------------------------------
// Partida (§4.3)
// ---------------------------------------------------------------------------

export interface MatchConfig {
  mode: MatchMode; seed: string; settings: PokerSettings;
  seats: Record<PlayerId, number>;                 // {human:0,bogart:1,fincher:2,cypher:3}
  profiles: Record<RivalId, BotProfile>;           // já mesclados
  paramsVersion: Record<RivalId, number>;
  difficulty: DifficultyRow; loan: number;         // 0 | 500
  prize: { prizeId: string; carrierId: RivalId; rarity: Rarity } | null;
  memory: Record<PlayerId, OppCounters> | null;    // memória do Raposo (30%)
  tutorial?: TutorialScript;
  tournament?: TournamentConfig | null;            // Pôster Poker: torneio da semana (com prize = null)
  // Pacote E3 (03/11/2026). `people`: lugares controlados por pessoas (ausente = ['human'], os
  // modos de uma pessoa). `effects`: pôsteres de efeito da mesa de amigos (até 8; repetidos
  // acumulam, regras em config.ts stackedParams). `reclaim`: casual de devolução (o oráculo
  // portador de `prize` carrega um pôster que a pessoa perdeu).
  people?: PlayerId[];
  effects?: PosterEffectId[];
  reclaim?: boolean;
}
export interface BotMemory {
  committed: boolean; facedFirstBet: boolean;      // reset a cada mão (Sapo)
  tilt: { kind: TiltKind; handsLeft: number; targetId?: PlayerId } | null;
  model?: Record<PlayerId, OppCounters>;           // só o Raposo
  labelsAnnounced: StyleLabel[];
  labelsBy?: Record<PlayerId, StyleLabel[]>;       // pacote E3: leituras já anunciadas por pessoa (mesa de amigos)
}
export interface HumanTally {                       // atualizado ao fim de cada mão, com informação privada
  hands: number; vpip: number; pfr: number; aggrBets: number; aggrCalls: number;
  cbetOpp: number; cbet: number; foldToCbetOpp: number; foldToCbet: number;
  showdowns: number; showdownsWon: number; handsWon: number;
  allinCount: number; allinWon: number; allinExpectedMilli: number;   // Índice de sorte
  bluffsWorked: number; oscarBluff: boolean; badBeatsSuffered: number; badBeatsDealt: number;
  biggestPot: number; bestHand: { cards: Card[]; kind: HandKind; score: number } | null;
  minStackBB: number; eliminations: { victimId: PlayerId; byId: PlayerId | null; hand: number }[];
}
export interface MatchState {
  v: 1; config: MatchConfig; game: GameState;      // game.config.historyLimit = 3
  levelIndex: number; eventNo: number; actionNo: number;
  holderId: PlayerId | null; capturedHand: number | null;
  places: Partial<Record<PlayerId, number>>; eliminatedBy: Partial<Record<PlayerId, PlayerId | null>>;
  bots: Record<RivalId, BotMemory>; tally: HumanTally;
  lastUncontested: { hand: number; playerId: PlayerId; shown: boolean } | null;
  status: 'running' | 'humanOut' | 'finished';
  tutorialHand?: number;
}
export interface BotDecision { action: PlayerAction; thinkMs: number; cue: Cue }

// ---------------------------------------------------------------------------
// Eventos públicos (§4.5)
// ---------------------------------------------------------------------------

export interface HandFlags {                         // derivados SÓ de dados públicos (cartas abertas)
  bigPot?: true;                                    // ≥ 20 BB
  badBeat?: { victimId: PlayerId; winnerId: PlayerId; victimOdds: number };  // ≥ 0,75 no último all-in, com cartas abertas
  bluffShown?: { playerId: PlayerId };              // último agressor mostrou "ar"
  bluffCaught?: { blufferId: PlayerId; catcherId: PlayerId };
  valueShown?: { playerId: PlayerId };              // venceu o showdown com trinca+ sem apostar antes do river
  heroFold?: { playerId: PlayerId };                // largou e mostrou mão forte
}

export type PublicEvent = { i: number } & (           // i = eventNo, crescente na partida (dedupe na retomada)
  | { t: 'matchStarted'; mode: MatchMode; seats: { id: PlayerId; seat: number; stack: number }[];
      loan: number; prize: { prizeId: string; holderId: PlayerId } | null; level: LevelInfo; seedHash?: string;
      tournament?: TournamentConfig | null;
      // pacote E3: mesa de amigos (quem é pessoa e os efeitos na mesa) e casual de devolução
      people?: PlayerId[]; effects?: { effect: PosterEffectId; level: number }[]; reclaim?: true }
  | { t: 'levelUp'; level: LevelInfo; handNumber: number }
  | { t: 'handStarted'; handNumber: number; buttonId: PlayerId; sbId: PlayerId; bbId: PlayerId;
      level: LevelInfo; stacks: Record<PlayerId, number> }
  | { t: 'blindsPosted'; antes: { playerId: PlayerId; amount: number }[]; sb: { playerId: PlayerId; amount: number };
      bb: { playerId: PlayerId; amount: number }; potAfter: number; allInIds: PlayerId[] }
  | { t: 'holeCards'; cards: [Card, Card] }                                    // só as da pessoa
  | { t: 'action'; playerId: PlayerId; street: Street; action: RecordedActionType; amount: number; to: number;
      toCall: number; potAfter: number; allIn: boolean; shortAllIn: boolean; stackBefore: number;
      sizeClass: SizeClass | null; thinkMs?: number; cue?: Cue             // thinkMs e cue só em ação de bot
      auto?: AutoActionKind }                                              // pacote E3: o servidor agiu pela pessoa
  | { t: 'uncalledReturned'; playerId: PlayerId; amount: number }
  | { t: 'runout'; hands: { playerId: PlayerId; cards: Card[] }[] }
  // `early`: o flop do Golpe de Mestre, aberto antes das apostas do pré-flop (depois, a mão
  // segue direto para o turn). No Onze Homens, o river pode trazer 2 cartas (board com 6).
  | { t: 'street'; street: BoardStreet; cards: Card[]; board: Card[]; early?: boolean }
  | { t: 'showdown'; hands: { playerId: PlayerId; cards: Card[]; kind: HandKind; best5: Card[]; royal: boolean }[] }  // sem score
  | { t: 'cardsShown'; playerId: PlayerId; cards: [Card, Card]; afterFold: boolean }
  | { t: 'potAwarded'; potIndex: number; amount: number; eligibleIds: PlayerId[];
      winners: { playerId: PlayerId; amount: number }[]; uncontested: boolean; kind: HandKind | null }
  | { t: 'handComplete'; handNumber: number; net: Record<PlayerId, number>; winnerIds: PlayerId[];
      wentToShowdown: boolean; potBB: number; flags: HandFlags }
  | { t: 'eliminated'; playerId: PlayerId; place: number; byId: PlayerId | null; handNumber: number;
      stackLeft?: number }   // pacote E3: quem saiu da mesa de amigos (as fichas que saíram com a pessoa)
  | { t: 'prizeMoved'; fromId: PlayerId; toId: PlayerId; handNumber: number }
  | { t: 'prizeCaptured'; handNumber: number; prizeId: string }
  | { t: 'tilt'; playerId: RivalId; kind: TiltKind; on: boolean; targetId?: PlayerId }
  | { t: 'styleRead'; by: RivalId; targetId: PlayerId; label: StyleLabel }   // E3: PlayerId (uma leitura por pessoa)
  | { t: 'headsUp'; ids: [PlayerId, PlayerId]; handNumber: number }
  // Pacote E3 (03/11/2026), mesa de amigos: relógio estourado (logo antes da ação automática;
  // `streak` = estouros seguidos), ausente (3 seguidos) / voltou, e quem saiu no meio (o
  // `eliminated` dela vem no fim da mão, ou na hora se não estava na mão).
  | { t: 'clockOut'; playerId: PlayerId; handNumber: number; streak: number }
  | { t: 'away'; playerId: PlayerId; on: boolean; handNumber: number }
  | { t: 'personLeft'; playerId: PlayerId; reason: 'forfeit' | 'abandoned'; handNumber: number }
  // Pôster Poker. `effectCast`: o pôster mágico lança o efeito (no começo da mão, antes de
  // dar as cartas; o eight_aces sai logo depois do matchStarted). `effectReveal`: cartas
  // fechadas que o efeito abre para todos (reveal_one: 1 por jogador; blackjack: as 2 de
  // quem recebeu cartas). `effectBonus`: fichas que a casa paga (entram no cacife na hora).
  // `tellMark`: o tique de um oráculo numa aposta ou aumento, nas mãos do efeito tell.
  | { t: 'effectCast'; effect: PosterEffectId; handNumber: number; castNo: number; data: EffectCastData }
  // Pacote E (03/11/2026): hand_bounty e opal também viram cartas, para provar quem ganhou o
  // bônus sem showdown (hand_bounty: as 2 do vencedor; opal: só a opala).
  | { t: 'effectReveal'; effect: 'reveal_one' | 'blackjack' | 'hand_bounty' | 'opal'; handNumber: number;
      cards: { playerId: PlayerId; cards: Card[] }[] }
  | { t: 'effectBonus'; effect: PosterEffectId; handNumber: number; playerId: PlayerId; amount: number }
  | { t: 'tellMark'; handNumber: number; playerId: RivalId; mark: 'blefe' | 'valor' }
  | { t: 'matchEnded'; places: Record<PlayerId, number>; winnerId: PlayerId | null; humanPlace: number;
      reason: 'won' | 'eliminated' | 'forfeit' | 'abandoned'; prizeCaptured: boolean; seed?: string;  // seed só no prêmio, revelada no fim
      people?: Record<PlayerId, { place: number; reason: EndReasonPublic }> }   // E3: mesa de amigos
);

// ---------------------------------------------------------------------------
// Eventos privados da partida (§4.4: "MatchEvent = PokerEvent | eventos de partida")
//
// Completado no F0 (03/11/2026). Saem de match.ts SEMPRE privados; só toPublicEvents
// os transforma em PublicEvent. Usam `type` (como o motor) para não confundir com o
// `t` dos públicos. Cada um leva `i` (= eventNo) porque toPublicEvents não recebe o
// estado e o `i` público precisa crescer na partida inteira.
// ---------------------------------------------------------------------------

export type MatchOnlyEvent =
  | { type: 'matchStarted'; mode: MatchMode; seats: { id: PlayerId; seat: number; stack: number }[];
      loan: number; prize: { prizeId: string; holderId: PlayerId } | null; level: LevelInfo; seedHash?: string;
      tournament?: TournamentConfig | null;
      people?: PlayerId[]; effects?: { effect: PosterEffectId; level: number }[]; reclaim?: true }
  | { type: 'levelUp'; level: LevelInfo; handNumber: number }
  // Vem logo antes do `actionTaken` do motor e o completa. `bucket` e `monster` são
  // privados (só para os testes do Diretor, §6.6); toPublicEvents copia só thinkMs e cue.
  | { type: 'actionMeta'; playerId: PlayerId; handNumber: number; stackBefore: number; sizeClass: SizeClass | null;
      bot?: { thinkMs: number; cue: Cue; bucket: HandBucket | null; monster: boolean }; auto?: AutoActionKind }
  | { type: 'cardsShown'; playerId: PlayerId; cards: [Card, Card]; afterFold: boolean }
  // Na saída pública substitui o `handComplete` do motor (que traz scores e as mãos inteiras).
  | { type: 'handSummary'; handNumber: number; net: Record<PlayerId, number>; winnerIds: PlayerId[];
      wentToShowdown: boolean; potBB: number; flags: HandFlags }
  // Na saída pública substitui o `playerEliminated` do motor (acrescenta quem eliminou).
  | { type: 'eliminated'; playerId: PlayerId; place: number; byId: PlayerId | null; handNumber: number; stackLeft?: number }
  | { type: 'prizeMoved'; fromId: PlayerId; toId: PlayerId; handNumber: number }
  | { type: 'prizeCaptured'; handNumber: number; prizeId: string }
  | { type: 'tilt'; playerId: RivalId; kind: TiltKind; on: boolean; targetId?: PlayerId }
  | { type: 'styleRead'; by: RivalId; targetId: PlayerId; label: StyleLabel }
  | { type: 'headsUp'; ids: [PlayerId, PlayerId]; handNumber: number }
  | { type: 'clockOut'; playerId: PlayerId; handNumber: number; streak: number }
  | { type: 'away'; playerId: PlayerId; on: boolean; handNumber: number }
  | { type: 'personLeft'; playerId: PlayerId; reason: 'forfeit' | 'abandoned'; handNumber: number }
  // Pôster Poker (pacote E, 03/11/2026): os mesmos campos dos públicos.
  | { type: 'effectCast'; effect: PosterEffectId; handNumber: number; castNo: number; data: EffectCastData }
  | { type: 'effectReveal'; effect: 'reveal_one' | 'blackjack' | 'hand_bounty' | 'opal'; handNumber: number;
      cards: { playerId: PlayerId; cards: Card[] }[] }
  | { type: 'effectBonus'; effect: PosterEffectId; handNumber: number; playerId: PlayerId; amount: number }
  | { type: 'tellMark'; handNumber: number; playerId: RivalId; mark: 'blefe' | 'valor' }
  | { type: 'matchEnded'; places: Record<PlayerId, number>; winnerId: PlayerId | null; humanPlace: number;
      reason: 'won' | 'eliminated' | 'forfeit' | 'abandoned'; prizeCaptured: boolean; seed?: string;
      people?: Record<PlayerId, { place: number; reason: EndReasonPublic }> };

export type MatchEvent = { i: number } & (PokerEvent | MatchOnlyEvent);

// ---------------------------------------------------------------------------
// Saídas da camada de partida (§4.4)
// ---------------------------------------------------------------------------

export interface MatchStep { state: MatchState; events: MatchEvent[] }   // MatchEvent = PokerEvent | eventos de partida

/** Retorno de outcomeOf (§4.4), com nome para o pacote C reaproveitar. */
export interface MatchOutcome {
  captured?: { hand: number; prizeId: string };
  finished?: { status: 'won' | 'lost' | 'forfeit' | 'abandoned'; place: number };
}

export interface TableView {
  mode: MatchMode; handNumber: number; level: LevelInfo; status: MatchState['status'];
  seats: { id: PlayerId; seat: number; stack: number; streetBet: number; status: PlayerStatus;
           holeCards: Card[]; hasHiddenCards: boolean; isButton: boolean; isSB: boolean; isBB: boolean;
           tilt: TiltKind | null; place: number | null }[];
  board: Card[]; pots: { amount: number; eligibleIds: PlayerId[] }[]; potTotal: number;
  toActId: PlayerId | null; legal: LegalActions | null;          // legal só quando é a vez da pessoa
  prize: { prizeId: string; holderId: PlayerId | null; captured: boolean } | null;
  loan: number; places: Partial<Record<PlayerId, number>>;
  // Pôster Poker: o torneio e os efeitos em vigor (para a retomada redesenhar a mesa).
  tournament?: { prizeId: string; rarity: Rarity; effect: PosterEffectId; cobraItem: boolean;
                 casts: number; active: EffectCastData | null; revealed: { playerId: PlayerId; cards: Card[] }[] } | null;
  // Pacote E3 (03/11/2026), só na mesa de amigos: a situação de cada pessoa e os efeitos em vigor
  // (`level` = pôsteres iguais; `casts` = lançadas até agora; `revealed` = cartas viradas nesta mão).
  people?: Record<PlayerId, { status: PersonStatus; away: boolean; streak: number; place: number | null }>;
  effects?: { list: { effect: PosterEffectId; level: number; casts: number; active: EffectCastData | null }[];
              revealed: { playerId: PlayerId; cards: Card[] }[] } | null;
}
export interface MatchSummary {
  v: 1; clientId: string; mode: 'free' | 'bounty' | 'friends'; startedAt: string; endedAt: string; durationS: number;
  hands: number; place: 1 | 2 | 3 | 4; winnerId: PlayerId | null;
  reason: 'won' | 'eliminated' | 'forfeit' | 'abandoned'; loan: boolean;
  human: Omit<HumanTally, 'eliminations' | 'oscarBluff'>; eliminations: HumanTally['eliminations'];
  comeback: boolean;                                   // venceu depois de ficar com < 5 BB
  marks: { firstWinCandidate: boolean; foxHunter: boolean; cleanSweep: boolean; oscarBluff: boolean };
  prize: { prizeId: string; capturedHand: number | null } | null;
  engineHash: string; paramsVersion: Record<RivalId, number>;
  tournament?: { prizeId: string; effect: PosterEffectId; won: boolean; casts: number; bonusWon: number } | null;
  // Pacote E3: resumo de UMA pessoa da mesa de amigos (`summarizeMatch(s, meta, id)`).
  friends?: { playerId: PlayerId; people: number; effects: PosterEffectId[]; winnerIsPerson: boolean;
              bonusWon: number; status: PersonStatus } | null;
  reclaim?: boolean;   // casual de devolução
}
