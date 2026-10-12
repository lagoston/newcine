// DESATIVADA em 12/10/2026 — conserto avulso de linhas incompletas do movie_cache (até 300 por chamada).
// Estava aberta (sem login) e gastava a chave do TMDB a cada chamada. O que
// ela fazia agora é a cache-title: título incompleto entra na fila da madrugada. Ver o doc "Base de filmes" do Project.
// O código antigo continua no histórico de versões da função no Supabase.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  console.warn('BLOCKED: repopulate-movie-cache was called but is disabled (replaced by cache-title on 2026-10-12).');
  return new Response(JSON.stringify({ error: 'This endpoint has been permanently disabled.' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 403,
  });
});
