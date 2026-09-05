import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, Star, Film, Tv, AtSign } from 'lucide-react';
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

// Substitui a busca que vivia dentro do menu de três linhas no mobile —
// agora é um botão flutuante fixo, sempre acessível sem precisar abrir
// o menu inteiro primeiro. A transição usa layoutId do Framer Motion: o
// ÍCONE da lupa e o CONTAINER compartilham a mesma identidade entre o
// estado fechado (quadradinho) e aberto (painel cheio) — o Framer Motion
// interpola posição, tamanho e borda automaticamente entre os dois,
// dando a sensação de o próprio quadrado se esticando como gelatina, em
// vez de um elemento sumindo e outro aparecendo no lugar. Como o ícone
// tem seu próprio layoutId, ele nunca desaparece da tela em nenhum
// frame da transição — só se move e cresce.
const FloatingMobileSearch: React.FC<FloatingMobileSearchProps> = ({ onMovieSelect }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  // O teclado virtual no mobile reduz a área VISÍVEL da tela sem mudar a
  // altura da janela em si — CSS puro (vh/dvh) nem sempre acompanha isso
  // de forma confiável, especialmente no Safari iOS, onde um elemento
  // "fixed" pode ficar posicionado como se o teclado não existisse,
  // ficando escondido atrás dele ou fazendo a página inteira "pular".
  // window.visualViewport é a API feita exatamente pra esse problema:
  // reporta a altura e o deslocamento REAIS da área visível, atualizando
  // ao vivo quando o teclado abre/fecha.
  const [keyboardOffset, setKeyboardOffset] = useState(0);
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
        // Mesma função (searchMovies) e mesmo corte de resultados
        // usados tanto aqui quanto em Add Movies — antes o menu mobile
        // mostrava só 6 e o Add Movies 18, dando a impressão de
        // resultados diferentes pra mesma busca, quando na real eram os
        // mesmos resultados, só um subconjunto menor exibido.
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
    if (isOpen) {
      // overflow:hidden sozinho às vezes não basta no iOS Safari — o
      // navegador pode tentar rolar a página por trás pra "ajudar" a
      // trazer o input focado pra vista, mesmo com o overflow do body
      // travado, já que esse comportamento de auto-scroll não respeita
      // sempre o overflow do elemento pai. Fixar a posição do body por
      // completo durante a abertura é a forma mais robusta de evitar
      // esse "pulo" da página.
      const scrollY = window.scrollY;
      const originalStyle = {
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        overflow: document.body.style.overflow,
      };
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';

      setTimeout(() => inputRef.current?.focus(), 350);

      return () => {
        document.body.style.position = originalStyle.position;
        document.body.style.top = originalStyle.top;
        document.body.style.left = originalStyle.left;
        document.body.style.right = originalStyle.right;
        document.body.style.overflow = originalStyle.overflow;
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !window.visualViewport) return;

    const vv = window.visualViewport;
    const updateOffset = () => {
      // window.innerHeight é a altura da JANELA (não muda com o
      // teclado). vv.height é a altura VISÍVEL real (encolhe quando o
      // teclado abre). A diferença entre as duas é exatamente o espaço
      // que o teclado ocupa por baixo — é isso que o painel precisa
      // subir pra continuar visível por cima dele, em vez de ficar
      // escondido atrás ou fazer a tela inteira pular.
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, offset));
    };

    updateOffset();
    vv.addEventListener('resize', updateOffset);
    vv.addEventListener('scroll', updateOffset);
    return () => {
      vv.removeEventListener('resize', updateOffset);
      vv.removeEventListener('scroll', updateOffset);
      setKeyboardOffset(0);
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

      // Mesma chamada de sempre — garante que o filme entre no cache do
      // banco assim que alguém abre ele pela busca, independente de
      // qual caminho (menu antigo ou esse painel novo) foi usado.
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isUserSearch) return;
    navigate(`/add-movies?search=${encodeURIComponent(query.trim())}`);
    handleClose();
  };

  return (
    <>
      {/* Botão fechado — quadrado glass colado na borda esquerda,
          canto inferior. Só existe no mobile (md:hidden). */}
      {!isOpen && (
        <motion.button
          layoutId="floating-search-shell"
          layout="position"
          onClick={() => setIsOpen(true)}
          className="md:hidden fixed left-0 z-40 w-14 h-14 rounded-r-2xl bg-white/10 backdrop-blur-xl border border-white/20 border-l-0 shadow-2xl flex items-center justify-center"
          style={{ paddingLeft: 'env(safe-area-inset-left)', bottom: '25vh' }}
          whileTap={{ scale: 0.92 }}
        >
          <motion.div layoutId="floating-search-icon" className="w-5 h-5 flex items-center justify-center">
            <Search className="w-5 h-5 text-white/90" />
          </motion.div>
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
              {/* Painel expandido — mesmo layoutId do botão fechado, o
                  Framer Motion interpola forma e posição sozinho entre
                  os dois estados. */}
              <motion.div
                layoutId="floating-search-shell"
                layout="position"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="md:hidden fixed left-0 right-0 z-[95] rounded-t-3xl bg-white/10 backdrop-blur-2xl border border-white/20 border-b-0 shadow-2xl overflow-hidden"
                style={{
                  bottom: keyboardOffset,
                  maxHeight: '75dvh',
                  paddingBottom: keyboardOffset > 0 ? 0 : 'env(safe-area-inset-bottom)',
                }}
              >
                <div className="flex flex-col" style={{ maxHeight: '75dvh' }}>
                  <form onSubmit={handleSubmit} className="relative flex-shrink-0 p-4 pb-3">
                    <motion.div
                      key={isUserSearch ? 'at' : 'search'}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.15, duration: 0.2 }}
                      className="absolute left-7 top-1/2 -translate-y-1/2 pointer-events-none"
                    >
                      {isUserSearch ? (
                        <AtSign className="w-5 h-5 text-blue-300" />
                      ) : (
                        <Search className="w-5 h-5 text-white/70" />
                      )}
                    </motion.div>
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('nav.searchMoviesOrUsers', { defaultValue: 'Buscar filmes ou @usuário...' })}
                      className="w-full pl-12 pr-10 py-3 text-sm bg-white/10 border border-white/20 rounded-2xl outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 text-white placeholder-white/50 transition-all"
                      autoComplete="off"
                    />
                    {loading ? (
                      <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 animate-spin" />
                    ) : (
                      <button
                        type="button"
                        onClick={handleClose}
                        className="absolute right-8 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                      >
                        <X className="w-3 h-3 text-white/80" />
                      </button>
                    )}
                  </form>

                  <div className="flex-1 overflow-y-auto px-4 pb-4">
                    <AnimatePresence mode="popLayout">
                      {isUserSearch ? (
                        profileResults.length > 0 ? (
                          <motion.div className="space-y-1.5" initial="hidden" animate="visible">
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
                            {t('common.noResults', { defaultValue: 'Nenhum resultado encontrado.' })}
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
                            onClick={handleSubmit as any}
                            className="w-full py-3 text-xs text-blue-300 hover:text-blue-200 transition-colors text-center"
                          >
                            {t('nav.searchMovies')} &ldquo;{query}&rdquo; &rarr;
                          </button>
                        </motion.div>
                      ) : query.trim().length > 1 && !loading ? (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-white/50 text-sm py-8">
                          {t('common.noResults', { defaultValue: 'Nenhum resultado encontrado.' })}
                        </motion.p>
                      ) : (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-white/40 text-xs py-8">
                          {t('nav.startTypingToSearch', { defaultValue: 'Digite pra buscar, ou @ pra encontrar pessoas.' })}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
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