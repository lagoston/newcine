import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Star, Film, Tv, Search, SlidersHorizontal, ChevronRight, AtSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { searchMovies, getMovieDetails, ensureMovieCached, Movie } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ORACLES } from '../lib/oracleTheme';

// Busca exclusiva do celular: uma aba presa na borda esquerda da tela que
// abre uma gaveta de tela cheia com o campo no topo (o teclado empurra o
// fim da tela, nunca o campo). Filmes e séries por padrão; começando com @
// (ou tocando em "Pessoas") procura usuários.

interface ProfileResult {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface FloatingMobileSearchProps {
  onMovieSelect: (movie: Movie) => void;
}

const FloatingMobileSearch: React.FC<FloatingMobileSearchProps> = ({ onMovieSelect }) => {
  const { t, i18n } = useTranslation();
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
  // Chave "tipo:id" — filme e série podem ter o MESMO id no TMDB.
  const prefetchRef = useRef<Map<string, Promise<Movie>>>(new Map());
  // Qual resultado está sendo aberto agora (spinner no pôster dele).
  const [openingKey, setOpeningKey] = useState<string | null>(null);

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
          const key = `${mediaType}:${movie.id}`;
          if (!prefetchRef.current.has(key)) {
            const pending = getMovieDetails(movie.id, mediaType);
            // Evita "unhandled rejection" de uma pré-busca que ninguém abriu.
            pending.catch(() => {});
            prefetchRef.current.set(key, pending);
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

    const html = document.documentElement;
    const originalHtmlOverflow = html.style.overflow;
    html.style.overflow = 'hidden';

    const preventBackgroundScroll = (e: TouchEvent) => {
      const target = e.target as Node;
      if (resultsScrollRef.current?.contains(target)) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false });

    const focusTimer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 300);

    return () => {
      html.style.overflow = originalHtmlOverflow;
      document.removeEventListener('touchmove', preventBackgroundScroll);
      clearTimeout(focusTimer);
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setMovieResults([]);
    setProfileResults([]);
  }, []);

  // Esc fecha (tablet com teclado físico).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  // Alterna entre filmes e pessoas mexendo só no @ do começo do texto.
  const setPeopleMode = (people: boolean) => {
    const bare = query.replace(/^@+/, '');
    setQuery(people ? `@${bare}` : bare);
    inputRef.current?.focus({ preventScroll: true });
  };

  const handleMovieClick = async (movie: Movie) => {
    if (openingKey) return;
    const mediaType = movie.media_type || 'movie';
    setOpeningKey(`${mediaType}:${movie.id}`);
    setLoading(true);
    try {
      const pending = prefetchRef.current.get(`${mediaType}:${movie.id}`);
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
      setOpeningKey(null);
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

  const trimmed = query.trim();
  const peopleQuery = trimmed.replace(/^@+/, '');
  const formatScore = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const skeletonRows = (
    <ul className="pt-2 space-y-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3.5 py-2">
          <span className="w-12 h-[72px] rounded-lg animate-pulse" style={{ background: VELVET }} />
          <span className="flex-1 space-y-2">
            <span className="block h-4 w-3/4 rounded animate-pulse" style={{ background: VELVET }} />
            <span className="block h-3 w-1/3 rounded animate-pulse" style={{ background: VELVET }} />
          </span>
        </li>
      ))}
    </ul>
  );

  const emptyMessage = (text: string) => (
    <p className="py-12 text-center text-sm" style={{ color: MIST }}>{text}</p>
  );

  let results: React.ReactNode;
  if (isUserSearch) {
    if (profileResults.length > 0) {
      results = (
        <ul className="pt-1 divide-y divide-white/[0.06]">
          {profileResults.map((profile) => (
            <li key={profile.id}>
              <button
                onClick={() => handleProfileClick(profile)}
                className={`w-full flex justify-start items-center gap-3.5 py-3 text-left rounded-xl active:bg-white/5 transition ${FOCUS_RING}`}
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-11 h-11 shrink-0 rounded-full object-cover ring-1 ring-white/15" loading="lazy" decoding="async" />
                ) : (
                  <span className="grid place-items-center w-11 h-11 shrink-0 rounded-full ring-1 ring-white/15 font-semibold" style={{ background: VELVET, color: PAPER }}>
                    {profile.username.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="flex-1 min-w-0 font-semibold truncate" style={{ color: PAPER }}>@{profile.username}</span>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      );
    } else if (!peopleQuery) {
      results = emptyMessage(t('mobileSearch.peopleHint'));
    } else if (loading) {
      results = skeletonRows;
    } else {
      results = emptyMessage(t('common.noResults'));
    }
  } else if (movieResults.length > 0) {
    results = (
      <>
        <ul className="pt-1 divide-y divide-white/[0.06]">
          {movieResults.map((movie) => {
            const mediaType = movie.media_type || 'movie';
            const key = `${mediaType}:${movie.id}`;
            const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
            const isTV = mediaType === 'tv';
            const title = movie.title || movie.name;
            return (
              <li key={key}>
                <button
                  onClick={() => handleMovieClick(movie)}
                  aria-busy={openingKey === key || undefined}
                  className={`w-full flex justify-start items-center gap-3.5 py-2.5 text-left rounded-xl active:bg-white/5 transition ${FOCUS_RING}`}
                >
                  <span className="relative w-12 h-[72px] shrink-0 rounded-lg overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
                    {movie.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                        <Film className="w-4 h-4" aria-hidden />
                      </span>
                    )}
                    {openingKey === key && (
                      <span className="absolute inset-0 bg-black/55 grid place-items-center">
                        <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold leading-snug line-clamp-2" style={{ color: PAPER }}>{title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]" style={{ color: MIST }}>
                      {year && <span>{year}</span>}
                      <span
                        className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-semibold ${isTV ? 'bg-cyan-400/15 text-cyan-200' : 'bg-white/[0.07]'}`}
                      >
                        {isTV ? <Tv className="w-3 h-3" aria-hidden /> : <Film className="w-3 h-3" aria-hidden />}
                        {isTV ? t('mobileSearch.series') : t('mobileSearch.film')}
                      </span>
                      {movie.vote_average > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                          {formatScore(movie.vote_average)}
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={handleGoToFullSearch}
          className={`mt-3 w-full gap-2 h-12 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
          style={{ color: PAPER }}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0 text-violet-300" aria-hidden />
          <span className="truncate">{t('mobileSearch.fullSearch', { query: trimmed })}</span>
        </button>
      </>
    );
  } else if (trimmed.length > 1 && loading) {
    results = skeletonRows;
  } else if (trimmed.length > 1) {
    results = emptyMessage(t('common.noResults'));
  } else {
    results = (
      <div className="pt-14 px-4 text-center">
        <div className="flex justify-center -space-x-2" aria-hidden>
          {ORACLES.map((oracle) => (
            <img
              key={oracle.id}
              src={oracle.avatar}
              alt=""
              width={44}
              height={44}
              className="w-11 h-11 rounded-full object-cover"
              style={{ boxShadow: `0 0 0 2px ${NIGHT}, 0 0 0 4px ${oracle.color}` }}
            />
          ))}
        </div>
        <p style={{ ...PIXEL, color: PAPER }} className="mt-6 text-2xl leading-tight">{t('mobileSearch.heading')}</p>
        <p className="mt-2 text-sm" style={{ color: MIST }}>{t('nav.startTypingToSearch')}</p>
      </div>
    );
  }

  return (
    <>
      {!isOpen && (
        <motion.button
          onClick={() => setIsOpen(true)}
          initial={false}
          aria-label={t('mobileSearch.open')}
          className={`md:hidden fixed left-0 z-40 w-12 h-14 rounded-r-2xl ring-1 ring-white/15 flex items-center justify-center ${FOCUS_RING}`}
          style={{
            paddingLeft: 'env(safe-area-inset-left)',
            bottom: '25vh',
            background: 'rgba(28,20,51,0.92)',
            boxShadow: '0 12px 28px -12px rgba(139,92,246,0.75), inset -1px 0 0 rgba(255,255,255,0.06)',
            minWidth: 0,
          }}
          whileTap={{ scale: 0.92 }}
        >
          <Search className="w-5 h-5" style={{ color: PAPER }} aria-hidden />
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
                className="md:hidden fixed inset-0 bg-black/60 z-[90]"
                style={{ touchAction: 'none' }}
                onClick={handleClose}
              />

              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={t('mobileSearch.open')}
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="md:hidden fixed inset-x-0 top-0 z-[95] flex flex-col"
                style={{
                  height: '100dvh',
                  paddingTop: 'env(safe-area-inset-top)',
                  background: `radial-gradient(ellipse 90% 45% at 85% 0%, rgba(139,92,246,0.2), transparent 65%), ${NIGHT}`,
                }}
              >
                {/* Campo fixo no topo — como a gaveta ocupa 100dvh a partir do
                    topo, o teclado empurra só o fim da tela e o campo fica
                    sempre visível. */}
                <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.07]">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      {isUserSearch ? (
                        <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none text-violet-300" aria-hidden />
                      ) : (
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none" style={{ color: MIST }} aria-hidden />
                      )}
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
                        placeholder={isUserSearch ? t('mobileSearch.placeholderPeople') : t('mobileSearch.placeholderTitles')}
                        aria-label={t('nav.searchMoviesOrUsers')}
                        className="w-full h-12 pl-11 pr-11 text-[16px] rounded-xl outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-fuchsia-300/70 transition placeholder:text-[#BDB4D6]/70"
                        style={{ background: VELVET, color: PAPER }}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        inputMode="search"
                        enterKeyHint="search"
                      />
                      {loading ? (
                        <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] animate-spin" style={{ color: MIST }} aria-hidden />
                      ) : query ? (
                        <button
                          type="button"
                          aria-label={t('mobileSearch.clear')}
                          onClick={() => {
                            setQuery('');
                            setMovieResults([]);
                            setProfileResults([]);
                            inputRef.current?.focus();
                          }}
                          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-xl hover:bg-white/5 transition"
                          style={{ color: MIST }}
                        >
                          <X className="w-[18px] h-[18px]" />
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      className={`shrink-0 px-2 rounded-xl text-sm font-medium hover:bg-white/5 transition ${FOCUS_RING}`}
                      style={{ color: MIST }}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>

                  {/* Filmes e séries × pessoas — o mesmo que digitar ou apagar o @ */}
                  <div className="mt-3 flex gap-2" role="group" aria-label={t('mobileSearch.modeLabel')}>
                    {[
                      { people: false, label: t('mobileSearch.modeTitles'), icon: <Film className="w-4 h-4" aria-hidden /> },
                      { people: true, label: t('mobileSearch.modePeople'), icon: <AtSign className="w-4 h-4" aria-hidden /> },
                    ].map((mode) => {
                      const active = isUserSearch === mode.people;
                      return (
                        <button
                          key={String(mode.people)}
                          type="button"
                          onClick={() => setPeopleMode(mode.people)}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-1.5 px-3.5 rounded-full text-sm font-medium border transition ${FOCUS_RING} ${
                            active ? 'border-violet-400/60 bg-violet-500/20' : 'border-white/15 hover:border-white/30'
                          }`}
                          style={{ color: active ? PAPER : MIST }}
                        >
                          {mode.icon}
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Resultados — rolagem própria (touchAction pan-y reativa o
                    toque que o bloqueio da página de fundo desliga). */}
                <div
                  ref={resultsScrollRef}
                  className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
                  style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                  aria-live="polite"
                  aria-busy={loading || undefined}
                >
                  {results}
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
