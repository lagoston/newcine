// De quem são os dados pessoais guardados agora (18/11/2026, Protocolo Reborn).
//
// A camada de dados guarda respostas de UMA pessoa por vez. Este arquivo é só o
// estado disso: quem é a pessoa (uid) e se o que estava guardado no aparelho já
// voltou para a memória (userReady / pubReady). Enquanto não voltou, nenhuma
// consulta guardada sai para a rede — senão pediríamos o que já temos.
//
// Quem muda este estado é session.ts (claimScope). Aqui não há regra nenhuma.

export interface Scope {
  // undefined = ainda não se sabe; null = visitante; texto = id de quem está logado
  uid: string | null | undefined;
  // o balde da pessoa já foi lido do aparelho (ou não havia nada)
  userReady: boolean;
  // o balde público já foi lido do aparelho
  pubReady: boolean;
}

let scope: Scope = { uid: undefined, userReady: false, pubReady: false };
const listeners = new Set<() => void>();

export const getScope = (): Scope => scope;

export function subscribeScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setScope(next: Partial<Scope>): void {
  scope = { ...scope, ...next };
  listeners.forEach((listener) => listener());
}

// Quem está logado agora, para o código fora dos componentes (undefined se
// ninguém disse ainda).
export const ownerNow = (): string | null | undefined => scope.uid;

// Espera uma condição do estado (com teto: o aparelho pode demorar ou falhar,
// e a tela não pode ficar esperando o armazenamento).
function when(test: (s: Scope) => boolean, maxMs = 1500): Promise<void> {
  if (test(scope)) return Promise.resolve();
  return new Promise((resolve) => {
    // o que desfazer quando a espera acaba (a escuta e o relógio do teto)
    const cleanup: (() => void)[] = [];
    const done = () => {
      cleanup.splice(0).forEach((undo) => undo());
      resolve();
    };
    cleanup.push(
      subscribeScope(() => {
        if (test(scope)) done();
      }),
    );
    const timer = setTimeout(done, maxMs);
    cleanup.push(() => clearTimeout(timer));
  });
}

export const whenPubReady = (): Promise<void> => when((s) => s.pubReady);
// Resolve quando o balde desta pessoa foi lido — ou quando a pessoa logada
// deixou de ser ela (quem chamou confere de novo).
export const whenUserReady = (uid: string): Promise<void> => when((s) => s.uid !== uid || s.userReady);
