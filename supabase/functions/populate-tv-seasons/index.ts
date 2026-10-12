// DESATIVADA em 12/10/2026 — preenchimento avulso das temporadas das séries.
// Estava aberta (sem login) e gastava a chave do TMDB a cada chamada. O que
// ela fazia agora é a cache-title, que grava as temporadas junto com a série. Ver o doc "Base de filmes" do Project.
// O código antigo continua no histórico de versões da função no Supabase.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  console.warn('BLOCKED: populate-tv-seasons was called but is disabled (replaced by cache-title on 2026-10-12).');
  return new Response(JSON.stringify({ error: 'This endpoint has been permanently disabled.' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 403,
  });
});
