import { supabase } from '../../../lib/supabase';

// As chamadas que as entradas do pôquer (placar, 18+, cosméticos) fazem.
// 03/11/2026: o src/lib/pokerApi.ts (pacote C) ainda não existia quando isto
// foi escrito; as funções abaixo seguem a interface do SPEC §4.9 e chamam as
// mesmas RPCs. Quando o pokerApi chegar, basta trocar o corpo de cada uma por
// pokerApi.x() — quem usa (os componentes) não muda. As respostas voltam
// cruas (unknown): cada tela lê o JSON com o seu próprio leitor defensivo.

type Row = Record<string, unknown>;

async function rpc(fn: string, args?: Row): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as unknown;
}

const asRow = (value: unknown): Row | null => (value && typeof value === 'object' ? (value as Row) : null);

// Confirmação 18+ autodeclarada (a primeira data fica gravada no servidor).
export async function confirmPokerAge(): Promise<void> {
  const data = asRow(await rpc('poker_confirm_age'));
  if (!data || data.enabled === false || data.ok !== true) throw new Error('poker_closed');
}

// O placar inteiro (get_poker_scoreboard). Fechado: {enabled:false}.
export const fetchPokerScoreboard = (): Promise<unknown> => rpc('get_poker_scoreboard');

// O lobby (get_poker_home): o Personalizar perfil só lê enabled, loadout e items.
export const fetchPokerHome = (): Promise<unknown> => rpc('get_poker_home');

// Equipa o verso do baralho ou o feltro (o servidor confere a posse).
export async function equipPokerItem(slot: 'deck' | 'table', itemId: string): Promise<void> {
  const data = asRow(await rpc('poker_equip', { p_slot: slot, p_item_id: itemId }));
  if (!data || data.ok !== true) throw new Error(String(data?.reason ?? 'equip_failed'));
}

// Molduras e banners ganhos fora de tag/Premium (prêmios da mesa). Sem a
// função no servidor (versão antiga), devolve vazio: nada muda na tela.
export async function fetchMyCosmeticUnlocks(): Promise<Set<string>> {
  try {
    const data = await rpc('get_my_cosmetic_unlocks');
    const set = new Set<string>();
    (Array.isArray(data) ? data : []).forEach((row) => {
      const r = asRow(row);
      if (r && typeof r.category === 'string' && typeof r.cosmetic_id === 'string') set.add(`${r.category}:${r.cosmetic_id}`);
    });
    return set;
  } catch {
    return new Set();
  }
}

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
