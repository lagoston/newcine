import { supabase } from './supabase';
import { isMissingFunction } from './data/missing';
import { UnlockedPin } from '../hooks/useUnlockedTagPins';

/**
 * Sincroniza a lista de pins atualmente desbloqueados (calculada no
 * cliente) com o registro persistente no banco, e dispara um Whisper
 * pra cada tag GENUINAMENTE nova (nunca vista antes pra esse usuário).
 *
 * A diferenciação em si acontece no banco (sync_unlocked_tags_and_notify),
 * de forma atômica via ON CONFLICT DO NOTHING — isso é o que torna
 * seguro chamar essa função de mais de um lugar (o hook leve e o modal
 * completo de tags têm cálculos independentes de quais pins estão
 * desbloqueados) sem risco de duplicar a notificação: só quem
 * "vencer a corrida" de registrar uma tag específica primeiro é que
 * efetivamente dispara o whisper dela.
 *
 * Tags de Jogos (category 'games', 03/11/2026): o banco já registra e avisa
 * na hora da concessão (gatilho em user_special_tags); aqui elas chegam como
 * "já vistas". O banco só aceita uma tag de Jogos da lista se a pessoa tem a
 * tag (normalize_synced_tags) — o aviso nunca depende só do aparelho.
 *
 * Nunca deve ser chamada com o userId de OUTRA pessoa — só faz sentido
 * pro próprio usuário logado vendo o cálculo das próprias tags
 * (chamar isso ao visitar o perfil de um amigo geraria notificações
 * incorretas pra ele). Quem chama é responsável por essa checagem.
 */
export async function syncUnlockedTagsAndNotify(userId: string, pins: UnlockedPin[]): Promise<void> {
  if (pins.length === 0) return;

  try {
    const payload = pins.map((pin) => ({
      category: pin.category,
      name: pin.name,
      emoji: pin.emoji,
    }));

    await supabase.rpc('sync_unlocked_tags_and_notify', {
      p_user_id: userId,
      p_tags: payload,
    });
  } catch (error) {
    // Silencioso de propósito — isso é um efeito colateral (notificar),
    // nunca deve quebrar ou atrasar a exibição normal dos pins pro
    // usuário, mesmo se a sincronização falhar por algum motivo.
    console.error('Error syncing unlocked tags:', error);
  }
}
/**
 * Versão da home (em segundo plano, de tempos em tempos): faz as tags novas
 * virarem aviso e story no Feed dos Amigos sem a pessoa abrir o modal de
 * Tags. Na primeira vez de alguém, o banco só registra o que ela já tem —
 * sem sussurro e sem story. Devolve quantas tags novas apareceram.
 */
export async function syncUnlockedTagsFromHome(userId: string, pins: UnlockedPin[]): Promise<number> {
  if (pins.length === 0) return 0;
  try {
    const { data, error } = await supabase.rpc('sync_unlocked_tags_from_home', {
      p_user_id: userId,
      p_tags: pins.map((pin) => ({ category: pin.category, name: pin.name, emoji: pin.emoji })),
    });
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  } catch (error) {
    console.error('Error syncing unlocked tags from home:', error);
    return 0;
  }
}

// 19/11/2026 (Reborn, onda 3): o banco calcula e registra as tags da própria
// pessoa (sync_my_tags), sem receber a lista do aparelho. Os efeitos são os
// das funções antigas (registro, sussurro e story de cada tag nova), porque
// por dentro ela as chama com a lista calculada no servidor. As duas funções
// acima continuam: são o PLANO B (banco sem a função nova) e o caminho do APK
// antigo.
let syncMyTagsMissing = false;

/**
 * A própria pessoa: registra e avisa as tags novas, calculadas no banco.
 * `notifyFirst` = o comportamento do modal de Tags (avisa também na primeira
 * vez); sem ele, o da Home (na primeira vez só registra).
 * Devolve quantas tags novas viraram aviso; null = a função não existe neste
 * banco (quem chamou usa o caminho antigo).
 */
async function syncMyTags(notifyFirst: boolean): Promise<number | null> {
  if (syncMyTagsMissing) return null;
  const { data, error } = await supabase.rpc('sync_my_tags', notifyFirst ? { p_notify_first: true } : {});
  if (isMissingFunction(error)) {
    syncMyTagsMissing = true;
    return null;
  }
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/**
 * O modal de Tags e o card de tags do próprio perfil: no lugar de mandar a
 * lista calculada no aparelho, pede ao banco que calcule e registre. `pins` é
 * a lista que a tela já tem, usada só no plano B.
 */
export async function syncMyTagsAndNotify(userId: string, pins: UnlockedPin[]): Promise<void> {
  try {
    if ((await syncMyTags(true)) !== null) return;
  } catch (error) {
    console.error('Error syncing my tags:', error);
    return;
  }
  await syncUnlockedTagsAndNotify(userId, pins);
}

/**
 * A Home (de tempos em tempos): uma ida só, sem baixar o progresso inteiro
 * para montar a lista (eram 11 a 15 pedidos). `fallbackPins` só roda no
 * plano B. Devolve quantas tags novas apareceram.
 */
export async function syncMyTagsFromHome(userId: string, fallbackPins: () => Promise<UnlockedPin[]>): Promise<number> {
  try {
    const created = await syncMyTags(false);
    if (created !== null) return created;
  } catch (error) {
    console.error('Error syncing my tags from home:', error);
    return 0;
  }
  return syncUnlockedTagsFromHome(userId, await fallbackPins());
}
