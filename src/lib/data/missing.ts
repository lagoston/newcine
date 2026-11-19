// "Esta função não existe no banco" (19/11/2026, Reborn, onda 3).
//
// O site novo pode subir antes de uma migração (ou rodar contra um banco de
// teste antigo). Quando uma RPC ainda não existe, o PostgREST responde com o
// código PGRST202 (ou 42883, do Postgres) e a tela cai no PLANO B: a consulta
// antiga, que continua no código. Qualquer outro erro é erro de verdade.
//
// Nasceu privado em lib/friendsFeed.ts (os stories com p_kinds); virou comum
// porque as RPCs de resumo da onda 3 (get_title_social, get_title_me,
// get_profile_stats_v2) usam o mesmo teste.
export const isMissingFunction = (error: { code?: string; message?: string } | null | undefined): boolean =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? ''));
