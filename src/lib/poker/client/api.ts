/**
 * Qual API a mesa usa (03/11/2026): o `src/lib/pokerApi.ts` do pacote C quando ele
 * existir, senão o `mockApi`. O `import.meta.glob` devolve {} enquanto o arquivo
 * não existe, então o build não quebra e a troca acontece sozinha no próximo build.
 *
 * Na prévia (VITE_POKER_PREVIEW=1) o mock vale sempre, para jogar sem servidor.
 */
import type { PokerApiLike } from './apiTypes.ts';
import { mockApi } from './mockApi.ts';
import { POKER_PREVIEW } from './flags.ts';

const realModules = import.meta.glob('../../pokerApi.ts', { eager: true }) as Record<string, Record<string, unknown>>;

function pickReal(): PokerApiLike | null {
  const mod = Object.values(realModules)[0];
  if (!mod) return null;
  // Aceita `export const pokerApi`, `export default` ou as funções soltas no módulo.
  const cand = (mod.pokerApi ?? mod.default ?? mod) as Partial<PokerApiLike>;
  if (cand && typeof cand.getHome === 'function' && cand.bounty && typeof cand.bounty.start === 'function') {
    return cand as PokerApiLike;
  }
  return null;
}

const real = POKER_PREVIEW ? null : pickReal();

export const pokerApi: PokerApiLike = real ?? mockApi;
export const usingMockApi = real === null;
