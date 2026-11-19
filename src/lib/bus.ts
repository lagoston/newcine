// O barramento de eventos do app (18/11/2026, Protocolo Reborn).
//
// É a "nova maneira dos modais conversarem" que o Bruno pediu ("Mais do que
// achar apenas gargalos, talvez novas maneiras dos modais conversarem entre
// si"). Quem muda algo AVISA, com um evento de nome e tipo fixos; quem depende
// daquilo ESCUTA e se atualiza. O menu do título não precisa conhecer a Home,
// o Perfil nem o Jackpot: ele emite 'title:rated' e cada tela cuida de si.
// Isso substitui:
//   • os eventos soltos de window ('episodeToggled', 'cineoracle:jackpot-chips',
//     'cineoracle:posters-changed', 'cineoracle:seasonal-refresh'), sem tipo,
//     em que um erro de digitação passava calado;
//   • as "recargas por garantia" ao fechar o menu do título (Home, Persona,
//     Acervo recarregavam tudo sem saber se algo mudou).
// A camada de dados (src/lib/data/) escuta estes mesmos eventos para invalidar
// o que estiver guardado (auditoria: claude/otimizacao/modais.md, seção C, e
// claude/otimizacao/rede.md, seção 4.2).
//
// Convivência: cada evento que tem um nome antigo continua saindo na window
// (quem ainda escuta do jeito antigo recebe) e o que o código antigo ainda
// dispara na window chega aos ouvintes daqui. Dá para migrar um por vez.
import { useEffect, useRef } from 'react';

export type MediaType = 'movie' | 'tv';

export type BusEvents = {
  // a pessoa deu, mudou ou tirou a nota de um título (null = saiu da biblioteca)
  'title:rated': { id: number; mediaType: MediaType; rating: number | null };
  // entrou ou saiu da Watchlist
  'title:watchlist': { id: number; mediaType: MediaType; on: boolean };
  // marcou ou desmarcou episódio de uma série
  'title:episodes': { id: number };
  // o próprio perfil mudou (nome, avatar, tag, moldura, banner…)
  'profile:updated': Record<string, never>;
  // amizade feita ou desfeita
  'friendship:changed': Record<string, never>;
  // o saldo de fichas do Jackpot mudou (ficha voadora, giro, missão, presente)
  'jackpot:chips': { tickets?: number };
  // a coleção de pôsteres mudou (giro, troca, contrato, pôquer)
  'posters:changed': Record<string, never>;
  // o evento sazonal precisa ser lido de novo (avaliações que contam para ele)
  'seasonal:stale': Record<string, never>;
  // 19/11/2026 (onda 3): a biblioteca mudou em lote (importação, "apagar
  // tudo"). Um aviso só, no lugar de um 'title:rated' por título.
  'library:bulk': Record<string, never>;
  // 19/11/2026 (onda 3): chegou um sussurro novo para a pessoa logada. Quem
  // emite é o canal ao vivo (src/lib/userChannel.ts), a partir do aviso do
  // banco; `type` é o tipo do sussurro (poker_invite, friend_request…).
  'whispers:new': { type?: string };
};
export type BusEvent = keyof BusEvents;

// Os nomes antigos (window) de cada evento, para a convivência.
const LEGACY: Partial<Record<BusEvent, string>> = {
  'title:episodes': 'episodeToggled',
  'jackpot:chips': 'cineoracle:jackpot-chips',
  'posters:changed': 'cineoracle:posters-changed',
  'seasonal:stale': 'cineoracle:seasonal-refresh',
};

type Handler<E extends BusEvent> = (payload: BusEvents[E]) => void;
const handlers = new Map<BusEvent, Set<Handler<BusEvent>>>();
// Enquanto o próprio barramento repete um evento na window, a ponte não o
// devolve aos ouvintes (senão cada ouvinte receberia duas vezes).
let echoing = false;

export function emit<E extends BusEvent>(event: E, payload: BusEvents[E]): void {
  handlers.get(event)?.forEach((handler) => {
    try {
      handler(payload);
    } catch (error) {
      // um ouvinte com defeito não impede os outros
      console.error(`bus ${event}:`, error);
    }
  });
  const legacy = LEGACY[event];
  if (legacy && typeof window !== 'undefined') {
    echoing = true;
    try {
      window.dispatchEvent(new CustomEvent(legacy, { detail: payload }));
    } finally {
      echoing = false;
    }
  }
}

export function on<E extends BusEvent>(event: E, handler: Handler<E>): () => void {
  const set = handlers.get(event) ?? new Set<Handler<BusEvent>>();
  set.add(handler as Handler<BusEvent>);
  handlers.set(event, set);
  // o que o código antigo ainda dispara na window também chega
  const legacy = LEGACY[event];
  const bridge = (e: Event) => {
    if (!echoing) handler(((e as CustomEvent).detail ?? {}) as BusEvents[E]);
  };
  if (legacy && typeof window !== 'undefined') window.addEventListener(legacy, bridge);
  return () => {
    set.delete(handler as Handler<BusEvent>);
    if (legacy && typeof window !== 'undefined') window.removeEventListener(legacy, bridge);
  };
}

// Escuta enquanto o componente estiver montado. O handler pode mudar a cada
// render sem reinscrever (fica numa ref).
export function useBus<E extends BusEvent>(event: E, handler: Handler<E>): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on(event, (payload) => ref.current(payload)), [event]);
}
