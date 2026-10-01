import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.39.0';

// Sagas, trilogias e continuações de um filme (tabelas movie_collections,
// movie_collection_parts e movie_collection_checks).
//
// O site lê primeiro direto das tabelas; só chama esta function quando:
//   • o filme ainda não foi conferido (ou a conferência tem mais de 30 dias);
//   • a coleção do TMDB tem mais de 30 dias (pode ter saído filme novo);
//   • uma coleção manual tem partes sem título/pôster (preenche do TMDB).
// Os dados vêm sempre do próprio TMDB; coleções 'manual' nunca são
// sobrescritas.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || '';
const TMDB = 'https://api.themoviedb.org/3';
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function tmdb(path: string, language: string) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB}${path}${sep}language=${language}&api_key=${TMDB_API_KEY}`);
  if (!res.ok) return null;
  return res.json();
}

const isStale = (iso: string | null | undefined) => !iso || Date.now() - new Date(iso).getTime() > STALE_MS;

type Part = { id: number; title?: string; release_date?: string; poster_path?: string | null; adult?: boolean; media_type?: string };

// Busca a coleção no TMDB (inglês e português) e regrava as partes.
async function refreshTmdbCollection(db: SupabaseClient, collectionId: number) {
  const { data: existing } = await db.from('movie_collections').select('source').eq('id', collectionId).maybeSingle();
  if (existing?.source === 'manual') return;

  const [en, pt] = await Promise.all([tmdb(`/collection/${collectionId}`, 'en-US'), tmdb(`/collection/${collectionId}`, 'pt-BR')]);
  if (!en) return;
  const ptById = new Map<number, Part>(((pt?.parts as Part[]) || []).map((p) => [p.id, p]));
  const parts = ((en.parts as Part[]) || []).filter((p) => !p.adult && (!p.media_type || p.media_type === 'movie'));

  const { error: upsertError } = await db.from('movie_collections').upsert({
    id: collectionId,
    name_en: en.name ?? null,
    name_pt: pt?.name ?? en.name ?? null,
    poster_path: pt?.poster_path || en.poster_path || null,
    source: 'tmdb',
    fetched_at: new Date().toISOString(),
  });
  if (upsertError) throw upsertError;

  await db.from('movie_collection_parts').delete().eq('collection_id', collectionId);
  if (parts.length > 0) {
    const rows = parts.map((p) => {
      const ptPart = ptById.get(p.id);
      return {
        collection_id: collectionId,
        movie_id: p.id,
        position: null,
        title_en: p.title ?? null,
        title_pt: ptPart?.title ?? p.title ?? null,
        release_date: p.release_date || null,
        poster_path: p.poster_path || null,
        poster_path_pt: ptPart?.poster_path || null,
      };
    });
    const { error } = await db.from('movie_collection_parts').insert(rows);
    if (error) throw error;
  }
}

// Partes de coleções manuais cadastradas só com o id: completa do TMDB.
async function fillManualParts(db: SupabaseClient, collectionId: number) {
  const { data: missing } = await db
    .from('movie_collection_parts')
    .select('movie_id')
    .eq('collection_id', collectionId)
    .is('title_en', null)
    .limit(30);
  for (const row of missing || []) {
    const [en, pt] = await Promise.all([tmdb(`/movie/${row.movie_id}`, 'en-US'), tmdb(`/movie/${row.movie_id}`, 'pt-BR')]);
    if (!en) continue;
    await db
      .from('movie_collection_parts')
      .update({
        title_en: en.title ?? null,
        title_pt: pt?.title ?? en.title ?? null,
        release_date: en.release_date || null,
        poster_path: en.poster_path || null,
        poster_path_pt: pt?.poster_path || null,
      })
      .eq('collection_id', collectionId)
      .eq('movie_id', row.movie_id);
  }
}

async function readCollections(db: SupabaseClient, movieId: number) {
  const { data: memberships } = await db.from('movie_collection_parts').select('collection_id').eq('movie_id', movieId);
  const ids = [...new Set((memberships || []).map((m) => m.collection_id as number))];
  if (ids.length === 0) return [];
  const [{ data: collections }, { data: parts }] = await Promise.all([
    db.from('movie_collections').select('*').in('id', ids),
    db.from('movie_collection_parts').select('*').in('collection_id', ids),
  ]);
  return (collections || []).map((c) => ({ ...c, parts: (parts || []).filter((p) => p.collection_id === c.id) }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const movieId = Number(body?.movieId);
    if (!Number.isInteger(movieId) || movieId <= 0) return json({ error: 'invalid_input' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let collections = await readCollections(db, movieId);

    if (collections.length === 0) {
      const { data: check } = await db.from('movie_collection_checks').select('checked_at').eq('movie_id', movieId).maybeSingle();
      if (check && !isStale(check.checked_at)) return json({ collections: [] });

      const movie = await tmdb(`/movie/${movieId}`, 'en-US');
      if (movie) {
        const collectionId = Number(movie.belongs_to_collection?.id);
        if (Number.isInteger(collectionId) && collectionId > 0) await refreshTmdbCollection(db, collectionId);
        await db.from('movie_collection_checks').upsert({ movie_id: movieId, checked_at: new Date().toISOString() });
      }
      collections = await readCollections(db, movieId);
    } else {
      let changed = false;
      for (const c of collections) {
        if (c.source === 'tmdb' && isStale(c.fetched_at)) {
          await refreshTmdbCollection(db, c.id);
          changed = true;
        } else if (c.source === 'manual' && c.parts.some((p: { title_en: string | null }) => !p.title_en)) {
          await fillManualParts(db, c.id);
          changed = true;
        }
      }
      if (changed) collections = await readCollections(db, movieId);
    }

    return json({ collections });
  } catch (error) {
    console.error('movie-collection error', error);
    return json({ error: 'internal_error' }, 500);
  }
});
