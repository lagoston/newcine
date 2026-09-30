import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

// Fotos do elenco (tabela people). O site pede as fotos de alguns artistas
// de um filme/série; quem já está cadastrado vem direto do banco. Só quando
// falta alguém (ou alguém sem foto já passou de 30 dias sem conferir) este
// function busca o elenco no TMDB UMA vez e cadastra todo mundo — assim os
// próximos filmes desses artistas já saem do banco, sem TMDB.
//
// Os dados vêm sempre do próprio TMDB (nunca do navegador), e a escrita é
// feita com a service role via register_people(), que nunca sobrescreve
// quem já tem foto.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IDS = 30;
const REGISTER_TOP = 25;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const movieId = Number(body?.movieId);
    const mediaType = body?.mediaType === 'tv' ? 'tv' : 'movie';
    const ids: number[] = Array.isArray(body?.ids)
      ? [...new Set((body.ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_IDS)
      : [];

    if (!Number.isInteger(movieId) || movieId <= 0 || ids.length === 0) {
      return json({ error: 'invalid_input' }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const readPeople = async () => {
      const { data, error } = await supabase.from('people').select('tmdb_id, profile_path, checked_at').in('tmdb_id', ids);
      if (error) throw error;
      return data || [];
    };

    let rows = await readPeople();
    const known = new Map(rows.map((r) => [r.tmdb_id as number, r]));
    const now = Date.now();
    const needsTmdb = ids.some((id) => {
      const row = known.get(id);
      if (!row) return true;
      return !row.profile_path && now - new Date(row.checked_at as string).getTime() > RECHECK_MS;
    });

    if (needsTmdb) {
      const res = await fetch(`${TMDB_BASE_URL}/${mediaType}/${movieId}/credits?api_key=${TMDB_API_KEY}`);
      if (res.ok) {
        const credits = await res.json();
        const cast = Array.isArray(credits?.cast) ? credits.cast : [];
        // O elenco principal do filme inteiro (não só quem foi pedido): os
        // próximos filmes desses artistas já saem do banco.
        const requested = new Set(ids);
        const people = cast
          .filter((p: { id?: number; order?: number }, i: number) => i < REGISTER_TOP || requested.has(Number(p.id)))
          .map((p: { id: number; name: string; profile_path: string | null }) => ({
            id: p.id,
            name: p.name,
            profile_path: p.profile_path || null,
          }));
        if (people.length > 0) {
          const { error } = await supabase.rpc('register_people', { p_people: people });
          if (error) throw error;
          rows = await readPeople();
        }
      }
    }

    const photos: Record<string, string | null> = {};
    for (const r of rows) photos[String(r.tmdb_id)] = (r.profile_path as string | null) ?? null;
    return json({ photos });
  } catch (error) {
    console.error('cast-photos error', error);
    return json({ error: 'internal_error' }, 500);
  }
});
