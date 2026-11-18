// A pilha de camadas do app (18/11/2026, Protocolo Reborn, onda 2a).
//
// Antes cada modal resolvia sozinho o z-index, o Esc, a trava de rolagem e o
// voltar: 8 jeitos de tratar o Esc, 21 `escapeEnabled`, 17 `zIndexClass` e 28
// `onLayer` só para um modal saber que havia outro por cima. Disso saíram os
// bugs medidos na auditoria (claude/otimizacao/modais.md): a página que ficava
// sem rolar depois de sair com dois modais abertos (F1), a pessoa que abria
// escondida atrás do menu do título (F2) e um voltar que fechava duas camadas
// (F3). Aqui fica UMA pilha, dona de quatro coisas:
//   • z-index: quem abre depois fica por cima (nunca abaixo da camada de baixo);
//   • Esc: um ouvinte só, que fecha a camada de cima;
//   • trava de rolagem: trava com a pilha cheia e solta quando ela esvazia;
//   • tela coberta: `data-covered` no #root enquanto houver camada aberta.
// O histórico (cada camada é uma entrada, o voltar fecha a de cima) fica em
// history.ts e se liga aqui pelos `hooks`.
//
// Este arquivo não usa React: é um módulo só, que funciona mesmo sem o
// OverlayProvider montado (prévias, telas de teste). Os componentes entram
// pela `useLayerEntry` (hooks.ts).

// O z-index que uma gaveta pedia antes do host (o padrão do OracleSheet).
export const DEFAULT_Z = 9990;

export interface LayerEntry {
  // identidade da camada; vai no atributo data-layer da raiz dela
  mark: string;
  // z-index decidido ao entrar na pilha
  z: number;
  // pedir para fechar (Esc ou voltar). A camada pode fechar só uma parte dela
  // (a gaveta de comentários de um story) e continuar aberta.
  dismiss: () => void;
  // false = agora não fecha no Esc/voltar (salvando, edição em linha, um
  // filho que não é diálogo por cima): quem escuta o Esc do jeito antigo recebe
  canEscape: () => boolean;
}

const entries: LayerEntry[] = [];
const listeners = new Set<() => void>();

// O histórico se liga aqui (history.ts); sem ele, só a pilha.
export const hooks: { entered?: () => void; left?: () => void } = {};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const depth = (): number => entries.length;
export const has = (mark: string): boolean => entries.some((e) => e.mark === mark);
export const isTop = (mark: string): boolean => entries.length > 0 && entries[entries.length - 1].mark === mark;
export const zOf = (mark: string): number | undefined => entries.find((e) => e.mark === mark)?.z;
// para as telas de teste e para depurar
export const marks = (): string[] => entries.map((e) => e.mark);

// ------------------------------------------------------------------ tela coberta

// O sinal de "tela coberta" (auditoria F5: com uma gaveta por cima, 49
// animações continuavam rodando embaixo). O #root ganha data-covered com o
// número de camadas; quem anima por CSS pode pausar com
// `#root[data-covered] …` e quem anima por JavaScript lê useCovered().
function markCovered(): void {
  const root = document.getElementById('root');
  if (!root) return;
  if (entries.length > 0) root.setAttribute('data-covered', String(entries.length));
  else root.removeAttribute('data-covered');
}

// ------------------------------------------------------------------ trava de rolagem

// Quem ainda trava a rolagem por conta própria (salvando e devolvendo o valor
// anterior): o menu do título e os outros diálogos antigos, o Acervo e as
// folhas do pôquer. Enquanto um deles está na tela, a trava é dele.
const FOREIGN_LOCK = '[aria-modal="true"]:not([data-layer]), .ac-layer, .pp-layer';
let watcher: MutationObserver | null = null;
let recheck = 0;

function stopWatching(): void {
  watcher?.disconnect();
  watcher = null;
  window.clearTimeout(recheck);
}

function lock(): void {
  stopWatching();
  if (document.body.style.overflow !== 'hidden') document.body.style.overflow = 'hidden';
}

// Solta a rolagem se a pilha está vazia e não sobrou diálogo antigo na tela.
// Devolve false quando ainda há um diálogo antigo segurando a trava.
function release(): boolean {
  if (entries.length > 0) return true;
  if (document.querySelector(FOREIGN_LOCK)) return false;
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  return true;
}

// Com um diálogo antigo ainda na tela, espera ele sair (os portais são filhos
// diretos do <body>) e então solta. Só fica ligado nesse intervalo.
function watch(): void {
  if (watcher || typeof MutationObserver === 'undefined') return;
  watcher = new MutationObserver(() => {
    window.clearTimeout(recheck);
    recheck = window.setTimeout(() => {
      if (release()) stopWatching();
    }, 500);
  });
  watcher.observe(document.body, { childList: true });
}

// A pilha esvaziou. Solta na hora (quem abre em seguida, como o menu do
// título depois de um story, precisa guardar o valor certo) e confere de novo
// daqui a pouco: um modal antigo que abriu por cima de uma camada do host
// guardou 'hidden' e devolve esse valor atrasado quando fecha — era assim que
// a página ficava presa (F1).
function unlock(): void {
  if (!release()) watch();
  window.clearTimeout(recheck);
  recheck = window.setTimeout(() => {
    if (!release()) watch();
  }, 500);
}

// ------------------------------------------------------------------ entrar e sair

function changed(): void {
  markCovered();
  if (entries.length > 0) lock();
  else unlock();
  listeners.forEach((listener) => listener());
}

// `floor` é o z-index que a camada pedia antes do host (a prop zIndexClass ou o
// padrão do componente). Ele vale como PISO: mantém a ordem com as camadas que
// ainda não entraram no host (o menu do título em 9999 e os filhos dele), e o
// host garante o que faltava: quem entra depois nunca fica abaixo de quem já
// estava. `null` = camada que não vai em portal (a gaveta da nota): o z dela
// vale só dentro de quem a desenha, então ela herda o da camada de baixo.
export function enter(entry: Omit<LayerEntry, 'z'>, floor: number | null): number {
  const at = entries.findIndex((e) => e.mark === entry.mark);
  if (at >= 0) entries.splice(at, 1);
  const below = entries.length ? entries[entries.length - 1].z : 0;
  const z = floor === null ? below : Math.max(floor, below + 1);
  entries.push({ ...entry, z });
  changed();
  hooks.entered?.();
  return z;
}

export function leave(mark: string): void {
  const at = entries.findIndex((e) => e.mark === mark);
  if (at < 0) return;
  entries.splice(at, 1);
  changed();
  hooks.left?.();
}

// ------------------------------------------------------------------ Esc e voltar

// O diálogo que está por cima na tela: o último [aria-modal="true"] do
// documento (os portais entram no <body> na ordem em que abrem; é a regra da
// onda 1). Uma camada do host que já saiu da pilha e ainda está na animação de
// saída não conta.
function topDialog(): Element | null {
  const modals = document.querySelectorAll('[aria-modal="true"]');
  for (let i = modals.length - 1; i >= 0; i--) {
    const mark = modals[i].getAttribute('data-layer');
    if (mark && !has(mark)) continue;
    return modals[i];
  }
  return null;
}

// Quem responde a um pedido de fechar agora: a camada de cima da pilha, a não
// ser que um diálogo antigo, que ainda não entrou no host (o menu do título),
// esteja por cima dela na tela — aí é ele quem cuida do próprio Esc — ou que
// a camada de cima não feche agora (canEscape).
function target(): LayerEntry | null {
  const top = entries[entries.length - 1];
  if (!top) return null;
  const dialog = topDialog();
  if (dialog && !dialog.hasAttribute('data-layer')) return null;
  return top.canEscape() ? top : null;
}

// O Esc do app inteiro. Fase de captura e registrado quando o módulo carrega
// (antes de qualquer tela), para decidir antes dos ouvintes antigos.
function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || entries.length === 0) return;
  const entry = target();
  if (!entry) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  entry.dismiss();
}
if (typeof window !== 'undefined') window.addEventListener('keydown', onKeyDown, true);

// O voltar (do navegador, pelo histórico): o mesmo que o Esc. Se quem está por
// cima é um diálogo antigo, ou a camada de cima não fecha agora, sai um Esc de
// mentira — igual ao que o botão voltar do Android já faz (lib/nativeShell.ts)
// — e quem escuta do jeito antigo fecha.
export function requestDismiss(): void {
  const entry = target();
  if (entry) {
    entry.dismiss();
    return;
  }
  const from = (document.activeElement as HTMLElement | null) ?? document.body;
  from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
}

// Fecha uma camada pelo nome (useLayer().close).
export function dismiss(mark: string): void {
  entries.find((e) => e.mark === mark)?.dismiss();
}
