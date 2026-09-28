import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Star, FileUp, Loader2, Film, ArrowLeft, Plus, Check, X, Tv, SearchX } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Movie, searchMovies, getMovieDetails, updateMovieCache, ensureMovieCached } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { cache, CACHE_KEYS } from '../lib/cache';
import IMDbImportModal from '../components/IMDbImportModal';
import MovieDetailsModal from '../components/MovieDetailsModal';
import QuickAddMenu from '../components/QuickAddMenu';
import OracleForYouBox from '../components/OracleForYouBox';
import OptimizedPoster from '../components/OptimizedPoster';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING, POSTER_TITLE } from '../lib/oracleTheme';

// Adicionar Filmes — "a mesa do oráculo".
//   1. Cabeçalho: voltar pra Biblioteca, importar (IMDb / CineOracle),
//      título e quantos títulos você já tem.
//   2. Busca: filmes e séries juntos, por popularidade.
//   3. Sem busca: "Do oráculo para você" (os 5 filmes do dia).
//   4. Com busca: grade de pôsteres. Cada cartão tem o título em até duas
//      linhas (sempre com a altura de duas) e o botão "Adicionar" — ou o selo
//      "Na biblioteca" — alinhado com o dos vizinhos.

const MAX_RESULTS = 18;
const itemKey = (id: number, mediaType?: string | null) => `${mediaType || 'movie'}:${id}`;

export default function AddMovies() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const userId = session?.user?.id;

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') ?? '');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState('');
  const [libraryKeys, setLibraryKeys] = useState<Set<string>>(new Set());
  const [libraryCount, setLibraryCount] = useState<number | null>(null);
  const [personaCode, setPersonaCode] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [quickAddTarget, setQuickAddTarget] = useState<Movie | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRequest = useRef(0);

  // Busca vinda de outra tela (?search=...).
  useEffect(() => {
    const urlSearch = searchParams.get('search');
    if (urlSearch) setSearchQuery(urlSearch);
  }, [searchParams]);

  const fetchLibrary = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from('user_movies').select('movie_id, media_type').eq('user_id', userId);
    if (error) {
      console.error('Error fetching user movies:', error);
      return;
    }
    const rows = (data ?? []) as { movie_id: number; media_type: string | null }[];
    setLibraryKeys(new Set(rows.map((row) => itemKey(row.movie_id, row.media_type))));
    setLibraryCount(rows.length);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchLibrary();
    supabase
      .from('profiles')
      .select('personalidade_completa')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setPersonaCode((data as { personalidade_completa?: string | null } | null)?.personalidade_completa ?? null));
  }, [userId, fetchLibrary]);

  // Busca com debounce. Só a resposta da última busca entra na tela — uma
  // resposta lenta de uma busca antiga nunca sobrescreve a atual.
  useEffect(() => {
    const query = debouncedQuery.trim();
    const request = ++searchRequest.current;
    if (!query) {
      setSearchResults([]);
      setSearchedFor('');
      setSearching(false);
      return;
    }
    setSearching(true);
    searchMovies(query)
      .then((results) => {
        if (request !== searchRequest.current) return;
        const sliced = results.slice(0, MAX_RESULTS);
        setSearchResults(sliced);
        setSearchedFor(query);
        // Atualiza o cache dos resultados em segundo plano.
        sliced.forEach((movie) => {
          updateMovieCache(movie.id, movie.media_type || 'movie').catch(() => {});
        });
      })
      .catch((error) => {
        if (request !== searchRequest.current) return;
        console.error('Error searching movies:', error);
        toast.error(t('common.error'));
      })
      .finally(() => {
        if (request === searchRequest.current) setSearching(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const addToLibrary = async (movie: Movie, rating?: number) => {
    const mediaType = movie.media_type || 'movie';
    const movieDetails = await getMovieDetails(movie.id, mediaType);
    const director = movieDetails.credits?.crew?.find((person) => person.job === 'Director')?.name;

    ensureMovieCached(movie.id, mediaType).catch(() => {});

    const { error: movieError } = await supabase
      .from('movies')
      .upsert({
        id: movie.id,
        title: movieDetails.title,
        release_date: movieDetails.release_date,
        genres: movieDetails.genres.map((g) => g.name),
        director: director || null,
        media_type: mediaType,
        number_of_seasons: mediaType === 'tv' ? movieDetails.number_of_seasons : null,
      }, { onConflict: 'id,media_type' });
    if (movieError) throw movieError;

    if (movie.genres && movie.genres.length > 0) {
      supabase.rpc('cache_movie_genres', { p_movie_id: movie.id, p_genres: movie.genres }).then(() => {}, () => {});
    }

    const insertData: Record<string, unknown> = { movie_id: movie.id, media_type: mediaType, user_id: userId };
    if (rating !== undefined) insertData.rating = rating;
    const { error } = await supabase.from('user_movies').insert(insertData);
    if (error) throw error;

    setLibraryKeys((prev) => new Set([...prev, itemKey(movie.id, mediaType)]));
    setLibraryCount((prev) => (prev ?? 0) + 1);
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId || ''));
    toast.success(t('library.inLibrary'));
  };

  const openMovie = async (movie: Movie) => {
    const mediaType = movie.media_type || 'movie';
    const key = itemKey(movie.id, mediaType);
    setOpeningId(key);
    try {
      const details = await getMovieDetails(movie.id, mediaType);
      setSelectedMovie(details);
      // Salva/atualiza o cache em segundo plano — só aqui na busca, nunca na
      // Biblioteca (lá poderia sobrescrever dado bom com dado desatualizado).
      ensureMovieCached(movie.id, mediaType).catch((err) => console.error('Error caching movie on open:', err));
    } catch (error) {
      console.error('Error loading movie details:', error);
      toast.error(t('common.error'));
    } finally {
      setOpeningId(null);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const formatScore = (value?: number) =>
    typeof value === 'number' && value > 0
      ? value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : null;

  const hasQuery = searchQuery.trim().length > 0;
  const showSkeleton = searching && searchResults.length === 0;
  const showEmpty = !searching && !!searchedFor && searchResults.length === 0 && hasQuery;

  return (
    <div className="min-h-screen pb-16">
      {/* ---------- Cabeçalho ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-5 sm:pt-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/library"
            className={`-ml-2 inline-flex items-center gap-1.5 h-11 px-2 rounded-xl text-sm font-medium hover:bg-white/5 transition ${FOCUS_RING}`}
            style={{ color: MIST }}
          >
            <ArrowLeft className="w-[18px] h-[18px]" aria-hidden />
            {t('nav.library')}
          </Link>
          <button
            onClick={() => setShowImportModal(true)}
            className={`inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            <FileUp className="w-[18px] h-[18px] text-amber-300" aria-hidden />
            {t('common.import')}
          </button>
        </div>

        <h1 style={{ ...PIXEL, color: PAPER }} className="mt-4 text-[2.2rem] sm:text-5xl leading-none">
          {t('library.addMovies')}
        </h1>
        <p className="mt-3 text-sm sm:text-base" style={{ color: MIST }}>
          {libraryCount === null ? ' ' : t('addMoviesPage.inLibraryCount', { count: libraryCount })}
        </p>

        {/* ---------- Busca ---------- */}
        <form
          role="search"
          onSubmit={(e) => { e.preventDefault(); searchInputRef.current?.blur(); }}
          className="mt-6 relative max-w-2xl"
        >
          <label htmlFor="add-movies-search" className="sr-only">{t('addMoviesPage.searchLabel')}</label>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" style={{ color: MIST }} aria-hidden />
          <input
            id="add-movies-search"
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('addMoviesPage.searchPlaceholder')}
            autoComplete="off"
            enterKeyHint="search"
            className="w-full h-14 pl-12 pr-14 rounded-2xl ring-1 ring-white/15 focus:ring-2 focus:ring-fuchsia-300/70 outline-none text-base placeholder:text-[#BDB4D6]/70 transition [&::-webkit-search-cancel-button]:hidden"
            style={{ background: VELVET, color: PAPER }}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {searching ? (
              <span className="grid place-items-center w-11 h-11" role="status">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: MIST }} aria-hidden />
                <span className="sr-only">{t('common.loading')}</span>
              </span>
            ) : hasQuery ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={t('addMoviesPage.clearSearch')}
                className={`grid place-items-center w-11 h-11 rounded-xl hover:bg-white/5 transition ${FOCUS_RING}`}
                style={{ color: MIST }}
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            ) : null}
          </span>
        </form>
      </section>

      {/* ---------- Do oráculo para você (sem busca) ---------- */}
      {!hasQuery && userId && (
        <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-10">
          <OracleForYouBox userId={userId} hasEssence={!!(personaCode && personaCode.length >= 3)} />
        </div>
      )}

      {/* ---------- Resultados ---------- */}
      {hasQuery && (
        <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-8" aria-live="polite" aria-busy={searching}>
          {searchResults.length > 0 && (
            <p className="text-sm" style={{ color: MIST }}>
              {t('addMoviesPage.resultsFor', { count: searchResults.length, query: searchedFor })}
            </p>
          )}

          {showSkeleton && (
            <ul className="mt-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 sm:gap-x-4 gap-y-7" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i}>
                  <div className="aspect-[2/3] rounded-xl bg-white/[0.06] animate-pulse" />
                  <div className="mt-2.5 h-3.5 w-4/5 rounded bg-white/[0.06] animate-pulse" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.06] animate-pulse" />
                </li>
              ))}
            </ul>
          )}

          {searchResults.length > 0 && (
            <ul className={`mt-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 sm:gap-x-4 gap-y-7 transition-opacity ${searching ? 'opacity-60' : ''}`}>
              {searchResults.map((movie) => {
                const mediaType = movie.media_type || 'movie';
                const key = itemKey(movie.id, mediaType);
                const inLibrary = libraryKeys.has(key);
                const year = (movie.release_date || '').slice(0, 4);
                const score = formatScore(movie.vote_average);
                return (
                  <li key={key} className="group flex flex-col min-w-0">
                    <button
                      onClick={() => openMovie(movie)}
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
                          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center" style={{ color: MIST }}>
                            <Film className="w-7 h-7" aria-hidden />
                          </span>
                        )}
                        {inLibrary && (
                          <span className="absolute top-1.5 left-1.5 grid place-items-center w-7 h-7 rounded-full bg-emerald-500 text-white shadow-lg ring-2 ring-black/30">
                            <Check className="w-4 h-4" strokeWidth={3} aria-hidden />
                          </span>
                        )}
                        {openingId === key && (
                          <span className="absolute inset-0 grid place-items-center bg-black/55">
                            <Loader2 className="w-6 h-6 animate-spin text-white" aria-hidden />
                          </span>
                        )}
                      </span>
                      <span className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                        {movie.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap overflow-hidden" style={{ color: MIST }}>
                        {mediaType === 'tv' && <Tv className="w-3 h-3 shrink-0 text-sky-300" aria-label={t('mobileSearch.series')} />}
                        {year && <span>{year}</span>}
                        {score && (
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                            {score}
                          </span>
                        )}
                      </span>
                    </button>

                    <div className="mt-auto pt-2.5">
                      {inLibrary ? (
                        <span className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-400/25 text-xs font-medium text-emerald-200">
                          <Check className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{t('library.inLibrary')}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => setQuickAddTarget(movie)}
                          aria-label={`${t('addMoviesPage.add')}: ${movie.title}`}
                          className={`w-full gap-1.5 h-10 rounded-lg border border-white/15 hover:border-violet-300/60 hover:bg-violet-500/10 text-xs font-semibold transition ${FOCUS_RING}`}
                          style={{ color: PAPER }}
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0 text-violet-300" aria-hidden />
                          {t('addMoviesPage.add')}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {showEmpty && (
            <div className="mt-2 rounded-2xl px-5 py-12 text-center ring-1 ring-white/10" style={{ background: VELVET }}>
              <SearchX className="w-7 h-7 mx-auto" style={{ color: MIST }} aria-hidden />
              <p className="mt-3 font-semibold" style={{ color: PAPER }}>
                {t('addMoviesPage.noResults', { query: searchedFor })}
              </p>
              <p className="mt-1 text-sm" style={{ color: MIST }}>{t('addMoviesPage.noResultsHint')}</p>
            </div>
          )}
        </section>
      )}

      <IMDbImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId || ''));
          fetchLibrary();
        }}
      />

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          onAddToLibrary={() => {
            cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId || ''));
            fetchLibrary();
          }}
        />
      )}

      {quickAddTarget && (
        <QuickAddMenu
          movieTitle={quickAddTarget.title}
          isOpen={true}
          onClose={() => setQuickAddTarget(null)}
          onAdd={(rating) => addToLibrary(quickAddTarget, rating)}
        />
      )}
    </div>
  );
}
