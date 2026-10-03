import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Filter, PartyPopper, Star, Wand2, Crown, Film, RefreshCw, Tv } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getOraclePoolPredictions, getMoviesForPredictedSlice, Movie, getMovieDetails, type PredictedShelfMovie } from '../lib/tmdb';
import MovieDetailsModal from '../components/MovieDetailsModal';
import StreamingFilterModal from '../components/StreamingFilterModal';
import OptimizedPoster from '../components/OptimizedPoster';
import { VELVET, PAPER, INK, MIST, PIXEL, FOCUS_RING, POSTER_TITLE, ORACLES, ORACLE_BY_ID, OracleId, oracleCardImage, withAlpha } from '../lib/oracleTheme';
import { MOODS, type Mood } from '../lib/moods';

// Biblioteca dos Oráculos (/oracle/libraries?oracle=bogart): as 9
// prateleiras temáticas de um oráculo, cada título com a nota PREVISTA pra
// você; troca de oráculo, "Incluir Séries" e filtro de streaming no topo.
// As cartas pra escolher o oráculo ficam na Central dos Oráculos — sem
// ?oracle= válido, a página volta pra lá.
//
// Séries: cada prateleira guarda filmes (recommendation_pools.movie_ids) e
// séries (tv_ids) em listas separadas. Por padrão só filmes; com "Incluir
// Séries" ligado, as séries entram na mesma fileira, ordenadas pela mesma
// nota prevista. A escolha fica salva neste aparelho.

type CardType = OracleId;

// As 9 prateleiras (humores) vêm de lib/moods — "random-surprise" existe
// como décimo mood_key no banco, mas é um modo coringa (quase 2500
// filmes), não uma categoria curada, então não vira prateleira aqui.
const MOOD_CATEGORIES: Mood[] = MOODS;

// Descrição funcional de cada oráculo: o critério de curadoria dele.
const LIBRARY_FUNCTION_DESC_KEY: Record<CardType, string> = {
  bogart: 'oracle.libraries.bogartFunctionDesc',
  fincher: 'oracle.libraries.fincherFunctionDesc',
  cypher: 'oracle.libraries.cypherFunctionDesc',
};

const INCLUDE_SERIES_KEY = 'cineoracle:oracleLibraries:includeSeries';

const readIncludeSeries = (): boolean => {
  try {
    return window.localStorage.getItem(INCLUDE_SERIES_KEY) === '1';
  } catch {
    return false;
  }
};

const saveIncludeSeries = (value: boolean) => {
  try {
    window.localStorage.setItem(INCLUDE_SERIES_KEY, value ? '1' : '0');
  } catch {
    // sem armazenamento (aba anônima etc.): vale só nesta visita
  }
};

// Carga inicial (grátis) é menor que o incremento premium.
const INITIAL_PAGE_SIZE = 20;
const LOAD_MORE_INCREMENT = 30;

const TILE_WIDTH = 'w-[124px] sm:w-[148px]';
const SHELF_PAD = 'px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))]';

interface ShelfState {
  movies: Movie[];
  totalCount: number;
  loading: boolean;
  loadingMore: boolean;
  // Falha ao falar com o servidor — diferente de "prateleira vazia".
  error: boolean;
}

const INITIAL_SHELF: ShelfState = { movies: [], totalCount: 0, loading: true, loadingMore: false, error: false };

type PredictedMovie = Movie & { predictedRating?: number };

// Uma prateleira: o humor, e a fileira de pôsteres ordenada pela nota
// prevista. O primeiro lote de 20 é grátis; carregar mais de 30 em 30 é
// Premium (sem custo por uso) e some quando não há mais nada — ou quando
// o filtro de streaming está ligado (carregar filmes "crus" que o filtro
// esconderia não ajuda ninguém).
//
// Cada prateleira pertence a UM oráculo: a página monta uma prateleira nova
// (key = oráculo + humor + séries) quando o oráculo — ou o "Incluir
// Séries" — muda. Antes a mesma prateleira
// era reaproveitada e a primeira busca do oráculo novo lia o estado do
// oráculo anterior ("já tenho 20 filmes") — pulava a busca das previsões,
// ficava com uma lista vazia e mostrava "Você já assistiu tudo dessa
// categoria" em todas as prateleiras. E uma resposta atrasada do oráculo
// anterior podia chegar depois e ocupar a prateleira nova.
const Shelf: React.FC<{
  cardType: CardType;
  mood: Mood;
  includeSeries: boolean;
  selectedProviderIds: number[];
  isPremium: boolean;
  onMovieClick: (movie: Movie) => void;
}> = ({ cardType, mood, includeSeries, selectedProviderIds, isPremium, onMovieClick }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<ShelfState>(INITIAL_SHELF);
  const stateRef = useRef(state);
  stateRef.current = state;
  const isFetchingRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  // Cache da lista completa de IDs já ordenados pela nota PREVISTA
  // (calculada uma vez pela Edge Function) — "carregar mais" só fatia essa
  // lista e busca os detalhes da fatia nova.
  const predictedIdsRef = useRef<PredictedShelfMovie[]>([]);

  // Arrastar com o mouse no desktop (a barra de rolagem fica escondida).
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

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current) return;
    const current = stateRef.current;
    const isFirstPage = current.movies.length === 0;
    if (!isFirstPage && current.movies.length >= current.totalCount) return;

    isFetchingRef.current = true;
    setState((s) => ({ ...s, error: false, loadingMore: !isFirstPage, loading: isFirstPage }));
    try {
      // Primeira carga: previsões pro pool inteiro, numa chamada só.
      if (isFirstPage) {
        predictedIdsRef.current = await getOraclePoolPredictions(cardType, mood.key, includeSeries);
      }

      const allPredicted = predictedIdsRef.current;
      const pageSize = isFirstPage ? INITIAL_PAGE_SIZE : LOAD_MORE_INCREMENT;
      const nextSlice = allPredicted.slice(current.movies.length, current.movies.length + pageSize);
      const sliceMovies = await getMoviesForPredictedSlice(nextSlice);

      const ratingByTitle = new Map(nextSlice.map((p) => [`${p.media_type}:${p.movie_id}`, p.predicted_rating]));
      const enrichedMovies = sliceMovies.map((movie) => ({
        ...movie,
        predictedRating: ratingByTitle.get(`${movie.media_type === 'tv' ? 'tv' : 'movie'}:${movie.id}`),
      }));

      if (!aliveRef.current) return;
      setState((s) => ({
        movies: isFirstPage ? enrichedMovies : [...s.movies, ...enrichedMovies],
        totalCount: allPredicted.length,
        loading: false,
        loadingMore: false,
        error: false,
      }));
    } catch (error) {
      console.error(`Error loading shelf ${cardType}/${mood.key}:`, error);
      if (!aliveRef.current) return;
      setState((s) => ({ ...s, loading: false, loadingMore: false, error: s.movies.length === 0 }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [cardType, mood.key, includeSeries]);

  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtro de streaming — no cliente, sobre os filmes já carregados.
  const visibleMovies: PredictedMovie[] =
    selectedProviderIds.length === 0
      ? state.movies
      : state.movies.filter((movie) => {
          const flatrate = movie.watchProviders?.flatrate;
          if (!flatrate || flatrate.length === 0) return false;
          return flatrate.some((p) => selectedProviderIds.includes(p.provider_id));
        });

  const hasMore = state.movies.length < state.totalCount;
  const showLoadMoreButton = hasMore && selectedProviderIds.length === 0;
  const isFullyEmpty = !state.loading && !state.error && state.totalCount === 0;
  const Icon = mood.icon;
  const label = t(mood.labelKey);
  const formatScore = (value: number) => value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <section
      className="border-t border-white/[0.07] py-8 sm:py-10"
      style={{ background: `linear-gradient(180deg, ${withAlpha(mood.color, 0.1)} 0%, ${withAlpha(mood.color, 0.03)} 55%, transparent 100%)` }}
      aria-label={label}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8 flex items-center gap-3.5">
        {/* A letra da prateleira — a mesma do código de personalidade. */}
        <span
          className="relative grid place-items-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-xl text-3xl sm:text-4xl leading-none"
          style={{ ...PIXEL, color: mood.color, background: VELVET, boxShadow: `inset 0 0 0 1.5px ${withAlpha(mood.color, 0.55)}` }}
          aria-hidden
        >
          {mood.letter}
        </span>
        <div className="min-w-0">
          <h2 style={{ ...PIXEL, color: PAPER }} className="flex items-center gap-2 text-2xl sm:text-3xl leading-tight">
            <span className="truncate">{label}</span>
            <Icon className="w-5 h-5 shrink-0" style={{ color: mood.color }} aria-hidden />
          </h2>
          <p className="mt-0.5 text-sm truncate" style={{ color: MIST }}>
            {t(mood.tagKey)}
          </p>
        </div>
      </div>

      {state.loading ? (
        <div className={`mt-6 flex gap-4 overflow-hidden ${SHELF_PAD}`} aria-busy="true">
          {[...Array(7)].map((_, i) => (
            <div key={i} className={`${TILE_WIDTH} shrink-0`}>
              <div className="aspect-[2/3] rounded-xl bg-white/[0.07] animate-pulse" />
              <div className="mt-2.5 h-3.5 w-4/5 rounded bg-white/[0.07] animate-pulse" />
            </div>
          ))}
        </div>
      ) : state.error ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-white/10" style={{ background: VELVET, color: MIST }}>
            <span className="flex-1 min-w-[12rem]">{t('oracle.libraries.shelfError')}</span>
            <button
              onClick={() => loadMore()}
              className={`gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              <RefreshCw className="w-4 h-4 text-violet-300" aria-hidden />
              {t('common.retry')}
            </button>
          </div>
        </div>
      ) : isFullyEmpty ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-5">
          <p className="flex items-center gap-3 rounded-xl px-4 py-4 text-sm ring-1 ring-white/10" style={{ background: VELVET, color: MIST }}>
            <PartyPopper className="w-5 h-5 shrink-0 text-amber-300" aria-hidden />
            {t('oracle.libraries.shelfFullyWatched')}
          </p>
        </div>
      ) : (
        <>
          {visibleMovies.length === 0 && (
            <p className="mx-auto max-w-6xl px-5 sm:px-8 mt-4 text-sm" style={{ color: MIST }}>
              {t('oracle.libraries.noMoviesForFilter')}
            </p>
          )}

          {(visibleMovies.length > 0 || showLoadMoreButton) && (
            <div
              ref={scrollRef}
              className="mt-3 pt-3 overflow-x-auto cursor-grab select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              <ol className={`flex gap-4 pb-2 ${SHELF_PAD}`}>
                {visibleMovies.map((movie) => {
                  const year = (movie.release_date || '').slice(0, 4);
                  const predicted = typeof movie.predictedRating === 'number' ? movie.predictedRating : null;
                  const isSeries = movie.media_type === 'tv';
                  return (
                    <li key={`${movie.media_type || 'movie'}:${movie.id}`} className={`group relative shrink-0 ${TILE_WIDTH}`}>
                      <button
                        onClick={() => {
                          if (dragDistanceRef.current > 5) return;
                          onMovieClick(movie);
                        }}
                        className={`block w-full text-left rounded-xl ${FOCUS_RING}`}
                      >
                        <span
                          className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1"
                          style={{ background: VELVET }}
                        >
                          {movie.poster_path ? (
                            <OptimizedPoster src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`} alt={movie.title} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: MIST }}>
                              <Film className="w-7 h-7" aria-hidden />
                              <span className="text-xs leading-snug line-clamp-3" style={{ color: PAPER }}>
                                {movie.title}
                              </span>
                            </span>
                          )}
                          {predicted !== null && (
                            <span
                              className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20"
                              title={t('home.desk.predictedForYou')}
                            >
                              <Wand2 className="w-3 h-3" aria-hidden />
                              <span className="sr-only">{t('home.desk.predictedForYou')}:</span>
                              <span style={PIXEL} className="text-sm leading-none">
                                {predicted}
                              </span>
                            </span>
                          )}
                          {isSeries && (
                            <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/75 text-white text-[11px] font-semibold leading-none shadow-lg ring-1 ring-white/20">
                              <Tv className="w-3 h-3" aria-hidden />
                              {t('oracle.libraries.seriesBadge')}
                            </span>
                          )}
                        </span>
                        <span className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                          {movie.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                          {year && <span>{year}</span>}
                          {movie.vote_average > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                              {formatScore(movie.vote_average)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}

                {showLoadMoreButton && (
                  <li className={`shrink-0 ${TILE_WIDTH}`}>
                    <button
                      onClick={() => (isPremium ? loadMore() : navigate('/premium'))}
                      disabled={state.loadingMore}
                      className={`w-full aspect-[2/3] flex flex-col items-center justify-center gap-2 px-3 rounded-xl border-2 border-dashed text-center transition disabled:opacity-60 ${FOCUS_RING} ${
                        isPremium ? 'border-violet-300/40 hover:border-violet-300/70 hover:bg-violet-500/10' : 'border-amber-300/40 hover:border-amber-300/70 hover:bg-amber-500/10'
                      }`}
                    >
                      {state.loadingMore ? (
                        <Loader2 className="w-6 h-6 animate-spin text-violet-300" aria-hidden />
                      ) : (
                        <>
                          {isPremium ? <Wand2 className="w-6 h-6 text-violet-300" aria-hidden /> : <Crown className="w-6 h-6 text-amber-300" aria-hidden />}
                          <span style={{ ...PIXEL, color: PAPER }} className="text-xl leading-none">
                            {t('oracle.libraries.loadMore30')}
                          </span>
                          <span className="text-xs leading-snug" style={{ color: MIST }}>
                            {isPremium ? t('oracle.libraries.tapToLoad') : t('oracle.libraries.premiumRequired')}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                )}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default function OracleLibraries() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const oracleParam = searchParams.get('oracle');
  const selectedOracle: CardType | null = oracleParam && oracleParam in ORACLE_BY_ID ? (oracleParam as CardType) : null;

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showStreamingFilter, setShowStreamingFilter] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState<number[]>([]);
  const [includeSeries, setIncludeSeries] = useState(readIncludeSeries);
  const [isPremium, setIsPremium] = useState(false);
  // Estilo de carta do Personalizar perfil. Começa null de propósito: a
  // carta só monta com a imagem certa, sem piscar a padrão antes.
  const [cardStyle, setCardStyle] = useState<string | null>(null);
  // Prateleiras na ordem dos humores favoritos do usuário (calculada no
  // servidor); a ordem padrão vale até ela chegar.
  const [orderedMoods, setOrderedMoods] = useState(MOOD_CATEGORIES);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.rpc('get_user_favorite_moods_order', { p_user_id: session.user.id }).then(({ data, error }) => {
      if (error || !data) return;
      const orderMap = new Map((data as { mood_key: string; score: number }[]).map((row, idx) => [row.mood_key, idx]));
      const sorted = [...MOOD_CATEGORIES].sort((a, b) => {
        const rankA = orderMap.get(a.key) ?? MOOD_CATEGORIES.length;
        const rankB = orderMap.get(b.key) ?? MOOD_CATEGORIES.length;
        return rankA - rankB;
      });
      setOrderedMoods(sorted);
    });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('profiles')
      .select('card_style')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setCardStyle((data?.card_style as string) || 'default');
      });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.rpc('get_user_premium_status', { user_id_input: session.user.id }).then(({ data }) => {
      setIsPremium(Boolean(data));
    });
  }, [session?.user?.id]);

  // Troca de oráculo sempre começa do topo da página.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selectedOracle]);

  const handleMovieClick = async (movie: Movie) => {
    try {
      const details = await getMovieDetails(movie.id, movie.media_type || 'movie');
      setSelectedMovie(details);
    } catch {
      setSelectedMovie(movie);
    }
  };

  const toggleIncludeSeries = () => {
    const next = !includeSeries;
    setIncludeSeries(next);
    saveIncludeSeries(next);
  };

  const handleToggleProvider = (providerId: number) => {
    setSelectedProviderIds((prev) => (prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]));
  };

  // Sem oráculo escolhido: as cartas moram na Central dos Oráculos.
  if (!selectedOracle) return <Navigate to="/oracle" replace />;

  const current = ORACLE_BY_ID[selectedOracle];
  const ghostButton = `gap-2 h-11 px-3 sm:px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium whitespace-nowrap transition ${FOCUS_RING}`;

  return (
    <div className="min-h-screen pb-16">
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10 pb-8">
        <div className="flex items-center justify-between gap-3">
          {/* No celular a volta fica só com a seta, pra caber os dois botões. */}
          <Link
            to="/oracle"
            aria-label={t('oracle.title')}
            className={`-ml-2 shrink-0 gap-1.5 h-11 px-2 rounded-xl hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
            style={{ color: MIST, justifyContent: 'flex-start', display: 'inline-flex' }}
          >
            <ArrowLeft className="w-[18px] h-[18px]" aria-hidden />
            <span className="hidden sm:inline">{t('oracle.title')}</span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            <button
              onClick={toggleIncludeSeries}
              aria-pressed={includeSeries}
              className={`${ghostButton} ${includeSeries ? '!border-violet-400/60 bg-violet-500/20' : ''}`}
              style={{ color: PAPER }}
            >
              <Tv className="w-4 h-4 text-violet-300" aria-hidden />
              {t('oracle.libraries.includeSeries')}
            </button>
            <button
              onClick={() => setShowStreamingFilter(true)}
              aria-label={selectedProviderIds.length > 0 ? `${t('library.filters')} (${selectedProviderIds.length})` : t('library.filters')}
              className={`${ghostButton} ${selectedProviderIds.length > 0 ? '!border-violet-400/60 bg-violet-500/20' : ''}`}
              style={{ color: PAPER }}
            >
              <Filter className="w-4 h-4 text-violet-300" aria-hidden />
              {t('library.filters')}
              {selectedProviderIds.length > 0 && (
                <span className="grid place-items-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs leading-none" style={{ ...PIXEL, background: PAPER, color: INK }} aria-hidden>
                  {selectedProviderIds.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-4 sm:gap-5">
          {cardStyle ? (
            <img
              src={oracleCardImage(current.id, cardStyle)}
              alt=""
              decoding="async"
              className="w-[72px] sm:w-[92px] h-auto shrink-0 rounded-lg"
              style={{ boxShadow: `0 16px 32px -16px ${withAlpha(current.color, 0.8)}` }}
            />
          ) : (
            <span className="w-[72px] sm:w-[92px] aspect-[3/5] shrink-0 rounded-lg bg-white/[0.06] animate-pulse" />
          )}
          <div className="min-w-0">
            <p className="text-sm" style={{ color: MIST }}>
              {t('oracle.libraries.title')}
            </p>
            <h1 style={{ ...PIXEL, color: current.color }} className="mt-1 text-[2.4rem] sm:text-5xl leading-none">
              {current.name}
            </h1>
            <p className="mt-2 text-sm sm:text-[15px] leading-snug" style={{ color: PAPER }}>
              {t(LIBRARY_FUNCTION_DESC_KEY[current.id])}
            </p>
          </div>
        </div>

        {/* Trocar de oráculo sem voltar */}
        <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label={t('oracle.libraries.switchOracle')}>
          {ORACLES.map((oracle) => {
            const active = oracle.id === current.id;
            return (
              <button
                key={oracle.id}
                onClick={() => !active && setSearchParams({ oracle: oracle.id }, { replace: true })}
                aria-pressed={active}
                className={`gap-2 h-11 pl-1.5 pr-4 rounded-full text-sm font-medium transition ${FOCUS_RING} ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
                style={{ color: active ? PAPER : MIST, boxShadow: `inset 0 0 0 1.5px ${active ? oracle.color : 'rgba(255,255,255,0.15)'}` }}
              >
                <img src={oracle.avatar} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                {oracle.name}
              </button>
            );
          })}
        </div>

        <p className="mt-4 inline-flex items-start gap-2 text-sm" style={{ color: MIST }}>
          <Wand2 className="w-4 h-4 mt-0.5 shrink-0 text-violet-300" aria-hidden />
          {t('oracle.libraries.predictedRatingLegend')}
        </p>
      </section>

      {session?.user?.id &&
        orderedMoods.map((mood) => (
          <Shelf
            key={`${current.id}:${mood.key}:${includeSeries ? 'series' : 'movies'}`}
            cardType={current.id}
            mood={mood}
            includeSeries={includeSeries}
            selectedProviderIds={selectedProviderIds}
            isPremium={isPremium}
            onMovieClick={handleMovieClick}
          />
        ))}

      {selectedMovie && <MovieDetailsModal movie={selectedMovie} isOpen={true} onClose={() => setSelectedMovie(null)} isOtherUserProfile={false} />}

      <StreamingFilterModal
        isOpen={showStreamingFilter}
        onClose={() => setShowStreamingFilter(false)}
        selectedProviderIds={selectedProviderIds}
        onToggleProvider={handleToggleProvider}
        onClearFilter={() => setSelectedProviderIds([])}
      />
    </div>
  );
}
