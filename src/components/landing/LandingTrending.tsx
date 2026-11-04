import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Movie } from '../../lib/tmdb';
import OptimizedPoster from '../OptimizedPoster';
import { FOCUS_RING, MIST, PAPER, PIXEL, POSTER_TITLE, VELVET } from '../../lib/oracleTheme';
import { HiddenPill } from './LandingBits';

// "Em alta esta semana" — a única lista ao vivo da home de visitante (TMDB,
// via Home.tsx). Desde 04/11/2026 cada pôster é como os das prateleiras da
// home logada: o número no pé à esquerda, o título embaixo (no celular não
// há hover para revelar) e o selo da nota prevista com "?" — a sua aparece
// quando você entra. Cada pôster é um botão (teclado e leitor de tela) e
// abre o menu do título.

const TILE = 'w-[124px] sm:w-[148px]';

const LandingTrending: React.FC<{
  movies: Movie[];
  loading: boolean;
  onMovieClick: (movie: Movie) => void;
  onMovieHover: (movie: Movie) => void;
  onViewAll: () => void;
}> = ({ movies, loading, onMovieClick, onMovieHover, onViewAll }) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);

  // Arrastar com o mouse (no toque a rolagem já é nativa).
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollStartRef.current = scrollRef.current.scrollLeft;
    dragDistanceRef.current = 0;
    scrollRef.current.style.cursor = 'grabbing';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    dragDistanceRef.current = Math.abs(x - startXRef.current);
    scrollRef.current.scrollLeft = scrollStartRef.current - (x - startXRef.current) * 2;
  };
  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  if (!loading && movies.length === 0) return null;
  const list = movies.filter((m) => m.poster_path);

  return (
    <section className="border-t border-white/[0.07] py-14 sm:py-20" aria-labelledby="lp-trending">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="lp-trending" style={{ ...PIXEL, color: PAPER }} className="text-[1.9rem] sm:text-4xl leading-tight">
            {t('guestHome.trendingTitle')}
          </h2>
          <p className="mt-1.5 text-sm leading-snug" style={{ color: MIST }}>{t('guestHome.trendingHint')}</p>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={onViewAll}
            className={`shrink-0 inline-flex items-center min-h-[44px] px-4 rounded-lg text-sm font-medium border border-white/15 hover:border-white/35 hover:bg-white/5 transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            {t('common.view_all')}
          </button>
        )}
      </div>
      {loading ? (
        <div className="mt-6 pt-3 overflow-hidden" aria-busy="true">
          <ol className="flex gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pb-2">
            {[...Array(8)].map((_, i) => (
              <li key={i} className={`shrink-0 ${TILE}`} aria-hidden>
                <span className="block aspect-[2/3] rounded-xl poster-skeleton" />
                <span className="mt-2.5 block h-3.5 w-4/5 rounded poster-skeleton" />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="mt-5 pt-3 overflow-x-auto cursor-grab select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {/* A faixa rola de ponta a ponta; o recuo acompanha a margem do
              conteúdo (dá para ver que tem mais). O pt-3 dá espaço para o
              pôster subir no hover sem ser cortado. */}
          <ol className="flex gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pb-2">
            {list.map((movie, index) => (
              <li key={movie.id} className={`shrink-0 ${TILE}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (dragDistanceRef.current > 5) return;
                    onMovieClick(movie);
                  }}
                  onPointerEnter={() => onMovieHover(movie)}
                  onPointerDown={() => onMovieHover(movie)}
                  onFocus={() => onMovieHover(movie)}
                  className={`group block w-full text-left rounded-xl ${FOCUS_RING}`}
                  // Nome curto para leitor de tela: a posição e o título (sem
                  // repetir o selo e o alt do pôster).
                  aria-label={`${index + 1}. ${t('guestHome.openTitle', { title: movie.title })}`}
                >
                  <span
                    className="relative isolate block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
                    style={{ background: VELVET }}
                  >
                    <OptimizedPoster src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`} alt={movie.title} className="absolute inset-0 w-full h-full object-cover" />
                    <HiddenPill className="absolute top-1.5 left-1.5" />
                    <span
                      style={{ ...PIXEL, background: 'rgba(18,13,34,0.82)', color: PAPER }}
                      className="absolute bottom-2 left-2 min-w-[1.9rem] text-center px-1.5 py-0.5 rounded-md text-sm ring-1 ring-white/15"
                    >
                      {index + 1}
                    </span>
                  </span>
                  <span className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                    {movie.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};

export default LandingTrending;
