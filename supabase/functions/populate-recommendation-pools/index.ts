// DESATIVADA em 16/11/2026. Na versão 7, esta função regravava as 30 linhas de
// recommendation_pools com listas genéricas do TMDB (discover por gênero), com
// a chave de serviço e sem conferir quem chamava: bastava a chave pública do
// site para apagar a curadoria inteira das prateleiras (6.491 títulos escolhidos
// à mão) e recalcular as Personas, as tags e as previsões de todo mundo.
//
// Achado pelo mapa dos oráculos no estudo da Conta Diretor (pedido do Bruno,
// 16/11/2026). Nada no site a chamava. A curadoria das prateleiras passa a ser
// feita pelas funções do diretor, que conferem o papel no banco e registram
// cada mudança. O código antigo está no histórico do git (commit anterior a
// este arquivo).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  console.warn('BLOCKED: populate-recommendation-pools was called but is permanently disabled (16/11/2026).');

  return new Response(JSON.stringify({ error: 'This endpoint has been permanently disabled.' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 403,
  });
});
