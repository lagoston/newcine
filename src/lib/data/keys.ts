// As chaves e os prazos da camada de dados (18/11/2026, Protocolo Reborn, onda 2a).
//
// É a tabela 4.1 do relatório de rede (claude/otimizacao/rede.md) escrita em
// código: cada consulta guardada tem UMA chave, UM prazo de validade e a regra
// de ir ou não para o aparelho. Antes eram uns 12 caches feitos à mão, cada um
// com o seu Map, o seu prazo e a sua invalidação (achado A12).
//
// De quem é o dado (owner):
//   • 'pub'      → público, igual para todo mundo (listas do TMDB): balde público;
//   • id da pessoa → dado de quem está logado: a chave LEVA o id e o balde no
//     aparelho é só dela (trocar de conta nunca mostra dado de outra pessoa);
//   • null       → visitante (sem conta): a consulta pessoal fica desligada;
//   • undefined  → o login ainda está carregando: espera.
//
// Para criar uma consulta nova: acrescente uma linha aqui e, se algum evento
// deve refazê-la, uma linha no mapa de events.ts. Só marque persist: true para
// dado da própria pessoa ou público — nunca resposta com dados de terceiros
// (amigos, perfis de outras pessoas, sussurros, mensagens).

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

// Quanto tempo um dado guardado no aparelho ainda serve para "mostrar na hora
// e atualizar por trás". Mais velho que isso, é descartado ao abrir.
export const PERSIST_MAX_AGE = 24 * HOUR;
// Versão do formato guardado no aparelho. MUDE este texto quando o formato da
// resposta de uma consulta persistida mudar: o que estiver guardado com a
// versão antiga é jogado fora ao abrir.
export const PERSIST_VERSION = 'reborn2a-1';

export type Owner = 'pub' | string | null | undefined;
export type QueryKey = readonly unknown[];

export interface QuerySpec {
  key: QueryKey;
  owner: Owner;
  // por quanto tempo a resposta vale sem pedir de novo (ms); função quando
  // depende do que veio (ex.: resposta vazia não vale nada)
  staleTime: number | ((data: unknown) => number);
  // por quanto tempo fica na memória sem ninguém usando (ms)
  gcTime: number;
  // vai para o aparelho (IndexedDB)?
  persist: boolean;
  // conferência extra ao reabrir o app (ver RESTORE_GUARDS)
  guard?: string;
}

function spec(owner: Owner, key: QueryKey, staleTime: QuerySpec['staleTime'], persist = false, guard?: string): QuerySpec {
  const longest = typeof staleTime === 'number' ? staleTime : HOUR;
  return {
    key,
    owner,
    staleTime,
    // o que vai para o aparelho fica na memória o dia todo (senão sairia do
    // aparelho junto, 5 min depois de a tela fechar); o resto, pelo menos o prazo
    gcTime: persist ? PERSIST_MAX_AGE : Math.max(5 * MIN, longest),
    // só dado público ou de quem está logado vai para o aparelho
    persist: persist && (owner === 'pub' || typeof owner === 'string'),
    guard,
  };
}

// uid = quem está logado (useOwner() nos hooks; ownerNow() fora deles).
export const Q = {
  // ---- a casca -------------------------------------------------------------
  // (get_app_bootstrap, a casca numa ida só, NÃO é uma consulta guardada: cada
  // parte dela entra na consulta do seu consumidor — ver boot.ts)
  // o próprio perfil: UMA leitura para a casca inteira (eram 14 numa sessão de 6 telas)
  myProfile: (uid: Owner) => spec(uid, ['me', 'profile', uid], 10 * MIN, true),
  // (premium e vitalício NÃO são consulta guardada: quem decide o que é pago é
  // sempre o servidor, na hora — lib/auth.tsx lê da ida da casca, ou das RPCs)
  // ids dos amigos. Só na memória: é dado de terceiros
  myFriendIds: (uid: Owner) => spec(uid, ['me', 'friendIds', uid], 5 * MIN),
  // o evento sazonal com o progresso da pessoa (visitante: o evento sem progresso)
  seasonal: (uid: Owner, preview: string | null) =>
    typeof uid === 'string'
      ? spec(uid, ['seasonal', uid, preview], 5 * MIN, preview === null, 'seasonal')
      : spec(uid === null ? 'pub' : undefined, ['seasonal', 'visitante'], 5 * MIN),

  // ---- listas públicas ------------------------------------------------------
  // Popular agora, Em breve, Melhores do ano (o servidor guarda por 6 a 12 h)
  tmdbList: (name: string, lang: string) => spec('pub', ['tmdb', 'list', name, lang], 3 * HOUR, true),

  // ---- Poster Jackpot -------------------------------------------------------
  // O catálogo depende de a roleta estar liberada para a conta (o banco devolve
  // [] para quem não tem): é guardado por pessoa, e lista vazia não vale nada.
  jackpotCatalog: (uid: Owner) =>
    spec(uid, ['jackpot', 'catalog', uid], (data) => (Array.isArray(data) && data.length > 0 ? HOUR : 0), true),
  // fichas, missões, ficha do dia: muda toda hora, não vai para o aparelho
  jackpotState: (uid: Owner) => spec(uid, ['jackpot', 'state', uid], 1 * MIN),

  // ---- reservadas para a 2b (as telas) — mesmas chaves da tabela 4.1 --------
  titleCard: (type: 'movie' | 'tv', id: number, lang: string) => spec('pub', ['title', 'card', type, id, lang], 24 * HOUR),
  titleFull: (type: 'movie' | 'tv', id: number, lang: string) => spec('pub', ['title', 'full', type, id, lang], 30 * MIN),
  // "Eu e este título" (get_title_me, onda 3): na biblioteca?, minha nota,
  // episódios vistos, prateleiras, comentários dos oráculos e a previsão.
  // Visitante: só o que é do título (prateleiras e comentários), sem pessoa.
  titleMe: (uid: Owner, type: 'movie' | 'tv', id: number) =>
    typeof uid === 'string'
      ? spec(uid, ['title', 'me', type, id, uid], 2 * MIN)
      : spec(uid === null ? 'pub' : undefined, ['title', 'me', type, id, 'visitante'], 2 * MIN),
  // As bolhas de quem já viu (get_title_social, onda 3). Dado de terceiros: só na memória.
  titleSocial: (uid: Owner, type: 'movie' | 'tv', id: number) => spec(uid, ['title', 'social', type, id, uid], 2 * MIN),
  libraryRows: (uid: Owner) => spec(uid, ['library', 'rows', uid], 2 * MIN, true),
  // números e estúdio de um perfil: só os da própria pessoa vão para o aparelho
  // (get_profile_stats_v2, onda 3. Uma resposta "plano B" — null — não fica
  // valendo. Visitante vê o perfil público: guardado como dado público, só na memória.)
  profileStats: (uid: Owner, of: string) =>
    typeof uid === 'string'
      ? spec(uid, ['profile', 'stats', of, uid], (data) => (data ? 5 * MIN : 0), of === uid)
      : spec(uid === null ? 'pub' : undefined, ['profile', 'stats', of, 'visitante'], (data) => (data ? 5 * MIN : 0)),
  personaWorld: (uid: Owner, of: string) => spec(uid, ['persona', 'world', of, uid], 10 * MIN, of === uid),
  feed: (uid: Owner) => spec(uid, ['feed', uid], 1 * MIN),
};

// Conferência ao reabrir o app: um dado guardado que não faz mais sentido não
// volta para a tela (a consulta roda como se nada estivesse guardado).
export const RESTORE_GUARDS: Record<string, (data: unknown) => boolean> = {
  // um evento que já acabou não reaparece por um instante na abertura
  seasonal: (data) => {
    if (data === null) return true;
    const event = data as { ends_at?: string; is_preview?: boolean };
    if (event.is_preview) return true;
    const end = event.ends_at ? Date.parse(event.ends_at) : NaN;
    return Number.isFinite(end) && end > Date.now();
  },
};

// O que vai junto com a consulta (e com a cópia guardada no aparelho).
export interface SpecMeta extends Record<string, unknown> {
  owner: 'pub' | string;
  persist: boolean;
  guard?: string;
}
export const metaOf = (s: QuerySpec): SpecMeta => ({
  owner: s.owner === 'pub' ? 'pub' : String(s.owner),
  persist: s.persist,
  ...(s.guard ? { guard: s.guard } : {}),
});
