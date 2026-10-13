import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Popcorn, LogIn } from 'lucide-react';
import DuoAvatars from './DuoAvatars';
import { PosterArt } from './connectionBits';
import { useCountUp } from '../profile/observatoryKit';
import type { ConnectionStatus } from '../../hooks/useConnection';
import {
  connectionTone,
  connectionPoster,
  connectionTitleName,
  confidenceKey,
  formatConnection,
  CONNECTION_MIN_SHARED,
  type ConnectionDetail,
  type ConnectionSide,
} from '../../lib/connection';
import { PAPER, MIST, PIXEL, FOCUS_RING, withAlpha } from '../../lib/oracleTheme';
import type { AvatarUser } from '../UserAvatar';

// A Conexão no cartão de identidade de outra pessoa (13/10/2026). Fica
// embaixo do nome, na faixa do banner (e não no avatar, onde moldura e
// gorro de época já disputam espaço): dois pôsteres que os dois amam, o
// número na cor da faixa e uma frase do que os une. Tocar abre a gaveta
// Conexão; a pipoca abre a gaveta direto em "Assistam juntos".
//
// Sem número ainda (menos de 5 títulos em comum): "Conexão em formação",
// que abre a gaveta em "Afine a conexão". Sem login: um convite para
// entrar. Você mesmo, perfil que não dá para ver ou erro: nada (nunca um
// "privado").
//
// Superfície: noite translúcida com realce no alto e contorno na cor da
// faixa, sem backdrop-filter (os banners têm animação; o desfoque refaria
// a cada quadro).

export type ConnectionSection = 'watch' | 'calibrate';

interface ConnectionStripProps {
  other: ConnectionSide;
  me: AvatarUser | null;
  detail: ConnectionDetail | null;
  status: ConnectionStatus;
  // Visitante sem login.
  guest: boolean;
  onOpen: (section?: ConnectionSection) => void;
  className?: string;
}

// Violeta da marca para os estados sem número (formação, visitante).
const NEUTRAL_TONE = '#A78BFA';

const surface = (tone: string): React.CSSProperties => ({
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%), rgba(18,13,34,0.62)',
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), inset 0 0 0 1px ${withAlpha(tone, 0.35)}`,
});

const WRAP = 'w-full sm:max-w-[440px] mx-auto sm:mx-0 text-left';

// Dois pôsteres em leque (rotação fixa no CSS; o framer só sobe o wrapper).
const PosterFan: React.FC<{ paths: (string | null)[] }> = ({ paths }) => {
  const reduceMotion = useReducedMotion();
  return (
    <span className="relative block shrink-0 w-[46px] h-[50px]" aria-hidden>
      {paths.slice(0, 2).map((path, i) => (
        <motion.span
          key={i}
          className="absolute top-[2px] block"
          // Com um pôster só, ele fica no meio.
          style={{ left: paths.length === 1 ? 8 : i === 0 ? 14 : 0, zIndex: i === 0 ? 1 : 0 }}
          initial={reduceMotion ? false : { y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.15 + (1 - i) * 0.06 }}
        >
          <span className="block" style={{ transform: `rotate(${paths.length === 1 ? -4 : i === 0 ? 6 : -6}deg)` }}>
            <PosterArt path={path} className="w-[30px] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.8)]" rounded="rounded-[5px]" />
          </span>
        </motion.span>
      ))}
    </span>
  );
};

// O número subindo (0 → 87) quando a faixa aparece.
const CountUpPct: React.FC<{ pct: number; low: boolean; color: string; className?: string }> = ({ pct, low, color, className = '' }) => {
  const { ref, value } = useCountUp(pct, 900);
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ ...PIXEL, color }} className={`tabular-nums leading-none ${className}`}>
      {low ? '~' : ''}
      {Math.round(value)}%
    </span>
  );
};

const WatchButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={`shrink-0 self-stretch min-w-[52px] px-3 sm:px-4 gap-2 text-[13px] font-medium hover:bg-white/[0.06] transition ${FOCUS_RING}`}
    style={{ color: PAPER }}
  >
    <Popcorn className="w-5 h-5 shrink-0 text-amber-200" aria-hidden />
    <span className="hidden sm:inline whitespace-nowrap" aria-hidden>
      {label}
    </span>
  </button>
);

const ConnectionStrip: React.FC<ConnectionStripProps> = ({ other, me, detail, status, guest, onOpen, className = '' }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  if (guest) {
    return (
      <div className={`${WRAP} ${className}`}>
        <div className="flex items-center gap-3 min-h-[64px] py-2.5 pl-3 pr-2.5 rounded-2xl" style={surface(NEUTRAL_TONE)}>
          <DuoAvatars me={null} other={other} size={26} />
          <p className="flex-1 min-w-0 text-[13.5px] leading-snug" style={{ color: PAPER }}>
            {t('connection.strip.guest', { username: other.username })}
          </p>
          <Link
            to="/auth"
            className={`shrink-0 gap-1.5 h-11 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold transition ${FOCUS_RING}`}
          >
            <LogIn className="w-4 h-4" aria-hidden />
            {t('connection.strip.signIn')}
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className={`${WRAP} ${className}`} aria-hidden>
        <div className="h-[78px] sm:h-16 rounded-2xl motion-safe:animate-pulse" style={surface(NEUTRAL_TONE)} />
      </div>
    );
  }

  if (status !== 'ready' || !detail) return null;

  const watchLabel = t('connection.strip.watch');
  const hasNumber = detail.pct !== null && detail.confidence !== 'none';

  if (!hasNumber) {
    const missing = Math.max(1, CONNECTION_MIN_SHARED - detail.shared_count);
    return (
      <div className={`${WRAP} ${className}`}>
        <div className="flex items-stretch min-h-[64px] rounded-2xl overflow-hidden" style={surface(NEUTRAL_TONE)}>
          <button
            type="button"
            onClick={() => onOpen('calibrate')}
            className={`flex-1 min-w-0 justify-start gap-2.5 py-2 pl-2.5 pr-2 text-left hover:bg-white/[0.04] transition ${FOCUS_RING}`}
          >
            <DuoAvatars me={me} other={other} size={22} />
            <span className="min-w-0 flex-1 flex flex-col gap-1">
              <span style={{ ...PIXEL, color: PAPER }} className="text-[15px] leading-tight">
                {t('connection.strip.forming')}
              </span>
              <span className="text-[12.5px] leading-tight line-clamp-2" style={{ color: MIST }}>
                {t('connection.strip.formingHint', { count: missing })}
              </span>
            </span>
            {/* No celular o texto precisa do espaço da seta. */}
            <ChevronRight className="hidden sm:block w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
          </button>
          <span className="w-px my-3 bg-white/10 shrink-0" aria-hidden />
          <WatchButton onClick={() => onOpen('watch')} label={watchLabel} />
        </div>
      </div>
    );
  }

  const pct = detail.pct as number;
  const confidence = detail.confidence as Exclude<ConnectionDetail['confidence'], 'none'>;
  const tone = connectionTone(pct).color;
  const low = confidence === 'low';
  // O que une os dois: um título com a mesma nota (o mais forte primeiro).
  const bond = detail.loves.find((item) => item.rating_me === item.rating_other);
  const line = low
    ? t('connection.strip.preview', { count: detail.shared_count })
    : bond
      ? t('connection.strip.bond', { rating: bond.rating_other, title: connectionTitleName(bond, lang) })
      : t('connection.strip.shared', { count: detail.shared_count });
  const posters = detail.loves.slice(0, 2).map((item) => connectionPoster(item, lang));
  const openLabel = t('connection.strip.openAria', {
    value: formatConnection(pct, confidence),
    username: other.username,
    confidence: t(confidenceKey(confidence)),
  });

  return (
    <div className={`${WRAP} ${className}`}>
      <div className="flex items-stretch min-h-[64px] rounded-2xl overflow-hidden" style={surface(tone)}>
        <button
          type="button"
          onClick={() => onOpen()}
          aria-label={`${openLabel}. ${line}`}
          className={`flex-1 min-w-0 justify-start gap-3 py-2 pl-2.5 pr-2 text-left hover:bg-white/[0.04] transition ${FOCUS_RING}`}
        >
          {posters.length > 0 ? <PosterFan paths={posters} /> : <DuoAvatars me={me} other={other} size={26} />}
          <span className="min-w-0 flex-1 flex flex-col gap-1" aria-hidden>
            <span className="flex items-baseline gap-1.5 min-w-0">
              <CountUpPct pct={pct} low={low} color={tone} className="text-[28px]" />
              <span className="text-[13px] truncate" style={{ color: MIST }}>
                {t('connection.label')}
              </span>
            </span>
            <span className="text-[12.5px] leading-tight line-clamp-2" style={{ color: 'rgba(243,234,211,0.82)' }}>
              {line}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
        </button>
        <span className="w-px my-3 bg-white/10 shrink-0" aria-hidden />
        <WatchButton onClick={() => onOpen('watch')} label={watchLabel} />
      </div>
    </div>
  );
};

export default ConnectionStrip;
