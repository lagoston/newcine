// Ler pela camada de dados FORA de componente (18/11/2026, Protocolo Reborn, onda 2a).
//
//   fetchCached(linha, busca) devolve uma Promise, como os serviços de src/lib
//   já faziam, só que passando pelo guarda-respostas: pedidos iguais ao mesmo
//   tempo viram um, e dentro do prazo da linha a resposta guardada serve.
//
// Dado pessoal só é guardado se o dono da linha for quem está logado AGORA;
// senão a busca roda direto, sem guardar nada (nunca se guarda uma resposta
// sob a pessoa errada).
//
// Este arquivo NÃO importa lib/auth.tsx de propósito: na 2b o próprio auth.tsx
// vai ler o premium por aqui (import de './data/fetch', não do index).
import { isFreshCached, optionsOf, peekCached, putCached, queryClient } from './client';
import type { QuerySpec } from './keys';
import { getScope, whenPubReady, whenUserReady } from './scope';
import { startDataSession } from './session';
import { startDataEvents } from './events';

// A partida, uma vez: ler o balde público do aparelho e escutar o barramento.
startDataSession();
startDataEvents();

export async function fetchCached<T>(spec: QuerySpec, fetcher: () => Promise<T>): Promise<T> {
  if (spec.owner === 'pub') {
    await whenPubReady();
  } else {
    // visitante, login ainda carregando, ou linha de outra pessoa: direto, sem guardar
    if (typeof spec.owner !== 'string' || getScope().uid !== spec.owner) return fetcher();
    await whenUserReady(spec.owner);
    if (getScope().uid !== spec.owner) return fetcher();
  }
  return queryClient.fetchQuery<T>(optionsOf(spec, fetcher));
}

// 20/11/2026 (peça final do Reborn): MUITAS respostas do mesmo tipo de uma vez,
// cada uma na sua chave. Nasceu para a lista do Perfil, que precisa de uma
// linha do catálogo por título da biblioteca e baixava todas a CADA visita
// (952 kB medidos na maior biblioteca, 270 títulos).
//
//   • o que está guardado e dentro do prazo serve, sem rede;
//   • só o que falta é pedido, num lote só: `loadMissing` recebe os itens que
//     faltam e devolve as respostas NA MESMA ORDEM (undefined = não existe: não
//     é guardado, e na próxima vez é pedido de novo);
//   • cada resposta fica na chave do seu item, com o prazo da linha.
//
// Resultado: voltar à tela não baixa nada; um item novo baixa só o dele.
// Vale a regra do fetchCached: dado pessoal só é lido ou guardado se o dono da
// linha for quem está logado AGORA (conferido de novo quando o lote chega: a
// pessoa pode ter saído no meio).
export async function fetchManyCached<I, T>(
  items: I[],
  specOf: (item: I) => QuerySpec,
  loadMissing: (missing: I[]) => Promise<(T | undefined)[]>,
): Promise<(T | undefined)[]> {
  const specs = items.map(specOf);
  if (specs.some((spec) => spec.owner === 'pub')) await whenPubReady();
  const mine = (spec: QuerySpec) => spec.owner === 'pub' || (typeof spec.owner === 'string' && getScope().uid === spec.owner);
  const out = new Array<T | undefined>(items.length).fill(undefined);
  const missing: number[] = [];
  specs.forEach((spec, index) => {
    const hit = mine(spec) && isFreshCached(spec) ? peekCached<T>(spec) : undefined;
    if (hit === undefined) missing.push(index);
    else out[index] = hit;
  });
  if (missing.length === 0) return out;
  const loaded = await loadMissing(missing.map((index) => items[index]));
  const at = Date.now();
  missing.forEach((index, position) => {
    const value = loaded[position];
    out[index] = value;
    if (value !== undefined && mine(specs[index])) putCached(specs[index], value, at);
  });
  return out;
}
