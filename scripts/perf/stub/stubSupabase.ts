// Supabase de mentira para o build de teste (scripts/perf/vite.smoke.config.ts):
// toda chamada responde na hora com dados vazios, sem rede. Mesmas exportações
// de src/lib/supabase.ts.
import { createClient } from '@supabase/supabase-js';

const result = { data: null, error: null, count: 0 };
function chain(): unknown {
  const target = function () {} as unknown as Record<string, unknown>;
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result);
      return () => chain();
    },
    apply() {
      return chain();
    },
  });
}
const session = () => (localStorage.getItem('measure_guest') === '1' ? null : { user: { id: 'u1', email: 'x@y.z' }, access_token: 't' });
export const supabase = {
  from: () => chain(),
  rpc: () => Promise.resolve(result),
  functions: { invoke: () => Promise.resolve(result) },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), upload: () => Promise.resolve(result), list: () => Promise.resolve({ data: [], error: null }) }) },
  auth: {
    getSession: () => Promise.resolve({ data: { session: session() }, error: null }),
    getUser: () => Promise.resolve({ data: { user: session()?.user ?? null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    refreshSession: () => Promise.resolve({ data: { session: session() }, error: null }),
  },
  channel: () => {
    const c: Record<string, unknown> = {};
    c.on = () => c;
    c.subscribe = () => c;
    c.unsubscribe = () => Promise.resolve();
    c.send = () => Promise.resolve();
    c.track = () => Promise.resolve();
    c.presenceState = () => ({});
    return c;
  },
  removeChannel: () => Promise.resolve(),
  removeAllChannels: () => Promise.resolve(),
} as never;
export const supabaseUrl = 'http://localhost';
export const supabaseAnonKey = 'x';
export async function getProfile() {
  return null;
}
export async function createProfile() {
  return null;
}
// Mantém o supabase-js no pacote (o peso real da abertura), sem usar a rede.
export const __realClientForBundleWeight = createClient('http://127.0.0.1:9', 'x', { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
