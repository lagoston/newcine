import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, ListPlus, MessageSquare, SlidersHorizontal, Library as LibraryIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import RatingBox from '../components/RatingBox';
import StreamingFilterModal from '../components/StreamingFilterModal';
import LibraryEditModal from '../components/LibraryEditModal';
import UserReviewsModal from '../components/UserReviewsModal';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import WatchListDuelModal from '../components/WatchListDuelModal';
import GlassLoader from '../components/GlassLoader';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';
import { ShelfItem, TitleMediaType, asMediaType, loadTitleCards, peekTitleCard } from '../lib/titleCards';
import {
  RatedLayout, RatedTitle, Top100Saved, buildTop100, decadeColor, fetchRatedLayout, fetchTop100, groupByDecade, outsideTop100,
  readLegacyLayout, saveRatedLayout, saveTop100,
} from '../lib/libraryLayouts';
import Top100List from '../components/Top100List';

// Biblioteca — "a estante".
//   1. Cabeçalho: título, números da coleção e atalhos (adicionar, listas,
//      resenhas, ajustes). No celular os três últimos viram só ícone, na
//      mesma linha do "Adicionar Filmes". O gráfico de notas mora no Perfil.
//   2. Prateleiras: Watchlist (com filtros e duelo) e os avaliados numa das
//      4 organizações (Ajustes): Notas (uma prateleira por nota, de 10 a 0),
//      One Grid (uma de filmes e uma de séries), Top 100 (lista com posição,
//      que a pessoa organiza) e Por década. A escolha fica no perfil — o
//      perfil na comunidade mostra a coleção do mesmo jeito.
//
// Sob demanda (10/10/2026): a página lê só as linhas da biblioteca (id,
// tipo e nota — uma consulta), então cabeçalho, números e prateleiras
// aparecem na hora. Os pôsteres de cada prateleira são buscados pela
// própria prateleira quando ela chega perto da tela, em lotes conforme a
// pessoa rola de lado (RatingBox + lib/titleCards). Antes eram duas
// consultas por título, todas antes de mostrar a página.

interface LibraryRow {
  movie_id: number;
  media_type: TitleMediaType;
  rating: number | null;
  // ano de lançamento (organização por década)
  year: number | null;
}

type LibraryItem = ShelfItem & { userRating: number | null };

const sameTitle = (row: LibraryRow, movieId: number, mediaType?: TitleMediaType) =>
  row.movie_id === movieId && (!mediaType || row.media_type === mediaType);

export default function Library() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  const [showWatchlistDuel, setShowWatchlistDuel] = useState(false);
  const [username, setUsername] = useState<string>('');

  // Library preferences
  const [tvOrder, setTvOrder] = useState<'auto' | 'first' | 'last'>('auto');
  // Chroma Box é sempre ligada (não é mais uma opção).
  const chromaBoxEnabled = true;
  // Começa pela escolha guardada no aparelho e confirma com a do perfil.
  const [ratedLayout, setRatedLayout] = useState<RatedLayout>(() => readLegacyLayout() || 'notes');
  // Top 100 guardado (null = nunca organizado: segue as notas).
  const [top100, setTop100] = useState<Top100Saved | null>(null);

  // As linhas da biblioteca chegaram (as prateleiras já podem aparecer).
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

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
      fetchLibraryRows();
      const userId = session.user.id;
      fetchRatedLayout(userId).then((saved) => {
        if (saved) {
          setRatedLayout(saved);
        } else {
          // Quem tinha escolhido só neste aparelho leva a escolha pro perfil.
          const legacy = readLegacyLayout();
          if (legacy && legacy !== 'notes') saveRatedLayout(userId, legacy).catch(() => undefined);
        }
      });
      fetchTop100(userId).then(setTop100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Só as linhas (id, tipo, nota), na ordem em que entraram. O tipo vem da
  // própria biblioteca (user_movies.media_type), que é o certo quando um
  // filme e uma série têm o mesmo número no TMDB.
  const fetchLibraryRows = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const cacheKey = CACHE_KEYS.USER_LIBRARY(userId);
    const cached = cache.get<LibraryRow[]>(cacheKey);
    if (cached) {
      setRows(cached);
      setLoading(false);
      setInitialLoadComplete(true);
      return;
    }

    try {
      // Linhas com o ano (get_library_titles), na ordem em que entraram.
      const { data, error } = await supabase.rpc('get_library_titles', { p_user_id: userId });

      if (error) throw error;

      const libraryRows: LibraryRow[] = ((data || []) as { movie_id: number; media_type: string | null; rating: number | null; release_year: number | null }[]).map((row) => ({
        movie_id: row.movie_id,
        media_type: asMediaType(row.media_type),
        rating: typeof row.rating === 'number' ? row.rating : null,
        year: typeof row.release_year === 'number' ? row.release_year : null,
      }));
      setRows(libraryRows);
      cache.set(cacheKey, libraryRows, CACHE_TTL.USER_LIBRARY);
    } catch (error) {
      console.error('Error fetching library:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  };

  // Títulos sem ano no cache (não estavam no movie_cache): o ano vem do
  // cartão, que busca no TMDB e grava o cache para a próxima vez.
  useEffect(() => {
    const missing = rows.filter((row) => row.rating !== null && row.year === null);
    if (missing.length === 0) return;
    let alive = true;
    loadTitleCards(missing.map((row) => ({ id: row.movie_id, media_type: row.media_type }))).then((cards) => {
      if (!alive) return;
      const years = new Map<string, number>();
      missing.forEach((row) => {
        const year = Number((cards.get(`${row.media_type}:${row.movie_id}`)?.release_date || '').slice(0, 4));
        if (year > 0) years.set(`${row.media_type}:${row.movie_id}`, year);
      });
      if (years.size === 0) return;
      setRows((prev) => prev.map((row) => (row.year === null && years.has(`${row.media_type}:${row.movie_id}`) ? { ...row, year: years.get(`${row.media_type}:${row.movie_id}`) as number } : row)));
    });
    return () => {
      alive = false;
    };
    // só quando as linhas chegam (não a cada nota trocada)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const storeRows = (update: (prev: LibraryRow[]) => LibraryRow[]) => {
    setRows((prev) => {
      const next = update(prev);
      if (session?.user?.id) cache.set(CACHE_KEYS.USER_LIBRARY(session.user.id), next, CACHE_TTL.USER_LIBRARY);
      return next;
    });
  };

  const handleRate = async (movieId: number, rating: number | null, mediaType?: TitleMediaType) => {
    try {
      // Cache dos gêneros para o Espectrograma Cinematográfico (do cartão
      // que a prateleira já carregou).
      const row = rows.find((r) => sameTitle(r, movieId, mediaType));
      const card = row ? peekTitleCard({ id: row.movie_id, media_type: row.media_type }) : undefined;
      if (card?.genres && card.genres.length > 0) {
        try {
          await supabase
            .rpc('cache_movie_genres', {
              p_movie_id: movieId,
              p_genres: card.genres
            });
        } catch (cacheError) {
          console.warn('Failed to cache movie genres:', cacheError);
          // Não bloquear o rating se o cache falhar
        }
      }

      let query = supabase
        .from('user_movies')
        .update({ rating })
        .eq('movie_id', movieId)
        .eq('user_id', session?.user?.id);
      if (mediaType) query = query.eq('media_type', mediaType);
      const { error } = await query;

      if (error) throw error;

      storeRows((prev) => prev.map((r) => (sameTitle(r, movieId, mediaType) ? { ...r, rating } : r)));
      cache.invalidatePattern('stats:');
      toast.success(rating === null ? t('library.ratingRemoved') : t('library.ratingUpdated'));
    } catch (error) {
      console.error('Error updating rating:', error);
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async (movieId: number, mediaType?: TitleMediaType) => {
    try {
      // Deletar o filme completamente da biblioteca
      let query = supabase
        .from('user_movies')
        .delete()
        .eq('movie_id', movieId)
        .eq('user_id', session?.user?.id);
      if (mediaType) query = query.eq('media_type', mediaType);
      const { error } = await query;

      if (error) throw error;

      storeRows((prev) => prev.filter((r) => !sameTitle(r, movieId, mediaType)));
      cache.invalidatePattern('stats:');
      toast.success(t('library.movieDeleted'));
    } catch (error) {
      console.error('Error deleting movie:', error);
      toast.error(t('common.error'));
    }
  };

  const handleRatedLayoutChange = (layout: RatedLayout) => {
    const previous = ratedLayout;
    setRatedLayout(layout);
    if (!session?.user?.id) return;
    saveRatedLayout(session.user.id, layout).catch((error) => {
      console.error('Error saving library layout:', error);
      setRatedLayout(previous);
      toast.error(t('common.error'));
    });
  };

  const handleSaveTop100 = async (next: Top100Saved) => {
    if (!session?.user?.id) return;
    await saveTop100(session.user.id, next);
    setTop100(next);
  };

  // Avaliados com o ano, na ordem em que entraram (Top 100 e décadas).
  const ratedTitles: RatedTitle[] = useMemo(
    () =>
      rows
        .filter((row) => row.rating !== null)
        .map((row) => ({ id: row.movie_id, media_type: row.media_type, userRating: row.rating as number, year: row.year })),
    [rows]
  );
  const top100Entries = useMemo(() => buildTop100(ratedTitles, top100), [ratedTitles, top100]);
  const top100Others = useMemo(() => outsideTop100(ratedTitles, top100Entries), [ratedTitles, top100Entries]);
  const decadeShelves = useMemo(() => groupByDecade(ratedTitles), [ratedTitles]);

  // Apply TV order preference
  const sortByTvOrder = (list: LibraryItem[]) => {
    if (tvOrder === 'auto') {
      return list; // Keep original order
    }

    const tvShows = list.filter((m) => m.media_type === 'tv');
    const films = list.filter((m) => m.media_type !== 'tv');

    if (tvOrder === 'first') {
      return [...tvShows, ...films];
    }
    return [...films, ...tvShows];
  };

  // Uma lista por prateleira (Watchlist e notas de 0 a 10), já na ordem
  // escolhida para as séries.
  const moviesByRating = useMemo(() => {
    const buckets: Record<string, LibraryItem[]> = { unrated: [] };
    for (let r = 0; r <= 10; r++) buckets[r] = [];
    rows.forEach((row) => {
      const item: LibraryItem = { id: row.movie_id, media_type: row.media_type, userRating: row.rating };
      if (row.rating === null) buckets.unrated.push(item);
      else (buckets[row.rating] ||= []).push(item);
    });
    Object.keys(buckets).forEach((key) => {
      buckets[key] = sortByTvOrder(buckets[key]);
    });
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tvOrder]);

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

  // O filtro de streaming precisa dos streamings de TODA a Watchlist: só
  // quando ele é ligado os cartões que faltam são buscados (em lote).
  const [watchlistCardsVersion, setWatchlistCardsVersion] = useState(0);
  const streamingFilterOn = selectedStreamingProviders.length > 0;
  useEffect(() => {
    if (!streamingFilterOn || moviesByRating.unrated.length === 0) return;
    let alive = true;
    loadTitleCards(moviesByRating.unrated).then(() => {
      if (alive) setWatchlistCardsVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [streamingFilterOn, moviesByRating.unrated]);
  const watchlistFilterPending = useMemo(
    () => streamingFilterOn && moviesByRating.unrated.some((item) => !peekTitleCard(item)),
    // watchlistCardsVersion: os cartões chegaram
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streamingFilterOn, moviesByRating.unrated, watchlistCardsVersion]
  );

  const filteredWatchlistMovies = useMemo(() => {
    let list: LibraryItem[] = moviesByRating.unrated;

    if (streamingFilterOn) {
      list = list.filter((item) => {
        const flatrate = peekTitleCard(item)?.watchProviders?.flatrate;
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
    // watchlistCardsVersion: os streamings chegaram
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moviesByRating.unrated, selectedStreamingProviders, streamingFilterOn, oracleFilterActive, predictedRatings, watchlistCardsVersion]);

  const handleToggleStreamingProvider = (providerId: number) => {
    setSelectedStreamingProviders((prev) =>
      prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]
    );
  };

  // Abre o Duelo de Watchlist automaticamente quando outra página manda o
  // usuário pra cá com esse propósito (ex.: Hub dos Oráculos). Só depois que
  // as linhas da biblioteca chegaram e só com os 4 filmes mínimos exigidos.
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

  // Números do cabeçalho.
  const stats = useMemo(() => {
    const rated = rows.filter((row) => row.rating !== null).length;
    return {
      rated,
      watchlist: rows.length - rated,
      total: rows.length,
    };
  }, [rows]);

  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
  }

  const isEmpty = initialLoadComplete && stats.total === 0;
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
            items={filteredWatchlistMovies}
            pending={watchlistFilterPending}
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

          {ratedLayout === 'top100' ? (
            <Top100List
              anchorId="library-top100"
              entries={top100Entries}
              others={top100Others}
              saved={top100}
              editable
              onSave={handleSaveTop100}
            />
          ) : ratedLayout === 'decades' ? (
            decadeShelves.map((shelf) => (
              <RatingBox
                key={shelf.decade ?? 'none'}
                anchorId={`library-decade-${shelf.decade ?? 'none'}`}
                fullBleed
                title={shelf.decade === null ? t('library.decadeUnknown') : t('library.decadeTitle', { decade: shelf.decade })}
                badgeText={shelf.decade === null ? '?' : `'${String(shelf.decade).slice(2)}`}
                items={shelf.items}
                accentColor={decadeColor(shelf.decade)}
                average={shelf.average}
                rating={null}
                onRate={handleRate}
                onDelete={handleDelete}
                chromaBoxEnabled={false}
              />
            ))
          ) : ratedLayout === 'onegrid' ? (() => {
            const allRated: LibraryItem[] = [...Array(11)].reduce((acc: LibraryItem[], _, i) => {
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
                    items={ratedMovies}
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
                    items={ratedSeries}
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
                  items={moviesByRating[rating] || []}
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
          setRows([]);
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
