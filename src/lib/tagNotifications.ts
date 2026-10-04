import { supabase } from './supabase';
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
