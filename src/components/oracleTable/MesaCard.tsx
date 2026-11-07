import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOCUS_RING, ORACLE_BY_ID, withAlpha } from '../../lib/oracleTheme';
import { prefetchFullTitle } from '../../lib/titleCards';
import type { MesaCard as MesaCardT, Seat } from '../../lib/mesa/types';
import CardFace from './CardFace';
import { EspelhoBack, OracleBack } from './CardBack';
import { MoonArc } from './MesaArt';
import type { SealUi } from './useMesa';
import { cardTitle } from './mesaText';

// Uma carta da Mesa (SPEC §2.3 e §2.15), 05/11/2026. É um <button>: virada para
// baixo, o toque vira; virada, o toque mostra a leitura (e, se já está em foco,
// abre a ficha). A virada é 2D por ACHATAMENTO: o verso vai de scaleX 1 a 0 em
// 260 ms e a face de 0 a 1 em 260 ms. Nada de preserve-3d nem
// backface-visibility, que falham no WebView do APK. Com "reduzir movimento",
// um crossfade de 150 ms. O anel de foco é desenhado por fora da carta creme.

type Phase = 'back' | 'fold' | 'unfold' | 'face';

interface MesaCardProps {
  seat: Seat;
  card: MesaCardT | null;
  cardStyle: string;
  passed?: boolean;
  loading?: boolean;
  dim?: boolean;
  focused: boolean;
  seal: SealUi;
  shakeN: number;
  seenRating?: number | null;
  desktop: boolean;
  reduced: boolean;
  flipOnMount?: boolean;
  onFlipMounted?: () => void;
  onActivate: () => void;
  tabIndex: number;
  btnRef?: (el: HTMLButtonElement | null) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  compact?: boolean;
  espelhoLabel?: string;
}

const MesaCard: React.FC<MesaCardProps> = ({
  seat,
  card,
  cardStyle,
  passed = false,
  loading = false,
  dim = false,
  focused,
  seal,
  shakeN,
  seenRating = null,
  desktop,
  reduced,
  flipOnMount = false,
  onFlipMounted,
  onActivate,
  tabIndex,
  btnRef,
  onKeyDown,
  compact = false,
  espelhoLabel = '',
}) => {
  const { t, i18n } = useTranslation();
  const faceUp = !!card && card.state !== 'down';
  // A substituta chega virada, mas entra pelo verso e vira (o gesto da troca).
  const [phase, setPhase] = useState<Phase>(faceUp && !flipOnMount ? 'face' : 'back');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    if (faceUp && phase !== 'face' && phase !== 'unfold') {
      if (reduced) setPhase('face');
      else {
        const start = flipOnMount ? 300 : 0;
        timers.current.push(window.setTimeout(() => setPhase('fold'), start));
        timers.current.push(window.setTimeout(() => setPhase('unfold'), start + 260));
        timers.current.push(window.setTimeout(() => setPhase('face'), start + 520));
      }
      if (flipOnMount) onFlipMounted?.();
    } else if (!faceUp && phase !== 'back') setPhase('back');
    return () => timers.current.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceUp, reduced]);

  const oracleId = card?.title.oracle ?? (seat === 'espelho' ? 'fincher' : seat);
  const color = seat === 'espelho' ? '#B9A6FF' : ORACLE_BY_ID[oracleId].color;
  const name = seat === 'espelho' ? t('mesa.espelho.name') : ORACLE_BY_ID[seat].name;

  let label: string;
  if (passed) label = t('mesa.card.passedAria', { oracle: name });
  else if (!card) label = name;
  else if (faceUp) label = t('mesa.card.faceAria', { oracle: name, title: cardTitle(card.title, i18n.language), year: card.title.year ?? '' });
  else if (seal === 'locked') label = t('mesa.card.sealedAria');
  else if (seal === 'ready' || seal === 'breaking') label = t('mesa.card.sealOpenAria');
  else if (seat === 'espelho') label = t('mesa.card.espelhoBackAria', { label: espelhoLabel || name });
  else label = t('mesa.card.backAria', { oracle: name });

  // Estilos da virada.
  const showFaceLayer = phase !== 'back' || (reduced && faceUp);
  const backStyle: React.CSSProperties = reduced
    ? { opacity: phase === 'face' ? 0 : 1, transition: 'opacity 150ms ease' }
    : { transform: `scaleX(${phase === 'back' ? 1 : 0})`, transition: phase === 'fold' ? 'transform 260ms cubic-bezier(0.55, 0, 0.9, 0.45)' : 'none' };
  const faceStyle: React.CSSProperties = reduced
    ? { opacity: phase === 'face' ? 1 : 0, transition: 'opacity 150ms ease' }
    : { transform: `scaleX(${phase === 'face' || phase === 'unfold' ? 1 : 0})`, transition: phase === 'unfold' ? 'transform 260ms cubic-bezier(0.1, 0.55, 0.45, 1)' : 'none' };

  const lifted = focused || (phase !== 'back' && phase !== 'face');
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onActivate}
      onKeyDown={onKeyDown}
      onPointerEnter={() => card && faceUp && prefetchFullTitle({ id: card.title.tmdb_id, media_type: card.title.media_type })}
      onTouchStart={() => card && faceUp && prefetchFullTitle({ id: card.title.tmdb_id, media_type: card.title.media_type })}
      tabIndex={tabIndex}
      aria-label={label}
      aria-disabled={seal === 'locked' || passed ? true : undefined}
      aria-pressed={faceUp ? focused : undefined}
      disabled={loading}
      data-seat={seat}
      className={`ms-card group block w-full ${lifted ? 'is-focus' : ''} ${FOCUS_RING} focus-visible:outline-offset-[3px] disabled:cursor-default`}
      style={{
        boxShadow: focused && faceUp ? `0 0 0 2px ${color}, 0 18px 30px -16px rgba(0,0,0,0.85)` : '0 14px 26px -16px rgba(0,0,0,0.9)',
        cursor: seal === 'locked' || passed ? 'default' : 'pointer',
      }}
    >
      <span key={shakeN} className={`absolute inset-0 rounded-[9px] ${shakeN > 0 && !reduced ? 'ms-shake' : ''}`}>
        {loading ? (
          <span className="ms-card-back ms-skel grid place-items-start justify-center" style={{ background: '#1C1433' }}>
            <MoonArc width={compact ? 26 : desktop ? 60 : 36} className="mt-[8%] opacity-40" />
          </span>
        ) : (
          <>
            <span className="absolute inset-0 origin-center" style={backStyle} aria-hidden>
              {seat === 'espelho' ? (
                <EspelhoBack compact={compact} />
              ) : (
                <OracleBack oracle={seat} cardStyle={cardStyle} seal={seal} passed={passed} dim={dim} eager />
              )}
            </span>
            {card && showFaceLayer && (
              <span className="absolute inset-0 origin-center" style={faceStyle} aria-hidden>
                <CardFace card={card} desktop={desktop && !compact} seenRating={seenRating} eager compact={compact} />
              </span>
            )}
          </>
        )}
      </span>
      {/* Brilho na cor do bicho por cima da arte quando a carta está em foco. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-[1px] rounded-[10px] transition-opacity duration-200"
        style={{ boxShadow: `0 0 26px 2px ${withAlpha(color, 0.35)}`, opacity: focused ? 1 : 0 }}
      />
    </button>
  );
};

export default MesaCard;
