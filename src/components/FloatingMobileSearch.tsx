import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Star, Film, Tv } from 'lucide-react';
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

// O painel de vidro e a barra de busca são camadas INDEPENDENTES.
// O painel usa vh (não dvh) para que seu topo permaneça fixo mesmo
// quando o teclado mobile altera a altura dinâmica da viewport.
// A barra de busca é posicionada via visualViewport API — subindo
// exatamente o tamanho do teclado — ficando sempre visível acima dele.
// O teclado cobre parte dos resultados por baixo, exatamente como uma
// caixa de mensagem de chat se comporta.
const FloatingMobileSearch: React.FC<FloatingMobileSearchProps> = ({ onMovieSelect }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  // Rastreado só pra mover a BARRA DE BUSCA — o painel de vidro dos
  // resultados fica sempre parado, sem nenhuma lógica de teclado
  // aplicada a ele. Só a barra sobe junto com o teclado, deixando o
  // teclado cobrir parte dos resultados por baixo até ser fechado —
  // exatamente como uma caixa de mensagem de chat se comporta.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [query, setQuery] = useState('');
  const [movieResults, setMovieResults] = useState<Movie[]>([]);
  const [profileResults, setProfileResults] = useState<ProfileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
    if (!isOpen || !window.visualViewport) return;

    const vv = window.visualViewport;
    const updateKeyboardHeight = () => {
      // Diferença entre a altura da JANELA (fixa) e a altura VISÍVEL
      // real (encolhe com o teclado) = altura que o teclado ocupa.
      // Só usada pra deslocar a barra de busca — nada mais na tela
      // reage a essa mudança.
      const occluded = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardHeight(Math.max(0, occluded));
    };

    updateKeyboardHeight();
    vv.addEventListener('resize', updateKeyboardHeight);
    vv.addEventListener('scroll', updateKeyboardHeight);
    return () => {
      vv.removeEventListener('resize', updateKeyboardHeight);
      vv.removeEventListener('scroll', updateKeyboardHeight);
      setKeyboardHeight(0);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 350);
      return () => { document.body.style.overflow = originalOverflow; };
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

  // Antes navegava pra Add Movies ao pressionar Enter — isso fazia o
  // teclado mobile mostrar uma barra extra por cima dele (com um botão
  // de fechar/Done), um comportamento diferente do que aparece numa
  // busca "simples" sem ação de navegação real associada à tecla de
  // ação do teclado. Agora Enter só fecha o teclado, sem sair da tela.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inputRef.current?.blur();
  };

  // Clique explícito no botão "Buscar X →" dentro dos resultados — esse
  // sim é uma ação intencional de navegação, diferente do Enter do
  // teclado (que agora só fecha ele).
  const handleGoToFullSearch = () => {
    if (!query.trim() || isUserSearch) return;
    navigate(`/add-movies?search=${encodeURIComponent(query.trim())}`);
    handleClose();
  };

  return (
    <>
      {!isOpen && (
        <motion.button
          layoutId="floating-search-shell"
          onClick={() => setIsOpen(true)}
          className="md:hidden fixed left-0 z-40 w-14 h-14 rounded-r-2xl bg-white/10 backdrop-blur-xl border border-white/20 border-l-0 shadow-2xl flex items-center justify-center"
          style={{ paddingLeft: 'env(safe-area-inset-left)', bottom: '25vh' }}
          whileTap={{ scale: 0.92 }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
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
                className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[90]"
                onClick={handleClose}
              />

              {/* Fundo de vidro — se estende bem além da base real da
                  tela (bottom em valor negativo grande), então nunca
                  existe uma "borda final" visível. O layoutId cuida do
                  efeito de "gelatina" saindo do botão fechado. */}
              <motion.div
                layoutId="floating-search-shell"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="md:hidden fixed left-0 right-0 z-[95] rounded-t-3xl bg-white/10 backdrop-blur-2xl border border-white/20 border-b-0 shadow-2xl overflow-hidden"
                style={{ top: '22vh', bottom: '-50vh' }}
              >
                <div className="absolute inset-0 flex flex-col" style={{ paddingBottom: '92px' }}>
                  <div className="flex-shrink-0 flex items-center justify-end p-3">
                    {/* Botão X reconstruído do zero — círculo de 36px
                        (w-9 h-9), ícone de 16px (w-4 h-4) centralizado.
                        Proporção pensada pra esse tamanho de painel
                        especificamente, sem depender de nenhum layoutId
                        compartilhado que pudesse herdar escala. */}
                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4 text-white/90" strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 pb-4">
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

              {/* Barra de busca — camada totalmente independente do
                  painel de vidro. Só ela reage ao teclado via
                  visualViewport; o painel de resultados fica parado. */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ delay: 0.1, duration: 0.2 }}
                className="md:hidden fixed left-0 right-0 z-[96] p-3"
                style={{
                  bottom: keyboardHeight,
                  paddingBottom: keyboardHeight > 0 ? '0.75rem' : 'calc(env(safe-area-inset-bottom) + 0.75rem)',
                  transition: 'bottom 0.1s ease-out',
                }}
              >
                <form onSubmit={handleSubmit} className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('nav.searchMoviesOrUsers')}
                    className="w-full pl-4 pr-10 py-3 text-sm bg-white/15 border border-white/25 rounded-2xl outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 text-white placeholder-white/50 backdrop-blur-2xl shadow-2xl transition-all"
                    autoComplete="off"
                  />
                  {loading && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 animate-spin" />
                  )}
                </form>
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