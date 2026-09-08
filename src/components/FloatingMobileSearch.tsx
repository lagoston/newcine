import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Star, Film, Tv, Search } from 'lucide-react';
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

// v4 — reconstrução focada em PESO/FLUIDEZ, não em funcionalidade nova.
// Três mudanças de arquitetura, cada uma resolvendo um sintoma
// relatado por uma causa técnica específica:
//
// 1. Removido o layoutId compartilhado entre botão fechado e painel
//    aberto. Animar uma transformação FLIP entre um círculo de 56px e
//    um painel que cobre quase a tela inteira, com backdrop-blur nos
//    dois extremos (uma das operações mais caras que existem em CSS),
//    é pesado o bastante pra gerar artefatos visuais em GPUs de
//    celular — exatamente o "leve glitch" relatado. Trocado por
//    fade+scale simples: muito mais barato, sem FLIP nenhum.
//
// 2. A barra de busca usa a MESMA textura de vidro do painel principal
//    (bg-white/10 backdrop-blur-2xl) — antes usava um cinza opaco
//    (bg-gray-900/95) que destoava visualmente do resto, parecendo um
//    retângulo "errado" colado embaixo. O anel azul de foco do input
//    (focus:ring-blue-400) também foi removido — como o campo é
//    auto-focado ao abrir, esse anel ficava permanentemente visível,
//    parecendo outro retângulo indesejado ao redor da barra.
//
// 3. A posição da barra de busca em resposta ao teclado não passa mais
//    por useState/re-render do React — é uma ref (translateY via
//    style direto no DOM) atualizada a cada evento do visualViewport.
//    Essa ref agora vive num elemento PRÓPRIO, separado do motion.div
//    que anima abrir/fechar — antes os dois disputavam a propriedade
//    "transform" no MESMO elemento (Framer Motion via animate={{y}},
//    e a mutação manual do teclado por cima), o que provavelmente
//    causava o congelamento ao fechar/reabrir rapidamente: o estado
//    interno do Framer Motion ficava dessincronizado do DOM real.
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
  const searchBarRef = useRef<HTMLDivElement>(null);
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

  // Responde ao teclado via mutação direta do DOM — nenhum setState
  // aqui. O React nunca fica sabendo que essa altura está mudando, e
  // isso é intencional: essa posição precisa acompanhar o teclado em
  // tempo real, quadro a quadro, e o ciclo de render do React (mesmo
  // rápido) é overhead desnecessário pra algo que é puramente visual.
  useEffect(() => {
    if (!isOpen || !window.visualViewport) return;

    const vv = window.visualViewport;
    const updateKeyboardOffset = () => {
      const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (searchBarRef.current) {
        searchBarRef.current.style.transform = occluded > 0 ? `translateY(-${occluded}px)` : '';
      }
    };

    updateKeyboardOffset();
    vv.addEventListener('resize', updateKeyboardOffset);
    vv.addEventListener('scroll', updateKeyboardOffset);
    return () => {
      vv.removeEventListener('resize', updateKeyboardOffset);
      vv.removeEventListener('scroll', updateKeyboardOffset);
      if (searchBarRef.current) searchBarRef.current.style.transform = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
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

      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 350);

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
      };
    }
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

              {/* Fade + scale simples, sem layoutId — nenhum cálculo de
                  FLIP entre formas/tamanhos radicalmente diferentes.
                  Muito mais barato pra GPU renderizar, mesmo com o
                  backdrop-blur do painel. */}
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="md:hidden fixed left-0 right-0 z-[95] rounded-t-3xl bg-white/10 backdrop-blur-2xl border border-white/20 border-b-0 shadow-2xl overflow-hidden"
                style={{ top: '22vh', bottom: '-50vh' }}
              >
                <div className="absolute inset-0 flex flex-col">
                  <div className="flex-shrink-0 flex items-center justify-end p-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4 text-white/90" strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* pb-24 fixo — a barra de busca é uma camada por cima
                      (não precisa mais casar pixel a pixel com um
                      padding aqui, já que ela mesma tem fundo opaco).
                      Só garante que os últimos resultados não fiquem
                      colados debaixo dela. */}
                  {/* touchAction: 'pan-y' é essencial aqui — o body
                      inteiro tem touchAction:none enquanto o modal está
                      aberto (bloqueando o scroll de fundo), e isso é
                      decidido pelo navegador no nível de reconhecimento
                      de gestos, antes até do listener de touchmove
                      rodar. Precisa ser reabilitado explicitamente aqui,
                      sobrescrevendo a herança do body — sem isso, o
                      scroll por toque nessa lista simplesmente não
                      funciona (só a rodinha do mouse no desktop). */}
                  <div ref={resultsScrollRef} className="flex-1 overflow-y-auto px-4 pb-24" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
                    <AnimatePresence mode="popLayout">
                      {isUserSearch ? (
                        profileResults.length > 0 ? (
                          <motion.div className="space-y-1.5">
                            {profileResults.map((profile, i) => (
                              <motion.button
                                key={profile.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                onClick={() => handleProfileClick(profile)}
                                className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors text-left"
                              >
                                <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
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
                          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-white/50 text-sm py-8">
                            {t('common.noResults')}
                          </motion.p>
                        ) : null
                      ) : movieResults.length > 0 ? (
                        <motion.div className="space-y-1.5">
                          {movieResults.map((movie, i) => {
                            const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
                            const isTV = movie.media_type === 'tv';
                            return (
                              <motion.button
                                key={movie.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                onClick={() => handleMovieClick(movie)}
                                className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors text-left"
                              >
                                <div className="w-9 h-[52px] flex-shrink-0 rounded-lg overflow-hidden bg-white/10">
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
                                    {year && <span className="text-xs text-white/50">{year}</span>}
                                    {isTV ? (
                                      <span className="flex items-center gap-0.5 text-xs text-cyan-300/80">
                                        <Tv className="w-3 h-3" />
                                        TV
                                      </span>
                                    ) : (
                                      <Film className="w-3 h-3 text-white/40" />
                                    )}
                                    {movie.vote_average > 0 && (
                                      <span className="flex items-center gap-0.5 text-xs text-yellow-300/80">
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
                            className="w-full py-3 text-xs text-blue-300 hover:text-blue-200 transition-colors text-center"
                          >
                            {t('nav.searchMovies')} &ldquo;{query}&rdquo; &rarr;
                          </button>
                        </motion.div>
                      ) : query.trim().length > 1 && !loading ? (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-white/50 text-sm py-8">
                          {t('common.noResults')}
                        </motion.p>
                      ) : (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-white/40 text-xs py-8">
                          {t('nav.startTypingToSearch')}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>

              {/* Dois elementos, não um: o externo (ref, sem framer-motion
                  controlando ele) é mutado diretamente via DOM pro ajuste
                  de teclado; o interno (motion.div) cuida só da animação
                  de abrir/fechar. Antes os dois controlavam "transform"
                  no MESMO elemento — o Framer Motion via animate={{y}},
                  e eu via style.transform manual pro teclado — competindo
                  pela mesma propriedade CSS. Isso deixava o estado
                  interno do Framer Motion dessincronizado do DOM real,
                  e provavelmente era a causa do congelamento ao
                  fechar/reabrir rapidamente: o Framer tenta re-montar a
                  animação de saída assumindo um estado que não batia
                  mais com o que o DOM realmente tinha. */}
              <div ref={searchBarRef} className="md:hidden fixed left-0 right-0 z-[96]" style={{ bottom: 0 }}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ delay: 0.08, duration: 0.15 }}
                  className="p-3 bg-white/10 backdrop-blur-2xl"
                  style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
                >
                  <div className="relative">
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
                      className="w-full pl-4 pr-10 py-3 text-base bg-white/15 border border-white/25 rounded-2xl outline-none text-white placeholder-white/50 transition-all"
                      autoComplete="off"
                      autoCorrect="off"
                      inputMode="search"
                    />
                    {loading && (
                      <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 animate-spin" />
                    )}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default FloatingMobileSearch;