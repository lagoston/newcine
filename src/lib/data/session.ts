// De quem são os dados guardados: a troca de pessoa (18/11/2026, Protocolo Reborn).
//
// claimScope(uid) é chamado quando se sabe quem está logado (pelos hooks da
// fachada e pelo DataProvider, a partir do useAuth) e quando alguém sai. É AQUI
// que a regra "trocar de conta nunca mostra dado de outra pessoa" é cumprida:
//
//   1. para de gravar o balde da pessoa anterior (nada pendente escapa);
//   2. tira da memória tudo que não é público;
//   3. apaga do aparelho os baldes de qualquer outra pessoa (saindo: todos);
//   4. só então lê o balde de quem entrou e libera as consultas dela.
//
// Além disso as chaves pessoais levam o id da pessoa (keys.ts): mesmo que um
// passo acima falhasse, a tela de B pede ['me','profile',B] e nunca recebe o
// que foi guardado como ['me','profile',A].
import { supabase } from '../supabase';
import { isPublic, queryClient } from './client';
import { forgetOtherUsers, restorePublic, restoreUser, startUserPersist, stopUserPersist } from './persist';
import { getScope, setScope } from './scope';

let claimSeq = 0;

export function claimScope(uid: string | null): void {
  if (getScope().uid === uid) return;
  const seq = ++claimSeq;
  stopUserPersist();
  const personal = (query: { meta?: Record<string, unknown> }) => !isPublic(query);
  void queryClient.cancelQueries({ predicate: personal }, { silent: true });
  queryClient.removeQueries({ predicate: personal });
  setScope({ uid, userReady: false });
  (async () => {
    await forgetOtherUsers(uid);
    if (uid !== null) await restoreUser(uid);
  })()
    .catch(() => undefined)
    .then(() => {
      // outra troca chegou no meio: quem manda é a mais nova
      if (seq !== claimSeq) return;
      if (uid !== null) startUserPersist(uid);
      setScope({ userReady: true });
    });
}

// ---- partida (uma vez, quando a fachada é carregada) -----------------------------
let started = false;
export function startDataSession(): void {
  if (started) return;
  started = true;
  // o balde público volta primeiro: não depende de quem está logado
  restorePublic()
    .catch(() => undefined)
    .then(() => setScope({ pubReady: true }));
  // Saiu da conta (aqui, em outra aba, ou a sessão expirou): limpa na hora, sem
  // esperar a tela redesenhar. Só mexe no que é local: nada de chamar o
  // supabase de dentro deste aviso (ele trava).
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') claimScope(null);
    });
  } catch {
    // prévias com Supabase falso sem este método: os hooks cuidam da troca
  }
}
