import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Star, Import, Loader2, Film, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Movie, searchMovies, getMovieDetails, updateMovieCache, ensureMovieCached } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useDebounce } from 'use-debounce';
import toast from 'react-hot-toast';
import IMDbImportModal from '../components/IMDbImportModal';
import MovieDetailsModal from '../components/MovieDetailsModal';
import QuickAddMenu from '../components/QuickAddMenu';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS } from '../lib/cache';

export default function AddMovies() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState({
    search: false,
    prediction: false
  });
  const [userMovieIds, setUserMovieIds] = useState<Set<number>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showMovieModal, setShowMovieModal] = useState(false);
  const [quickAddTarget, setQuickAddTarget] = useState<Movie | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const ITEMS_PER_PAGE = 9;
  const totalPages = Math.ceil(searchResults.length / ITEMS_PER_PAGE);
  const paginatedResults = searchResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    const urlSearch = searchParams.get('search');
    if (urlSearch) {
      setSearchQuery(urlSearch);
    }
  }, [searchParams]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchUserMovies();
    }
  }, [session?.user?.id]);

  const fetchUserMovies = async () => {
    try {
      const { data } = await supabase
        .from('user_movies')
        .select('movie_id')
        .eq('user_id', session?.user?.id);
      
      if (data) {
        setUserMovieIds(new Set(data.map(item => item.movie_id)));
      }
    } catch (error) {
      console.error('Error fetching user movies:', error);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(prev => ({ ...prev, search: true }));
      const results = await searchMovies(debouncedQuery);
      const sliced = results.slice(0, 18);
      setSearchResults(sliced);
      setCurrentPage(1);

      // Update cache for all results in background (no await)
      sliced.forEach(movie => {
        const mediaType = movie.media_type || 'movie';
        updateMovieCache(movie.id, mediaType).catch(() => {});
      });
    } catch (error) {
      console.error('Error searching movies:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(prev => ({ ...prev, search: false }));
    }
  };

  useEffect(() => {
    handleSearch();
  }, [debouncedQuery]);

  const addToLibrary = async (movie: Movie, rating?: number) => {
    const mediaType = movie.media_type || 'movie';

    const movieDetails = await getMovieDetails(movie.id, mediaType);
    const director = movieDetails.credits?.crew?.find(person => person.job === 'Director')?.name;

    ensureMovieCached(movie.id, mediaType).catch(() => {});

    const { error: movieError } = await supabase
      .from('movies')
      .upsert({
        id: movie.id,
        title: movieDetails.title,
        release_date: movieDetails.release_date,
        genres: movieDetails.genres.map(g => g.name),
        director: director || null,
        media_type: mediaType,
        number_of_seasons: mediaType === 'tv' ? movieDetails.number_of_seasons : null
      });

    if (movieError) throw movieError;

    if (movie.genres && movie.genres.length > 0) {
      supabase.rpc('cache_movie_genres', { p_movie_id: movie.id, p_genres: movie.genres }).catch(() => {});
    }

    const insertData: Record<string, unknown> = {
      movie_id: movie.id,
      user_id: session?.user.id,
    };
    if (rating !== undefined) insertData.rating = rating;

    const { error } = await supabase
      .from('user_movies')
      .insert(insertData);

    if (error) throw error;

    setUserMovieIds(prev => new Set([...prev, movie.id]));
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(session?.user?.id || ''));
    toast.success(t('library.inLibrary'));
  };

  const isInLibrary = (movieId: number) => userMovieIds.has(movieId);

  const handleMovieClick = async (movie: Movie) => {
    try {
      const mediaType = movie.media_type || 'movie';
      const details = await getMovieDetails(movie.id, mediaType);
      setSelectedMovie(details);
      setShowMovieModal(true);
    } catch (error) {
      console.error('Error loading movie details:', error);
      toast.error(t('common.error'));
    }
  };

  const handleAddFromModal = () => {
    if (selectedMovie) {
      setUserMovieIds(prev => new Set([...prev, selectedMovie.id]));
      cache.invalidate(CACHE_KEYS.USER_LIBRARY(session?.user?.id || ''));
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('library.addMovies')}
            </h1>
            <div className="flex items-center text-sm text-blue-800 dark:text-blue-200">
              <Film className="w-4 h-4 mr-1" />
              <span>{userMovieIds.size} {t('community.films')}</span>
            </div>
          </div>
        </div>
        
        <div className="max-w-2xl mx-auto w-full space-y-3">
          <div className="relative">
            <form onSubmit={handleSearch} className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('library.searchMovies')}
                className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoComplete="off"
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                disabled={loading.search}
              >
                {loading.search ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
              </button>
            </form>
          </div>

          <div className="sm:hidden flex justify-end">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center px-2 py-1 bg-yellow-400 hover:bg-yellow-500 text-black rounded-md transition-colors shadow-sm text-xs"
            >
              <Import className="w-3 h-3 mr-1" />
              <span className="font-medium">{t('common.import')}</span>
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => setShowImportModal(true)}
            className="hidden sm:flex items-center px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-black rounded-lg transition-colors shadow-sm"
          >
            <Import className="w-4 h-4 mr-2" />
            <span className="font-medium">{t('common.import')}</span>
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              {paginatedResults.map((movie) => (
              <div
                key={movie.id}
                className="flex bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleMovieClick(movie)}
              >
                <div className="w-32 relative">
                  {movie.vote_average !== undefined && (
                    <div className="absolute top-1 left-1 z-10 bg-black/40 rounded-md px-1.5 py-0.5 flex items-center">
                      <Star className="w-3.5 h-3.5 text-blue-400 fill-current" />
                      <span className="text-white text-xs ml-1">{movie.vote_average?.toFixed(1)}</span>
                    </div>
                  )}
                  <img
                    src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.onerror = null; // Prevent infinite loop
                      e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="450"%3E%3Crect fill="%23ddd" width="300" height="450"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="24" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
                    }}
                  />
                </div>
                <div className="flex-1 p-4 flex flex-col">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{movie.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {new Date(movie.release_date).getFullYear()}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-3">{movie.overview}</p>
                  <div className="mt-auto">
                    {!isInLibrary(movie.id) ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuickAddTarget(movie);
                        }}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
                      >
                        {t('library.addToLibrary')}
                      </button>
                    ) : (
                      <span className="block w-full text-center py-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md">
                        {t('library.inLibrary')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('common.back')}</span>
                </button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded-lg transition-colors ${
                        currentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="hidden sm:inline">{t('common.next')}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {searchResults.length === 0 && searchQuery && !loading.search && (
          <div className="text-center text-gray-600 dark:text-gray-400 py-12">
            <p>{t('library.noMoviesFound')}</p>
          </div>
        )}
      </div>

      <IMDbImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={showMovieModal}
          onClose={() => setShowMovieModal(false)}
          onAddToLibrary={handleAddFromModal}
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