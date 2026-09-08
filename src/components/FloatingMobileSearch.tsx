import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Star, Film, Tv, Search, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { searchMovies, getMovieDetails, ensureMovieCached, Movie } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface ProfileResult {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface FloatingMobileSearchProps {
  onMovieSelect: (movie: Movie) => void;
}

const FloatingMobileSearch: React.FC<FloatingMobileSearchProps> = ({ onMovieSelect }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [movieResults, setMovieResults] = useState<Movie[]>([]);
  const [profileResults, setProfileResults] = useState<ProfileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchRef = useRef<Map<number, Promise<Movie>>>(new Map());

  const isUserSearch = query.trim().startsWith('@');

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setMovieResults([]);
      setProfileResults([]);
      return;
    }

    setLoading(true);
    try {
      if (trimmed.startsWith('@')) {
        const usernameQuery = trimmed.slice(1);
        if (!usernameQuery || !session?.user?.id) {
          setProfileResults([]);
          return;
        }
        const { data, error } = await supabase.rpc('search_visible_profiles', {
          p_user_id: session.user.id,
          p_search_query: usernameQuery,
          p_limit: 8,
        });
        if (error) throw error;
        setProfileResults(data || []);
        setMovieResults([]);
      } else {
        const data = await searchMovies(trimmed);
        const sliced = data.slice(0, 10);
        setMovieResults(sliced);
        setProfileResults([]);
        sliced.forEach((movie) => {
          const mediaType = movie.media_type || 'movie';
          if (!prefetchRef.current.has(movie.id)) {
            prefetchRef.current.set(movie.id, getMovieDetails(movie.id, mediaType));
          }
        });
      }
    } catch (error) {
      console.error('Error in floating search:', error);
      setMovieResults([]);
      setProfileResults([]);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const html = document.documentElement;

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';
    const originalHtmlOverscroll = html.style.overscrollBehavior;
    html.style.overscrollBehavior = 'none';

    const preventBackgroundScroll = (e: TouchEvent) => {
      const target = e.target as Node;
      if (resultsScrollRef.current?.contains(target)) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false });

    let rafId: number | null = null;
    const preventWindowScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
        rafId = null;
      });
    };
    window.addEventListener('scroll', preventWindowScroll, { passive: true });

    const focusTimer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 300);

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.body.style.touchAction = '';
      html.style.overscrollBehavior = originalHtmlOverscroll;
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
      document.removeEventListener('touchmove', preventBackgroundScroll);
      window.removeEventListener('scroll', preventWindowScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearTimeout(focusTimer);
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    setQuery('');
    setMovieResults([]);
    setProfileResults([]);
  };

  const handleMovieClick = async (movie: Movie) => {
    setLoading(true);
    try {
      const mediaType = movie.media_type || 'movie';
      const pending = prefetchRef.current.get(movie.id);
      const details = pending ? await pending : await getMovieDetails(movie.id, mediaType);
      onMovieSelect(details);
      handleClose();

      ensureMovieCached(movie.id, mediaType).catch((err) => {
        console.error('Error caching movie on open:', err);
      });
    } catch {
      navigate(`/add-movies?search=${encodeURIComponent(query)}`);
      handleClose();
    } finally {
      setLoading(false);
    }
  };

  const handleProfileClick = (profile: ProfileResult) => {
    handleClose();
    navigate(`/profile/${profile.username}`);
  };

  const handleGoToFullSearch = () => {
    if (!query.trim() || isUserSearch) return;
    navigate(`/add-movies?search=${encodeURIComponent(query.trim())}`);
    handleClose();
  };

  return (
    <>
      {!isOpen && (
        <motion.button
          onClick={() => setIsOpen(true)}
          initial={false}
          className="md:hidden fixed left-0 z-40 w-14 h-14 rounded-r-2xl bg-white/10 backdrop-blur-xl border border-white/20 border-l-0 shadow-2xl flex items-center justify-center"
          style={{ paddingLeft: 'env(safe-area-inset-left)', bottom: '25vh' }}
          whileTap={{ scale: 0.92 }}
        >
          <Search className="w-5 h-5 text-white/90" />
        </motion.button>
      )}

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[90]"
                style={{ touchAction: 'none' }}
                onClick={handleClose}
              />

              <motion.div
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="md:hidden fixed inset-x-0 top-0 z-[95] flex flex-col bg-slate-950/95 backdrop-blur-2xl"
                style={{
                  height: '100dvh',
                  paddingTop: 'env(safe-area-inset-top)',
                }}
              >
                {/* Unified glass surface — search bar pinned at top,
                    results scroll independently below. The bar is part
                    of the same glass panel, not a separate floating
                    layer, so there's no gray rectangle underneath. */}

                {/* Search bar — always visible, pinned to the top of the panel.
                    Because the panel starts at top:0 and uses 100dvh, the
                    keyboard naturally pushes the viewport bottom up but
                    the bar stays anchored at the top, fully visible. */}
                <div className="flex-shrink-0 px-4 pt-4 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                      <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            inputRef.current?.blur();
                          }
                        }}
                        placeholder={t('nav.searchMoviesOrUsers')}
                        className="w-full pl-10 pr-10 py-3 text-[15px] bg-white/[0.08] border border-white/[0.12] rounded-2xl outline-none text-white placeholder-white/40 transition-colors focus:bg-white/[0.12] focus:border-white/20"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        inputMode="search"
                      />
                      {loading ? (
                        <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 animate-spin" />
                      ) : query ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery('');
                            setMovieResults([]);
                            setProfileResults([]);
                            inputRef.current?.focus();
                          }}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-shrink-0 text-sm font-medium text-white/60 hover:text-white transition-colors px-1"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>

                {/* Results — independent scroll area below the search bar.
                    touchAction: 'pan-y' re-enables touch scrolling that the
                    body-level touchAction:none blocks. */}
                <div
                  ref={resultsScrollRef}
                  className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
                  style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                >
                  <AnimatePresence mode="popLayout">
                    {isUserSearch ? (
                      profileResults.length > 0 ? (
                        <motion.div className="space-y-1 pt-1">
                          {profileResults.map((profile, i) => (
                            <motion.button
                              key={profile.id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ delay: i * 0.03 }}
                              onClick={() => handleProfileClick(profile)}
                              className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.06] active:bg-white/[0.12] transition-colors text-left"
                            >
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                                {profile.avatar_url ? (
                                  <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white/70 font-bold text-sm">
                                    {profile.username.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <span className="text-sm font-medium text-white">@{profile.username}</span>
                            </motion.button>
                          ))}
                        </motion.div>
                      ) : query.trim().length > 1 && !loading ? (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-white/50 text-sm py-10">
                          {t('common.noResults')}
                        </motion.p>
                      ) : null
                    ) : movieResults.length > 0 ? (
                      <motion.div className="space-y-1 pt-1">
                        {movieResults.map((movie, i) => {
                          const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
                          const isTV = movie.media_type === 'tv';
                          return (
                            <motion.button
                              key={movie.id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ delay: i * 0.03 }}
                              onClick={() => handleMovieClick(movie)}
                              className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.06] active:bg-white/[0.12] transition-colors text-left"
                            >
                              <div className="w-10 h-[56px] flex-shrink-0 rounded-lg overflow-hidden bg-white/10">
                                {movie.poster_path ? (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                                    alt={movie.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white/40">
                                    <Film className="w-4 h-4" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{movie.title || movie.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {year && <span className="text-xs text-white/45">{year}</span>}
                                  {isTV ? (
                                    <span className="flex items-center gap-0.5 text-xs text-cyan-300/80">
                                      <Tv className="w-3 h-3" />
                                      TV
                                    </span>
                                  ) : (
                                    <Film className="w-3 h-3 text-white/30" />
                                  )}
                                  {movie.vote_average > 0 && (
                                    <span className="flex items-center gap-0.5 text-xs text-yellow-300/70">
                                      <Star className="w-3 h-3 fill-current" />
                                      {movie.vote_average.toFixed(1)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={handleGoToFullSearch}
                          className="w-full py-3 mt-1 text-xs text-blue-300/90 hover:text-blue-200 transition-colors text-center flex items-center justify-center gap-1.5"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          {t('nav.searchMovies')} &ldquo;{query}&rdquo;
                        </button>
                      </motion.div>
                    ) : query.trim().length > 1 && !loading ? (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-white/50 text-sm py-10">
                        {t('common.noResults')}
                      </motion.p>
                    ) : !loading ? (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-white/35 text-xs py-10">
                        {t('nav.startTypingToSearch')}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default FloatingMobileSearch;
