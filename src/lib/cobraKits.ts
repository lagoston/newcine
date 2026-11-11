import { supabase } from './supabase';

// Os kits da Cobra (11/11/2026): moldura + banner que só saem na roleta do
// Poster Jackpot, com a ficha especial, em 20% dos giros (o kit vem JUNTO
// com o pôster). Quem sorteia é o banco, num gatilho depois do giro
// (migração 20261111100000_cobra_kits); o site só pergunta o que saiu
// (get_cobra_kits), mostra a revelação uma vez (ack_cobra_kit_drops) e usa o
// kit (equip_cobra_kit, que confere a posse no servidor).

export interface CobraKit {
  id: string;
  name_pt: string;
  name_en: string;
  frame_id: string;
  banner_id: string;
  owned: boolean;
  won_at: string | null;
}

export interface CobraKitDrop {
  id: number;
  kit_id: string;
  created_at: string;
}

export interface CobraKitsState {
  // 0.2 = 20%
  chance: number;
  kits: CobraKit[];
  // revelações que a pessoa ainda não viu
  unseen: CobraKitDrop[];
}

type Row = Record<string, unknown>;

export async function fetchCobraKits(): Promise<CobraKitsState> {
  const { data, error } = await supabase.rpc('get_cobra_kits');
  if (error) throw error;
  const raw = (data ?? {}) as Row;
  const kits = (Array.isArray(raw.kits) ? raw.kits : []) as Row[];
  const unseen = (Array.isArray(raw.unseen) ? raw.unseen : []) as Row[];
  return {
    chance: typeof raw.chance === 'number' ? raw.chance : Number(raw.chance ?? 0.2) || 0.2,
    kits: kits.map((k) => ({
      id: String(k.id),
      name_pt: String(k.name_pt ?? ''),
      name_en: String(k.name_en ?? ''),
      frame_id: String(k.frame_id ?? ''),
      banner_id: String(k.banner_id ?? ''),
      owned: k.owned === true,
      won_at: typeof k.won_at === 'string' ? k.won_at : null,
    })),
    unseen: unseen.map((d) => ({ id: Number(d.id), kit_id: String(d.kit_id), created_at: String(d.created_at ?? '') })),
  };
}

export async function ackCobraKitDrops(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.rpc('ack_cobra_kit_drops', { p_ids: ids });
  if (error) throw error;
}

export async function equipCobraKit(kitId: string): Promise<{ frameId: string; bannerId: string }> {
  const { data, error } = await supabase.rpc('equip_cobra_kit', { p_kit: kitId });
  if (error) throw error;
  const raw = (data ?? {}) as Row;
  if (raw.ok !== true) throw new Error(typeof raw.error === 'string' ? raw.error : 'equip_failed');
  return { frameId: String(raw.frame_id), bannerId: String(raw.banner_id) };
}

export const kitName = (kit: Pick<CobraKit, 'name_pt' | 'name_en'>, isPt: boolean) => (isPt ? kit.name_pt : kit.name_en) || kit.name_en;

// A foto, o nome e o que a pessoa está usando agora (para a prévia do kit
// com a cara dela e para marcar "Em uso").
export interface MyLook {
  avatarUrl: string | null;
  username: string;
  frame: string | null;
  banner: string | null;
}

export async function fetchMyLook(userId: string): Promise<MyLook> {
  const { data, error } = await supabase.from('profiles').select('avatar_url, username, avatar_frame, banner').eq('id', userId).single();
  if (error) throw error;
  return {
    avatarUrl: (data?.avatar_url as string | null) ?? null,
    username: (data?.username as string | null) ?? '',
    frame: (data?.avatar_frame as string | null) ?? null,
    banner: (data?.banner as string | null) ?? null,
  };
}
