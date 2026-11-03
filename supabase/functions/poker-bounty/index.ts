import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { handle } from './handler.ts';

// poker-bounty — a partida com prêmio de O Grande Blefe (SPEC §4.7). 03/11/2026.
//
// verify_jwt = true. O uid vem de auth.getUser(token), NUNCA do corpo. O banco
// é acessado com a service role (variável de ambiente da Edge, nunca no
// repositório), e só pelas RPCs poker_bounty_*, que recusam qualquer outro
// papel. A lógica mora em handler.ts; o motor, em _engine/ (cópia gerada por
// scripts/sync-poker-engine.mjs).
//
// Publicar (MCP deploy_edge_function, verify_jwt: true), desde 03/11/2026:
//   node scripts/sync-poker-engine.mjs && node scripts/poker/bundle-edge.mjs
// e enviar 2 arquivos: este index.ts e dist/handler.ts publicado com o nome
// handler.ts (handler + _engine empacotados pelo esbuild, ~160 KB em vez de
// ~290 KB de fontes com comentários). O pacote leva o mesmo ENGINE_HASH.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // x-region: o app pede a região do banco (sa-east-1) no functions.invoke.
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

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ ok: false, code: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const uid = auth?.user?.id;
  if (authError || !uid) return json({ ok: false, code: 'unauthorized' }, 401);

  const text = await req.text();
  if (text.length > MAX_BODY) return json({ ok: false, code: 'too_large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, code: 'bad_request' }, 400);
  }

  const reply = await handle(body, uid, deps);
  return json(reply.body, reply.status);
});
