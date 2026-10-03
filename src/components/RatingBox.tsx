import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal, Trash2, Star, ListPlus, XCircle, ArrowUpDown, Film, Filter, Bookmark, Tv, Swords,
} from 'lucide-react';
import { Movie, getTvProgressBatch, getTvProgressBatchForProfile, TvProgress } from '../lib/tmdb';
import { useAuth } from '../lib/auth';
import ConfirmationModal from './ConfirmationModal';
import MovieDetailsModal from './MovieDetailsModal';
import AllMoviesModal from './AllMoviesModal';
import AddToListMenu from './AddToListMenu';
import RateMenuSheet from './RateMenuSheet';
import OracleSheet from './OracleSheet';
import { RATING_LABELS } from './RatingSliderSheet';
import { useTranslation } from 'react-i18next';
import OptimizedPoster from './OptimizedPoster';
import PredictedBadge from './PredictedBadge';
import {
  NIGHT, VELVET, PAPER, INK, MIST, PIXEL, FOCUS_RING, POSTER_TITLE, ratingTone, ratingBarColor, withAlpha,
} from '../lib/oracleTheme';

// Uma prateleira da estante — usada na Biblioteca (uma por nota, mais a
// Watchlist), no perfil de outra pessoa e nas listas. Cabeçalho com o selo
// da nota, o nome e a contagem; faixa de pôsteres que rola de lado.

interface RatingBoxProps {
  title: string;
  movies: Movie[];
  rating: number | null;
  onRate?: (movieId: number, rating: number | null) => void;
  onDelete?: (movieId: number) => void;
  onRemoveFromList?: (movieId: number) => void;
  isNotRated?: boolean;
  className?: string;
  isOtherUserProfile?: boolean;
  // ID do dono do perfil sendo visitado — quando presente, o progresso
  // de séries exibido reflete o QUE O DONO já assistiu, não quem está
  // olhando. Só relevante em perfis da comunidade (isOtherUserProfile).
  profileUserId?: string;
  onAddToLibrary?: () => void;
  isPersonalList?: boolean;
  enableDragDrop?: () => void;
  chromaBoxEnabled?: boolean;
  isOneGrid?: boolean;
  isOneGridTv?: boolean;
  // Só na Watchlist — abre o seletor de streamings. activeFilterCount põe
  // um selo no botão quando há filtros aplicados.
  onFilterClick?: () => void;
  activeFilterCount?: number;
  // Oracle Filter ativo — mostra a Nota Prevista em cada capa.
  showPredictedRating?: boolean;
  // Nome escolhido pelo usuário pra essa prateleira (Ajustes da
  // biblioteca). Sem ele, uma prateleira de nota mostra o nome da nota
  // ("Obra-Prima", "Ótimo"...).
  displayName?: string;
  // Faixa de pôsteres de ponta a ponta da tela (Biblioteca). Dentro de um
  // container com margem própria (perfil, listas), fica desligado.
  fullBleed?: boolean;
  // Atalho pro Duelo de Watchlist no cabeçalho (só a Biblioteca passa).
  onDuelClick?: () => void;
  // id da <section>, pra poder rolar até ela.
  anchorId?: string;
}

type LibraryTile = Movie & { predictedRating?: number };

const RatingBox: React.FC<RatingBoxProps> = ({
  title,
  movies,
  rating,
  onRate,
  onDelete,
  onRemoveFromList,
  isNotRated,
  className = '',
  isOtherUserProfile = false,
  profileUserId,
  onAddToLibrary,
  isPersonalList = false,
  enableDragDrop,
  chromaBoxEnabled = false,
  isOneGrid = false,
  isOneGridTv = false,
  onFilterClick,
  activeFilterCount = 0,
  showPredictedRating = false,
  displayName,
  fullBleed = false,
  onDuelClick,
  anchorId,
}) => {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [deleteMovieId, setDeleteMovieId] = useState<number | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [rateMenuMovie, setRateMenuMovie] = useState<Movie | null>(null);
  const [showAllMovies, setShowAllMovies] = useState(false);
  const [showAddToList, setShowAddToList] = useState<{ movieId: number; title: string } | null>(null);
  const [menuMovie, setMenuMovie] = useState<Movie | null>(null);
  // tmdb_id -> { watchedCount, airedCount }. Buscado em lote (uma consulta
  // pra todas as séries dessa prateleira) sempre que a lista mudar.
  // airedCount (não o total de episódios) é o denominador certo do
  // progresso — conta só o que já foi lançado.
  const [tvProgressData, setTvProgressData] = useState<Map<number, TvProgress>>(new Map());

  // Também chamada pelo onEpisodeToggle do modal de detalhes: marcar um
  // episódio lá atualiza a barra aqui na hora.
  const refetchTvProgress = useCallback(() => {
    const tvIds = movies.filter((m) => m.media_type === 'tv').map((m) => m.id);
    if (tvIds.length === 0 || !session?.user?.id) {
      setTvProgressData(new Map());
      return;
    }
    // Em perfil de outra pessoa, o progresso mostrado é o DELA.
    const fetchFn = isOtherUserProfile && profileUserId
      ? getTvProgressBatchForProfile(session.user.id, profileUserId, tvIds)
      : getTvProgressBatch(session.user.id, tvIds);
    fetchFn.then((data) => {
      setTvProgressData(data);
    });
  }, [movies, session?.user?.id, isOtherUserProfile, profileUserId]);

  useEffect(() => {
    refetchTvProgress();
  }, [refetchTvProgress]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);

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

  // Prateleiras de nota somem quando vazias. A Watchlist não: ela pode
  // ficar vazia só por causa de um FILTRO, e sem o cabeçalho não haveria
  // como desfazer o filtro.
  if (movies.length === 0 && !isNotRated) return null;

  // Progresso de episódios de uma série. Cores da Biblioteca: azul em
  // andamento, roxo quando em dia com uma série ainda no ar, rosa quando
  // completa e encerrada.
  const getTvProgress = (movie: Movie) => {
    const progress = tvProgressData.get(movie.id);
    const aired = progress?.airedCount || 0;
    const watched = progress?.watchedCount || 0;
    const percent = aired > 0 ? Math.min(100, (watched / aired) * 100) : 0;
    const stillAiring = movie.in_production === true || movie.status === 'Returning Series';
    let barColor = 'from-sky-400 to-cyan-300';
    if (percent >= 100) barColor = stillAiring ? 'from-violet-500 to-violet-400' : 'from-pink-500 to-pink-400';
    return { percent, barColor, watched, aired };
  };

  const isRatingShelf = rating !== null && !isOneGrid;
  const tone = isRatingShelf ? ratingTone(rating) : null;
  const ratingLabel = isRatingShelf && RATING_LABELS[rating]
    ? (isPt ? RATING_LABELS[rating].pt : RATING_LABELS[rating].en)
    : '';
  const heading = isRatingShelf ? (displayName || ratingLabel || title) : title;

  // Chroma Box — um véu da cor da nota no topo da prateleira.
  const chromaColor = !chromaBoxEnabled
    ? null
    : isOneGridTv
      ? ratingBarColor(null)
      : isRatingShelf
        ? ratingBarColor(rating)
        : null;
  const sectionStyle: React.CSSProperties | undefined = chromaColor
    ? { background: `linear-gradient(180deg, ${withAlpha(chromaColor, 0.12)} 0%, ${withAlpha(chromaColor, 0.03)} 55%, transparent 100%)` }
    : undefined;

  const innerPad = fullBleed ? 'mx-auto max-w-6xl px-5 sm:px-8' : 'px-1';
  const listPad = fullBleed ? 'px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))]' : 'px-1';
  const ghostPill = `inline-flex items-center gap-2 h-11 px-4 rounded-full border text-sm font-medium transition ${FOCUS_RING}`;
  const canManage = !isOtherUserProfile;
  const formatScore = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const headerIcon = isRatingShelf ? (
    <span
      className="grid place-items-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-xl text-2xl sm:text-3xl leading-none"
      style={{ ...PIXEL, background: VELVET, color: tone!.color, boxShadow: `inset 0 0 0 1.5px ${tone!.ring}` }}
      aria-hidden
    >
      {rating}
    </span>
  ) : (
    <span
      className="grid place-items-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-xl ring-1 ring-inset ring-white/10"
      style={{ background: VELVET }}
      aria-hidden
    >
      {isNotRated ? (
        <Bookmark className="w-5 h-5 text-sky-300" />
      ) : isOneGridTv ? (
        <Tv className="w-5 h-5 text-sky-300" />
      ) : (
        <Film className="w-5 h-5 text-violet-300" />
      )}
    </span>
  );

  const countLine = [
    t('library.titleCount', { count: movies.length }),
    isRatingShelf && displayName && ratingLabel ? ratingLabel : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <section
        id={anchorId}
        className={`relative scroll-mt-20 border-t border-white/[0.07] py-10 sm:py-12 ${className}`}
        style={sectionStyle}
        aria-label={isRatingShelf ? `${t('library.rating', { value: rating })} — ${heading}` : heading}
      >
        <div className={`${innerPad} flex flex-wrap items-center justify-between gap-x-4 gap-y-3`}>
          <div className="flex items-center gap-3.5 min-w-0">
            {headerIcon}
            <div className="min-w-0">
              <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight truncate">
                {isRatingShelf && <span className="sr-only">{t('library.rating', { value: rating })} — </span>}
                {heading}
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: MIST }}>{countLine}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isNotRated && onFilterClick && (
              <button
                onClick={onFilterClick}
                aria-label={activeFilterCount > 0
                  ? `${t('library.filters', { defaultValue: 'Filtros' })} (${activeFilterCount})`
                  : t('library.filters', { defaultValue: 'Filtros' })}
                className={`${ghostPill} ${activeFilterCount > 0 ? 'border-violet-400/60 bg-violet-500/20' : 'border-white/15 hover:border-white/35 hover:bg-white/5'}`}
                style={{ color: PAPER }}
              >
                <Filter className="w-4 h-4 text-violet-300" aria-hidden />
                {t('library.filters', { defaultValue: 'Filtros' })}
                {activeFilterCount > 0 && (
                  <span
                    className="grid place-items-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs leading-none"
                    style={{ ...PIXEL, background: PAPER, color: INK }}
                    aria-hidden
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
            {onDuelClick && (
              <button
                onClick={onDuelClick}
                className={`${ghostPill} border-white/15 hover:border-white/35 hover:bg-white/5`}
                style={{ color: PAPER }}
              >
                <Swords className="w-4 h-4 text-pink-300" aria-hidden />
                {t('library.duel')}
              </button>
            )}
            {movies.length > 0 && (
              <button
                onClick={() => setShowAllMovies(true)}
                className={`${ghostPill} border-white/15 hover:border-white/35 hover:bg-white/5`}
                style={{ color: PAPER }}
              >
                {t('common.view_all')}
              </button>
            )}
          </div>
        </div>

        {movies.length === 0 && isNotRated ? (
          <div className={`${innerPad} mt-6`}>
            <div className="rounded-xl px-5 py-8 text-center ring-1 ring-white/10" style={{ background: VELVET }}>
              {activeFilterCount > 0 ? (
                <>
                  <Filter className="w-6 h-6 mx-auto" style={{ color: MIST }} aria-hidden />
                  <p className="mt-2 text-sm" style={{ color: MIST }}>
                    {t('library.noMoviesForFilter', { defaultValue: 'Nenhum filme da sua watchlist está disponível nos streamings selecionados.' })}
                  </p>
                </>
              ) : (
                <>
                  <Bookmark className="w-6 h-6 mx-auto" style={{ color: MIST }} aria-hidden />
                  <p className="mt-2 text-sm" style={{ color: MIST }}>{t('library.noWatchlistMovies')}</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="mt-3 pt-3 overflow-x-auto cursor-grab select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {/* pt-3: espaço pro pôster subir no hover sem ser cortado
                (overflow-x:auto também recorta na vertical). */}
            <ol className={`flex gap-4 pb-2 ${listPad}`}>
              {movies.map((raw) => {
                const movie = raw as LibraryTile;
                const isTv = movie.media_type === 'tv';
                const tv = isTv ? getTvProgress(movie) : null;
                const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
                const predicted = showPredictedRating && typeof movie.predictedRating === 'number' ? movie.predictedRating : null;
                const ownRating = typeof movie.userRating === 'number' ? movie.userRating : null;
                // Na prateleira de uma nota, todos os títulos têm a mesma nota —
                // o selo só aparece onde as notas se misturam (One Grid, listas).
                const showOwnRating = ownRating !== null && !isNotRated && !isRatingShelf;
                return (
                  <li key={`${movie.media_type || 'movie'}:${movie.id}`} className="group relative shrink-0 w-[124px] sm:w-[148px]">
                    <button
                      onClick={() => { if (dragDistanceRef.current > 5) return; setSelectedMovie(movie); }}
                      className={`block w-full text-left rounded-xl ${FOCUS_RING}`}
                    >
                      <span
                        className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1"
                        style={{ background: VELVET }}
                      >
                        {movie.poster_path ? (
                          <OptimizedPoster
                            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                            alt={movie.title}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: MIST }}>
                            <Film className="w-7 h-7" aria-hidden />
                            <span className="text-xs leading-snug line-clamp-3" style={{ color: PAPER }}>{movie.title}</span>
                          </span>
                        )}

                        {predicted !== null ? (
                          <PredictedBadge rating={predicted} />
                        ) : showOwnRating ? (
                          <span
                            className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 rounded-full text-xs font-semibold shadow-lg"
                            style={{ background: PAPER, color: INK }}
                            title={t('home.desk.yourRating')}
                          >
                            <Star className="w-3 h-3 fill-current" aria-hidden />
                            <span className="sr-only">{t('home.desk.yourRating')}:</span>
                            {ownRating}
                          </span>
                        ) : null}

                        {tv && (
                          <span
                            className="absolute inset-x-0 bottom-0 h-1.5 bg-black/55"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(tv.percent)}
                            aria-label={t('library.tvProgress', { watched: tv.watched, aired: tv.aired })}
                          >
                            <span
                              className={`block h-full bg-gradient-to-r ${tv.barColor} transition-[width] duration-700 ease-out`}
                              style={{ width: `${tv.percent}%` }}
                            />
                          </span>
                        )}
                      </span>
                      <span className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                        {movie.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                        {isTv && <Tv className="w-3 h-3 shrink-0 text-sky-300" aria-label={t('mobileSearch.series')} />}
                        {year && <span>{year}</span>}
                        {movie.vote_average > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                            {formatScore(movie.vote_average)}
                          </span>
                        )}
                      </span>
                    </button>

                    {isNotRated && onRate && canManage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setRateMenuMovie(movie); }}
                        className={`mt-2 w-full gap-1.5 rounded-lg border border-white/15 hover:border-white/35 hover:bg-white/5 text-xs font-medium transition ${FOCUS_RING}`}
                        style={{ color: PAPER }}
                      >
                        <Star className="w-3.5 h-3.5 text-amber-300" aria-hidden />
                        {t('library.rateAction')}
                      </button>
                    )}

                    {canManage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuMovie(movie); }}
                        aria-label={t('library.moreActions', { title: movie.title })}
                        className={`absolute top-0 right-0 w-11 h-11 grid place-items-center rounded-full transition-transform duration-200 group-hover:-translate-y-1 ${FOCUS_RING}`}
                      >
                        <span className="grid place-items-center w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm ring-1 ring-white/15 text-white">
                          <MoreHorizontal className="w-4 h-4" aria-hidden />
                        </span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      {/* Modais — via portal, fora de qualquer contexto de empilhamento */}
      {createPortal(
        <>
          <ConfirmationModal
            isOpen={deleteMovieId !== null}
            onClose={() => setDeleteMovieId(null)}
            onConfirm={() => {
              if (deleteMovieId && onDelete) {
                onDelete(deleteMovieId);
              }
            }}
            title={t('common.delete')}
            message={t('library.movieRemoved')}
          />

          {selectedMovie && (
            <MovieDetailsModal
              movie={selectedMovie}
              isOpen={true}
              onClose={() => setSelectedMovie(null)}
              isOtherUserProfile={isOtherUserProfile}
              profileUserId={profileUserId}
              onAddToLibrary={onAddToLibrary}
              onEpisodeToggle={refetchTvProgress}
            />
          )}

          <AllMoviesModal
            isOpen={showAllMovies}
            onClose={() => setShowAllMovies(false)}
            title={isRatingShelf ? `${t('library.rating', { value: rating })} · ${heading}` : title}
            movies={movies}
            rating={rating}
            isOtherUserProfile={isOtherUserProfile}
            profileUserId={profileUserId}
            onAddToLibrary={onAddToLibrary}
          />

          {showAddToList && (
            <AddToListMenu
              movieId={showAddToList.movieId}
              movieTitle={showAddToList.title}
              isOpen={true}
              onClose={() => setShowAddToList(null)}
              position={{}}
            />
          )}

          {rateMenuMovie && onRate && (
            <RateMenuSheet
              movieTitle={rateMenuMovie.title}
              isOpen={true}
              onClose={() => setRateMenuMovie(null)}
              onRate={async (newRating) => {
                onRate(rateMenuMovie.id, newRating);
              }}
              showMoveToWatchlist={!isNotRated}
              currentRating={typeof rateMenuMovie.userRating === 'number' ? rateMenuMovie.userRating : undefined}
            />
          )}
        </>,
        document.body
      )}

      {/* Ações de um título (botão "…" no pôster) */}
      <OracleSheet
        open={!!menuMovie}
        onClose={() => setMenuMovie(null)}
        size="md"
        title={menuMovie?.title || ''}
        subtitle={menuMovie ? (menuMovie.release_date || menuMovie.first_air_date || '').slice(0, 4) || undefined : undefined}
        leading={menuMovie ? (
          <span className="relative shrink-0 w-10 aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10" style={{ background: NIGHT }}>
            {menuMovie.poster_path ? (
              <img src={`https://image.tmdb.org/t/p/w92${menuMovie.poster_path}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <Film className="absolute inset-0 m-auto w-4 h-4" style={{ color: MIST }} aria-hidden />
            )}
          </span>
        ) : undefined}
        bodyClassName="px-3 sm:px-5 py-3"
      >
        {menuMovie && (
          <ul className="space-y-1">
            {isPersonalList ? (
              <>
                <li>
                  <button
                    onClick={() => { onRemoveFromList?.(menuMovie.id); setMenuMovie(null); }}
                    className={`w-full flex justify-start items-center gap-3.5 px-3 py-3 rounded-xl text-left text-red-300 hover:bg-red-500/10 transition ${FOCUS_RING}`}
                  >
                    <XCircle className="w-5 h-5" aria-hidden />
                    <span className="font-medium">{t('common.remove')}</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { enableDragDrop?.(); setMenuMovie(null); }}
                    className={`w-full flex justify-start items-center gap-3.5 px-3 py-3 rounded-xl text-left hover:bg-white/5 transition ${FOCUS_RING}`}
                    style={{ color: PAPER }}
                  >
                    <ArrowUpDown className="w-5 h-5" style={{ color: MIST }} aria-hidden />
                    <span className="font-medium">{t('lists.reorder')}</span>
                  </button>
                </li>
              </>
            ) : (
              <>
                {onRate && (
                  <li>
                    <button
                      onClick={() => { setRateMenuMovie(menuMovie); setMenuMovie(null); }}
                      className={`w-full flex justify-start items-center gap-3.5 px-3 py-3 rounded-xl text-left hover:bg-white/5 transition ${FOCUS_RING}`}
                      style={{ color: PAPER }}
                    >
                      <Star className="w-5 h-5 text-amber-300" aria-hidden />
                      <span className="font-medium">{isNotRated ? t('library.rateAction') : t('library.changeRating')}</span>
                    </button>
                  </li>
                )}
                <li>
                  <button
                    onClick={() => {
                      setShowAddToList({ movieId: menuMovie.id, title: menuMovie.title });
                      setMenuMovie(null);
                    }}
                    className={`w-full flex justify-start items-center gap-3.5 px-3 py-3 rounded-xl text-left hover:bg-white/5 transition ${FOCUS_RING}`}
                    style={{ color: PAPER }}
                  >
                    <ListPlus className="w-5 h-5 text-violet-300" aria-hidden />
                    <span className="font-medium">{t('lists.addToList')}</span>
                  </button>
                </li>
                {onDelete && (
                  <li>
                    <button
                      onClick={() => { setDeleteMovieId(menuMovie.id); setMenuMovie(null); }}
                      className={`w-full flex justify-start items-center gap-3.5 px-3 py-3 rounded-xl text-left text-red-300 hover:bg-red-500/10 transition ${FOCUS_RING}`}
                    >
                      <Trash2 className="w-5 h-5" aria-hidden />
                      <span className="font-medium">{t('library.removeFromLibrary')}</span>
                    </button>
                  </li>
                )}
              </>
            )}
          </ul>
        )}
      </OracleSheet>
    </>
  );
};

export default React.memo(RatingBox);
