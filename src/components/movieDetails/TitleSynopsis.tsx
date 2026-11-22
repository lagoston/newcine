import React, { useEffect, useState } from 'react';
import { Loader2, Film, ChevronDown, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMovieCollections, collectionDisplayName, sortedParts, type MovieCollection } from '../../lib/collections';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import SectionTitle from './SectionTitle';
import { SECTION_CLASS } from './shared';

import EquippedCover from '../EquippedCover';
// Sinopse ("Ler mais" quando é longa) e, embaixo dela, a saga / trilogia /
// continuação do filme. A saga chega por conta própria e re-renderiza só
// esta seção.

interface TitleSynopsisProps {
  movieId: number;
  // o tipo como veio no título (séries não têm coleção)
  rawMediaType: 'movie' | 'tv' | undefined;
  overview: string | null | undefined;
  // abre outro filme da saga por cima deste
  onOpenMovie: (movieId: number) => void;
  // o filme da saga que está sendo aberto (mostra o carregador no pôster)
  loadingMovieId: number | null;
}

const NO_COLLECTIONS: MovieCollection[] = [];

const TitleSynopsis: React.FC<TitleSynopsisProps> = ({ movieId, rawMediaType, overview, onOpenMovie, loadingMovieId }) => {
  const { t, i18n } = useTranslation();
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  useEffect(() => {
    setSynopsisExpanded(false);
  }, [movieId]);
  const longSynopsis = (overview?.length || 0) > 320;

  // Saga / trilogia / continuação (coleção do TMDB ou cadastrada à mão —
  // lib/collections.ts). Só filmes; séries não têm coleção.
  const [collections, setCollections] = useState<MovieCollection[]>(NO_COLLECTIONS);
  const [openCollectionId, setOpenCollectionId] = useState<number | null>(null);
  useEffect(() => {
    setCollections(NO_COLLECTIONS);
    setOpenCollectionId(null);
    if (rawMediaType === 'tv' || !movieId) return;
    let cancelled = false;
    getMovieCollections(movieId).then((found) => {
      if (!cancelled) setCollections(found);
    });
    return () => {
      cancelled = true;
    };
  }, [movieId, rawMediaType]);

  return (
    <section className={SECTION_CLASS}>
      <SectionTitle>{t('movies.synopsis')}</SectionTitle>
      <p
        className={`mt-3 text-[15px] leading-relaxed ${longSynopsis && !synopsisExpanded ? 'line-clamp-5' : ''}`}
        style={{ color: 'rgba(243,234,211,0.86)' }}
      >
        {overview || t('movies.noSynopsis')}
      </p>
      {longSynopsis && (
        <button
          onClick={() => setSynopsisExpanded((v) => !v)}
          aria-expanded={synopsisExpanded}
          className={`mt-1 -ml-2 px-2 rounded-lg text-sm font-medium text-violet-300 hover:text-violet-200 justify-start ${FOCUS_RING}`}
        >
          {synopsisExpanded ? t('movieModal.readLess') : t('movieModal.readMore')}
        </button>
      )}

      {/* Saga / trilogia / continuação: abre os pôsteres em
          ordem; tocar num deles abre aquele filme. */}
      {collections.map((collection) => {
        const isPtLang = i18n.language.startsWith('pt');
        const parts = sortedParts(collection);
        const position = parts.findIndex((p) => p.movie_id === movieId);
        const kind = parts.length === 2 ? 'duology' : parts.length === 3 ? 'trilogy' : 'saga';
        const open = openCollectionId === collection.id;
        const today = new Date().toISOString().slice(0, 10);
        return (
          <div key={collection.id} className="mt-4">
            <button
              onClick={() => setOpenCollectionId(open ? null : collection.id)}
              aria-expanded={open}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl ring-1 ring-white/10 hover:ring-white/25 text-left transition ${FOCUS_RING}`}
              style={{ background: VELVET }}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="grid place-items-center w-10 h-10 shrink-0 rounded-lg bg-amber-500/15 text-amber-300">
                  <Layers className="w-5 h-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold truncate" style={{ color: PAPER }}>
                    {t(`movieModal.collection.${kind}`)} · {collectionDisplayName(collection, isPtLang)}
                  </span>
                  <span className="block text-sm truncate" style={{ color: MIST }}>
                    {t('movieModal.collection.count', { count: parts.length })}
                    {position >= 0 ? ` · ${t('movieModal.collection.thisIs', { n: position + 1 })}` : ''}
                  </span>
                </span>
              </span>
              <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: MIST }} aria-hidden />
            </button>

            {open && (
              <ol className="mt-3 grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                {parts.map((part, i) => {
                  const title = (isPtLang ? part.title_pt || part.title_en : part.title_en || part.title_pt) || '';
                  const poster = (isPtLang ? part.poster_path_pt || part.poster_path : part.poster_path || part.poster_path_pt) || null;
                  const isCurrent = part.movie_id === movieId;
                  const upcoming = !!part.release_date && part.release_date > today;
                  const year = part.release_date ? part.release_date.slice(0, 4) : null;
                  return (
                    <li key={part.movie_id} className="min-w-0">
                      <button
                        onClick={() => !isCurrent && onOpenMovie(part.movie_id)}
                        disabled={isCurrent}
                        aria-current={isCurrent ? 'true' : undefined}
                        aria-label={`${i + 1}. ${title}${year ? ` (${year})` : ''}${isCurrent ? ` — ${t('movieModal.collection.thisMovie')}` : ''}`}
                        title={title}
                        className={`group relative block w-full aspect-[2/3] rounded-lg overflow-hidden transition disabled:cursor-default ${
                          isCurrent ? 'ring-2 ring-amber-300' : 'ring-1 ring-white/10 hover:ring-white/35'
                        } ${FOCUS_RING}`}
                        style={{ background: VELVET, minWidth: 0 }}
                      >
                        {poster ? (
                          <EquippedCover id={part.movie_id} type="movie" size="w185">
                            <img
                              src={`https://image.tmdb.org/t/p/w185${poster}`}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className={`absolute inset-0 w-full h-full object-cover transition-transform ${isCurrent ? '' : 'group-hover:scale-105'}`}
                            />
                          </EquippedCover>
                        ) : (
                          <span className="absolute inset-0 grid place-items-center p-1.5 text-center text-[11px] leading-tight" style={{ color: MIST }}>
                            {title || <Film className="w-5 h-5" aria-hidden />}
                          </span>
                        )}
                        {loadingMovieId === part.movie_id && (
                          <span className="absolute inset-0 bg-black/55 grid place-items-center">
                            <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden />
                          </span>
                        )}
                        <span
                          className="absolute top-1 left-1 grid place-items-center min-w-[1.25rem] h-5 px-1 rounded text-[11px] leading-none"
                          style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: isCurrent ? '#FCD34D' : PAPER }}
                          aria-hidden
                        >
                          {i + 1}
                        </span>
                      </button>
                      <p className="mt-1 text-[11px] leading-tight text-center truncate" style={{ color: isCurrent ? '#FCD34D' : MIST }}>
                        {isCurrent ? t('movieModal.collection.thisMovie') : upcoming ? t('movieModal.collection.soon') : year}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </section>
  );
};

export default React.memo(TitleSynopsis);
