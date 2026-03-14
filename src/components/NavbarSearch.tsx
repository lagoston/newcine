import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, Star, Film, Tv, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { searchMovies, getMovieDetails, Movie } from '../lib/tmdb';

interface NavbarSearchProps {
  onClose?: () => void;
  fullWidth?: boolean;
  onMovieSelect: (movie: Movie) => void;
}

export default function NavbarSearch({ onClose, fullWidth = false, onMovieSelect }: NavbarSearchProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchRef = useRef<Map<number, Promise<Movie>>>(new Map());

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const data = await searchMovies(q);
      const sliced = data.slice(0, 6);
      setResults(sliced);
      setOpen(true);
      sliced.forEach((movie) => {
        const mediaType = movie.media_type || 'movie';
        if (!prefetchRef.current.has(movie.id)) {
          prefetchRef.current.set(movie.id, getMovieDetails(movie.id, mediaType));
        }
      });
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMovieClick = async (movie: Movie) => {
    setOpen(false);
    setLoading(true);
    try {
      const mediaType = movie.media_type || 'movie';
      const pending = prefetchRef.current.get(movie.id);
      const details = pending ? await pending : await getMovieDetails(movie.id, mediaType);
      onMovieSelect(details);
      if (onClose) onClose();
    } catch {
      navigate(`/add-movies?search=${encodeURIComponent(query)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setOpen(false);
    navigate(`/add-movies?search=${encodeURIComponent(query.trim())}`);
    setQuery('');
    if (onClose) onClose();
  };

  const clearQuery = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${fullWidth ? 'w-full' : 'w-48 lg:w-64'}`}>
      <form onSubmit={handleSubmit} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t('nav.searchMovies')}
          className={`${fullWidth ? 'w-full' : 'w-full'} px-3 py-2 pl-9 pr-8 text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white placeholder-gray-400 transition-all`}
          autoComplete="off"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
        {!loading && query && (
          <button
            type="button"
            onClick={clearQuery}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          {results.map((movie) => {
            const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
            const isTV = movie.media_type === 'tv';
            return (
              <button
                key={movie.id}
                type="button"
                onClick={() => handleMovieClick(movie)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 transition-colors text-left group"
              >
                <div className="w-9 h-13 flex-shrink-0 rounded-md overflow-hidden bg-slate-700">
                  {movie.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                      style={{ minHeight: '52px' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      <Film className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate group-hover:text-blue-300 transition-colors">
                    {movie.title || movie.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {year && <span className="text-xs text-gray-400">{year}</span>}
                    {isTV ? (
                      <span className="flex items-center gap-0.5 text-xs text-cyan-400/80">
                        <Tv className="w-3 h-3" />
                        <span>TV</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-xs text-gray-500">
                        <Film className="w-3 h-3" />
                      </span>
                    )}
                    {movie.vote_average > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-yellow-400/80">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{movie.vote_average.toFixed(1)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleSubmit as any}
            className="w-full px-3 py-2.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-colors border-t border-white/10 text-center"
          >
            {t('nav.searchMovies')} &ldquo;{query}&rdquo; &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
