// DESATIVADA em 12/10/2026 — rotina da madrugada (agenda sync-trending-movies, 04h UTC) que gravava no movie_cache os filmes em alta da semana que faltavam.
// Estava aberta (sem login) e gastava a chave do TMDB a cada chamada. O que
// ela fazia agora é a cache-title (modo trending, agenda title-cache-trending). Ver o doc "Base de filmes" do Project.
// O código antigo continua no histórico de versões da função no Supabase.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  console.warn('BLOCKED: sync-trending-movies was called but is disabled (replaced by cache-title on 2026-10-12).');
  return new Response(JSON.stringify({ error: 'This endpoint has been permanently disabled.' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 403,
  });
});
