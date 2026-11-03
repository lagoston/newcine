/**
 * "Usar agora" de cada tipo de prêmio (SPEC §7.6). Tipo desconhecido não tem ação
 * (o apresentador genérico mostra só a imagem, o nome e a raridade).
 */
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { equipPoster, type PosterEffect } from '../../../lib/posterJackpot';
import type { PokerPrize } from '../../../lib/poker/client/apiTypes';
import { pokerApi } from '../../../lib/poker/client/api';
import { equipPokerMark } from '../jackpot/entryApi';

export type UseNow = (() => Promise<void>) | null;

const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function prizeAction(prize: PokerPrize | null | undefined, ctx: { userId: string | null; navigate: NavigateFunction }): UseNow {
  if (!prize) return null;
  const p = prize.payload ?? {};
  switch (prize.kind) {
    case 'poster': {
      const item = Number(p.item_id);
      const effect = (str(p.effect) ?? 'none') as PosterEffect;
      if (!Number.isFinite(item)) return null;
      return () => equipPoster(item, effect);
    }
    case 'avatar_frame':
    case 'banner': {
      const id = str(p.cosmetic_id);
      if (!id || !ctx.userId) return null;
      const category = prize.kind === 'banner' ? 'banner' : 'frame';
      return async () => {
        const { error } = await supabase.rpc('set_user_cosmetic', { p_user_id: ctx.userId, p_category: category, p_cosmetic_id: id });
        if (error) throw error;
      };
    }
    case 'tag': {
      const tagId = str(p.tag_id);
      if (!tagId || !ctx.userId) return null;
      return async () => {
        const { data, error } = await supabase.from('special_tags').select('name, emoji').eq('id', tagId).maybeSingle();
        if (error || !data) throw error ?? new Error('tag_not_found');
        await equipPokerMark(ctx.userId!, { name: String(data.name), emoji: String(data.emoji ?? '') });
      };
    }
    case 'deck':
    case 'table':
    case 'poker_quip': {
      const item = str(p.item_id);
      if (!item) return null;
      const slot: 'deck' | 'table' | 'quips' = prize.kind === 'poker_quip' ? 'quips' : prize.kind === 'deck' ? 'deck' : 'table';
      return () => pokerApi.equip(slot, item);
    }
    case 'tickets':
    case 'special_tickets':
      // Fichas não se "equipam": abre a gaveta do Jackpot para usar.
      return async () => {
        ctx.navigate('/', { state: { openJackpot: 'machine' } });
      };
    default:
      return null;
  }
}
