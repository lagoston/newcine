import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { handle } from './handler.ts';

// poker-friends — a mesa com amigos do Pôster Poker e a casual de devolução (03/11/2026,
// pacote F3). A lógica mora em handler.ts; o motor é a cópia em ../poker-bounty/_engine/
// (scripts/sync-poker-engine.mjs), empacotada junto na publicação.
//
// verify_jwt = true. Duas portas:
//   - pessoa: o uid vem de auth.getUser(token), NUNCA do corpo;
//   - rotina agendada (pg_cron → poker_friends_sweep_call, a cada 30 s): manda a chave
//     pública (anon) no Authorization e a chave interna em x-internal-key, conferida pela
//     RPC check_internal_key (o segredo mora no cofre do banco, não aqui). Só pode 'sweep'.
// O banco é acessado com a service role (variável de ambiente da Edge, nunca no
// repositório), e só pelas RPCs poker_room_* / poker_recover_*, que recusam outro papel.
//
// Publicar (MCP deploy_edge_function, verify_jwt: true):
//   node scripts/sync-poker-engine.mjs && node supabase/functions/poker-friends/bundle.mjs
// e enviar 2 arquivos: este index.ts e dist/handler.ts publicado com o nome handler.ts.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Region',
};

const MAX_BODY = 4096;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps = {
  async rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  },
  nowIso: () => new Date().toISOString(),
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, code: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, code: 'server_error' }, 500);

  const text = await req.text();
  if (text.length > MAX_BODY) return json({ ok: false, code: 'too_large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, code: 'bad_request' }, 400);
  }

  // A rotina agendada (chave interna do cofre).
  const internalKey = req.headers.get('x-internal-key');
  if (internalKey) {
    const { data: valid } = await admin.rpc('check_internal_key', { p_key: internalKey });
    if (valid !== true) return json({ ok: false, code: 'unauthorized' }, 401);
    const reply = await handle(body, null, deps, { internal: true });
    return json(reply.body, reply.status);
  }

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ ok: false, code: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const uid = auth?.user?.id;
  if (authError || !uid) return json({ ok: false, code: 'unauthorized' }, 401);

  const reply = await handle(body, uid, deps);
  return json(reply.body, reply.status);
});
