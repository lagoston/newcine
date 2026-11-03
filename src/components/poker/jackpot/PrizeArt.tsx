import React from 'react';
import { Gift, MessageCircle, Tag, User } from 'lucide-react';
import PosterArt from '../../posterJackpot/PosterArt';
import { ChipFace } from '../../posterJackpot/Chips';
import { RARITY_META, type PokerTeaserPrize } from '../../../lib/posterJackpot';
import { CardBack, FeltSwatch } from '../cosmetics/CosmeticPreviews';
import { posterOfPrize } from './pokerMeta';

// A arte de um prêmio da mesa num cartaz 2:3, por tipo (SPEC §5.4). Tipo
// novo no banco cai no genérico (presente), sem quebrar nada.
const PrizeArt: React.FC<{
  prize: Pick<PokerTeaserPrize, 'kind' | 'image' | 'payload' | 'rarity'>;
  className?: string;
  animated?: boolean;
  // Sem o brilho da raridade em volta (miniaturas no mural).
  plain?: boolean;
}> = ({ prize, className = '', animated = true, plain = false }) => {
  const meta = RARITY_META[prize.rarity];
  const frame: React.CSSProperties = plain
    ? { boxShadow: '0 10px 22px -14px rgba(0,0,0,0.9)' }
    : { boxShadow: `0 0 0 1.5px ${meta.color}, 0 0 18px -4px ${meta.glow}, 0 14px 26px -16px rgba(0,0,0,0.95)` };
  const itemId = typeof prize.payload.item_id === 'string' ? prize.payload.item_id : null;
  const amount = Math.max(1, Math.min(3, Number(prize.payload.amount) || 1));

  if (prize.kind === 'poster') {
    const poster = posterOfPrize(prize);
    if (poster) {
      return (
        <span className={`relative block aspect-[2/3] rounded-[10px] ${className}`} style={frame}>
          <PosterArt filePath={poster.filePath} effect={poster.effect} size="w342" animated={animated} className="absolute inset-0 rounded-[10px]" />
        </span>
      );
    }
  }

  // O fundo comum dos tipos sem imagem própria: o céu do cassino.
  const sky: React.CSSProperties = {
    ...frame,
    background: 'radial-gradient(90% 70% at 50% 30%, rgba(80,96,220,0.35), transparent 70%), linear-gradient(180deg, #121a52, #0a0e2c)',
  };

  if (prize.kind === 'deck') {
    return (
      <span className={`relative block aspect-[2/3] rounded-[10px] overflow-hidden ${className}`} style={sky}>
        <CardBack deckId={itemId} className="absolute left-1/2 top-1/2 w-[64%] -translate-x-[58%] -translate-y-[52%] -rotate-[8deg]" />
        <CardBack deckId={itemId} className="absolute left-1/2 top-1/2 w-[64%] -translate-x-[40%] -translate-y-[46%] rotate-[6deg]" />
      </span>
    );
  }

  if (prize.kind === 'table') {
    return (
      <FeltSwatch tableId={itemId} className={`aspect-[2/3] rounded-[10px] ${className}`}>
        <span className="absolute inset-0 rounded-[10px]" style={frame} />
        <CardBack className="absolute left-1/2 top-1/2 w-[38%] -translate-x-[78%] -translate-y-1/2 -rotate-[6deg]" />
        <CardBack className="absolute left-1/2 top-1/2 w-[38%] -translate-x-[18%] -translate-y-[46%] rotate-[5deg]" />
      </FeltSwatch>
    );
  }

  const center = 'absolute inset-0 grid place-items-center';
  let inner: React.ReactNode;
  if (prize.kind === 'tickets' || prize.kind === 'special_tickets') {
    const kind = prize.kind === 'special_tickets' ? 'special' : 'normal';
    // As fichas em leque, uma sobre a outra (1 a 3).
    inner = (
      <span className="relative block w-[62%] aspect-square">
        {Array.from({ length: amount }, (_, i) => (
          <span
            key={i}
            className="absolute w-[72%] h-[72%]"
            style={{ left: `${14 - (amount - 1) * 6 + i * 12}%`, top: `${14 + (amount - 1) * 5 - i * 10}%`, transform: `rotate(${(i - (amount - 1) / 2) * 10}deg)` }}
          >
            <ChipFace kind={kind} className="w-full h-full drop-shadow-[0_6px_8px_rgba(0,0,0,0.6)]" />
          </span>
        ))}
      </span>
    );
  } else if (prize.kind === 'avatar_frame') {
    inner = (
      <span className="grid place-items-center w-[58%] aspect-square rounded-full" style={{ boxShadow: `0 0 0 3px ${meta.color}, 0 0 0 6px rgba(244,196,84,0.35)`, background: '#0B1033' }}>
        <User className="w-1/2 h-1/2 text-white/70" />
      </span>
    );
  } else if (prize.kind === 'banner') {
    inner = <span className="block w-[78%] h-[32%] rounded-lg" style={{ background: `linear-gradient(120deg, ${meta.color}, #4b1f7a 60%, #0f1645)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' }} />;
  } else if (prize.kind === 'tag') {
    inner = <Tag className="w-[42%] h-[42%]" style={{ color: meta.color }} />;
  } else if (prize.kind === 'poker_quip') {
    inner = <MessageCircle className="w-[44%] h-[44%]" style={{ color: '#FFE8A3' }} />;
  } else if (prize.kind === 'rival') {
    inner = (
      <span className="grid place-items-center w-[56%] aspect-[5/7] rounded-md text-[clamp(18px,40%,40px)] font-bold" style={{ background: 'rgba(0,0,0,0.45)', color: '#FFE8A3', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45)' }}>
        ?
      </span>
    );
  } else {
    inner = <Gift className="w-[44%] h-[44%]" style={{ color: '#FFE8A3' }} />;
  }

  return (
    <span className={`relative block aspect-[2/3] rounded-[10px] overflow-hidden ${className}`} style={sky}>
      <span className="pj-stars" aria-hidden />
      <span className={center}>{inner}</span>
    </span>
  );
};

export default PrizeArt;
