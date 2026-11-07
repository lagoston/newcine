// Contrato JSON das RPCs da Mesa dos Oráculos (SPEC §5.10), copiado
// LITERALMENTE do SPEC em 05/11/2026. É a interface entre o WP-DB (as funções
// mesa_* no Postgres) e as telas (Mesa e Acervo): qualquer mudança aqui passa
// pelo arquiteto, porque o banco devolve exatamente estes formatos.

export type OracleSlot = 'bogart' | 'fincher' | 'cypher';
export type Seat = OracleSlot | 'espelho';
export type MediaFilter = 'all' | 'movie' | 'tv';
export type CardKind = 'main' | 'recon' | 'espelho4' | 'reveal';
export type CardState = 'down' | 'up' | 'want' | 'seen' | 'refused' | 'not_seen';
export type PredLabel = 'number' | 'guess' | 'hidden';
export type VerdictCategory = 'exact' | 'near' | 'over' | 'under' | 'ten';
export type ReasonType =
  | 'anchor_director' | 'anchor_kw' | 'watchlist' | 'friend' | 'mood_affinity'
  | 'cypher_mood' | 'cypher_country' | 'cypher_decade' | 'hidden'
  | 'occasion_runtime' | 'occasion_episode' | 'occasion_binge' | 'occasion_comment' | 'occasion_tone'
  | 'mood_ask' | 'recognition' | 'espelho_best' | 'reveal' | 'house';

export interface AskRef { key: string; kind: 'occasion' | 'mood' | 'season'; id: string; media: 'movie' | 'tv' | null }
export interface TitleLite {
  tmdb_id: number; media_type: 'movie' | 'tv';
  title_pt: string | null; title_en: string | null; year: number | null;
  runtime: number | null; ep_runtime: number | null; seasons: number | null;
  poster_path: string | null; poster_path_pt: string | null; backdrop_path: string | null;
  oracle: OracleSlot; mood: string; countries: string[]; director: string | null; vote_count: number;
}
export interface Reason { type: ReasonType; facts: Record<string, string | number | boolean | null | string[]> }
export interface CardLineFacts {
  bw: boolean; long: boolean; series: boolean; hidden: boolean; bomb: boolean; public: number | null;
  p10hi: boolean; anime: boolean; br: boolean; sequel: boolean; huge: boolean;
  newmood: boolean; newcountry: boolean; decade: string | null; ressalva: boolean; watchlist: boolean;
}
export interface MesaCard {
  id: string; seat: Seat; kind: CardKind; gen: number; state: CardState;
  sealed: boolean;            // true só na Cypher principal, enquanto Bogart/Fincher estão 'down'
  second_opinion: boolean;    // esta carta é a 2ª opinião do assento
  title: TitleLite;
  pred: { value: number | null; label: PredLabel };   // value null quando label = 'hidden'
  comment: { pt: string | null; en: string | null; ressalva: boolean };
  reason: Reason; evidence: Reason[];
  my: { rating: number | null; in_watchlist: boolean };
  line_facts: CardLineFacts;
}
export interface PassedSeat { seat: OracleSlot; reason: 'refused' | 'empty' | 'colo' }
export interface Verdict {
  card_id: string; oracle: OracleSlot; title_pt: string | null; title_en: string | null;
  rating: number; category: VerdictCategory; shown_day: string; ask: string | null;
}
export interface MesaFacts {
  weekday: number;                 // 0 = domingo (Brasília)
  first_visit: boolean; returning_days: number | null;
  yesterday: { flipped: number; unflipped: number; cypher_closed: boolean } | null;
  mood_rising: string | null; weak_mood: string | null;
  code_changed: boolean; verdicts_pending: number;
  espelho4: boolean; reveal: boolean; live_event: 'halloween' | 'christmas' | null;
}
export interface MesaMe {
  rated: number; rated_movies: number; pred_label: PredLabel;
  persona: { code: string; title_pt: string; title_en: string; character_pt: string; character_en: string; film_tmdb: number | null } | null;
  persona_progress: { counted: number; threshold: 10; moods_used: number };
  top_moods: string[]; card_style: 'default' | 'yugioh' | 'horror';
}
export interface AskMenu {
  occasions: { id: string; grp: 'who' | 'time' | 'feel'; sort: number; media: 'movie' | 'tv' | null; available: boolean }[];
  moods: string[];                              // as 9 chaves, na ordem de MOODS
  season: { id: 'halloween' | 'christmas' } | null;
}
export interface MesaPayload {
  v: 1; day: string; draw_id: string; seed: number;
  ask: AskRef | null; media: MediaFilter; mode: 'normal' | 'recon'; host: OracleSlot | null;
  me: MesaMe; cards: MesaCard[]; passed: PassedSeat[];
  facts: MesaFacts; verdicts: Verdict[]; asks: AskMenu;
  book: { pages: number; who_knows_best: OracleSlot | null };
}
export interface ReactResult {
  ok: boolean; error?: 'not_found' | 'expired' | 'sealed' | 'not_rated' | 'not_in_list' | 'bad_action' | 'bad_state';
  card?: MesaCard; replacement?: MesaCard | null; pass?: PassedSeat | null;
  verdict?: { category: VerdictCategory; rating: number } | null;
  persona?: MesaMe['persona']; me?: Pick<MesaMe, 'rated' | 'pred_label' | 'persona_progress'>;
}
export interface BookEntry {
  card_id: string; seat: Seat; oracle: OracleSlot; kind: CardKind; ask: string | null;
  title: Pick<TitleLite, 'tmdb_id' | 'media_type' | 'title_pt' | 'title_en' | 'year' | 'poster_path' | 'poster_path_pt'>;
  comment: { pt: string | null; en: string | null };
  state: Exclude<CardState, 'down'>; rating: number | null; verdict: VerdictCategory | null;
}
export interface BookPage { who_knows_best: OracleSlot | null; days: { day: string; entries: BookEntry[] }[]; next_before: string | null }
export interface AcervoItem {
  tmdb_id: number; media_type: 'movie' | 'tv'; title_pt: string | null; title_en: string | null; year: number | null;
  poster_path: string | null; poster_path_pt: string | null; pred: number | null; in_watchlist: boolean;
}
export interface AcervoPage {
  oracle: OracleSlot; mood: string; media: 'movie' | 'tv';
  total: number; unrated_total: number; offset: number; next_offset: number | null;
  pred_label: PredLabel; items: AcervoItem[];
}

// ---- Acréscimos do contrato ao vivo (WP-DB, 05/11/2026) ---------------------
// Fora do bloco literal do §5.10, para ele continuar igual ao SPEC. São os
// nomes que o banco publicou de verdade.

// Os fatos das razões de âncora (anchor_director, anchor_kw). O id do
// título-âncora deixa a miniatura do porquê abrir a ficha dele.
export interface AnchorFacts {
  anchor_title_pt: string | null;
  anchor_title_en: string | null;
  anchor_poster: string | null;
  anchor_rating: number;
  anchor_tmdb_id?: number | null;
  anchor_media_type?: 'movie' | 'tv' | null;
  director?: string | null;
  themes_pt?: string[];
  themes_en?: string[];
}

// Erros de regra que mesa_get devolve no JSON ({"error": ...}); api.ts vira
// MesaError e a Mesa mostra o estado de erro com "Tentar de novo".
export type MesaGetError = 'bad_ask' | 'bad_media' | 'bot';
// mesa_acervo: 'bad_args'. mesa_refresh: {"ok":true,"fresh":false} se chamado
// de novo em menos de 60 s (a Mesa não espera o resultado).
// ReactResult: o banco sempre manda replacement, pass e verdict (null quando
// não se aplica). not_seen só vale em carta de reconhecimento ou da revelação.
