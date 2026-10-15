// Supabase de mentira para o comercial: responde só o que a gaveta Conexão
// pede, com os dados de promo/data.ts. Nada sai para a rede.
import { PERSONA_RPC, PROFILE_ROWS, WATCH_MOVIES } from './data';

export const supabaseUrl = 'https://promo.invalid';
export const supabaseAnonKey = 'promo';

type Result = { data: unknown; error: null };
const ok = (data: unknown): Promise<Result> => Promise.resolve({ data, error: null });

class Query {
  private table: string;
  private filters: Record<string, unknown> = {};
  constructor(table: string) {
    this.table = table;
  }
  select() { return this; }
  insert() { return this; }
  update() { return this; }
  upsert() { return this; }
  delete() { return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  in() { return this; }
  neq() { return this; }
  gt() { return this; }
  gte() { return this; }
  lt() { return this; }
  lte() { return this; }
  is() { return this; }
  not() { return this; }
  or() { return this; }
  filter() { return this; }
  match() { return this; }
  ilike() { return this; }
  contains() { return this; }
  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }
  private rows(): Record<string, unknown>[] {
    if (this.table === 'profiles' && typeof this.filters.id === 'string') {
      const row = PROFILE_ROWS[this.filters.id];
      return row ? [row] : [];
    }
    return [];
  }
  maybeSingle() { return ok(this.rows()[0] ?? null); }
  single() { return ok(this.rows()[0] ?? null); }
  then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
    return ok(this.rows()).then(resolve, reject);
  }
}

const noop = () => undefined;
const channel = () => {
  const c: Record<string, unknown> = {};
  c.on = () => c;
  c.subscribe = () => c;
  c.unsubscribe = () => Promise.resolve('ok');
  return c;
};

export const supabase = {
  from: (table: string) => new Query(table),
  rpc: (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'get_user_persona') return ok(PERSONA_RPC[String(args.p_user_id)] ?? null);
    return ok(null);
  },
  functions: {
    invoke: (name: string) => {
      if (name === 'match-movie') return ok({ movies: WATCH_MOVIES });
      return ok(null);
    },
  },
  auth: {
    getSession: () => ok({ session: null }),
    getUser: () => ok({ user: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
    signOut: () => ok(null),
  },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), upload: () => ok(null) }) },
  channel,
  removeChannel: () => Promise.resolve('ok'),
};

export async function getProfile() {
  return { data: null, error: null };
}

export async function createProfile() {
  return { data: null, error: null };
}
