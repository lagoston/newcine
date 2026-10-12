// DESATIVADA em 12/10/2026 — rotina da madrugada (agenda refresh-tv-shows-biweekly, 03h UTC) que atualizava 6 séries por noite, com todas as temporadas, e avisava episódios novos.
// Estava aberta (sem login) e gastava a chave do TMDB a cada chamada. O que
// ela fazia agora é a cache-title (modo sweep, agenda title-cache-refresh): séries no ar vencem a cada 7 dias, só as temporadas que mudaram são buscadas de novo e o aviso de episódio novo continua. Ver o doc "Base de filmes" do Project.
// O código antigo continua no histórico de versões da função no Supabase.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  console.warn('BLOCKED: refresh-tv-shows-biweekly was called but is disabled (replaced by cache-title on 2026-10-12).');
  return new Response(JSON.stringify({ error: 'This endpoint has been permanently disabled.' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 403,
  });
});
