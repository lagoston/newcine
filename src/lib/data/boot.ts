// A casca do app numa ida só (19/11/2026, Protocolo Reborn, onda 2b).
//
// Ao abrir logado o app pedia a "casca" em rajada: premium, vitalício, diretor,
// sussurros não lidos, evento sazonal, OVNI do Jackpot e o próprio perfil — 7
// pedidos (e os preflights deles), cada um numa conexão do banco. A RPC
// get_app_bootstrap (migração 20261118180500) devolve todas as partes de uma
// vez; parts.<nome> é EXATAMENTE o que a RPC original devolveria.
//
// Como as telas usam:
//   • quem abre o app chama startBoot(uid, partes) UMA vez (lib/appBoot.ts);
//   • cada consumidor, na SUA busca de sempre, tenta primeiro
//     takeBootPart(uid, 'parte'). Veio? usa. Não veio (não há ida recente, a
//     ida falhou, a parte veio com erro, outro já usou)? cai na RPC original,
//     como antes. Nenhuma tela depende do bootstrap para funcionar.
//
// Três regras que evitam dado velho ou em dobro:
//   1. CADA PARTE SERVE UMA VEZ. Quem pede de novo depois (recarregar, voltar
//      para o app, um aviso do barramento) vai à RPC original e recebe dado novo.
//   2. A IDA TEM VALIDADE (30 s desde a saída). Depois disso ninguém a usa.
//   3. É DA PESSOA QUE PEDIU. A ida guarda o id; trocar de conta descarta tudo.
//
// O que já está guardado e dentro do prazo (ex.: o perfil que voltou do
// aparelho) não refaz a busca, então não "puxaria" a parte: para esses, quem
// guarda registra um semeador (onBootPart) e a resposta mais nova entra direto.
//
// Este arquivo NÃO importa lib/auth.tsx (o auth.tsx é quem dá a partida).
import { supabase } from '../supabase';
import { getScope, subscribeScope, whenUserReady } from './scope';

export type BootPart =
  | 'premium'
  | 'lifetime'
  | 'director'
  | 'unread'
  | 'seasonal'
  | 'ufo'
  | 'profile'
  | 'jackpot'
  | 'poker'
  | 'poker_friends'
  | 'persona_world'
  | 'feed'
  | 'trailer'
  | 'tag_progress'
  | 'for_you_movie'
  | 'for_you_tv';

// As sete da casca (o que a RPC devolve sem parâmetros).
export const SHELL_PARTS: BootPart[] = ['premium', 'lifetime', 'director', 'unread', 'seasonal', 'ufo', 'profile'];

interface BootReply {
  parts?: Record<string, unknown>;
  errors?: Record<string, unknown>;
}

interface BootRun {
  uid: string;
  // 'shell' = a casca; 'home' = as pesadas da primeira tela
  group: string;
  startedAt: number;
  arrivedAt: number | null;
  parts: Set<BootPart>;
  taken: Set<BootPart>;
  reply: Promise<BootReply | null>;
}

// Uma ida só vale por este tempo desde que saiu (rede muito lenta: desiste dela)…
const MAX_AGE_MS = 30_000;
// …e, depois que a resposta chegou, uma parte ainda sem uso só serve por este tempo.
const USE_WITHIN_MS = 10_000;
// Duas partidas do mesmo grupo neste intervalo são a mesma (o login avisa duas
// vezes ao abrir: a sessão lida e o aviso "INITIAL_SESSION").
const SAME_START_MS = 5_000;
let runs: BootRun[] = [];
type Seeder = (uid: string, value: unknown, at: number) => boolean;
const seeders = new Map<BootPart, Seeder>();

const alive = (run: BootRun, uid: string) => run.uid === uid && Date.now() - run.startedAt < MAX_AGE_MS;

// Trocou de pessoa (ou saiu): o que estava a caminho não é de mais ninguém.
subscribeScope(() => {
  const uid = getScope().uid;
  if (uid === undefined) return;
  runs = runs.filter((run) => run.uid === uid);
});

const usable = (reply: BootReply | null, part: BootPart): reply is BootReply & { parts: Record<string, unknown> } =>
  !!reply?.parts && part in reply.parts && !(reply.errors && part in reply.errors);

// O que já está guardado e fresco não refaz a busca; a resposta mais nova da
// ida entra por aqui (só nas consultas que já existem na memória).
async function seed(run: BootRun): Promise<void> {
  const reply = await run.reply;
  if (!reply || run.arrivedAt === null) return;
  await whenUserReady(run.uid);
  if (getScope().uid !== run.uid) return;
  seeders.forEach((apply, part) => {
    if (!run.parts.has(part) || run.taken.has(part) || !usable(reply, part)) return;
    try {
      if (apply(run.uid, reply.parts[part], run.arrivedAt as number)) run.taken.add(part);
    } catch {
      // um semeador com defeito não atrapalha os outros
    }
  });
}

// Dá a partida numa ida. Se já há uma do mesmo grupo para esta pessoa — que
// acabou de sair, ou que ainda não foi usada por ninguém — ela serve e não sai
// outra: é o caso da partida adiantada feita pelo login e, pouco depois, da
// tela que montou.
export function startBoot(uid: string, group: string, parts: BootPart[], args: Record<string, unknown> = {}): void {
  if (parts.length === 0) return;
  runs = runs.filter((run) => alive(run, uid));
  if (runs.some((run) => run.group === group && (run.taken.size === 0 || Date.now() - run.startedAt < SAME_START_MS))) return;
  const run: BootRun = { uid, group, startedAt: Date.now(), arrivedAt: null, parts: new Set(parts), taken: new Set(), reply: Promise.resolve(null) };
  run.reply = (async (): Promise<BootReply | null> => {
    try {
      const { data, error } = await supabase.rpc('get_app_bootstrap', { p_parts: parts, p_args: args });
      if (error || !data || typeof data !== 'object') return null;
      const reply = data as BootReply & { user_id?: string | null };
      // resposta de outra sessão (trocou de conta no meio): ninguém usa
      if (reply.user_id !== uid || !reply.parts || typeof reply.parts !== 'object') return null;
      run.arrivedAt = Date.now();
      return reply;
    } catch {
      return null;
    }
  })();
  runs.push(run);
  void seed(run);
}

// Quem guarda uma parte na camada de dados diz como a resposta do bootstrap
// vira o dado guardado. Devolve true se usou (a parte não serve mais a ninguém).
export function onBootPart(part: BootPart, apply: Seeder): void {
  seeders.set(part, apply);
}

export interface BootValue<T> {
  value: T;
  // quando a resposta chegou (para dado que envelhece em segundos, como o OVNI)
  at: number;
}

// A parte do bootstrap para este consumidor, ou null (aí ele usa a RPC
// original). Espera a ida que estiver a caminho. `maxAgeMs`: não aceitar
// resposta que chegou há mais tempo que isso.
export async function takeBootPart<T>(uid: string | null | undefined, part: BootPart, maxAgeMs = USE_WITHIN_MS): Promise<BootValue<T> | null> {
  if (!uid) return null;
  const run = runs.find((candidate) => alive(candidate, uid) && candidate.parts.has(part) && !candidate.taken.has(part));
  if (!run) return null;
  // marcada já: dois consumidores ao mesmo tempo não usam a mesma resposta
  run.taken.add(part);
  const reply = await run.reply;
  if (!usable(reply, part) || run.arrivedAt === null) return null;
  if (Date.now() - run.arrivedAt > maxAgeMs) return null;
  // a pessoa mudou enquanto a resposta vinha
  const now = getScope().uid;
  if (now !== undefined && now !== uid) return null;
  return { value: reply.parts[part] as T, at: run.arrivedAt };
}
