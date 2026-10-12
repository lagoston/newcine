import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

// Página da pessoa (ator ou diretor) — tabela person_pages (12/10/2026).
//
// O site pede uma pessoa pelo id do TMDB. Se ela já está no banco e foi
// buscada há menos de 30 dias, vem direto de lá. Senão, este function busca
// no TMDB (pt-BR e en-US, cada um com os filmes da pessoa na mesma chamada),
// resume os filmes e grava com a service role. Os dados vêm sempre do
// próprio TMDB (nunca do navegador), como em cast-photos e movie-collection.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
// Filmes com pouquíssimos votos não entram em nenhum Top 10: ficam de fora
// do resumo para a linha não crescer à toa (há atores com 200+ filmes).
const MIN_VOTES = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type Credit = {
  id: number;
  title?: string;
  poster_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  character?: string;
  order?: number;
  job?: string;
  genre_ids?: number[];
};

type Summary = {
  id: number;
  title_pt: string | null;
  title_en: string | null;
  poster_pt: string | null;
  poster_en: string | null;
  release_date: string | null;
  vote_average: number;
  vote_count: number;
  character?: string | null;
  order?: number | null;
  genre_ids: number[];
};

// Junta os créditos dos dois idiomas num resumo por filme (um filme aparece
// uma vez só, mesmo com mais de um personagem).
function summarize(pt: Credit[], en: Credit[], withRole: boolean): Summary[] {
  const enById = new Map<number, Credit>();
  en.forEach((c) => {
    if (!enById.has(c.id)) enById.set(c.id, c);
  });
  const byId = new Map<number, Summary>();
  pt.forEach((c) => {
    if (!c?.id || (c.vote_count || 0) < MIN_VOTES) return;
    const e = enById.get(c.id);
    const prev = byId.get(c.id);
    if (prev) {
      if (withRole && c.character && prev.character && !prev.character.includes(c.character)) prev.character = `${prev.character} / ${c.character}`;
      if (withRole && typeof c.order === 'number' && (prev.order == null || c.order < prev.order)) prev.order = c.order;
      return;
    }
    byId.set(c.id, {
      id: c.id,
      title_pt: c.title || null,
      title_en: e?.title || null,
      poster_pt: c.poster_path || null,
      poster_en: e?.poster_path || c.poster_path || null,
      release_date: c.release_date || null,
      vote_average: Math.round((c.vote_average || 0) * 100) / 100,
      vote_count: c.vote_count || 0,
      ...(withRole ? { character: (e?.character || c.character || null), order: typeof c.order === 'number' ? c.order : null } : {}),
      genre_ids: Array.isArray(c.genre_ids) ? c.genre_ids : [],
    });
  });
  return Array.from(byId.values());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const personId = Number(body?.personId);
    if (!Number.isInteger(personId) || personId <= 0) return json({ error: 'invalid_input' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: existing } = await supabase.from('person_pages').select('*').eq('tmdb_id', personId).maybeSingle();
    if (existing && Date.now() - new Date(existing.fetched_at as string).getTime() < REFRESH_MS) {
      return json({ person: existing, source: 'db' });
    }

    const fetchLang = (lang: string) =>
      fetch(`${TMDB_BASE_URL}/person/${personId}?language=${lang}&append_to_response=movie_credits&api_key=${TMDB_API_KEY}`);
    const [ptRes, enRes] = await Promise.all([fetchLang('pt-BR'), fetchLang('en-US')]);

    if (!ptRes.ok || !enRes.ok) {
      // TMDB fora do ar ou pessoa removida: vale o que já estava guardado.
      if (existing) return json({ person: existing, source: 'db_stale' });
      return json({ error: 'not_found' }, ptRes.status === 404 ? 404 : 502);
    }

    const pt = await ptRes.json();
    const en = await enRes.json();
    const ptCredits = pt?.movie_credits || {};
    const enCredits = en?.movie_credits || {};

    const row = {
      tmdb_id: personId,
      name: (en?.name || pt?.name || '').trim(),
      profile_path: pt?.profile_path || en?.profile_path || null,
      known_for_department: en?.known_for_department || null,
      birthday: pt?.birthday || null,
      deathday: pt?.deathday || null,
      place_of_birth: pt?.place_of_birth || en?.place_of_birth || null,
      biography_pt: (pt?.biography || '').trim() || null,
      biography_en: (en?.biography || '').trim() || null,
      movie_cast: summarize(ptCredits.cast || [], enCredits.cast || [], true),
      movie_directed: summarize(
        (ptCredits.crew || []).filter((c: Credit) => c.job === 'Director'),
        (enCredits.crew || []).filter((c: Credit) => c.job === 'Director'),
        false
      ),
      fetched_at: new Date().toISOString(),
    };

    if (!row.name) return json({ error: 'not_found' }, 404);

    const { data: saved, error } = await supabase.from('person_pages').upsert(row, { onConflict: 'tmdb_id' }).select('*').single();
    if (error) throw error;
    return json({ person: saved, source: 'tmdb' });
  } catch (error) {
    console.error('person-page error', error);
    return json({ error: 'internal_error' }, 500);
  }
});
