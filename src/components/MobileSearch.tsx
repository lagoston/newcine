import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Star, Film, Tv, Search, SlidersHorizontal, ChevronRight, AtSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { searchMovies, getMovieDetails, ensureMovieCached, Movie } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ORACLES } from '../lib/oracleTheme';

// Busca do celular e do tablet, aberta pelo botão redondo da barra de baixo
// (MobileDock). Como no Instagram e no IMDb, o campo fica EMBAIXO, numa
// pílula de vidro, e sobe junto com o teclado; os resultados ficam em cima.
// O botão da barra "vira" o campo (layoutId compartilhado).
//
// Filmes e séries por padrão; começando com @ (ou tocando em "Pessoas")
// procura usuários.
//
// Teclado: a camada acompanha a área visível da tela (visualViewport) — no
// iPhone o teclado não encolhe a página, então sem isso o campo ficaria
// escondido atrás dele.

export const DOCK_SEARCH_LAYOUT_ID = 'co-dock-search';

interface ProfileResult {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface MobileSearchProps {
  open: boolean;
  onClose: () => void;
  onMovieSelect: (movie: Movie) => void;
  // Um filme aberto daqui está por cima (o modal do filme). A busca fica
  // aberta por baixo, com os resultados, e volta a aparecer quando o filme
  // fecha; enquanto isso ela não reage a Esc nem segura o toque da tela.
  suspended?: boolean;
}

// Área visível da tela (encolhe quando o teclado abre).
function useVisibleViewport(active: boolean) {
  const read = () => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    return {
      top: vv ? vv.offsetTop : 0,
      height: vv ? vv.height : typeof window !== 'undefined' ? window.innerHeight : 0,
    };
  };
  const [box, setBox] = useState(read);
  // Maior altura vista: no Android a página inteira encolhe com o teclado.
  const tallest = useRef(0);
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const update = () => {
      tallest.current = Math.max(tallest.current, window.innerHeight);
      setBox(read());
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [active]);
  const keyboard = box.height < Math.max(tallest.current, typeof window !== 'undefined' ? window.innerHeight : 0) - 120;
  return { ...box, keyboard };
}

const MobileSearch: React.FC<MobileSearchProps> = ({ open, onClose, onMovieSelect, suspended = false }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
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
  const viewport = useVisibleViewport(open);

  const isUserSearch = query.trim().startsWith('@');

  const search = useCallback(
    async (q: string) => {
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
        console.error('Error in mobile search:', error);
        setMovieResults([]);
        setProfileResults([]);
      } finally {
        setLoading(false);
      }
    },
    [session?.user?.id]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Foco no mesmo toque que abriu (no iPhone o teclado só abre assim).
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Página de fundo parada enquanto a busca está aberta. Com um filme
  // aberto por cima, o bloqueio do toque sai (senão o modal do filme não
  // rolaria); a página continua sem rolar (overflow).
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const originalHtmlOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = originalHtmlOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || suspended) return;
    const preventBackgroundScroll = (e: TouchEvent) => {
      const target = e.target as Node;
      if (resultsScrollRef.current?.contains(target)) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventBackgroundScroll);
    };
  }, [open, suspended]);

  const handleClose = useCallback(() => {
    inputRef.current?.blur();
    onClose();
    setQuery('');
    setMovieResults([]);
    setProfileResults([]);
  }, [onClose]);

  // Esc fecha (tablet com teclado físico). Com um filme aberto por cima, o
  // Esc é dele: fecha o filme e a busca continua.
  useEffect(() => {
    if (!open || suspended) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, suspended, handleClose]);

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
      // O filme abre por cima e a busca fica aberta embaixo, com os mesmos
      // resultados: fechar o filme volta para a busca. O teclado fecha.
      inputRef.current?.blur();
      onMovieSelect(details);

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
  const formatScore = (value: number) => value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
    <p className="py-12 text-center text-sm" style={{ color: MIST }}>
      {text}
    </p>
  );

  let results: React.ReactNode;
  if (isUserSearch) {
    if (profileResults.length > 0) {
      results = (
        <ul className="divide-y divide-white/[0.06]">
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
                <span className="flex-1 min-w-0 font-semibold truncate" style={{ color: PAPER }}>
                  @{profile.username}
                </span>
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
        <ul className="divide-y divide-white/[0.06]">
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
                    <span className="font-semibold leading-snug line-clamp-2" style={{ color: PAPER }}>
                      {title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]" style={{ color: MIST }}>
                      {year && <span>{year}</span>}
                      <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-semibold ${isTV ? 'bg-cyan-400/15 text-cyan-200' : 'bg-white/[0.07]'}`}>
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
    // Vazio: os três oráculos esperando, logo acima do campo.
    results = (
      <div className="h-full flex flex-col justify-end items-center pb-6 px-4 text-center">
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
        <p style={{ ...PIXEL, color: PAPER }} className="mt-5 text-2xl leading-tight">
          {t('mobileSearch.heading')}
        </p>
        <p className="mt-2 text-sm" style={{ color: MIST }}>
          {t('nav.startTypingToSearch')}
        </p>
      </div>
    );
  }

  // Embaixo: área segura do iPhone com o teclado fechado; colado no teclado
  // quando ele está aberto.
  const bottomGap = viewport.keyboard ? '8px' : 'max(12px, env(safe-area-inset-bottom))';

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Vidro sobre a página */}
          <motion.div
            key="mobile-search-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 z-[90] backdrop-blur-xl"
            style={{ background: 'rgba(12, 8, 24, 0.82)', touchAction: 'none' }}
            aria-hidden
          />

          <div
            key="mobile-search-panel"
            role="dialog"
            aria-modal={suspended ? undefined : true}
            aria-hidden={suspended || undefined}
            aria-label={t('mobileSearch.open')}
            className="lg:hidden fixed inset-x-0 z-[95] flex flex-col"
            style={{ top: viewport.top, height: viewport.height }}
          >
            {/* Resultados — rolagem própria (touchAction pan-y reativa o
                toque que o bloqueio da página de fundo desliga). */}
            <motion.div
              ref={resultsScrollRef}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-2"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
              aria-live="polite"
              aria-busy={loading || undefined}
            >
              <div className="mx-auto w-full max-w-xl h-full">{results}</div>
            </motion.div>

            {/* Campo de vidro, embaixo */}
            <div className="shrink-0 px-3" style={{ paddingBottom: bottomGap }}>
              <div className="mx-auto w-full max-w-xl">
                {/* Filmes e séries × pessoas — o mesmo que digitar ou apagar o @ */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, delay: 0.08 }}
                  className="mb-2.5 flex gap-2"
                  role="group"
                  aria-label={t('mobileSearch.modeLabel')}
                >
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
                        className={`inline-flex items-center gap-1.5 h-9 min-h-0 px-3.5 rounded-full text-sm font-medium ring-1 backdrop-blur-md transition ${FOCUS_RING} ${
                          active ? 'ring-violet-300/50 bg-violet-500/25' : 'ring-white/15 bg-white/[0.06]'
                        }`}
                        style={{ color: active ? PAPER : MIST }}
                      >
                        {mode.icon}
                        {mode.label}
                      </button>
                    );
                  })}
                </motion.div>

                <div className="flex items-center gap-2">
                  <motion.div
                    layoutId={DOCK_SEARCH_LAYOUT_ID}
                    transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                    className="co-glass relative flex-1 h-14 flex items-center"
                    style={{ borderRadius: 999 }}
                  >
                    {isUserSearch ? (
                      <AtSign className="absolute left-4 w-5 h-5 pointer-events-none text-violet-300" aria-hidden />
                    ) : (
                      <Search className="absolute left-4 w-5 h-5 pointer-events-none" style={{ color: PAPER }} aria-hidden />
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
                      placeholder={isUserSearch ? t('mobileSearch.placeholderPeople') : t('mobileSearch.placeholderSite')}
                      aria-label={t('nav.searchMoviesOrUsers')}
                      className="w-full h-full bg-transparent pl-12 pr-12 text-[16px] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/60 placeholder:text-[#BDB4D6]/80"
                      style={{ color: PAPER }}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      inputMode="search"
                      enterKeyHint="search"
                    />
                    {loading ? (
                      <Loader2 className="absolute right-4 w-5 h-5 animate-spin" style={{ color: MIST }} aria-hidden />
                    ) : query ? (
                      <button
                        type="button"
                        aria-label={t('mobileSearch.clear')}
                        onClick={() => {
                          setQuery('');
                          setMovieResults([]);
                          setProfileResults([]);
                          inputRef.current?.focus({ preventScroll: true });
                        }}
                        className="absolute right-1.5 rounded-full hover:bg-white/10 transition"
                        style={{ color: MIST }}
                      >
                        <X className="w-[18px] h-[18px]" />
                      </button>
                    ) : null}
                  </motion.div>

                  <motion.button
                    type="button"
                    onClick={handleClose}
                    aria-label={t('common.close')}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className={`co-glass shrink-0 w-14 h-14 rounded-full ${FOCUS_RING}`}
                    style={{ color: PAPER }}
                  >
                    <X className="w-6 h-6" aria-hidden />
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default MobileSearch;
