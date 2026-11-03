/**
 * Web Worker da partida livre e do treino (SPEC §4.2 e §4.6): os bots pensam aqui,
 * longe do thread que desenha a mesa. Cada mensagem leva um `id` e volta com ele.
 */
import { handleCore, type CoreRequest } from './matchCore.ts';

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<{ id: number; req: CoreRequest }>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (ev) => {
  const { id, req } = ev.data;
  ctx.postMessage({ id, reply: handleCore(req) });
};
