import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Eye, User as UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import OptimizedPoster from '../OptimizedPoster';
import PredictedBadge from '../PredictedBadge';
import UserAvatar from '../UserAvatar';
import { useReveal } from '../../hooks/useLazyList';
import { PIXEL, FOCUS_RING, POSTER_TITLE, ratingTone } from '../../lib/oracleTheme';
import { cardKey, cardPoster, cardTitle, pick, type RealPerson, type RoomCard, type SecretRoomPerson } from '../../lib/secretRooms';
import { ASH, BLOOD_TEXT, BONE, CANDLE, CRYPT, CRYPT_RAISED, OXBLOOD } from './terrorTheme';

// As prateleiras do Clube do Terror. Cada tipo de prateleira mostra o que
// a torna diferente: a posição no estudo de batimentos, o carimbo de
// proibido com o país, a ficha da pessoa real, a virada escondida, o REC
// das fitas achadas, a nota de quem é dono da estante.

export const SHELF_PAD = 'px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))]';
const TILE_WIDTH = 'w-[124px] sm:w-[148px]';

export interface TileContext {
  pt: boolean;
  // nota prevista e nota dada por quem está na sala ("movie:123")
  predicted: (card: RoomCard) => number | null;
  seen: (card: RoomCard) => number | null | undefined;
  onOpen: (card: RoomCard) => void;
}

// Arrastar com o mouse no desktop (a barra de rolagem fica escondida).
function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, scroll: 0, distance: 0 });
  const onMouseDown = (e: React.MouseEvent) => {
    if (!ref.current) return;
    drag.current = { active: true, startX: e.pageX, scroll: ref.current.scrollLeft, distance: 0 };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current.active || !ref.current) return;
    const dx = e.pageX - drag.current.startX;
    drag.current.distance = Math.abs(dx);
    if (drag.current.distance > 3) e.preventDefault();
    ref.current.scrollLeft = drag.current.scroll - dx;
  };
  const end = () => {
    drag.current.active = false;
  };
  const wasDrag = () => drag.current.distance > 5;
  return { ref, wasDrag, handlers: { onMouseDown, onMouseMove, onMouseUp: end, onMouseLeave: end } };
}

// O cabeçalho e a faixa de uma prateleira.
export const ShelfFrame: React.FC<{
  id: string;
  title: React.ReactNode;
  hint?: React.ReactNode;
  leading?: React.ReactNode;
  accent?: string;
  decoration?: React.ReactNode;
  children: (wasDrag: () => boolean) => React.ReactNode;
}> = ({ id, title, hint, leading, accent = OXBLOOD, decoration, children }) => {
  const { ref, wasDrag, handlers } = useDragScroll();
  return (
    <section aria-labelledby={`room-shelf-${id}`} className="py-7 sm:py-9">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex items-center gap-3">
          {leading}
          <div className="min-w-0 flex-1">
            <h2 id={`room-shelf-${id}`} style={{ ...PIXEL, color: BONE }} className="text-2xl sm:text-3xl leading-tight">
              {title}
            </h2>
            {hint && (
              <p className="mt-1 text-sm leading-snug max-w-2xl" style={{ color: ASH }}>
                {hint}
              </p>
            )}
          </div>
        </div>
        {decoration ?? <span aria-hidden className="mt-4 block h-px" style={{ background: `linear-gradient(90deg, ${accent}, transparent 70%)` }} />}
      </div>
      <div
        ref={ref}
        className="mt-4 pt-2 overflow-x-auto cursor-grab active:cursor-grabbing select-none"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        {...handlers}
      >
        <ol className={`flex gap-4 pb-2 ${SHELF_PAD}`}>{children(wasDrag)}</ol>
      </div>
    </section>
  );
};

// Selo "sua nota" (já viu) — no lugar da nota prevista.
const SeenChip: React.FC<{ rating: number | null }> = ({ rating }) => {
  const { t } = useTranslation();
  const tone = ratingTone(rating);
  return (
    <span
      className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-xs shadow-lg"
      style={{ background: 'rgba(15,8,17,0.9)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
      title={rating === null ? t('secretRoom.inYourList') : t('secretRoom.yourRating', { rating })}
    >
      <Eye className="w-3 h-3" aria-hidden />
      <span className="sr-only">{rating === null ? t('secretRoom.inYourList') : t('secretRoom.yourRating', { rating })}</span>
      {rating !== null && (
        <span style={PIXEL} className="text-sm leading-none" aria-hidden>
          {rating}
        </span>
      )}
    </span>
  );
};

// Um pôster da sala. `overlay` vai por cima da imagem; `below`, embaixo do
// título.
export const PosterTile: React.FC<{
  card: RoomCard;
  ctx: TileContext;
  wasDrag: () => boolean;
  overlay?: React.ReactNode;
  below?: React.ReactNode;
  hideBadge?: boolean;
  width?: string;
}> = ({ card, ctx, wasDrag, overlay, below, hideBadge, width = TILE_WIDTH }) => {
  const reveal = useReveal();
  const title = cardTitle(card, ctx.pt);
  const poster = cardPoster(card, ctx.pt);
  const seen = ctx.seen(card);
  const predicted = ctx.predicted(card);
  return (
    <li ref={reveal} className={`reveal-tile group relative shrink-0 ${width}`}>
      <button
        type="button"
        onClick={() => !wasDrag() && ctx.onOpen(card)}
        className={`block w-full text-left rounded-xl ${FOCUS_RING}`}
      >
        <span
          className="relative block aspect-[2/3] rounded-xl overflow-hidden shadow-xl transition-transform duration-200 group-hover:-translate-y-1"
          style={{ background: CRYPT_RAISED, boxShadow: `0 18px 30px -18px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(243,234,211,0.08)` }}
        >
          {poster ? (
            <OptimizedPoster src={poster} alt={title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: ASH }}>
              <Film className="w-7 h-7" aria-hidden />
              <span className="text-xs leading-snug line-clamp-3" style={{ color: BONE }}>
                {title}
              </span>
            </span>
          )}
          {!hideBadge && (seen !== undefined ? <SeenChip rating={seen} /> : predicted !== null && <PredictedBadge rating={predicted} />)}
          {overlay}
        </span>
        <span className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: BONE }} title={title}>
          {title}
        </span>
        {card.y ? (
          <span className="mt-0.5 block text-xs" style={{ color: ASH }}>
            {card.y}
          </span>
        ) : null}
      </button>
      {below}
    </li>
  );
};

// ---------------------------------------------------------------------------
// Medidos no coração
// ---------------------------------------------------------------------------

// Um traço de eletrocardiograma, embaixo do título da prateleira.
export const HeartbeatRule: React.FC = () => (
  <svg viewBox="0 0 600 28" preserveAspectRatio="none" className="mt-3 block w-full h-7" aria-hidden>
    <defs>
      <linearGradient id="room-ecg" x1="0" x2="1">
        <stop offset="0" stopColor={BLOOD_TEXT} stopOpacity="0.95" />
        <stop offset="0.75" stopColor={BLOOD_TEXT} stopOpacity="0.15" />
        <stop offset="1" stopColor={BLOOD_TEXT} stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      d="M0 18 H70 L78 18 L84 8 L90 24 L96 18 H170 L178 18 L186 2 L194 27 L201 18 H290 L298 18 L304 10 L310 22 L316 18 H600"
      fill="none"
      stroke="url(#room-ecg)"
      strokeWidth="1.6"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

export const RankChip: React.FC<{ rank: number }> = ({ rank }) => {
  const { t } = useTranslation();
  return (
    <span
      className="absolute bottom-1.5 left-1.5 grid place-items-center min-w-[2.25rem] h-8 px-1.5 rounded-lg text-lg leading-none shadow-lg"
      style={{ ...PIXEL, background: CANDLE, color: CRYPT }}
      aria-label={t('secretRoom.science.rankAria', { rank })}
    >
      {t('secretRoom.science.rank', { rank })}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Proibidos: a ficha do filme, com o carimbo.
// ---------------------------------------------------------------------------

export const BannedCard: React.FC<{ card: RoomCard; ctx: TileContext; wasDrag: () => boolean }> = ({ card, ctx, wasDrag }) => {
  const { t } = useTranslation();
  const reveal = useReveal();
  const title = cardTitle(card, ctx.pt);
  const poster = cardPoster(card, ctx.pt, 'w185');
  const seen = ctx.seen(card);
  const predicted = ctx.predicted(card);
  return (
    <li ref={reveal} className="reveal-tile shrink-0 w-[288px] sm:w-[320px]">
      <button
        type="button"
        onClick={() => !wasDrag() && ctx.onOpen(card)}
        className={`group w-full h-full flex gap-3.5 text-left rounded-2xl p-3 transition hover:brightness-110 ${FOCUS_RING}`}
        style={{ background: CRYPT_RAISED, boxShadow: `inset 0 0 0 1px rgba(238,114,114,0.22)` }}
      >
        <span className="relative block w-[96px] shrink-0 aspect-[2/3] rounded-lg overflow-hidden" style={{ background: CRYPT }}>
          {poster ? (
            <OptimizedPoster src={poster} alt={title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <Film className="absolute inset-0 m-auto w-6 h-6" style={{ color: ASH }} aria-hidden />
          )}
          {seen !== undefined ? <SeenChip rating={seen} /> : predicted !== null && <PredictedBadge rating={predicted} />}
          <span
            aria-hidden
            className="absolute left-1/2 bottom-3 -translate-x-1/2 -rotate-[9deg] px-2 py-0.5 rounded-sm text-base leading-none whitespace-nowrap"
            style={{ ...PIXEL, color: BLOOD_TEXT, background: 'rgba(15,8,17,0.78)', boxShadow: `inset 0 0 0 2px ${BLOOD_TEXT}` }}
          >
            {t('secretRoom.banned.stamp')}
          </span>
        </span>
        <span className="min-w-0 flex-1 flex flex-col">
          <span className="text-[15px] font-semibold leading-snug line-clamp-2" style={{ color: BONE }}>
            {title}
          </span>
          <span className="mt-1 text-sm font-medium" style={{ color: BLOOD_TEXT }}>
            {t('secretRoom.banned.where', { where: pick(ctx.pt, card.where_pt, card.where_en) })}
          </span>
          <span className="mt-1.5 text-[13px] leading-snug line-clamp-5" style={{ color: ASH }}>
            {pick(ctx.pt, card.note_pt, card.note_en)}
          </span>
        </span>
      </button>
    </li>
  );
};

// ---------------------------------------------------------------------------
// Monstros reais: a ficha da pessoa e os filmes sobre ela.
// ---------------------------------------------------------------------------

export const RealPersonCard: React.FC<{ person: RealPerson; titles: RoomCard[]; ctx: TileContext; wasDrag: () => boolean }> = ({ person, titles, ctx, wasDrag }) => {
  const { t } = useTranslation();
  const reveal = useReveal();
  const name = ctx.pt ? person.name : person.name_en || person.name;
  return (
    <li ref={reveal} className="reveal-tile shrink-0 w-[300px] sm:w-[340px]">
      <article className="h-full flex flex-col rounded-2xl p-3.5" style={{ background: CRYPT_RAISED, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.1)' }}>
        <div className="flex gap-3.5">
          <span className="relative block w-[84px] shrink-0 aspect-[3/4] rounded-lg overflow-hidden" style={{ background: CRYPT }}>
            {person.photo ? (
              <img
                src={`https://image.tmdb.org/t/p/w185${person.photo}`}
                alt={t('secretRoom.real.photoAlt', { name })}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover grayscale contrast-[1.05]"
              />
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center" style={{ color: ASH }}>
                <UserIcon className="w-7 h-7" aria-hidden />
                <span className="text-[11px] leading-tight">{person.unknown ? t('secretRoom.real.neverIdentified') : t('secretRoom.real.noPhoto')}</span>
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug" style={{ color: BONE }}>
              {name}
            </h3>
            <p className="mt-0.5 text-xs" style={{ color: CANDLE }}>
              {person.years}
            </p>
            <p className="text-xs" style={{ color: ASH }}>
              {pick(ctx.pt, person.place_pt, person.place_en)}
            </p>
            <p className="mt-1.5 text-[13px] leading-snug" style={{ color: ASH }}>
              {pick(ctx.pt, person.line_pt, person.line_en)}
            </p>
          </div>
        </div>
        <ul className="mt-3 pt-3 flex gap-2.5 border-t" style={{ borderColor: 'rgba(243,234,211,0.08)' }} aria-label={t('secretRoom.real.titlesAria', { name })}>
          {titles.map((card) => {
            const title = cardTitle(card, ctx.pt);
            const poster = cardPoster(card, ctx.pt, 'w154');
            return (
              <li key={cardKey(card)} className="w-[76px] shrink-0">
                <button type="button" onClick={() => !wasDrag() && ctx.onOpen(card)} className={`block w-full text-left rounded-md ${FOCUS_RING}`} title={title}>
                  <span className="relative block aspect-[2/3] rounded-md overflow-hidden" style={{ background: CRYPT }}>
                    {poster ? <OptimizedPoster src={poster} alt={title} className="absolute inset-0 w-full h-full object-cover" /> : <Film className="absolute inset-0 m-auto w-5 h-5" style={{ color: ASH }} aria-hidden />}
                  </span>
                  <span className="mt-1.5 text-[12px] font-medium leading-tight line-clamp-2 break-words" style={{ color: BONE }}>
                    {title}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-tight" style={{ color: ASH }}>
                    {card.rel === 'portrayed' ? t('secretRoom.real.portrayed') : t('secretRoom.real.inspired')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </article>
    </li>
  );
};

// ---------------------------------------------------------------------------
// Viradas: começa como uma coisa; tocar revela no que vira.
// ---------------------------------------------------------------------------

export const TwistTile: React.FC<{ card: RoomCard; ctx: TileContext; wasDrag: () => boolean }> = ({ card, ctx, wasDrag }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const from = pick(ctx.pt, card.from_pt, card.from_en);
  const to = pick(ctx.pt, card.to_pt, card.to_en);
  return (
    <PosterTile
      card={card}
      ctx={ctx}
      wasDrag={wasDrag}
      below={
        <div className="mt-2 text-xs leading-snug">
          <p style={{ color: ASH }}>{t('secretRoom.twist.starts', { genre: from })}</p>
          <button
            type="button"
            onClick={() => !wasDrag() && setOpen((v) => !v)}
            aria-expanded={open}
            className={`mt-1 w-full min-h-[36px] px-2 py-1.5 rounded-lg text-left transition ${FOCUS_RING}`}
            style={
              open
                ? { color: CRYPT, background: CANDLE }
                : { color: CANDLE, background: 'rgba(255,181,71,0.08)', boxShadow: 'inset 0 0 0 1px rgba(255,181,71,0.35)' }
            }
          >
            {open ? (card.twist === 'ending' || !to ? t('secretRoom.twist.ending') : t('secretRoom.twist.becomes', { genre: to })) : t('secretRoom.twist.reveal')}
          </button>
        </div>
      }
    />
  );
};

// O REC das fitas achadas.
export const RecMark: React.FC = () => (
  <span
    aria-hidden
    className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs leading-none"
    style={{ ...PIXEL, color: '#FF5A5A', background: 'rgba(15,8,17,0.72)' }}
  >
    <span className="w-2 h-2 rounded-full bg-[#FF3B3B] animate-pulse motion-reduce:animate-none" />
    REC
  </span>
);

// A nota de quem é dono da estante.
export const OwnerRating: React.FC<{ rating: number; username: string }> = ({ rating, username }) => {
  const { t } = useTranslation();
  const tone = ratingTone(rating);
  return (
    <span
      className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-sm leading-none shadow-lg"
      style={{ ...PIXEL, color: tone.color, background: 'rgba(15,8,17,0.88)', boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
      title={t('secretRoom.members.ownerRating', { username, rating })}
    >
      <span className="sr-only">{t('secretRoom.members.ownerRating', { username, rating })}</span>
      <span aria-hidden>{rating}</span>
    </span>
  );
};

export const MemberLeading: React.FC<{ user: SecretRoomPerson }> = ({ user }) => (
  <Link to={`/profile/${user.username}`} className={`shrink-0 rounded-full ${FOCUS_RING}`} aria-label={`@${user.username}`}>
    <UserAvatar user={user} size={44} />
  </Link>
);
