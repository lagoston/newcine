// O que a camada de dados guarda no aparelho (18/11/2026, Protocolo Reborn, onda 2a).
//
// Relatório de rede, 4.4: abrir o app e já ver o que havia na última visita,
// atualizando por trás. Só as consultas marcadas persist: true em keys.ts.
//
// As três regras de segurança (pedido do coordenador):
//   1. SEPARADO POR PESSOA. Há um balde público ('pub') e um balde por pessoa,
//      guardado sob o id dela e carimbado com o id dela. Ao abrir, só entra na
//      memória o balde de quem está logado, e cada item ainda é conferido (o
//      dono escrito no item tem de ser a mesma pessoa).
//   2. APAGADO NO LOGOUT. Sair da conta apaga TODOS os baldes pessoais do
//      aparelho. E, por garantia, toda vez que alguém entra, os baldes de
//      qualquer outra pessoa são apagados antes (cobre o logout que não chegou
//      a rodar: sessão expirada, aba fechada no meio).
//   3. NADA DE TERCEIROS. Só vai para o aparelho o que é da própria pessoa ou
//      público. Amigos, perfis alheios, sussurros e mensagens ficam só na memória.
//
// A gravação é espaçada (2 s) e só acontece quando algum dado guardado mudou
// de verdade; ao esconder a aba, o que estiver pendente é gravado na hora.
import type { DehydratedState } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave, type PersistedClient, type Persister } from '@tanstack/react-query-persist-client';
import { queryClient, type AnyQuery } from './client';
import { PERSIST_MAX_AGE, PERSIST_VERSION, RESTORE_GUARDS } from './keys';
import { getScope } from './scope';
import { kvDelete, kvGet, kvKeepOnly, kvSet, type Store } from './kv';

const SAVE_DELAY_MS = 2000;
const PUB_KEY = 'state';

interface Bucket {
  // 'pub' ou o id da pessoa
  owner: string;
  saved: PersistedClient;
}

const signature = (state: DehydratedState) =>
  state.queries
    .map((q) => `${q.queryHash}@${q.state.dataUpdatedAt}`)
    .sort()
    .join('|');

// Pertence a este balde? (dono certo, marcado para o aparelho, com resposta boa)
const belongs = (query: { meta?: Record<string, unknown>; state: { status: string } }, owner: string) =>
  query.state.status === 'success' && query.meta?.persist === true && query.meta?.owner === owner;

interface Saver {
  stop(): void;
  flush(): void;
}
const savers = new Set<Saver>();

function createBucket(store: Store, key: string, owner: string) {
  let lastSignature: string | null = null;

  const persister: Persister = {
    async restoreClient() {
      const bucket = await kvGet<Bucket>(store, key);
      // carimbo errado, ou a pessoa já não é a mesma: não entra
      if (!bucket || bucket.owner !== owner || !bucket.saved?.clientState) return undefined;
      if (owner !== 'pub' && getScope().uid !== owner) return undefined;
      const oldest = Date.now() - PERSIST_MAX_AGE;
      const queries = (bucket.saved.clientState.queries ?? []).filter((q) => {
        if (!belongs(q, owner)) return false;
        if (q.state.dataUpdatedAt < oldest) return false;
        const guard = typeof q.meta?.guard === 'string' ? RESTORE_GUARDS[q.meta.guard] : undefined;
        try {
          return guard ? guard(q.state.data) : true;
        } catch {
          return false;
        }
      });
      const clientState: DehydratedState = { mutations: [], queries };
      lastSignature = signature(clientState);
      return { ...bucket.saved, clientState };
    },
    async persistClient(client) {
      // a pessoa saiu ou trocou enquanto a gravação esperava: não grava
      if (owner !== 'pub' && getScope().uid !== owner) return;
      const next = signature(client.clientState);
      if (next === lastSignature) return;
      lastSignature = next;
      await kvSet(store, key, { owner, saved: client } satisfies Bucket);
    },
    removeClient: () => kvDelete(store, key),
  };

  const restore = () =>
    persistQueryClientRestore({
      queryClient,
      persister,
      maxAge: PERSIST_MAX_AGE,
      buster: PERSIST_VERSION,
      // o que voltou do aparelho fica na memória o dia todo, mesmo sem tela usando
      hydrateOptions: { defaultOptions: { queries: { gcTime: PERSIST_MAX_AGE } } },
    }).catch(() => undefined);

  const start = (): Saver => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      timer = undefined;
      persistQueryClientSave({
        queryClient,
        persister,
        buster: PERSIST_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => belongs(query, owner),
          shouldDehydrateMutation: () => false,
        },
      }).catch(() => undefined);
    };
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'added' && event.type !== 'removed' && event.type !== 'updated') return;
      if ((event.query as AnyQuery).meta?.owner !== owner) return;
      if (timer === undefined) timer = setTimeout(save, SAVE_DELAY_MS);
    });
    const saver: Saver = {
      stop() {
        unsubscribe();
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        savers.delete(saver);
      },
      flush() {
        if (timer === undefined) return;
        clearTimeout(timer);
        save();
      },
    };
    savers.add(saver);
    return saver;
  };

  return { restore, start };
}

// ---- o balde público -----------------------------------------------------------
const pubBucket = createBucket('pub', PUB_KEY, 'pub');
export async function restorePublic(): Promise<void> {
  await pubBucket.restore();
  pubBucket.start();
}

// ---- o balde da pessoa ---------------------------------------------------------
// Um balde por vez (o de quem está logado). Ler e gravar usam o MESMO objeto:
// ele lembra o que já está no aparelho e não regrava o que acabou de ler.
let userBucket: { uid: string; bucket: ReturnType<typeof createBucket> } | null = null;
let userSaver: Saver | null = null;
const bucketFor = (uid: string) => {
  if (userBucket?.uid !== uid) userBucket = { uid, bucket: createBucket('user', uid, uid) };
  return userBucket.bucket;
};

// Para de gravar o balde da pessoa (o que estava pendente é descartado).
export function stopUserPersist(): void {
  userSaver?.stop();
  userSaver = null;
  userBucket = null;
}

// Apaga do aparelho os baldes pessoais, menos o de `keep` (null = todos).
export const forgetOtherUsers = (keep: string | null): Promise<void> => kvKeepOnly('user', keep);

export async function restoreUser(uid: string): Promise<void> {
  await bucketFor(uid).restore();
}

export function startUserPersist(uid: string): void {
  userSaver?.stop();
  userSaver = bucketFor(uid).start();
}

// Aba escondida ou página saindo: grava já o que estava esperando.
if (typeof document !== 'undefined') {
  const flushAll = () => savers.forEach((saver) => saver.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', flushAll);
}
