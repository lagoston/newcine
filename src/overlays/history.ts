// O histórico das camadas (18/11/2026, Protocolo Reborn, onda 2a).
//
// Cada camada aberta é uma entrada do histórico do navegador: o voltar fecha a
// de cima em vez de trocar de página com tudo aberto (antes só o Acervo fazia
// isso). O endereço não muda nesta onda (os links `?o=` são da 2b).
//
// Como funciona:
//   • as entradas das camadas são cópias da entrada da página (o mesmo state
//     do React Router: usr, key, idx) com uma marca a mais, `ovl: { g, o }`:
//     `g` é o grupo (a página de onde as camadas saíram) e `o` é a altura
//     (0 = a página, 1 = a primeira camada…);
//   • ABRIR grava a entrada na hora (history.pushState), ainda dentro do toque
//     de quem abriu;
//   • o VOLTAR chega como popstate numa entrada do mesmo grupo e mais baixa:
//     a camada de cima fecha e o roteador nem fica sabendo (a página de baixo
//     não é desenhada de novo);
//   • FECHAR pela tela (X, Esc, toque fora) deixa a entrada sobrando por um
//     instante e uma faxina tira (history.back()), um passo por vez e
//     conferindo onde caiu. Se nesse meio-tempo o app trocou de página
//     (fechar a gaveta e navegar em seguida), o passo cairia na página antiga:
//     o host percebe e leva o navegador de volta à entrada do roteador, em vez
//     de derrubar a navegação (medido: 16 rodadas de 0 a 50 ms, todas certas).
//
// O que NÃO é daqui: o Acervo tem a pilha dele (oracleAcervo/layerStack.ts),
// com o próprio pushState/popstate. As duas convivem: uma entrada do Acervo
// copia a nossa marca com a mesma altura, então um popstate que não muda a
// altura é dele e passa direto.
//
// No app Android o voltar não usa o histórico para fechar camada (o
// lib/nativeShell.ts manda um Esc), então lá isto fica desligado: é uma peça a
// menos num lugar onde uma correção só chega com APK novo.
import { IS_NATIVE_APP } from '../lib/platform';
import * as stack from './stack';

// Para desligar sem publicar de novo (as camadas continuam com z, Esc, trava e
// tela coberta; o voltar do navegador volta a trocar de página): no console,
// localStorage.setItem('cineoracle:overlay-history', 'off') e recarregar.
const switchedOff = (): boolean => {
  try {
    return window.localStorage.getItem('cineoracle:overlay-history') === 'off';
  } catch {
    return false;
  }
};
export const HISTORY_ENABLED = !IS_NATIVE_APP && typeof window !== 'undefined' && !switchedOff();

const KEY = 'ovl';
type Ovl = { g: string; o: number };
type State = Record<string, unknown> | null;
export type RouterLocation = { key: string; state: unknown; href: string };
export type RouterMove = 'INIT' | 'PUSH' | 'REPLACE' | 'POP';

type Pending =
  // a faxina deu um history.back() e espera cair uma altura abaixo
  | { kind: 'clean'; g: string; from: number; json: string; href: string; moves: number; timer: number }
  // o host deu um history.forward() (desfazendo um passo) e espera cair de volta
  | { kind: 'redo'; timer: number }
  // o host está avançando até a entrada em que o roteador está (ver seek)
  | { kind: 'seek'; key: string; left: number; timer: number };

let attached = false;
// Onde achamos que estamos: o grupo e a altura da entrada atual.
let group: string | null = null;
let offset = 0;
let pending: Pending | null = null;
let cleanTimer = 0;
let settleTimer = 0;
// A localização que o roteador tem na memória (vem do OverlayProvider), o
// tipo da última mudança dele e quantas já houve.
let router: RouterLocation | null = null;
let routerMove: RouterMove = 'INIT';
let routerMoves = 0;
// quando a faxina deu o último passo, e quantos seguidos não chegaram
let cleanedAt = 0;
let failures = 0;

const read = (): State => {
  try {
    return (window.history.state as State) ?? null;
  } catch {
    return null;
  }
};
const ovlOf = (state: State): Ovl | null => {
  const value = state?.[KEY] as Partial<Ovl> | undefined;
  return value && typeof value.g === 'string' && typeof value.o === 'number' && value.o >= 0 ? { g: value.g, o: value.o } : null;
};
// O Safari recusa mais de 100 gravações em 30 s; uma recusa não pode derrubar a tela.
const write = (mode: 'push' | 'replace', state: Record<string, unknown>, url?: string): boolean => {
  try {
    if (mode === 'push') window.history.pushState(state, '', url);
    else window.history.replaceState(state, '', url);
    return true;
  } catch {
    return false;
  }
};
// a chave que o roteador dá a cada entrada ('default' na primeira da aba)
const keyOf = (state: State): string => (typeof state?.key === 'string' ? state.key : 'default');
const jsonOf = (state: State): string => {
  try {
    return JSON.stringify(state);
  } catch {
    return '';
  }
};
let groupSeq = 0;
const newGroup = () => `g${Date.now().toString(36)}${(groupSeq++).toString(36)}`;
const adopt = (ovl: Ovl | null) => {
  group = ovl?.g ?? null;
  offset = ovl?.o ?? 0;
};
const settle = (next: Pending | null) => {
  if (pending) window.clearTimeout(pending.timer);
  pending = next;
};

// ------------------------------------------------------------------ endereço

// O endereço da camada de cima (`?o=title.movie.27205`), gravado na entrada do
// histórico DELA: quando a camada fecha a entrada sai e o endereço vai junto.
// O roteador não fica sabendo (para ele a página é a mesma). null = sem endereço.
const ADDRESS = 'o';
export function setAddress(address: string | null): void {
  if (!attached || pending) return;
  const state = read();
  const ovl = ovlOf(state);
  // só numa entrada de camada; a entrada da página nunca leva endereço
  if (!ovl || ovl.o < 1) return;
  const url = new URL(window.location.href);
  if ((url.searchParams.get(ADDRESS) ?? null) === address) return;
  if (address) url.searchParams.set(ADDRESS, address);
  else url.searchParams.delete(ADDRESS);
  write('replace', state ?? {}, url.pathname + url.search + url.hash);
}

// ------------------------------------------------------------------ abrir

// Uma camada entrou: o histórico ganha as entradas que faltam (uma por
// camada). Reaproveita a entrada que sobrou de uma camada que acabou de fechar
// (trocar uma gaveta por outra não mexe no histórico).
function grow(): void {
  if (!attached || pending) return;
  const want = stack.depth();
  let state = read();
  let ovl = ovlOf(state);
  if (!ovl && want > 0) {
    // a página vira a base do grupo
    ovl = { g: newGroup(), o: 0 };
    if (!write('replace', { ...(state ?? {}), [KEY]: ovl })) return;
    state = read();
  }
  if (ovl) {
    // a entrada reaproveitada era de outra camada: o endereço dela não vale mais
    if (ovl.o >= want && want > 0) setAddress(null);
    for (let o = ovl.o + 1; o <= want; o++) {
      if (!write('push', { ...(state ?? {}), [KEY]: { g: ovl.g, o } })) break;
    }
  }
  adopt(ovlOf(read()));
}

// ------------------------------------------------------------------ fechar pela tela

function scheduleClean(): void {
  if (!attached) return;
  window.clearTimeout(cleanTimer);
  // Na tarefa seguinte: a rolagem ainda não andou (a entrada de baixo guarda a
  // rolagem de quando a camada abriu) e quem fecha e troca de página no mesmo
  // toque já trocou.
  // eslint-disable-next-line no-use-before-define -- clean, giveUp e settleSoon se chamam em roda
  cleanTimer = window.setTimeout(clean, 0);
}

// Depois de uma chegada (voltar de outra página, avançar, troca de página com
// uma camada global aberta): acerta o histórico com a pilha.
function settleSoon(): void {
  if (!attached) return;
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    if (pending) return;
    adopt(ovlOf(read()));
    if (stack.depth() > offset) grow();
    else if (offset > stack.depth()) scheduleClean();
  }, 80);
}

// O passo pedido não chegou (não havia para onde ir): desiste e confere o que
// há. Tenta mais uma vez só; depois espera a próxima camada ou troca de página
// (uma entrada sobrando custa um toque a mais no voltar, nada além disso).
function giveUp(): void {
  pending = null;
  adopt(ovlOf(read()));
  failures += 1;
  if (failures < 2) settleSoon();
}

// Tira UMA entrada que sobrou (camada fechada pela tela) e confere onde caiu
// antes de tirar a próxima.
function clean(): void {
  if (!attached || pending) return;
  const state = read();
  const ovl = ovlOf(state);
  if (!ovl || ovl.o <= stack.depth()) return;
  pending = { kind: 'clean', g: ovl.g, from: ovl.o, json: jsonOf(state), href: window.location.href, moves: routerMoves, timer: window.setTimeout(giveUp, 1000) };
  cleanedAt = Date.now();
  window.history.back();
}

// O app trocou de página (navigate) com um passo da faxina a caminho, e o
// passo caiu numa entrada de trás: o roteador mostra a página nova e o
// navegador ficou na antiga. A entrada nova está logo adiante (por cima da
// que a faxina tirou): avança até a entrada com a chave do roteador.
function seek(key: string): void {
  settle({ kind: 'seek', key, left: 3, timer: window.setTimeout(giveUp, 1000) });
  window.history.forward();
}

// Uma entrada do nosso grupo com a localização antiga do roteador (ele trocou
// a de cima com `replace` enquanto a camada estava aberta: limpar o
// location.state de { openJackpot }, um filtro na URL). Ao cair nela, recebe a
// localização atual; senão fechar a camada desfaria a troca.
function repair(state: State): void {
  if (!router || !state || keyOf(state) === router.key) return;
  write('replace', { ...state, usr: router.state, key: router.key }, router.href);
}

// ------------------------------------------------------------------ voltar e avançar

// Fase de captura e registrado antes do roteador: o que é só de camada para
// aqui (stopImmediatePropagation) e a página de baixo não é desenhada de novo.
function onPop(event: PopStateEvent): void {
  const state = read();
  const ovl = ovlOf(state);

  if (pending?.kind === 'redo') {
    event.stopImmediatePropagation();
    settle(null);
    adopt(ovl);
    settleSoon();
    return;
  }
  if (pending?.kind === 'seek') {
    const step = pending;
    event.stopImmediatePropagation();
    if (keyOf(state) === step.key) {
      // chegou na entrada do roteador
      settle(null);
      adopt(ovl);
      settleSoon();
    } else if (step.left > 0) {
      settle({ ...step, left: step.left - 1, timer: window.setTimeout(giveUp, 1000) });
      window.history.forward();
    } else {
      settle(null);
      adopt(ovl);
    }
    return;
  }
  if (pending?.kind === 'clean') {
    const step = pending;
    if (ovl && ovl.g === step.g && ovl.o === step.from - 1) {
      // caiu onde devia: uma entrada a menos
      event.stopImmediatePropagation();
      settle(null);
      failures = 0;
      adopt(ovl);
      if (router && routerMoves !== step.moves && routerMove === 'PUSH' && keyOf(state) !== router.key) {
        // …mas o app trocou de página com o passo a caminho (o Chrome resolve
        // o voltar pela entrada de quando ele foi pedido): a página nova está adiante
        seek(router.key);
        return;
      }
      repair(state);
      if (stack.depth() > offset) grow();
      else if (offset > stack.depth()) scheduleClean();
      return;
    }
    if (step.json && jsonOf(state) === step.json && window.location.href === step.href) {
      // caiu na própria entrada de onde saiu: o app trocou de página enquanto
      // o passo estava a caminho (a entrada nova ficou por cima). Desfaz o
      // passo e o roteador continua onde está.
      event.stopImmediatePropagation();
      settle({ kind: 'redo', timer: window.setTimeout(giveUp, 1000) });
      window.history.forward();
      return;
    }
    // um voltar de outra pilha (o Acervo) chegou antes: é dele, o nosso ainda vem
    if (ovl && ovl.g === step.g && ovl.o === step.from) return;
    settle(null);
  }

  const wasGroup = group;
  const wasOffset = offset;
  adopt(ovl);
  if (ovl && ovl.g === wasGroup && ovl.o !== wasOffset) {
    repair(state);
    if (ovl.o < wasOffset && stack.depth() > 0) {
      // o voltar com camada aberta: fecha a de cima e mais nada
      event.stopImmediatePropagation();
      const before = Math.min(stack.depth(), wasOffset);
      stack.requestDismiss();
      // Quem continua aberto precisa da entrada de volta: a camada que só
      // fechou uma parte dela, ou a de baixo de um diálogo antigo que fechou
      // no lugar. Avançar (em vez de gravar outra) mantém a entrada criada no
      // toque de quem abriu — a que o navegador respeita no botão voltar.
      const keep = Math.min(stack.depth(), before);
      if (keep > offset) {
        settle({ kind: 'redo', timer: window.setTimeout(giveUp, 1000) });
        window.history.go(keep - offset);
      } else if (offset > stack.depth()) {
        scheduleClean();
      }
      return;
    }
    // entrada que sobrou de uma camada já fechada, ou o "avançar": nada a
    // fechar. Passa adiante (o roteador vê a mesma página; o Acervo vê o voltar dele).
    settleSoon();
    return;
  }
  // outra pilha tirou a entrada dela, ou a página mudou de verdade
  if (ovl) settleSoon();
}

// ------------------------------------------------------------------ roteador

// O OverlayProvider avisa a cada mudança de localização do roteador.
export function routerMoved(location: RouterLocation, move: RouterMove): void {
  router = location;
  routerMove = move;
  routerMoves += 1;
  failures = 0;
  if (!attached) return;
  const state = read();
  const ovl = ovlOf(state);
  if (move === 'REPLACE') {
    if (pending) return;
    if (!ovl && group !== null && offset > 0) {
      // o roteador regravou a entrada de uma camada: a marca volta
      write('replace', { ...(state ?? {}), [KEY]: { g: group, o: offset } });
    } else if (ovl && keyOf(state) !== location.key) {
      // a troca chegou com um passo da faxina a caminho e caímos na entrada antiga
      repair(state);
    } else {
      adopt(ovl);
    }
    return;
  }
  if (move === 'PUSH') {
    // página nova: as entradas das camadas ficaram para trás
    window.clearTimeout(cleanTimer);
    if (!pending && keyOf(state) !== location.key && Date.now() - cleanedAt < 1500) {
      // o passo da faxina caiu antes de este aviso chegar: o navegador está
      // numa entrada de trás, e a página nova, adiante
      seek(location.key);
      return;
    }
    adopt(ovl);
    // uma camada global que continuou aberta (fora da página) ganha entrada aqui
    if (stack.depth() > 0) settleSoon();
    return;
  }
  if (move === 'INIT') {
    // recarregou com uma camada aberta: a entrada dela sobrou
    adopt(ovl);
    settleSoon();
  }
  // POP: o onPop já cuidou
}

export function attach(): void {
  if (!HISTORY_ENABLED || attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('popstate', onPop, true);
  stack.hooks.entered = () => {
    failures = 0;
    grow();
  };
  stack.hooks.left = scheduleClean;
  adopt(ovlOf(read()));
}

export function detach(): void {
  if (!attached) return;
  attached = false;
  window.removeEventListener('popstate', onPop, true);
  stack.hooks.entered = undefined;
  stack.hooks.left = undefined;
  window.clearTimeout(cleanTimer);
  window.clearTimeout(settleTimer);
  settle(null);
}

// Para as telas de teste.
export const debug = () => ({ attached, group, offset, pending: pending?.kind ?? null, entry: ovlOf(read()) });
