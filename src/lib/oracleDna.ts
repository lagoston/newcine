import { supabase } from './supabase';
import type { OracleId } from './oracleTheme';

// Oracle DNA (18/11/2026) — os parentes de um título em TODAS as prateleiras
// dos oráculos. Quem calcula é o banco (public.oracle_dna): só dados e regras,
// sem IA, igual para todos. Ver o comentário da função para as quatro fitas
// (temas, autoria, plateia, corpo) e as lentes. A tela não mostra mais as
// lentes como abas: lê a mesma resposta em seções (familyOf, no fim).
//
// A resposta fica guardada na sessão por 10 minutos (abrir o DNA, abrir um
// parente, voltar: não pede de novo). Uma nota nova muda pouca coisa no DNA —
// só a marca "sua nota" de um parente —, e quem fecha e reabre depois de 10
// minutos já recebe tudo novo.

export type DnaLens = 'twins' | 'shelves' | 'roots' | 'heirs' | 'screen' | 'author';
export const DNA_LENSES: DnaLens[] = ['twins', 'shelves', 'roots', 'heirs', 'screen', 'author'];

export type DnaMedia = 'movie' | 'tv';
export type DnaPredLabel = 'number' | 'guess' | 'hidden';

export interface DnaGene {
  id: number;
  pt: string;
  en: string;
  // Em quantos títulos das prateleiras o gene aparece (quanto menor, mais raro).
  df: number;
}

export interface DnaSource {
  id: number;
  media_type: DnaMedia;
  in_catalog: boolean;
  in_shelf: boolean;
  oracle: OracleId | null;
  mood: string | null;
  year: number | null;
  // Quantas palavras-chave do título o oráculo consegue ler.
  genes: number;
}

export interface DnaRelative {
  id: number;
  media_type: DnaMedia;
  title_pt: string | null;
  title_en: string | null;
  year: number | null;
  poster_path: string | null;
  poster_path_pt: string | null;
  oracle: OracleId;
  mood: string;
  score: number;
  // Afinidade de 1 a 99 (1 - e^(-10·score)).
  pct: number;
  // Força só dos temas (a lente "outras prateleiras" ordena por ela).
  kw: number;
  // Todos os genes em comum, do mais raro ao mais comum (os que têm nome
  // estão em DnaResult.genes; os outros só contam).
  shared: number[];
  n_shared: number;
  same_director: boolean;
  cast: string[];
  co_lovers: number;
  countries: string[];
  anime: boolean;
  bw: boolean;
  lenses: DnaLens[];
  my_rating: number | null;
  in_watchlist: boolean;
  pred: number | null;
}

export interface DnaResult {
  source: DnaSource;
  genome: DnaGene[];
  genes: Record<string, { pt: string; en: string; df: number }>;
  predLabel: DnaPredLabel;
  items: DnaRelative[];
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: DnaResult }>();
const pending = new Map<string, Promise<DnaResult>>();

const isOracle = (v: unknown): v is OracleId => v === 'bogart' || v === 'fincher' || v === 'cypher';
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
const numArr = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((x) => Number.isFinite(x)) : []);

function normalize(raw: unknown, id: number, media: DnaMedia): DnaResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (r.error) throw new Error(String(r.error));
  const s = (r.source && typeof r.source === 'object' ? r.source : {}) as Record<string, unknown>;
  const source: DnaSource = {
    id,
    media_type: media,
    in_catalog: s.in_catalog === true,
    in_shelf: s.in_shelf === true,
    oracle: isOracle(s.oracle) ? s.oracle : null,
    mood: str(s.mood),
    year: num(s.year),
    genes: num(s.genes) ?? 0,
  };
  const genome: DnaGene[] = Array.isArray(r.genome)
    ? (r.genome as Record<string, unknown>[])
        .map((g) => ({ id: Number(g.id), pt: String(g.pt || g.en || ''), en: String(g.en || g.pt || ''), df: num(g.df) ?? 0 }))
        .filter((g) => Number.isFinite(g.id) && g.pt)
    : [];
  const genes: DnaResult['genes'] = {};
  if (r.genes && typeof r.genes === 'object') {
    Object.entries(r.genes as Record<string, Record<string, unknown>>).forEach(([key, g]) => {
      const pt = String(g?.pt || g?.en || '');
      if (pt) genes[key] = { pt, en: String(g?.en || pt), df: num(g?.df) ?? 0 };
    });
  }
  const items: DnaRelative[] = Array.isArray(r.items)
    ? (r.items as Record<string, unknown>[])
        .map((i) => ({
          id: Number(i.id),
          media_type: (i.media_type === 'tv' ? 'tv' : 'movie') as DnaMedia,
          title_pt: str(i.title_pt),
          title_en: str(i.title_en),
          year: num(i.year),
          poster_path: str(i.poster_path),
          poster_path_pt: str(i.poster_path_pt),
          oracle: (isOracle(i.oracle) ? i.oracle : 'bogart') as OracleId,
          mood: String(i.mood || ''),
          score: num(i.score) ?? 0,
          pct: Math.max(1, Math.min(99, Math.round(num(i.pct) ?? 0))),
          kw: num(i.kw) ?? 0,
          shared: numArr(i.shared),
          n_shared: num(i.n_shared) ?? 0,
          same_director: i.same_director === true,
          cast: strArr(i.cast),
          co_lovers: num(i.co_lovers) ?? 0,
          countries: strArr(i.countries),
          anime: i.anime === true,
          bw: i.bw === true,
          lenses: strArr(i.lenses).filter((l): l is DnaLens => (DNA_LENSES as string[]).includes(l)),
          my_rating: num(i.my_rating),
          in_watchlist: i.in_watchlist === true,
          pred: num(i.pred),
        }))
        .filter((i) => Number.isFinite(i.id) && i.id > 0)
    : [];
  const predLabel: DnaPredLabel = r.pred_label === 'guess' || r.pred_label === 'hidden' ? r.pred_label : 'number';
  return { source, genome, genes, predLabel, items };
}

export function peekOracleDna(id: number, media: DnaMedia): DnaResult | null {
  const hit = cache.get(`${media}:${id}`);
  return hit && Date.now() - hit.at < TTL_MS ? hit.data : null;
}

// fresh: ignora o guardado (a gaveta voltou do menu de um parente e a pessoa
// pode ter dado nota a ele).
export function getOracleDna(id: number, media: DnaMedia, opts: { fresh?: boolean } = {}): Promise<DnaResult> {
  const key = `${media}:${id}`;
  const hit = opts.fresh ? null : peekOracleDna(id, media);
  if (hit) return Promise.resolve(hit);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const promise = (async () => {
    const { data, error } = await supabase.rpc('oracle_dna', { p_id: id, p_media: media });
    if (error) throw new Error(error.message || 'oracle_dna failed');
    const result = normalize(data, id, media);
    cache.set(key, { at: Date.now(), data: result });
    return result;
  })();
  pending.set(key, promise);
  promise.then(
    () => pending.delete(key),
    () => pending.delete(key)
  );
  return promise;
}

// 24/11/2026 — A FAMÍLIA EM SEÇÕES (no lugar das seis lentes).
// As lentes eram abas que mostravam quase os mesmos títulos: cada parente
// aparecia, em média, em duas delas (medido em oito títulos: de 1,8 a 2,6), e
// "Outras prateleiras" era "Gêmeos" menos um ou dois. A gaveta agora é uma
// página só, e cada parente aparece UMA vez:
//   • closest — os cinco de maior afinidade (qualquer época, filme ou série);
//   • roots / peers / heirs — o resto da mesma tela, pela época: mais antigos,
//     do mesmo ano, mais novos (others = sem ano para comparar);
//   • screen — o resto que mora na outra tela (série ↔ filme);
//   • hand — quem entrou só pela direção ou pelo elenco, sem dividir temas.
// "Parente pelos temas" é o que o banco pôs em alguma lente de temas; quem
// veio só na lente "author" entrou pela mão, e não pelos genes. O banco não
// mudou (o app antigo usa a mesma resposta): isto é só a leitura da tela.
export type DnaSection = 'closest' | 'roots' | 'peers' | 'heirs' | 'others' | 'screen' | 'hand';
export const DNA_SECTIONS: DnaSection[] = ['closest', 'roots', 'peers', 'heirs', 'others', 'screen', 'hand'];
export const DNA_CLOSEST = 5;

const THEME_LENSES: DnaLens[] = ['twins', 'shelves', 'roots', 'heirs', 'screen'];
export const sharesThemes = (rel: DnaRelative): boolean => rel.lenses.some((l) => THEME_LENSES.includes(l));

const byAffinity = (a: DnaRelative, b: DnaRelative) => b.score - a.score || a.id - b.id;

// gene: só os parentes que carregam aquele gene (o filtro do genoma).
export function familyOf(
  items: DnaRelative[],
  sourceYear: number | null,
  media: DnaMedia,
  gene: number | null
): Record<DnaSection, DnaRelative[]> {
  const pool = gene === null ? items : items.filter((i) => i.shared.includes(gene));
  const kin = pool.filter(sharesThemes).sort(byAffinity);
  const out: Record<DnaSection, DnaRelative[]> = {
    closest: kin.slice(0, DNA_CLOSEST),
    roots: [],
    peers: [],
    heirs: [],
    others: [],
    screen: [],
    hand: pool.filter((i) => !sharesThemes(i)).sort(byAffinity),
  };
  kin.slice(DNA_CLOSEST).forEach((rel) => {
    if (rel.media_type !== media) out.screen.push(rel);
    else if (sourceYear === null || rel.year === null) out.others.push(rel);
    else if (rel.year < sourceYear) out.roots.push(rel);
    else if (rel.year > sourceYear) out.heirs.push(rel);
    else out.peers.push(rel);
  });
  return out;
}
