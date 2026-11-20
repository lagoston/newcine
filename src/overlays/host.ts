// As camadas que o host desenha (18/11/2026, Protocolo Reborn, onda 2a):
// `overlays.open('title', { id })` de qualquer lugar, sem estado no pai e sem
// uma cópia do modal em cada tela. Generaliza o que os Sussurros já fazem
// (WhispersHost na Navbar). A camada entra na pilha no instante do open(),
// antes de o código dela chegar: o Esc, o voltar e a trava já valem enquanto
// carrega. Quem desenha é o <LayerOutlet /> do OverlayProvider.
import type { ComponentType } from 'react';
import * as stack from './stack';
import { setAddress } from './history';
import type { OverlayDef, OverlayKind, OverlaySpec } from './registry';

// Quanto tempo a camada continua montada depois de fechar (a animação de
// saída das gavetas leva ~0,3 s).
const EXIT_MS = 450;

export interface Mount {
  mark: string;
  kind: string;
  params: unknown;
  z: number;
  // false = fechando (ainda montada para a animação de saída)
  open: boolean;
  // a página em que a camada abriu: a entrada do roteador (a chave dela) e o caminho
  page: string;
  path: string;
}

// O componente de dentro (um OracleSheet, o menu do título) assume a entrada
// da camada: é ele quem decide o que o Esc faz.
interface Claim {
  by: string;
  dismiss: () => void;
  canEscape: () => boolean;
  touchNone?: () => boolean;
}

type AnyDef = OverlayDef<unknown>;
// Preenchido pelo <OverlayProvider registry> (a lista mora em registry.ts, na
// entrada do build; este arquivo, no app-core, não pode importá-la).
const defs = new Map<string, AnyDef>();
const claims = new Map<string, Claim>();
let mounts: Mount[] = [];
const listeners = new Set<() => void>();
let outlets = 0;
let seq = 0;

const emit = () => listeners.forEach((listener) => listener());
export const subscribeMounts = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getMounts = (): Mount[] => mounts;
export const getDef = (kind: string): AnyDef | undefined => defs.get(kind);
// O <LayerOutlet /> avisa quando está na tela (sem ele não há onde desenhar).
export const outletMounted = (on: boolean): void => {
  outlets += on ? 1 : -1;
};
// 20/11/2026: já dá para abrir camada? (a lista chegou e o <LayerOutlet /> está
// na tela). Quem pergunta é lib/appLinks.ts: um link que abre o app na partida
// chega antes do anfitrião.
export const hostReady = (): boolean => outlets > 0 && defs.size > 0;

// A lista de camadas do app (registry.ts), entregue pelo OverlayProvider.
export function registerOverlays(registry: object): void {
  Object.entries(registry as Record<string, AnyDef>).forEach(([kind, def]) => defs.set(kind, def));
}
export const getDefs = (): [string, AnyDef][] => Array.from(defs.entries());

// Tipos de camada para prévias e testes, sem entrar na lista de verdade.
export function registerOverlay(kind: string, def: { load: () => Promise<{ default: ComponentType<{ params: never }> }>; z?: number }): void {
  defs.set(kind, def as unknown as AnyDef);
}

function closeLayer(mark: string): void {
  const mount = mounts.find((m) => m.mark === mark);
  if (!mount || !mount.open) return;
  stack.leave(mark);
  mounts = mounts.map((m) => (m.mark === mark ? { ...m, open: false } : m));
  emit();
  window.setTimeout(() => {
    mounts = mounts.filter((m) => m.mark !== mark);
    claims.delete(mark);
    emit();
  }, EXIT_MS);
}

// A chave que o roteador deu à entrada atual do histórico.
const pageKey = (): string => {
  try {
    const key = (window.history.state as { key?: unknown } | null)?.key;
    return typeof key === 'string' ? key : 'default';
  } catch {
    return 'default';
  }
};

function openLayer(kind: string, params: unknown): string | null {
  const def = defs.get(kind);
  if (!def || outlets <= 0) {
    console.error(`overlays.open('${kind}'): ${def ? 'OverlayProvider não está montado' : 'tipo de camada desconhecido'}`);
    return null;
  }
  const mark = `h${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const z = stack.enter(
    {
      mark,
      dismiss: () => (claims.get(mark)?.dismiss ?? (() => closeLayer(mark)))(),
      canEscape: () => claims.get(mark)?.canEscape() ?? true,
      touchNone: () => claims.get(mark)?.touchNone?.() ?? false,
    },
    def.z ?? stack.DEFAULT_Z,
  );
  mounts = [...mounts, { mark, kind, params, z, open: true, page: pageKey(), path: window.location.pathname }];
  // a camada com endereço põe o dela na URL (na entrada do histórico que acabou de ganhar)
  if (def.address) setAddress(`${kind}.${def.address(params)}`);
  emit();
  return mark;
}

// Lê um endereço de camada (`title.movie.27205`). null = não é de nenhuma.
export function readAddress(address: string | null): { kind: string; params: unknown } | null {
  if (!address) return null;
  const [kind, ...parts] = address.split('.');
  const params = defs.get(kind)?.fromAddress?.(parts) ?? null;
  return params ? { kind, params } : null;
}
export const openAddress = (wanted: { kind: string; params: unknown }): string | null => openLayer(wanted.kind, wanted.params);

// Troca parte dos parâmetros de uma camada aberta (os detalhes completos do
// título chegando depois do cartão leve). Camada já fechada: não faz nada.
function updateLayer(mark: string, patch: object): void {
  if (!mounts.some((m) => m.mark === mark && m.open)) return;
  mounts = mounts.map((m) => (m.mark === mark ? { ...m, params: { ...(m.params as object), ...patch } } : m));
  emit();
}

// A página mudou (o OverlayProvider avisa). As camadas do host pertencem à
// página em que abriram: antes, o menu do título era filho da página e sumia
// com ela (a bolha do amigo, um link dentro do menu); agora quem fecha é o
// host. Um `replace` na mesma página (limpar o location.state, um filtro na
// URL) não é troca de página: as camadas continuam.
export function routerMovedHosted(key: string, path: string, move: 'INIT' | 'PUSH' | 'REPLACE' | 'POP'): void {
  if (move === 'INIT') return;
  mounts
    .filter((m) => m.open)
    .forEach((m) => {
      if (move === 'REPLACE' && m.path === path) {
        m.page = key;
        return;
      }
      if (m.page !== key) closeLayer(m.mark);
    });
}

// O componente de dentro pede a entrada da camada. Só o primeiro leva.
export function claimLayer(mark: string, claim: Claim): boolean {
  const current = claims.get(mark);
  if (current && current.by !== claim.by) return false;
  if (!mounts.some((m) => m.mark === mark && m.open)) return false;
  claims.set(mark, claim);
  // quem assumiu pode pedir o touch-action (o menu do título)
  stack.applyLock();
  return true;
}
export function releaseLayer(mark: string, by: string): void {
  if (claims.get(mark)?.by !== by) return;
  claims.delete(mark);
  stack.applyLock();
}

export interface OverlayApi {
  // Abre uma camada por cima do que estiver na tela. Devolve o nome dela.
  open: <K extends OverlayKind>(kind: K, params: OverlaySpec[K]) => string | null;
  // Fecha uma camada aberta com open() (com a animação de saída).
  close: (mark: string) => void;
  // Troca parte dos parâmetros de uma camada aberta.
  update: <K extends OverlayKind>(mark: string, patch: Partial<OverlaySpec[K]>) => void;
  // Baixa o código de um tipo de camada antes do toque (hover, pointerdown).
  prefetch: (kind: OverlayKind) => void;
}

export const overlays: OverlayApi = {
  open: (kind, params) => openLayer(kind as string, params),
  close: closeLayer,
  update: (mark, patch) => updateLayer(mark, patch),
  prefetch: (kind) => {
    void defs
      .get(kind as string)
      ?.load()
      .catch(() => undefined);
  },
};
