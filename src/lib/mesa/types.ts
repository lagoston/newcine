// Contrato JSON do Acervo dos oráculos (a Mesa dos Oráculos), 09/11/2026.
//
// Até 06/11 este arquivo trazia o contrato inteiro da Mesa (tiragem de três
// cartas, reações, Livro, vereditos). O Bruno testou e pediu (09/11): as cartas
// saem, o Acervo vira a página única da Mesa, com as ocasiões e o porquê de
// cada título. Ficou só o que o Acervo usa — a RPC `mesa_acervo2`
// (supabase/migrations/20261109100000_mesa_acervo_v2.sql) devolve exatamente
// estes formatos.

export type OracleSlot = 'bogart' | 'fincher' | 'cypher';
export type AcervoMedia = 'movie' | 'tv';

// Rótulo da nota prevista, pela quantidade de notas da pessoa: número com 10
// ou mais, "palpite" de 3 a 9, "?" abaixo de 3 (a nota vem null).
export type PredLabel = 'number' | 'guess' | 'hidden';

// Os tipos de porquê que mesa_reasons monta (a mesma lógica das cartas da
// Mesa, que o Bruno aprovou). O Acervo mostra no máximo uma linha por título.
export type ReasonType =
  | 'anchor_director' | 'anchor_kw' | 'watchlist' | 'friend' | 'mood_affinity'
  | 'cypher_mood' | 'cypher_country' | 'cypher_decade' | 'hidden' | 'house';

export interface Reason {
  type: ReasonType | string;
  facts: Record<string, string | number | boolean | null | string[] | undefined>;
}

// Os fatos das razões de âncora (anchor_director, anchor_kw): o título que a
// pessoa avaliou e que liga ao título da grade.
export interface AnchorFacts {
  anchor_title_pt: string | null;
  anchor_title_en: string | null;
  anchor_poster: string | null;
  anchor_rating: number;
  anchor_tmdb_id?: number | null;
  anchor_media_type?: AcervoMedia | null;
  director?: string | null;
  themes_pt?: string[];
  themes_en?: string[];
}

export interface AcervoItem {
  tmdb_id: number;
  media_type: AcervoMedia;
  title_pt: string | null;
  title_en: string | null;
  year: number | null;
  poster_path: string | null;
  poster_path_pt: string | null;
  // Nota prevista (null quando pred_label = 'hidden').
  pred: number | null;
  in_watchlist: boolean;
  // O porquê principal e até duas provas, na ordem do oráculo.
  reasons: Reason[];
}

// Uma ficha de ocasião. `id` é o do site ('galera', 'christmas'); `media`
// fixa o tipo ("Só um episódio" é série); `pass` diz quais oráculos passam a
// vez nela (a Cypher no "Quero colo").
export interface AcervoOccasion {
  id: string;
  grp: 'who' | 'time' | 'feel' | 'season';
  sort: number;
  media: AcervoMedia | null;
  pass: OracleSlot[];
}

export interface AcervoPage {
  v: 2;
  oracle: OracleSlot;
  // O humor da prateleira (o servidor escolhe o mais forte da pessoa quando
  // não vem nenhum); null quando há uma ocasião (todos os humores).
  mood: string | null;
  occasion: string | null;
  // A mídia de verdade (uma ocasião de um tipo só passa por cima da pedida).
  media: AcervoMedia;
  total: number;
  unrated_total: number;
  offset: number;
  next_offset: number | null;
  pred_label: PredLabel;
  // 'pred': pela nota prevista; 'public': o vetor ainda não existe.
  order: 'pred' | 'public';
  // O oráculo passa a vez nesta ocasião: a grade vem vazia de propósito.
  passed: boolean;
  live_event: 'halloween' | 'christmas' | null;
  // Só na primeira página (offset 0).
  occasions: AcervoOccasion[] | null;
  items: AcervoItem[];
}

// Erros de regra que mesa_acervo2 devolve no JSON: 'bot' (contas de bot não
// usam o Acervo) e 'bad_args' (oráculo ou mídia inválidos).
export type AcervoRpcError = 'bot' | 'bad_args';
