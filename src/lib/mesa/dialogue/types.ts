/**
 * Tipos do Diretor de falas da Mesa dos Oráculos (SPEC §3.8). Porte da forma de
 * `src/lib/poker/dialogue/types.ts`, sem nada de pôquer (05/11/2026).
 *
 * Por que há aqui um "recorte" do payload (DialoguePayload) em vez de importar o
 * `MesaPayload` de `src/lib/mesa/types.ts`: aquele arquivo é do WP-UI-MESA e ainda
 * não existia quando este pacote começou. O recorte tem só os campos que o Diretor
 * lê, com os mesmos nomes e tipos do §5.10, então qualquer `MesaPayload` serve onde
 * se pede um `DialoguePayload` (tipagem estrutural). Se o contrato mudar, o `tsc`
 * acusa na chamada do WP-UI-MESA, que é o que queremos (05/11/2026).
 */

/** Quem fala. O Espelho é a quarta voz: fala só da pessoa, sem balão. */
export type Speaker = 'bogart' | 'fincher' | 'cypher' | 'espelho';
export type OracleId = 'bogart' | 'fincher' | 'cypher';
export type Lang = 'pt' | 'en';

/** Categoria do veredito (SPEC §5.2 `mesa_category`). */
export type VerdictCategory = 'exact' | 'near' | 'over' | 'under' | 'ten';

/**
 * Os tempos (gatilhos) de fala. `ask` é o anfitrião de uma pergunta: a ocasião vai
 * na condição (`ask:chuva`, `ask:halloween`, `mood_ask`), e não no nome do tempo,
 * para o baralho ficar finito (05/11/2026).
 */
export type Beat =
  | 'mirror' | 'mirrorClose' | 'open' | 'ask' | 'recon' | 'seal' | 'sealOpen'
  | 'verdict' | 'verdictLater' | 'want' | 'refuse' | 'pass' | 'replace' | 'notSeen' | 'system';

export const BEATS: readonly Beat[] = [
  'mirror', 'mirrorClose', 'open', 'ask', 'recon', 'seal', 'sealOpen',
  'verdict', 'verdictLater', 'want', 'refuse', 'pass', 'replace', 'notSeen', 'system',
];

export interface MesaLine {
  id: string;
  who: Speaker;
  beat: Beat;
  /** Todas precisam valer nos fatos; "!x" = x não pode valer. */
  cond?: string[];
  priority: 1 | 2 | 3;
  /** `week`: no máximo uma vez a cada 7 dias; `life`: uma vez na vida (no aparelho). */
  once?: 'week' | 'life';
  weight?: number;
  pt: string;
}

/** Troca atômica (2 ou 3 balões): começa ou não; se começa, vai até o fim. */
export interface MesaExchange {
  id: string;
  beat: 'banter';
  /** A situação da mesa (ex.: `fincher_bw`), mais condições extras opcionais. */
  cond: string[];
  priority: 1 | 2 | 3;
  once?: 'week' | 'life';
  weight?: number;
  parts: { who: OracleId; pt: string }[];
}

/** Inglês por id: texto da fala, ou um texto por balão nas trocas. */
export type EnglishBank = Record<string, string | string[]>;

export interface DialogueBank {
  lines: MesaLine[];
  exchanges: MesaExchange[];
  en: EnglishBank;
}

/** O que o Diretor devolve para a faixa (ou para a frase do Espelho). */
export interface Spoken {
  id: string;
  who: Speaker;
  text: string;
  ms: number;
  exchange?: { id: string; part: number; of: number };
}

/**
 * Memória local (`mesa.dialogue.v1`). O dia é o `day` do payload (dia de Brasília),
 * e não o relógio: assim, recarregar no mesmo dia repete as mesmas falas.
 */
export interface DialogueMemory {
  v: 1;
  lru: [id: string, day: string][];                  // mais recente no fim; até 300
  /** Falas `once` já tocadas, com a tiragem: só a MESMA tiragem (recarregar) pode repetir no dia. */
  once: [id: string, day: string, draw: string][];
}

export interface DialogueStorage {
  load(): DialogueMemory;
  save(m: DialogueMemory): void;
}

// ---------------------------------------------------------------------------
// Recorte do payload (§5.10) que o Diretor lê
// ---------------------------------------------------------------------------

export type DialogueSeat = OracleId | 'espelho';
export type DialoguePredLabel = 'number' | 'guess' | 'hidden';

export interface DialogueTitle {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title_pt: string | null;
  title_en: string | null;
  year: number | null;
  runtime: number | null;
  ep_runtime: number | null;
  seasons: number | null;
  oracle: OracleId;
  mood: string;
  countries: string[];
  director: string | null;
  vote_count: number;
}

export interface DialogueLineFacts {
  bw: boolean; long: boolean; series: boolean; hidden: boolean; bomb: boolean; public: number | null;
  p10hi: boolean; anime: boolean; br: boolean; sequel: boolean; huge: boolean;
  newmood: boolean; newcountry: boolean; decade: string | null; ressalva: boolean; watchlist: boolean;
}

export interface DialogueCard {
  id: string;
  seat: DialogueSeat;
  kind: 'main' | 'recon' | 'espelho4' | 'reveal';
  state: 'down' | 'up' | 'want' | 'seen' | 'refused' | 'not_seen';
  sealed: boolean;
  second_opinion: boolean;
  title: DialogueTitle;
  pred: { value: number | null; label: DialoguePredLabel };
  line_facts: DialogueLineFacts;
}

export interface DialogueVerdict {
  card_id: string;
  oracle: OracleId;
  title_pt: string | null;
  title_en: string | null;
  rating: number;
  category: VerdictCategory;
  shown_day: string;
  ask: string | null;
}

export interface DialoguePayload {
  day: string;
  draw_id: string;
  seed: number;
  ask: { key: string; kind: 'occasion' | 'mood' | 'season'; id: string; media: 'movie' | 'tv' | null } | null;
  mode: 'normal' | 'recon';
  host: OracleId | null;
  me: {
    rated: number;
    pred_label: DialoguePredLabel;
    persona: { code: string; character_pt: string; character_en: string } | null;
    persona_progress: { counted: number; threshold: number; moods_used: number };
    top_moods: string[];
  };
  cards: DialogueCard[];
  passed: { seat: OracleId; reason: 'refused' | 'empty' | 'colo' }[];
  facts: {
    weekday: number;
    first_visit: boolean;
    returning_days: number | null;
    yesterday: { flipped: number; unflipped: number; cypher_closed: boolean } | null;
    mood_rising: string | null;
    weak_mood: string | null;
    code_changed: boolean;
    verdicts_pending: number;
    espelho4: boolean;
    reveal: boolean;
    live_event: 'halloween' | 'christmas' | null;
  };
  verdicts: DialogueVerdict[];
}

/** Contexto de cada chamada (SPEC §3.8). */
export interface DirectorCtx {
  lang: Lang;
  /** O JSON do `mesa_get` (qualquer `MesaPayload` serve). */
  payload: DialoguePayload;
  /** Relógio do aparelho. `weekday`: 0 = domingo. */
  hour: number;
  weekday: number;
  /**
   * Opcional (acréscimo do WP-FALAS): a revelação que acabou de acontecer na Mesa
   * (§2.11). 'new' faz o Espelho dizer `persona_new`; 'changed', `code_changed`.
   * O Diretor não tem como saber isso só pelo payload.
   */
  reveal?: 'new' | 'changed' | null;
}

export type ReactionKind = 'want' | 'refuse' | 'pass' | 'replace' | 'notSeen' | 'verdict';
export type PassReason = 'refused' | 'empty' | 'colo';
export type SystemKind = 'error' | 'empty_all' | 'offline' | 'midnight';

export interface MesaDirector {
  /** Frase do alto ao abrir. Sempre devolve algo (há falas sem condição de reserva). */
  mirror(ctx: DirectorCtx): Spoken;
  /** Depois das três viradas (ou das não passadas). */
  mirrorClose(ctx: DirectorCtx): Spoken | null;
  /** Até 2 balões: a reação de ontem (verdictLater, ≤ 1) e o anfitrião (open/ask/recon). */
  opening(ctx: DirectorCtx): Spoken[];
  /** Toque na carta selada antes da hora (1 por tiragem). */
  seal(ctx: DirectorCtx): Spoken | null;
  sealOpen(ctx: DirectorCtx): Spoken | null;
  /** A troca depois das três viradas: 0 a 3 balões (40% dos dias, nenhuma, pela semente). */
  allFlipped(ctx: DirectorCtx): Spoken[];
  /**
   * `extra.cardId` (acréscimo do WP-FALAS, opcional): a carta avaliada. No veredito,
   * passe o id da carta que recebeu a nota; assim a fala ao vivo é a mesma do Livro
   * (`verdictLineFor`) mesmo que o payload já traga a substituta no assento.
   */
  reaction(ctx: DirectorCtx, slot: DialogueSeat, kind: ReactionKind,
           extra?: { category?: VerdictCategory; rating?: number; passReason?: PassReason; cardId?: string }): Spoken | null;
  /** A fala de reação do Livro: determinística por `cardId` (a mesma que tocou na hora). */
  verdictLineFor(cardId: string, oracle: Speaker, category: VerdictCategory, lang: Lang,
                 facts: { rating: number; title?: string; weekday?: number; nopred?: boolean }): string;
  system(kind: SystemKind, lang: Lang): Spoken;
}
