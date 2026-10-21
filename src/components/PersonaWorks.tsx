import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Movie } from '../lib/tmdb';
import { getFullTitle, prefetchFullTitle, titleKey, type TitleRef } from '../lib/titleCards';
import { useTitleCards } from '../hooks/useLazyList';
import { personaText, type PersonaEntry } from '../lib/persona';
import { MIST, PAPER, PIXEL, VELVET, FOCUS_RING, ratingTone } from '../lib/oracleTheme';
import MovieDetailsModal from './MovieDetailsModal';

// As obras das prateleiras em que o personagem da persona aparece (o filme
// dele primeiro): Harry Potter nos oito filmes, o Batman em todos os
// Batmans, o Drácula do Bela Lugosi ao Hotel Transilvânia. Pôsteres
// pequenos numa fileira que rola de lado; tocar abre o título. Quem está
// olhando vê a própria nota nas que já viu (ou o olho, se está na Watchlist).

const PersonaWorks: React.FC<{
  persona: PersonaEntry;
  seen?: Record<string, number | null>;
  // Fundo de quem usa (para o degradê das bordas da fileira).
  className?: string;
  size?: 'sm' | 'md';
}> = ({ persona, seen = {}, className = '', size = 'md' }) => {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<Movie | null>(null);
  const refs: TitleRef[] = useMemo(() => persona.works.map((w) => ({ id: w.id, media_type: w.type })), [persona.works]);
  const cardOf = useTitleCards(refs, refs.length, { enabled: refs.length > 0, ahead: 0 });

  // Setas só quando a fileira não cabe (no celular, o dedo já rola). As
  // bordas esmaecem do lado em que ainda há pôsteres escondidos.
  const listRef = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const start = el.scrollLeft > 4;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  useEffect(() => {
    measure();
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, refs.length]);
  const page = (dir: 1 | -1) => {
    const el = listRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (refs.length === 0) return null;

  const text = personaText(persona, i18n.language);
  const seenCount = refs.filter((ref) => typeof seen[titleKey(ref)] === 'number').length;
  const width = size === 'sm' ? 'w-[60px] sm:w-[68px]' : 'w-[68px] sm:w-[84px]';

  const open = async (ref: TitleRef) => {
    try {
      setSelected(await getFullTitle(ref));
    } catch {
      const card = cardOf(ref);
      if (card) setSelected(card);
    }
  };

  return (
    <section className={className} aria-label={t('oracle.persona.worksTitle', { character: text.character })}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium" style={{ color: PAPER }}>
          {t('oracle.persona.worksTitle', { character: text.character })}
        </p>
        <div className="shrink-0 flex items-center gap-2">
          <p className="text-xs tabular-nums" style={{ color: MIST }}>
            {seenCount > 0 ? t('oracle.persona.worksSeen', { seen: seenCount, count: refs.length }) : t('oracle.persona.worksCount', { count: refs.length })}
          </p>
          {(edges.start || edges.end) && (
            <span className="hidden sm:flex items-center gap-1">
              {([-1, 1] as const).map((dir) => {
                const Icon = dir < 0 ? ChevronLeft : ChevronRight;
                const disabled = dir < 0 ? !edges.start : !edges.end;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => page(dir)}
                    disabled={disabled}
                    aria-label={t(dir < 0 ? 'oracle.persona.worksPrev' : 'oracle.persona.worksNext')}
                    className={`grid place-items-center w-7 h-7 rounded-full ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent ${FOCUS_RING}`}
                    style={{ color: PAPER }}
                  >
                    <Icon className="w-4 h-4" aria-hidden />
                  </button>
                );
              })}
            </span>
          )}
        </div>
      </div>
      <ol
        ref={listRef}
        onScroll={measure}
        className="mt-2.5 -mx-1 px-1 pb-1 flex gap-2.5 overflow-x-auto snap-x"
        style={
          {
            scrollbarWidth: 'none',
            maskImage: `linear-gradient(to right, ${edges.start ? 'transparent, #000 28px' : '#000'}, ${edges.end ? '#000 calc(100% - 28px), transparent' : '#000'})`,
            WebkitMaskImage: `linear-gradient(to right, ${edges.start ? 'transparent, #000 28px' : '#000'}, ${edges.end ? '#000 calc(100% - 28px), transparent' : '#000'})`,
          } as React.CSSProperties
        }
      >
        {refs.map((ref) => {
          const card = cardOf(ref);
          const key = titleKey(ref);
          const mine = key in seen ? seen[key] : undefined;
          const title = card?.title || '';
          const year = (card?.release_date || '').slice(0, 4);
          const poster = card?.poster_path ? `https://image.tmdb.org/t/p/w154${card.poster_path}` : null;
          const tone = mine !== undefined ? ratingTone(mine) : null;
          return (
            <li key={key} className={`shrink-0 snap-start ${width}`}>
              <button
                type="button"
                onClick={() => open(ref)}
                onPointerEnter={() => prefetchFullTitle(ref)}
                className={`group block w-full text-left rounded-lg ${FOCUS_RING}`}
                title={title}
              >
                <span className="relative block aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-0.5" style={{ background: VELVET }}>
                  {poster ? (
                    <img src={poster} alt={title} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                      {card ? <Film className="w-5 h-5" aria-hidden /> : <span className="absolute inset-0 poster-skeleton" />}
                    </span>
                  )}
                  {tone && (
                    <span
                      className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 h-5 px-1 rounded-md text-[11px] leading-none"
                      style={{ background: 'rgba(18,13,34,0.9)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                      title={mine === null ? t('oracle.persona.inYourList') : t('oracle.persona.yourRating', { rating: mine })}
                    >
                      {mine === null ? <Eye className="w-3 h-3" aria-hidden /> : <span style={PIXEL}>{mine}</span>}
                      <span className="sr-only">{mine === null ? t('oracle.persona.inYourList') : t('oracle.persona.yourRating', { rating: mine })}</span>
                    </span>
                  )}
                </span>
                <span className="mt-1.5 text-[11px] font-medium leading-tight line-clamp-2 min-h-[2.4em] break-words" style={{ color: PAPER }}>
                  {title || t('common.loading')}
                </span>
                {year && (
                  <span className="block text-[10px] leading-tight" style={{ color: MIST }}>
                    {year}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {selected && <MovieDetailsModal movie={selected} isOpen onClose={() => setSelected(null)} isOtherUserProfile={false} />}
    </section>
  );
};

export default PersonaWorks;
