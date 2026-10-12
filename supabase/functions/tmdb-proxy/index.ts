import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

// tmdb-proxy — o caminho do site até o TMDB, sem expor a chave (reescrito
// em 12/10/2026; ver o doc "Base de filmes" do Project).
//
// Antes repassava qualquer endpoint, para qualquer um, sem limite. Agora:
//   • só GET e só os endpoints da lista abaixo;
//   • listas (Popular, Em Breve, descobrir…), vídeos, pessoas e o "find" do
//     IMDb ficam guardados em tmdb_response_cache pelo prazo de cada regra:
//     o primeiro visitante busca, os outros recebem do banco;
//   • cada pedido que vai de fato ao TMDB conta no limite por hora de quem
//     pediu (conta logada ou, sem conta, endereço IP);
//   • chamadas internas (banco, curadoria) com a chave interna passam sem
//     limite e podem usar qualquer endpoint.
//
// Os detalhes de um título, temporadas e onde assistir só continuam aqui
// para os apps antigos (APK) — o site novo pega tudo isso do banco pela
// cache-title. Podem sair quando os apps antigos deixarem de ser usados.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || '';
const BASE_URL = 'https://api.themoviedb.org/3';

const HOUR = 3600;
const DAY = 24 * HOUR;
const USER_REQUESTS_PER_HOUR = 1200;
const ANON_REQUESTS_PER_HOUR = 600;

type Trim = (data: any) => any;

const trimVideos: Trim = (data) => ({
  id: data?.id,
  results: (data?.results || [])
    .filter((v: any) => v?.site === 'YouTube')
    .map((v: any) => ({ key: v.key, site: v.site, type: v.type, official: v.official, name: v.name })),
});

const trimPeople: Trim = (data) => ({
  page: data?.page,
  total_results: data?.total_results,
  results: (data?.results || []).slice(0, 10).map((p: any) => ({
    id: p.id,
    name: p.name,
    known_for_department: p.known_for_department,
    popularity: p.popularity,
    profile_path: p.profile_path,
  })),
});

interface Rule {
  re: RegExp;
  // segundos guardado no banco (0 = não guarda)
  ttl: number;
  trim?: Trim;
}

const RULES: Rule[] = [
  // listas da home e das categorias
  { re: /^\/trending\/(movie|tv|all)\/(day|week)$/, ttl: 6 * HOUR },
  { re: /^\/movie\/(upcoming|popular|now_playing|top_rated)$/, ttl: 6 * HOUR },
  { re: /^\/tv\/(popular|top_rated|on_the_air|airing_today)$/, ttl: 6 * HOUR },
  { re: /^\/discover\/(movie|tv)$/, ttl: 12 * HOUR },
  // busca (não guarda: cada letra digitada seria uma linha nova)
  { re: /^\/search\/(movie|tv|multi)$/, ttl: 0 },
  { re: /^\/search\/person$/, ttl: 30 * DAY, trim: trimPeople },
  // importação do IMDb e trailers
  { re: /^\/find\/[a-z0-9]+$/, ttl: 30 * DAY },
  { re: /^\/(movie|tv)\/\d+\/videos$/, ttl: 14 * DAY, trim: trimVideos },
  // apps antigos (APK): detalhes, onde assistir, temporadas, créditos
  { re: /^\/(movie|tv)\/\d+$/, ttl: 0 },
  { re: /^\/(movie|tv)\/\d+\/watch\/providers$/, ttl: 0 },
  { re: /^\/tv\/\d+\/season\/\d+$/, ttl: 0 },
  { re: /^\/person\/\d+\/movie_credits$/, ttl: 0 },
];

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });

function readJwt(req: Request): { role: string | null; sub: string | null } {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return { role: null, sub: null };
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return { role: payload?.role ?? null, sub: payload?.sub ?? null };
  } catch {
    return { role: null, sub: null };
  }
}

const clientIp = (req: Request) =>
  (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();

// path: o caminho, para as regras. key: caminho + parâmetros em ordem
// alfabética, a chave no banco. upstream: o endpoint como veio (menos uma
// api_key que alguém mande), que é o que vai ao TMDB.
function normalize(endpoint: string): { path: string; key: string; upstream: string } | null {
  if (!endpoint.startsWith('/') || endpoint.includes('..')) return null;
  const [rawPath, rawQuery = ''] = endpoint.split('?');
  const path = rawPath.replace(/\/+$/, '');
  const parts = rawQuery.split('&').filter((p) => p && !/^api_key=/i.test(p));
  const sorted = [...parts].sort();
  return {
    path,
    key: sorted.length ? `${path}?${sorted.join('&')}` : path,
    upstream: parts.length ? `${path}?${parts.join('&')}` : path,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const endpoint = new URL(req.url).searchParams.get('endpoint');
  if (!endpoint) return json({ error: 'Missing endpoint parameter' }, 400);
  const target = normalize(endpoint);
  if (!target) return json({ error: 'invalid_endpoint' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const internalKey = req.headers.get('x-internal-key');
    let internal = false;
    if (internalKey) {
      const { data } = await supabase.rpc('check_internal_key', { p_key: internalKey });
      internal = data === true;
    }

    const rule = RULES.find((r) => r.re.test(target.path));
    if (!rule && !internal) return json({ error: 'endpoint_not_allowed' }, 403);

    // 1) guardado e dentro do prazo
    if (rule && rule.ttl > 0) {
      const { data: cached } = await supabase.from('tmdb_response_cache').select('payload, fetched_at').eq('endpoint', target.key).maybeSingle();
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < rule.ttl * 1000) {
        return json(cached.payload, 200, { 'X-Cache': 'hit' });
      }
    }

    // 2) limite de quem pede (só o que vai ao TMDB conta)
    if (!internal) {
      const { role, sub } = readJwt(req);
      const isUser = role === 'authenticated' && !!sub;
      const { data: ok } = await supabase.rpc('hit_rate_limit', {
        p_key: isUser ? `proxy:user:${sub}` : `proxy:ip:${clientIp(req)}`,
        p_limit: isUser ? USER_REQUESTS_PER_HOUR : ANON_REQUESTS_PER_HOUR,
        p_window_seconds: HOUR,
        p_cost: 1,
      });
      if (ok !== true) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '600' });
    }

    // 3) TMDB
    const tmdbUrl = `${BASE_URL}${target.upstream}${target.upstream.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
    const tmdbResponse = await fetch(tmdbUrl);
    if (!tmdbResponse.ok) {
      return json({ error: 'TMDB API error', status: tmdbResponse.status }, tmdbResponse.status);
    }
    const raw = await tmdbResponse.json();
    const data = rule?.trim ? rule.trim(raw) : raw;

    if (rule && rule.ttl > 0) {
      await supabase.from('tmdb_response_cache').upsert({ endpoint: target.key, payload: data, fetched_at: new Date().toISOString() }, { onConflict: 'endpoint' });
    }

    return json(data, 200, { 'X-Cache': 'miss' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
