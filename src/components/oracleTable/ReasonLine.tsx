import React from 'react';
import { Bookmark, Clock, Clapperboard, EyeOff, Globe, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MIST, PAPER, PIXEL, ORACLE_BY_ID, withAlpha, FOCUS_RING } from '../../lib/oracleTheme';
import { MOOD_BY_KEY } from '../../lib/moods';
import type { Reason } from '../../lib/mesa/types';
import { EyeMark } from './MesaArt';
import { OCCASION_ICON } from './occasionIcons';
import { reasonText } from './mesaText';

// O porquê de uma carta (SPEC §2.4 e §5.8), 05/11/2026: uma linha com o sinal
// da origem antes do texto (o pôster do título-âncora, a letra colorida do
// humor, o avatar do amigo, a marca da Watchlist, um relógio…). As provas
// menores vêm embaixo, em MIST, sem ícone grande.

const MoodLetter: React.FC<{ mood: string; size?: number }> = ({ mood, size = 20 }) => {
  const m = MOOD_BY_KEY[mood];
  if (!m) return null;
  return (
    <span
      aria-hidden
      className="inline-grid place-items-center shrink-0 rounded-[4px]"
      style={{ ...PIXEL, width: size, height: size, fontSize: size * 0.62, color: m.color, background: withAlpha(m.color, 0.16), boxShadow: `inset 0 0 0 1px ${withAlpha(m.color, 0.45)}` }}
    >
      {m.letter}
    </span>
  );
};

function OriginIcon({ reason, onAnchor }: { reason: Reason; onAnchor?: (ref: { id: number; media_type: 'movie' | 'tv' }) => void }) {
  const { t, i18n } = useTranslation();
  const f = reason.facts ?? {};
  const box = 'shrink-0 inline-grid place-items-center w-5 h-5';
  switch (reason.type) {
    case 'anchor_director':
    case 'anchor_kw': {
      const poster = typeof f.anchor_poster === 'string' ? f.anchor_poster : null;
      const img = poster ? (
        <img src={`https://image.tmdb.org/t/p/w92${poster}`} alt="" className="w-5 h-[30px] rounded-[2px] object-cover" style={{ boxShadow: '0 0 0 1px rgba(243,234,211,0.25)' }} />
      ) : (
        <Star className="w-4 h-4" style={{ color: '#F9A8D4' }} />
      );
      // Abre a ficha do título-âncora quando o servidor manda o id dele.
      // Nomes do banco ao vivo: anchor_tmdb_id e anchor_media_type (os antigos
      // ficam como reserva).
      const rawId = f.anchor_tmdb_id ?? f.anchor_tmdb ?? f.anchor_id;
      const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : null;
      const media = (f.anchor_media_type ?? f.anchor_media) === 'tv' ? 'tv' : 'movie';
      if (id && onAnchor) {
        const title = String((i18n.language.startsWith('pt') ? f.anchor_title_pt || f.anchor_title_en : f.anchor_title_en || f.anchor_title_pt) ?? '');
        return (
          <button type="button" onClick={() => onAnchor({ id, media_type: media })} aria-label={t('mesa.reading.anchorOpen', { title })} className={`shrink-0 rounded-[2px] ${FOCUS_RING}`}>
            {img}
          </button>
        );
      }
      return <span className="shrink-0" aria-hidden>{img}</span>;
    }
    case 'watchlist':
      return <span className={`${box} rounded-full bg-sky-500/90`} aria-hidden><Bookmark className="w-3 h-3 text-white fill-current" /></span>;
    case 'friend':
      return typeof f.avatar_url === 'string' && f.avatar_url ? (
        <img src={f.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
      ) : (
        <span className={`${box} rounded-full`} style={{ background: 'rgba(243,234,211,0.12)', color: PAPER, ...PIXEL, fontSize: 11 }} aria-hidden>
          {String(f.username ?? '?').charAt(0).toUpperCase()}
        </span>
      );
    case 'mood_affinity':
    case 'cypher_mood':
    case 'mood_ask':
    case 'recognition':
    case 'reveal':
      return <MoodLetter mood={String(f.mood ?? '')} />;
    case 'cypher_country':
      return <span className={box} aria-hidden><Globe className="w-4 h-4" style={{ color: MIST }} /></span>;
    case 'cypher_decade':
      return <span className={box} aria-hidden><Clapperboard className="w-4 h-4" style={{ color: MIST }} /></span>;
    case 'hidden':
      return <span className={box} aria-hidden><EyeOff className="w-4 h-4" style={{ color: MIST }} /></span>;
    case 'occasion_runtime':
    case 'occasion_episode':
    case 'occasion_binge':
      return <span className={box} aria-hidden><Clock className="w-4 h-4" style={{ color: MIST }} /></span>;
    case 'occasion_comment': {
      const key = String(f.oracle);
      const o = ORACLE_BY_ID[key === 'bogart' || key === 'cypher' ? key : 'fincher'];
      return <img src={o.avatar} alt="" aria-hidden className="w-5 h-5 rounded-full object-cover shrink-0" />;
    }
    case 'occasion_tone': {
      const Icon = OCCASION_ICON[String(f.occasion ?? '')] ?? Clock;
      return <span className={box} aria-hidden><Icon className="w-4 h-4" style={{ color: MIST }} /></span>;
    }
    case 'espelho_best':
      return <span className={box} aria-hidden><EyeMark size={18} /></span>;
    default:
      return <span className={box} aria-hidden><Star className="w-4 h-4" style={{ color: MIST }} /></span>;
  }
}

const ReasonLine: React.FC<{ reason: Reason; evidence: Reason[]; onAnchor?: (ref: { id: number; media_type: 'movie' | 'tv' }) => void }> = ({ reason, evidence, onAnchor }) => {
  const { t, i18n } = useTranslation();
  const main = reasonText(t, reason, i18n.language);
  const proofs = evidence.map((r) => reasonText(t, r, i18n.language)).filter(Boolean).slice(0, 2);
  if (!main && !proofs.length) return null;
  return (
    <div className="space-y-1.5">
      {main && (
        <div className="flex items-center gap-2.5 min-h-[30px]">
          <OriginIcon reason={reason} onAnchor={onAnchor} />
          <p className="text-[14px] leading-snug" style={{ color: PAPER }}>
            {main}
          </p>
        </div>
      )}
      {proofs.map((p, i) => (
        <p key={i} className="text-[12.5px] leading-snug pl-[30px]" style={{ color: MIST }}>
          {p}
        </p>
      ))}
    </div>
  );
};

export default ReasonLine;
