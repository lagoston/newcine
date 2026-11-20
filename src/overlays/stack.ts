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
//   • trava de rolagem: trava com a pilha cheia e solta quando ela esvazia
//     (desde 20/11/2026 ninguém mais escreve essa trava fora daqui);
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
  // true = com esta camada aberta o <body> fica com touch-action: none (o menu
  // do título: sem isso o iPhone arrasta a página por trás do fundo escuro)
  touchNone?: () => boolean;
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
// número de camadas: o covered.css pausa as animações CSS da página de baixo,
// e quem anima por JavaScript lê useCovered() ou isCovered(elemento).
function markCovered(): void {
  const root = document.getElementById('root');
  if (!root) return;
  if (entries.length > 0) root.setAttribute('data-covered', String(entries.length));
  else root.removeAttribute('data-covered');
}

// Este elemento está coberto por uma camada? Na página: qualquer camada
// aberta. Dentro de uma camada: outra por cima dela. É o que o orçamento de
// movimento (lib/motion.ts) pergunta antes de desenhar o estúdio — o estúdio
// da Home para com uma gaveta por cima, e o de dentro da gaveta da Persona só
// para quando o guia abre por cima dele.
export function isCovered(element: Element | null): boolean {
  if (entries.length === 0) return false;
  const mark = element?.closest('[data-layer]')?.getAttribute('data-layer');
  return !(mark && isTop(mark));
}

// ------------------------------------------------------------------ trava de rolagem

// 20/11/2026 (Protocolo Reborn, fecho): a pilha é a ÚNICA que escreve a trava
// de rolagem da página (body.style.overflow, o overflow do <html> e o
// touch-action do <body>). Até aqui cinco camadas ainda travavam por conta
// própria, salvando e devolvendo o valor anterior (o formulário e a ordem das
// listas, a folha da curadoria, as folhas do pôquer e o Acervo), e por isso
// existiam um "faxineiro" no App.tsx (ScrollLockJanitor) e, aqui, uma espera
// pelos diálogos antigos. Com todas no host, a regra é uma linha: há camada
// (ou página em tela cheia) aberta → travado; não há → solto. Nada é salvo
// nem devolvido, então nada fica preso (auditoria F1).
//
// Além das camadas da pilha, há as PÁGINAS EM TELA CHEIA (o Acervo): travam a
// rolagem enquanto estão montadas, mas não são camadas — o Esc e o voltar
// delas são sair da página, e isso continua com elas (useScrollLock).
const holders = new Map<string, boolean>();

const put = (style: CSSStyleDeclaration, property: 'overflow' | 'touchAction', value: string): void => {
  if (style[property] !== value) style[property] = value;
};

export function applyLock(): void {
  if (typeof document === 'undefined') return;
  put(document.body.style, 'overflow', entries.length > 0 || holders.size > 0 ? 'hidden' : '');
  // o Acervo sempre travou também o <html>
  put(document.documentElement.style, 'overflow', Array.from(holders.values()).some(Boolean) ? 'hidden' : '');
  put(document.body.style, 'touchAction', entries.some((e) => e.touchNone?.()) ? 'none' : '');
}

// Uma página em tela cheia segura a trava enquanto está montada. `root`: trava
// também o <html>.
export function hold(id: string, root = false): void {
  holders.set(id, root);
  applyLock();
}
export function unhold(id: string): void {
  if (holders.delete(id)) applyLock();
}

// ------------------------------------------------------------------ entrar e sair

function changed(): void {
  markCovered();
  applyLock();
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
