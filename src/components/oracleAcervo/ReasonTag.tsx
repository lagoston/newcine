import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, Clapperboard, EyeOff, Globe } from 'lucide-react';
import { MIST, PIXEL, withAlpha } from '../../lib/oracleTheme';
import { MOOD_BY_KEY } from '../../lib/moods';
import type { Reason } from '../../lib/mesa/types';
import { reasonText } from './reasonText';

// A linha do porquê embaixo de cada pôster do Acervo (09/11/2026): o sinal da
// origem (a miniatura do título que a pessoa avaliou, o avatar do amigo, a
// letra do humor, a marca da Watchlist…) e uma frase curta. Faz parte do
// botão do pôster: o leitor de tela lê "título, porquê" de uma vez.

const BOX = 'shrink-0 inline-grid place-items-center w-4 h-4';

function Origin({ reason }: { reason: Reason }) {
  const f = reason.facts ?? {};
  switch (reason.type) {
    case 'anchor_director':
    case 'anchor_kw': {
      const poster = typeof f.anchor_poster === 'string' && f.anchor_poster ? f.anchor_poster : null;
      return poster ? (
        <img
          src={`https://image.tmdb.org/t/p/w92${poster}`}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="shrink-0 w-4 h-6 rounded-[2px] object-cover"
          style={{ boxShadow: '0 0 0 1px rgba(243,234,211,0.28)' }}
        />
      ) : null;
    }
    case 'friend':
      return typeof f.avatar_url === 'string' && f.avatar_url ? (
        <img src={f.avatar_url} alt="" aria-hidden loading="lazy" decoding="async" className="shrink-0 w-4 h-4 rounded-full object-cover" />
      ) : null;
    case 'watchlist':
      return (
        <span className={`${BOX} rounded-full bg-sky-500/90`} aria-hidden>
          <Bookmark className="w-2.5 h-2.5 text-white fill-current" />
        </span>
      );
    case 'mood_affinity':
    case 'cypher_mood': {
      const m = typeof f.mood === 'string' ? MOOD_BY_KEY[f.mood] : null;
      return m ? (
        <span
          aria-hidden
          className={`${BOX} rounded-[3px]`}
          style={{ ...PIXEL, fontSize: 10, color: m.color, background: withAlpha(m.color, 0.16), boxShadow: `inset 0 0 0 1px ${withAlpha(m.color, 0.45)}` }}
        >
          {m.letter}
        </span>
      ) : null;
    }
    case 'cypher_country':
      return <Globe className="shrink-0 w-3.5 h-3.5" style={{ color: MIST }} aria-hidden />;
    case 'cypher_decade':
      return <Clapperboard className="shrink-0 w-3.5 h-3.5" style={{ color: MIST }} aria-hidden />;
    case 'hidden':
      return <EyeOff className="shrink-0 w-3.5 h-3.5" style={{ color: MIST }} aria-hidden />;
    default:
      return null;
  }
}

const ReasonTag: React.FC<{ reason: Reason }> = ({ reason }) => {
  const { t, i18n } = useTranslation();
  const text = reasonText(t, reason, i18n.language || 'pt');
  if (!text) return null;
  return (
    <span className="mt-1.5 flex items-start gap-1.5 min-w-0">
      <span className="mt-px">
        <Origin reason={reason} />
      </span>
      <span className="min-w-0 text-[12px] sm:text-[12.5px] leading-[1.35] line-clamp-3 break-words" style={{ color: MIST }}>
        {text}
      </span>
    </span>
  );
};

export default ReasonTag;
