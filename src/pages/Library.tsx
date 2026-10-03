import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, ListPlus, MessageSquare, SlidersHorizontal, Library as LibraryIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Movie, getMovieDetailsFromDB } from '../lib/tmdb';
import toast from 'react-hot-toast';
import RatingBox from '../components/RatingBox';
import StreamingFilterModal from '../components/StreamingFilterModal';
import LibraryEditModal from '../components/LibraryEditModal';
import UserReviewsModal from '../components/UserReviewsModal';
import LinearProgressBar from '../components/LinearProgressBar';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import WatchListDuelModal from '../components/WatchListDuelModal';
import GlassLoader from '../components/GlassLoader';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

// Biblioteca — "a estante".
//   1. Cabeçalho: título, números da coleção e atalhos (adicionar, listas,
//      resenhas, ajustes). No celular os três últimos viram só ícone, na
//      mesma linha do "Adicionar Filmes". O gráfico de notas mora no Perfil.
//   2. Prateleiras: Watchlist (com filtros e duelo) e uma por nota, de 10
//      a 0 — ou, no layout One Grid, uma de filmes e uma de séries.

interface UserMovie {
  id: string;
  movie_id: number;
  rating: number | null;
}

interface LibraryMovie extends Movie {
  userRating?: number | null;
  predictedRating?: number;
}

export default function Library() {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [userMovies, setUserMovies] = useState<LibraryMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  const [showWatchlistDuel, setShowWatchlistDuel] = useState(false);
  const [username, setUsername] = useState<string>('');

  // Library preferences
  const [tvOrder, setTvOrder] = useState<'auto' | 'first' | 'last'>('auto');
  // Chroma Box é sempre ligada (não é mais uma opção).
  const chromaBoxEnabled = true;
  const [ratedLayout, setRatedLayout] = useState<'notes' | 'onegrid'>(() => {
    try {
      return (localStorage.getItem('libraryRatedLayout') as 'notes' | 'onegrid') || 'notes';
    } catch {
      return 'notes';
    }
  });

  // Progress tracking states
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [totalMovies, setTotalMovies] = useState(0);
  const [processedMovies, setProcessedMovies] = useState(0);
  const [loadingError, setLoadingError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Notas cruas da coleção inteira (só movie_id + rating), disponíveis logo
  // na primeira consulta — os números do cabeçalho já saem certos enquanto
  // os detalhes dos filmes ainda estão chegando.
  const [ratingRows, setRatingRows] = useState<(number | null)[]>([]);

  // Track if this is the initial load
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Track active requests to allow cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.id) return;

      const { data } = await supabase
        .from('profiles')
        .select('tv_order, username')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setTvOrder(data.tv_order || 'auto');
        setUsername(data.username || '');
      }
    };

    if (session?.user?.id) {
      loadPreferences();
      fetchUserMovies();
    }

    // Cleanup on unmount or when user changes
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [session?.user?.id]);

  // Os nomes das prateleiras não são mais personalizáveis: some o que
  // tinha ficado salvo neste navegador.
  useEffect(() => {
    try {
      localStorage.removeItem('libraryAlternateNames');
    } catch {
      // armazenamento indisponível (aba anônima etc.)
    }
  }, []);

  // Reload movies when language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      const cacheKey = CACHE_KEYS.USER_LIBRARY(session?.user?.id || '');
      cache.delete(cacheKey);
      // Detalhes dos filmes recarregam no idioma novo
      cache.invalidatePattern('movie:');
      if (session?.user?.id) {
        fetchUserMovies();
      }
    };

    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [session?.user?.id, i18n]);

  const fetchUserMovies = async () => {
    try {
      // Clear any existing intervals
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      // Create new AbortController for this fetch
      abortControllerRef.current = new AbortController();

      setLoadingError(false);
      setLoadingProgress(0);
      setProcessedMovies(0);
      setLoading(true);

      const cacheKey = CACHE_KEYS.USER_LIBRARY(session?.user?.id || '');
      const cachedLibrary = cache.get<LibraryMovie[]>(cacheKey);

      if (cachedLibrary) {
        setUserMovies(cachedLibrary);
        setRatingRows(cachedLibrary.map((m) => (typeof m.userRating === 'number' ? m.userRating : null)));
        setTotalMovies(cachedLibrary.length);
        setProcessedMovies(cachedLibrary.length);
        setLoadingProgress(100);
        setLoading(false);
        setInitialLoadComplete(true);
        return;
      }

      const { data: userMoviesData, error } = await supabase
        .from('user_movies')
        .select('*')
        .eq('user_id', session?.user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const total = (userMoviesData || []).length;
      setTotalMovies(total);
      setRatingRows((userMoviesData || []).map((row: UserMovie) => (typeof row.rating === 'number' ? row.rating : null)));

      setLoading(false);

      if (total === 0) {
        setUserMovies([]);
        setLoadingProgress(100);
        setInitialLoadComplete(true);
        return;
      }

      setLoadingProgress(5);

      // Carregamento incremental: primeiro 20 filmes
      const INITIAL_BATCH = 20;
      const initialBatch = userMoviesData.slice(0, INITIAL_BATCH);
      const remainingMovies = userMoviesData.slice(INITIAL_BATCH);

      // Simular progresso baseado em tempo estimado
      const estimatedDuration = 8000;
      const startTime = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const percentage = Math.min(95, 5 + (elapsed / estimatedDuration) * 90);
        setLoadingProgress(percentage);
      }, 100);

      // Carregar primeiro lote (20 filmes)
      const firstBatchDetails = await Promise.all(
        initialBatch.map(async (userMovie: UserMovie) => {
          try {
            const details = await getMovieDetailsFromDB(userMovie.movie_id);
            return {
              ...details,
              userRating: userMovie.rating,
            };
          } catch {
            console.warn(`Failed to fetch movie ${userMovie.movie_id}`);
            return null;
          }
        })
      );

      const firstBatchMovies = firstBatchDetails.filter((movie) => movie !== null) as LibraryMovie[];
      setUserMovies(firstBatchMovies);
      setProcessedMovies(firstBatchMovies.length);
      setInitialLoadComplete(true);

      // Carregar restante em background
      if (remainingMovies.length > 0) {
        const remainingDetails = await Promise.all(
          remainingMovies.map(async (userMovie: UserMovie) => {
            try {
              const details = await getMovieDetailsFromDB(userMovie.movie_id);
              return {
                ...details,
                userRating: userMovie.rating,
              };
            } catch {
              console.warn(`Failed to fetch movie ${userMovie.movie_id}`);
              return null;
            }
          })
        );

        const remainingBatchMovies = remainingDetails.filter((movie) => movie !== null) as LibraryMovie[];
        const allMovies = [...firstBatchMovies, ...remainingBatchMovies];
        setUserMovies(allMovies);
        setProcessedMovies(allMovies.length);
        cache.set(cacheKey, allMovies, CACHE_TTL.USER_LIBRARY);
      } else {
        cache.set(cacheKey, firstBatchMovies, CACHE_TTL.USER_LIBRARY);
      }

      // Clear interval and set progress to complete
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoadingProgress(100);
    } catch (error) {
      console.error('Error fetching user movies:', error);

      // Clear interval on error
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      setLoadingError(true);
      setErrorMessage(t('common.error'));
      toast.error(t('common.error'));
      setLoadingProgress(100);
      setLoading(false);
    }
  };

  const handleRate = async (movieId: number, rating: number | null) => {
    try {
      // Encontrar o filme para obter os gêneros
      const movie = userMovies.find((m) => m.id === movieId);

      // Cache dos gêneros para o Espectrograma Cinematográfico
      if (movie?.genres && movie.genres.length > 0) {
        try {
          await supabase
            .rpc('cache_movie_genres', {
              p_movie_id: movieId,
              p_genres: movie.genres
            });
        } catch (cacheError) {
          console.warn('Failed to cache movie genres:', cacheError);
          // Não bloquear o rating se o cache falhar
        }
      }

      const { error } = await supabase
        .from('user_movies')
        .update({ rating })
        .eq('movie_id', movieId)
        .eq('user_id', session?.user?.id);

      if (error) throw error;

      setUserMovies((movies) =>
        movies.map((m) =>
          m.id === movieId ? { ...m, userRating: rating } : m
        )
      );

      cache.invalidate(CACHE_KEYS.USER_LIBRARY(session?.user?.id || ''));
      cache.invalidatePattern('stats:');
      toast.success(rating === null ? t('library.ratingRemoved') : t('library.ratingUpdated'));
    } catch (error) {
      console.error('Error updating rating:', error);
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async (movieId: number) => {
    try {
      // Deletar o filme completamente da biblioteca
      const { error } = await supabase
        .from('user_movies')
        .delete()
        .eq('movie_id', movieId)
        .eq('user_id', session?.user?.id);

      if (error) throw error;

      // Remover localmente
      setUserMovies((movies) =>
        movies.filter((m) => m.id !== movieId)
      );

      cache.invalidate(CACHE_KEYS.USER_LIBRARY(session?.user?.id || ''));
      cache.invalidatePattern('stats:');
      toast.success(t('library.movieDeleted'));
    } catch (error) {
      console.error('Error deleting movie:', error);
      toast.error(t('common.error'));
    }
  };

  const handleRatedLayoutChange = (layout: 'notes' | 'onegrid') => {
    setRatedLayout(layout);
    try {
      localStorage.setItem('libraryRatedLayout', layout);
    } catch {
      // sem armazenamento — a escolha vale só nesta visita
    }
  };

  const emptyBuckets: Record<string, LibraryMovie[]> = { unrated: [] };
  for (let r = 0; r <= 10; r++) emptyBuckets[r] = [];
  const moviesByRating = userMovies.reduce(
    (acc, movie) => {
      const rating = movie.userRating;
      if (rating === null || rating === undefined) {
        acc.unrated.push(movie);
      } else {
        acc[rating] = acc[rating] || [];
        acc[rating].push(movie);
      }
      return acc;
    },
    emptyBuckets
  );

  // Filtro por streaming — só afeta a Watchlist. Seleção múltipla: um filme
  // passa se estiver em QUALQUER um dos serviços escolhidos ("o que posso
  // assistir com o que já assino"). Sem nenhum escolhido, lista completa.
  const [showStreamingFilter, setShowStreamingFilter] = useState(false);
  const [selectedStreamingProviders, setSelectedStreamingProviders] = useState<number[]>([]);

  // Oracle Filter — ordena a Watchlist pela Nota Prevista (maior primeiro).
  // "movie:id" / "tv:id" -> nota prevista, buscado em lote quando ativado.
  // Só títulos que estão nas prateleiras dos oráculos têm previsão (filmes
  // e, desde 03/10/2026, séries). Sem previsão vai pro fim.
  const [oracleFilterActive, setOracleFilterActive] = useState(false);
  const [predictedRatings, setPredictedRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!oracleFilterActive || !session?.user?.id) return;
    const movieIds = moviesByRating.unrated.filter((m) => m.media_type !== 'tv').map((m) => m.id);
    const seriesIds = moviesByRating.unrated.filter((m) => m.media_type === 'tv').map((m) => m.id);
    if (movieIds.length === 0 && seriesIds.length === 0) return;

    supabase.functions.invoke('predict-watchlist-ratings', { body: { movieIds, seriesIds } })
      .then(({ data, error }) => {
        if (error) throw error;
        const keyed = (prefix: string, values: unknown) =>
          Object.fromEntries(Object.entries((values || {}) as Record<string, number>).map(([id, value]) => [`${prefix}:${id}`, value]));
        setPredictedRatings({ ...keyed('movie', data?.ratings), ...keyed('tv', data?.seriesRatings) });
      })
      .catch((error) => {
        console.error('Error loading watchlist predictions:', error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracleFilterActive, session?.user?.id, moviesByRating.unrated.length]);

  const filteredWatchlistMovies = useMemo(() => {
    let list = moviesByRating.unrated;

    if (selectedStreamingProviders.length > 0) {
      list = list.filter((movie) => {
        const flatrate = movie.watchProviders?.flatrate;
        if (!flatrate || flatrate.length === 0) return false;
        return flatrate.some((p) => selectedStreamingProviders.includes(p.provider_id));
      });
    }

    if (oracleFilterActive) {
      list = list
        .map((movie) => {
          const key = `${movie.media_type === 'tv' ? 'tv' : 'movie'}:${movie.id}`;
          return { ...movie, predictedRating: predictedRatings[key] };
        })
        .sort((a, b) => {
          const aHas = typeof a.predictedRating === 'number';
          const bHas = typeof b.predictedRating === 'number';
          if (aHas && !bHas) return -1;
          if (!aHas && bHas) return 1;
          if (!aHas && !bHas) return 0;
          return (b.predictedRating as number) - (a.predictedRating as number);
        });
    }

    return list;
  }, [moviesByRating.unrated, selectedStreamingProviders, oracleFilterActive, predictedRatings]);

  const handleToggleStreamingProvider = (providerId: number) => {
    setSelectedStreamingProviders((prev) =>
      prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]
    );
  };

  // Abre o Duelo de Watchlist automaticamente quando outra página manda o
  // usuário pra cá com esse propósito (ex.: Hub dos Oráculos). Só depois que
  // os detalhes chegaram de verdade (initialLoadComplete, não loading — que
  // vira false antes de moviesByRating estar populado) e só com os 4 filmes
  // mínimos exigidos.
  const autoOpenDuelRef = useRef(false);
  useEffect(() => {
    if (autoOpenDuelRef.current) return;
    if (!initialLoadComplete) return;
    if (!(location.state as { openWatchlistDuel?: boolean } | null)?.openWatchlistDuel) return;
    autoOpenDuelRef.current = true;
    if (moviesByRating.unrated.length >= 4) {
      setShowWatchlistDuel(true);
    }
  }, [initialLoadComplete, location.state, moviesByRating.unrated.length]);

  // Apply TV order preference
  const sortMoviesByTvOrder = (movies: LibraryMovie[]) => {
    if (tvOrder === 'auto') {
      return movies; // Keep original order
    }

    const tvShows = movies.filter((m) => m.media_type === 'tv');
    const films = movies.filter((m) => m.media_type !== 'tv');

    if (tvOrder === 'first') {
      return [...tvShows, ...films];
    }
    return [...films, ...tvShows];
  };

  // Apply sorting to all rating categories
  Object.keys(moviesByRating).forEach((key) => {
    moviesByRating[key] = sortMoviesByTvOrder(moviesByRating[key]);
  });

  // Números do cabeçalho — da lista crua enquanto os detalhes carregam, da
  // lista completa (que reflete notas trocadas e exclusões) depois disso.
  const stats = useMemo(() => {
    const source = loadingProgress >= 100 || ratingRows.length === 0
      ? userMovies.map((m) => (typeof m.userRating === 'number' ? m.userRating : null))
      : ratingRows;
    const rated = source.filter((r) => r !== null).length;
    return {
      rated,
      watchlist: source.length - rated,
      total: source.length,
    };
  }, [loadingProgress, ratingRows, userMovies]);

  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
  }

  const isEmpty = initialLoadComplete && stats.total === 0 && userMovies.length === 0;
  // No celular os atalhos secundários são só ícone (quadrados de 44px), pra
  // caberem na mesma linha do "Adicionar Filmes"; o nome volta a partir do sm.
  const ghostButton = `shrink-0 inline-flex items-center justify-center gap-2 w-11 sm:w-auto h-11 px-0 sm:px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`;

  return (
    <div className="min-h-screen pb-16">
      {/* ---------- Cabeçalho ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10 pb-10">
        <div>
          <div className="min-w-0">
            <h1 style={{ ...PIXEL, color: PAPER }} className="text-[2.2rem] sm:text-5xl leading-none">
              {t('library.title')}
            </h1>
            {stats.total > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:text-base" style={{ color: MIST }}>
                <span>
                  <span style={{ ...PIXEL, color: PAPER }} className="text-lg">{stats.rated}</span>{' '}
                  {t('library.statsRated', { count: stats.rated })}
                </span>
                <span aria-hidden className="w-1 h-1 rounded-full bg-white/25" />
                <span>
                  <span style={{ ...PIXEL, color: PAPER }} className="text-lg">{stats.watchlist}</span>{' '}
                  {t('library.statsWatchlist')}
                </span>
              </p>
            )}

            <div className="mt-6 flex flex-nowrap sm:flex-wrap items-center gap-2">
              <Link
                to="/add-movies"
                className={`min-w-0 inline-flex items-center gap-2 h-11 px-4 sm:px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold whitespace-nowrap shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
              >
                <Plus className="w-[18px] h-[18px] shrink-0" aria-hidden />
                {t('library.addMovies')}
              </Link>
              <Link to="/lists" className={ghostButton} style={{ color: PAPER }} aria-label={t('library.listsShort')} title={t('library.listsShort')}>
                <ListPlus className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                <span className="hidden sm:inline">{t('library.listsShort')}</span>
              </Link>
              <button onClick={() => setIsReviewsModalOpen(true)} className={ghostButton} style={{ color: PAPER }} aria-label={t('reviews.title')} title={t('reviews.title')}>
                <MessageSquare className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                <span className="hidden sm:inline">{t('reviews.title')}</span>
              </button>
              <button onClick={() => setIsEditModalOpen(true)} className={ghostButton} style={{ color: PAPER }} aria-label={t('library.settings')} title={t('library.settings')}>
                <SlidersHorizontal className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                <span className="hidden sm:inline">{t('library.settings')}</span>
              </button>
            </div>
          </div>
        </div>

        {loadingProgress > 0 && loadingProgress < 100 && (
          <div className="mt-8 rounded-xl px-4 py-3 ring-1 ring-white/10" style={{ background: VELVET }} role="status">
            <div className="flex items-center justify-between gap-3 mb-2 text-sm">
              <span style={{ color: PAPER }}>{t('library.loadingMovies')}</span>
              <span className="tabular-nums" style={{ color: MIST }}>{processedMovies} / {totalMovies}</span>
            </div>
            <LinearProgressBar
              progress={loadingProgress}
              total={totalMovies}
              current={processedMovies}
              isError={loadingError}
              errorMessage={errorMessage}
            />
          </div>
        )}
      </section>

      {isEmpty ? (
        <section className="border-t border-white/[0.07] py-16">
          <div className="mx-auto max-w-xl px-5 text-center">
            <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl ring-1 ring-white/10" style={{ background: VELVET }}>
              <LibraryIcon className="w-6 h-6 text-violet-300" aria-hidden />
            </span>
            <h2 style={{ ...PIXEL, color: PAPER }} className="mt-5 text-2xl sm:text-3xl leading-tight">{t('library.emptyTitle')}</h2>
            <p className="mt-2" style={{ color: MIST }}>{t('library.noMoviesInLibrary')}</p>
            <Link
              to="/add-movies"
              className={`mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
            >
              <Plus className="w-5 h-5" aria-hidden />
              {t('library.addMovies')}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <RatingBox
            anchorId="library-watchlist"
            fullBleed
            title={t('library.watchList')}
            movies={filteredWatchlistMovies}
            rating={null}
            onRate={handleRate}
            onDelete={handleDelete}
            isNotRated
            chromaBoxEnabled={chromaBoxEnabled}
            onFilterClick={() => setShowStreamingFilter(true)}
            activeFilterCount={selectedStreamingProviders.length + (oracleFilterActive ? 1 : 0)}
            showPredictedRating={oracleFilterActive}
            onDuelClick={moviesByRating.unrated.length >= 4 ? () => setShowWatchlistDuel(true) : undefined}
          />

          {ratedLayout === 'onegrid' ? (() => {
            const allRated: LibraryMovie[] = [...Array(11)].reduce((acc: LibraryMovie[], _, i) => {
              const r = 10 - i;
              return [...acc, ...(moviesByRating[r] || [])];
            }, []);
            const ratedMovies = allRated.filter((m) => m.media_type !== 'tv');
            const ratedSeries = allRated.filter((m) => m.media_type === 'tv');
            return (
              <>
                {ratedMovies.length > 0 && (
                  <RatingBox
                    anchorId="library-rated-movies"
                    fullBleed
                    title={t('library.ratedMoviesTitle')}
                    movies={ratedMovies}
                    rating={null}
                    onRate={handleRate}
                    onDelete={handleDelete}
                    chromaBoxEnabled={false}
                    isOneGrid
                  />
                )}
                {ratedSeries.length > 0 && (
                  <RatingBox
                    anchorId="library-rated-series"
                    fullBleed
                    title={t('library.ratedSeriesTitle')}
                    movies={ratedSeries}
                    rating={null}
                    onRate={handleRate}
                    onDelete={handleDelete}
                    chromaBoxEnabled={chromaBoxEnabled}
                    isOneGrid
                    isOneGridTv
                  />
                )}
              </>
            );
          })() : (
            [...Array(11)].map((_, i) => {
              const rating = 10 - i;
              return (
                <RatingBox
                  key={rating}
                  anchorId={`library-rating-${rating}`}
                  fullBleed
                  title={t('library.rating', { value: rating })}
                  movies={moviesByRating[rating] || []}
                  rating={rating}
                  onRate={handleRate}
                  onDelete={handleDelete}
                  chromaBoxEnabled={chromaBoxEnabled}
                />
              );
            })
          )}
        </>
      )}

      <StreamingFilterModal
        isOpen={showStreamingFilter}
        onClose={() => setShowStreamingFilter(false)}
        selectedProviderIds={selectedStreamingProviders}
        onToggleProvider={handleToggleStreamingProvider}
        onClearFilter={() => setSelectedStreamingProviders([])}
        oracleFilterActive={oracleFilterActive}
        onToggleOracleFilter={() => setOracleFilterActive((prev) => !prev)}
      />

      <LibraryEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onReset={() => {
          setUserMovies([]);
          setRatingRows([]);
          setTotalMovies(0);
          cache.invalidate(CACHE_KEYS.USER_LIBRARY(session?.user?.id || ''));
          cache.invalidatePattern('stats:');
        }}
        ratedLayout={ratedLayout}
        onRatedLayoutChange={handleRatedLayoutChange}
        onTvOrderChange={setTvOrder}
      />

      {isReviewsModalOpen && session?.user?.id && (
        <UserReviewsModal
          userId={session.user.id}
          username={username}
          onClose={() => setIsReviewsModalOpen(false)}
        />
      )}

      <WatchListDuelModal
        isOpen={showWatchlistDuel}
        onClose={() => setShowWatchlistDuel(false)}
      />
    </div>
  );
}
