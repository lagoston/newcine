// As camadas que o host desenha (18/11/2026, Protocolo Reborn, onda 2a):
// `overlays.open('title', { id })` de qualquer lugar, sem estado no pai e sem
// uma cópia do modal em cada tela. Generaliza o que os Sussurros já fazem
// (WhispersHost na Navbar). A camada entra na pilha no instante do open(),
// antes de o código dela chegar: o Esc, o voltar e a trava já valem enquanto
// carrega. Quem desenha é o <LayerOutlet /> do OverlayProvider.
import type { ComponentType } from 'react';
import * as stack from './stack';
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
}

// O componente de dentro (um OracleSheet, o menu do título) assume a entrada
// da camada: é ele quem decide o que o Esc faz.
interface Claim {
  by: string;
  dismiss: () => void;
  canEscape: () => boolean;
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
    },
    def.z ?? stack.DEFAULT_Z,
  );
  mounts = [...mounts, { mark, kind, params, z, open: true }];
  emit();
  return mark;
}

// O componente de dentro pede a entrada da camada. Só o primeiro leva.
export function claimLayer(mark: string, claim: Claim): boolean {
  const current = claims.get(mark);
  if (current && current.by !== claim.by) return false;
  if (!mounts.some((m) => m.mark === mark && m.open)) return false;
  claims.set(mark, claim);
  return true;
}
export function releaseLayer(mark: string, by: string): void {
  if (claims.get(mark)?.by === by) claims.delete(mark);
}

export interface OverlayApi {
  // Abre uma camada por cima do que estiver na tela. Devolve o nome dela.
  open: <K extends OverlayKind>(kind: K, params: OverlaySpec[K]) => string | null;
  // Fecha uma camada aberta com open() (com a animação de saída).
  close: (mark: string) => void;
  // Baixa o código de um tipo de camada antes do toque (hover, pointerdown).
  prefetch: (kind: OverlayKind) => void;
}

export const overlays: OverlayApi = {
  open: (kind, params) => openLayer(kind as string, params),
  close: closeLayer,
  prefetch: (kind) => {
    void defs
      .get(kind as string)
      ?.load()
      .catch(() => undefined);
  },
};
