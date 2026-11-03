/**
 * Ponte com o Worker da partida (SPEC §4.6). Se o Worker não subir (navegador
 * antigo, CSP, erro ao carregar), o mesmo `matchCore` roda no thread principal:
 * mais lento, mas a mesa continua jogável.
 */
import type { CoreReply, CoreRequest } from './matchCore.ts';

type Pending = { resolve: (r: CoreReply) => void };

export class MatchClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private local: ((req: CoreRequest) => CoreReply) | null = null;

  constructor() {
    try {
      this.worker = new Worker(new URL('./matchWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<{ id: number; reply: CoreReply }>) => {
        const p = this.pending.get(ev.data.id);
        if (p) {
          this.pending.delete(ev.data.id);
          p.resolve(ev.data.reply);
        }
      };
      this.worker.onerror = () => this.fallBack();
    } catch {
      this.worker = null;
    }
  }

  // O Worker caiu: o que estava esperando vai para o thread principal.
  private fallBack() {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    waiting.forEach((p) => p.resolve({ kind: 'error', code: 'worker_failed', message: 'worker failed' }));
  }

  private async runLocal(req: CoreRequest): Promise<CoreReply> {
    if (!this.local) {
      const mod = await import('./matchCore.ts');
      this.local = mod.handleCore;
    }
    return this.local(req);
  }

  async call(req: CoreRequest): Promise<CoreReply> {
    if (!this.worker) return this.runLocal(req);
    const id = ++this.seq;
    const reply = await new Promise<CoreReply>((resolve) => {
      this.pending.set(id, { resolve });
      try {
        this.worker!.postMessage({ id, req });
      } catch {
        this.pending.delete(id);
        resolve({ kind: 'error', code: 'worker_failed', message: 'post failed' });
      }
    });
    // O Worker morreu no meio: refaz no thread principal (o estado se perde, então
    // só repete o que não depende dele; o resto a mesa recupera com `restore`).
    if (reply.kind === 'error' && reply.code === 'worker_failed') {
      this.worker = null;
      return this.runLocal(req);
    }
    return reply;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
