import { supabase } from '../../../lib/supabase';
import { pokerApi } from '../../../lib/pokerApi';

// As chamadas que as entradas do pôquer (placar, 18+, cosméticos) fazem.
// 03/11/2026: tudo o que é do pôquer passa pelo src/lib/pokerApi.ts (pacote
// C); as respostas seguem cruas (unknown) para cada tela ler o JSON com o seu
// próprio leitor defensivo (scoreboard/model.ts, PokerCosmeticsSection). Só o
// perfil (estilo de carta e tag em uso) fala direto com a tabela profiles,
// pelo mesmo caminho que o resto do app já usa.

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row | null => (value && typeof value === 'object' ? (value as Row) : null);

// Confirmação 18+ autodeclarada (a primeira data fica gravada no servidor).
export const confirmPokerAge = (): Promise<void> => pokerApi.confirmAge();

// O placar inteiro (get_poker_scoreboard). Fechado: {enabled:false}.
export const fetchPokerScoreboard = (): Promise<unknown> => pokerApi.getScoreboard();

// O lobby (get_poker_home): o Personalizar perfil só lê enabled, loadout e items.
export const fetchPokerHome = (): Promise<unknown> => pokerApi.getHome();

// Equipa o verso do baralho ou o feltro (o servidor confere a posse).
export const equipPokerItem = (slot: 'deck' | 'table', itemId: string): Promise<void> => pokerApi.equip(slot, itemId);

// Molduras e banners ganhos fora de tag/Premium (prêmios da mesa). Sem a
// função no servidor (versão antiga), vem vazio: nada muda na tela.
export const fetchMyCosmeticUnlocks = (): Promise<Set<string>> => pokerApi.cosmeticUnlocks().catch(() => new Set<string>());

// O estilo de carta dos oráculos e a tag em uso (para o placar).
export async function fetchProfileBits(userId: string): Promise<{ cardStyle: string; activeTagName: string | null }> {
  const { data } = await supabase.from('profiles').select('card_style, active_tag').eq('id', userId).maybeSingle();
  const row = asRow(data);
  const tag = asRow(row?.active_tag);
  return {
    cardStyle: typeof row?.card_style === 'string' ? row.card_style : 'default',
    activeTagName: typeof tag?.name === 'string' ? tag.name : null,
  };
}

// [Equipar] num marco: o mesmo caminho do TagPinsModal (profiles.active_tag).
// O RLS de profiles só deixa a pessoa mudar a própria linha.
export async function equipPokerMark(userId: string, mark: { name: string; emoji: string }): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ active_tag: { category: 'special', name: mark.name, emoji: mark.emoji } })
    .eq('id', userId);
  if (error) throw error;
}
