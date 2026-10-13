import React, { useRef } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import UserAvatar, { type AvatarUser } from '../UserAvatar';
import { PosterArt } from './connectionBits';
import { connectionPoster, connectionTitleName, type ConnectionSide, type ConnectionTitle } from '../../lib/connection';
import { PAPER, MIST, PIXEL, FOCUS_RING, ratingTone, withAlpha } from '../../lib/oracleTheme';

// "Onde o debate esquenta" (13/10/2026): os títulos com a maior diferença
// de nota entre os dois. Cada linha tem uma régua de 0 a 10 com os dois
// avatares nas notas. Tudo em HTML: os avatares saem do meio da régua e
// andam até a nota por transição de `left` (centralizados com margem
// negativa, não translate). Sem animação para quem prefere menos movimento.

interface DebateTrackProps {
  items: ConnectionTitle[];
  me: AvatarUser | null;
  other: ConnectionSide;
  onOpenTitle: (item: ConnectionTitle) => void;
}

const DOT = 22;

const Dot: React.FC<{ user: AvatarUser; rating: number; shown: boolean; label: string }> = ({ user, rating, shown, label }) => {
  const tone = ratingTone(rating).color;
  return (
    <span
      className="absolute top-0 flex flex-col items-center transition-[left] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={{ left: `${(shown ? rating : 5) * 10}%`, width: DOT, marginLeft: -DOT / 2 }}
      aria-label={label}
      title={label}
    >
      <span style={{ ...PIXEL, color: tone }} className="text-[13px] leading-none tabular-nums" aria-hidden>
        {rating}
      </span>
      <span className="mt-1 block rounded-full" style={{ boxShadow: `0 0 0 2px ${tone}` }} aria-hidden>
        <UserAvatar user={user} size={DOT} plain />
      </span>
    </span>
  );
};

const DebateTrack: React.FC<DebateTrackProps> = ({ items, me, other, onOpenTitle }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const inView = useInView(listRef, { once: true, amount: 0.4 });
  const shown = inView || Boolean(reduceMotion);

  const rows = [...items]
    .sort((a, b) => Math.abs((b.rating_me ?? 0) - b.rating_other) - Math.abs((a.rating_me ?? 0) - a.rating_other))
    .slice(0, 3);

  return (
    <ul ref={listRef} className="space-y-2.5">
      {rows.map((item) => {
        const title = connectionTitleName(item, lang);
        const mine = item.rating_me ?? 0;
        const theirs = item.rating_other;
        const low = Math.min(mine, theirs);
        const high = Math.max(mine, theirs);
        const lowTone = ratingTone(low).color;
        const highTone = ratingTone(high).color;
        return (
          <li
            key={`${item.media_type}:${item.movie_id}`}
            className="flex items-center gap-3 rounded-2xl p-2.5 pr-3.5"
            style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
          >
            <button
              type="button"
              onClick={() => onOpenTitle(item)}
              aria-label={title}
              className={`block shrink-0 w-11 min-h-0 min-w-0 rounded-md hover:brightness-110 transition ${FOCUS_RING}`}
            >
              <PosterArt path={connectionPoster(item, lang)} rounded="rounded-md" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium leading-snug" style={{ color: PAPER }} title={title}>
                {title}
              </p>
              <p className="text-[12px] leading-snug tabular-nums" style={{ color: MIST }}>
                {item.year ? `${item.year} · ` : ''}
                {t('connection.debate.gap', { count: high - low })}
              </p>
              {/* Régua 0–10. O recuo de meia bolinha de cada lado deixa o 0 e
                  o 10 inteiros dentro da linha. */}
              <div className="mt-1.5 px-[11px]">
                <div className="relative h-[42px]">
                  <span className="absolute inset-x-0 top-[27px] h-[3px] rounded-full bg-white/10" aria-hidden />
                  <span className="absolute top-[24px] h-[9px] w-px left-1/2 bg-white/15" aria-hidden />
                  <span
                    className="absolute top-[27px] h-[3px] rounded-full transition-[left,width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    style={{
                      left: `${(shown ? low : 5) * 10}%`,
                      width: `${shown ? (high - low) * 10 : 0}%`,
                      background: `linear-gradient(90deg, ${withAlpha(lowTone, 0.8)}, ${withAlpha(highTone, 0.8)})`,
                    }}
                    aria-hidden
                  />
                  <Dot user={me ?? {}} rating={mine} shown={shown} label={t('connection.rated.you', { rating: mine })} />
                  <Dot
                    user={other}
                    rating={theirs}
                    shown={shown}
                    label={t('connection.rated.other', { username: other.username, rating: theirs })}
                  />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default DebateTrack;
