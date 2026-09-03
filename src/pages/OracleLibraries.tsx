import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, LibraryBig, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getOraclePoolMovies, Movie, getMovieDetails } from '../lib/tmdb';
import MovieDetailsModal from '../components/MovieDetailsModal';
import StreamingFilterModal from '../components/StreamingFilterModal';

type CardType = 'bogart' | 'fincher' | 'cypher';

// As 9 categorias temáticas reais dos pools — "random-surprise" existe
// como décimo mood_key no banco, mas é um modo coringa/fallback (quase
// 1000 filmes, muito maior que as outras), não uma categoria curada de
// verdade — por isso não vira uma prateleira própria aqui.
const MOOD_CATEGORIES: { key: string; labelKey: string; colors: { bar: string; text: string } }[] = [
  { key: 'adventures', labelKey: 'oracle.moods.adventures', colors: { bar: 'from-sky-400 to-sky-600', text: 'text-sky-600 dark:text-sky-400' } },
  { key: 'catharsis', labelKey: 'oracle.moods.catharsis', colors: { bar: 'from-blue-400 to-blue-600', text: 'text-blue-600 dark:text-blue-400' } },
  { key: 'adrenaline', labelKey: 'oracle.moods.adrenaline', colors: { bar: 'from-red-400 to-red-600', text: 'text-red-600 dark:text-red-400' } },
  { key: 'mind-blowing', labelKey: 'oracle.moods.mindBlowing', colors: { bar: 'from-pink-400 to-pink-600', text: 'text-pink-600 dark:text-pink-400' } },
  { key: 'laugh-out-loud', labelKey: 'oracle.moods.laughOutLoud', colors: { bar: 'from-green-400 to-green-600', text: 'text-green-600 dark:text-green-400' } },
  { key: 'drug-trip', labelKey: 'oracle.moods.drugTrip', colors: { bar: 'from-emerald-400 to-emerald-600', text: 'text-emerald-600 dark:text-emerald-400' } },
  { key: 'romantic', labelKey: 'oracle.moods.romantic', colors: { bar: 'from-orange-400 to-orange-600', text: 'text-orange-600 dark:text-orange-400' } },
  { key: 'dark-and-scary', labelKey: 'oracle.moods.darkScary', colors: { bar: 'from-gray-400 to-gray-600', text: 'text-gray-600 dark:text-gray-400' } },
  { key: 'family-time', labelKey: 'oracle.moods.familyTime', colors: { bar: 'from-yellow-400 to-yellow-600', text: 'text-yellow-600 dark:text-yellow-400' } },
];

const ORACLE_THEME: Record<CardType, { glow: string; border: string; text: string }> = {
  bogart: { glow: 'from-green-500/20 to-emerald-500/10', border: 'border-green-400/40', text: 'text-green-600 dark:text-green-400' },
  fincher: { glow: 'from-red-500/20 to-rose-600/10', border: 'border-red-400/40', text: 'text-red-600 dark:text-red-400' },
  cypher: { glow: 'from-yellow-500/20 to-amber-500/10', border: 'border-yellow-400/40', text: 'text-yellow-600 dark:text-yellow-400' },
};

const SHELF_PAGE_SIZE = 30;

interface ShelfState {
  movies: Movie[];
  totalCount: number;
  loading: boolean;
  loadingMore: boolean;
}

// Uma prateleira horizontal — carrega 30 filmes (por maior nota), e
// carrega mais 30 automaticamente quando o usuário rola até o fim dela
// (sentinela com IntersectionObserver), sem botão "carregar mais".
const Shelf: React.FC<{
  cardType: CardType;
  mood: typeof MOOD_CATEGORIES[number];
  selectedProviderIds: number[];
  onMovieClick: (movie: Movie) => void;
}> = ({ cardType, mood, selectedProviderIds, onMovieClick }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<ShelfState>({ movies: [], totalCount: 0, loading: true, loadingMore: false });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (current.loadingMore || current.loading) return;
    if (current.movies.length > 0 && current.movies.length >= current.totalCount) return;

    setState((s) => ({ ...s, loadingMore: current.movies.length > 0, loading: current.movies.length === 0 }));
    const page = await getOraclePoolMovies(cardType, mood.key, SHELF_PAGE_SIZE, current.movies.length);
    setState((s) => ({
      movies: current.movies.length === 0 ? page.movies : [...s.movies, ...page.movies],
      totalCount: page.totalCount,
      loading: false,
      loadingMore: false,
    }));
  }, [cardType, mood.key]);

  useEffect(() => {
    setState({ movies: [], totalCount: 0, loading: true, loadingMore: false });
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardType, mood.key]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: el.parentElement, rootMargin: '0px 200px 0px 0px', threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Filtro de streaming — client-side, sobre os filmes já carregados
  // dessa prateleira. Mesma lógica já usada no filtro da Watchlist.
  const visibleMovies = selectedProviderIds.length === 0
    ? state.movies
    : state.movies.filter((movie) => {
        const flatrate = movie.watchProviders?.flatrate;
        if (!flatrate || flatrate.length === 0) return false;
        return flatrate.some((p) => selectedProviderIds.includes(p.provider_id));
      });

  if (!state.loading && state.movies.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2.5 mb-3 px-1">
        <div className={`h-6 w-1 rounded-full bg-gradient-to-b ${mood.colors.bar}`} />
        <h3 className={`text-sm font-bold ${mood.colors.text}`}>{t(mood.labelKey)}</h3>
        {state.totalCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">({state.totalCount})</span>
        )}
      </div>

      {state.loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-[110px] sm:w-[130px] aspect-[2/3] rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
          ))}
        </div>
      ) : visibleMovies.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
          {t('library.noMoviesForFilter', { defaultValue: 'Nenhum filme disponível nos streamings selecionados.' })}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {visibleMovies.map((movie) => (
            <motion.button
              key={`${movie.id}-${movie.media_type}`}
              onClick={() => onMovieClick(movie)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="w-[110px] sm:w-[130px] flex-shrink-0 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 aspect-[2/3] shadow-lg"
            >
              <img
                src={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : 'https://via.placeholder.com/300x450?text=No+Image'}
                alt={movie.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </motion.button>
          ))}
          {/* Sentinela invisível — quando ela entra na área visível do
              scroll, dispara o carregamento dos próximos 30. */}
          <div ref={sentinelRef} className="w-1 flex-shrink-0" />
          {state.loadingMore && (
            <div className="w-[110px] sm:w-[130px] flex-shrink-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function OracleLibraries() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [selectedOracle, setSelectedOracle] = useState<CardType | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showStreamingFilter, setShowStreamingFilter] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState<number[]>([]);

  const oracles: { id: CardType; image: string }[] = [
    { id: 'bogart', image: '/assets/BOGART.webp' },
    { id: 'fincher', image: '/assets/FINCHER.webp' },
    { id: 'cypher', image: '/assets/CYPHER.webp' },
  ];

  const handleMovieClick = async (movie: Movie) => {
    try {
      const details = await getMovieDetails(movie.id, movie.media_type || 'movie');
      setSelectedMovie(details);
    } catch {
      setSelectedMovie(movie);
    }
  };

  const handleToggleProvider = (providerId: number) => {
    setSelectedProviderIds((prev) =>
      prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]
    );
  };

  const handleBack = () => {
    if (selectedOracle) {
      setSelectedOracle(null);
    } else {
      navigate('/oracle');
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-24 px-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-amber-400/10 to-fuchsia-400/10 dark:from-amber-600/5 dark:to-fuchsia-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-slate-400/10 to-purple-400/10 dark:from-slate-600/5 dark:to-purple-600/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2.5 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-colors shadow-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
            <div className="flex items-center gap-2.5">
              <LibraryBig className="w-6 h-6 text-amber-500" />
              <h1 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500">
                {t('oracle.libraries.title', { defaultValue: 'Bibliotecas do Oráculo' })}
              </h1>
            </div>
          </div>

          {/* Filtro de streaming — só aparece depois de escolher um
              oráculo, já que filtra as prateleiras dele. Cor azul por
              padrão (era cinza antes), consistente com o mesmo filtro da
              Watchlist. */}
          {selectedOracle && (
            <button
              onClick={() => setShowStreamingFilter(true)}
              className={`relative flex items-center justify-center p-2.5 sm:p-3 rounded-xl transition-all shadow-lg flex-shrink-0 ${
                selectedProviderIds.length > 0
                  ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <Filter className="w-4 h-4" />
              {selectedProviderIds.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white text-purple-600 text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
                  {selectedProviderIds.length}
                </span>
              )}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* NÍVEL 1 — escolher o oráculo */}
          {!selectedOracle && (
            <motion.div
              key="oracles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-center text-gray-600 dark:text-gray-400 mb-8 max-w-xl mx-auto">
                {t('oracle.libraries.chooseOracle', { defaultValue: 'Cada oráculo enxerga o cinema à sua própria maneira. Escolha um para explorar tudo que ele já separou pra você.' })}
              </p>
              <div className="grid sm:grid-cols-3 gap-6">
                {oracles.map((oracle) => {
                  const theme = ORACLE_THEME[oracle.id];
                  return (
                    <motion.button
                      key={oracle.id}
                      onClick={() => setSelectedOracle(oracle.id)}
                      whileHover={{ scale: 1.03, y: -6 }}
                      whileTap={{ scale: 0.98 }}
                      className={`relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border ${theme.border} shadow-2xl overflow-hidden p-5 text-left group`}
                    >
                      <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${theme.glow} rounded-full blur-3xl pointer-events-none`} />
                      <div className="relative z-10">
                        <div className="rounded-2xl overflow-hidden mb-4 aspect-[3/4] bg-gray-200 dark:bg-gray-700">
                          <img
                            src={oracle.image}
                            alt={t(`oracle.cards.${oracle.id}`)}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                        <h2 className={`text-lg font-bold mb-1 ${theme.text}`}>
                          {t(`oracle.cards.${oracle.id}`)}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          {t(`oracle.cards.${oracle.id}Subtitle`)}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">
                          {t(`oracle.cards.${oracle.id}Desc`)}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* NÍVEL 2 — as 9 prateleiras daquele oráculo, direto, sem
              precisar escolher humor antes. */}
          {selectedOracle && (
            <motion.div
              key="shelves"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                  <img src={oracles.find((o) => o.id === selectedOracle)!.image} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${ORACLE_THEME[selectedOracle].text}`}>{t(`oracle.cards.${selectedOracle}`)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t(`oracle.cards.${selectedOracle}Subtitle`)}</p>
                </div>
              </div>

              {MOOD_CATEGORIES.map((mood) => (
                <Shelf
                  key={mood.key}
                  cardType={selectedOracle}
                  mood={mood}
                  selectedProviderIds={selectedProviderIds}
                  onMovieClick={handleMovieClick}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          isOtherUserProfile={false}
        />
      )}

      <StreamingFilterModal
        isOpen={showStreamingFilter}
        onClose={() => setShowStreamingFilter(false)}
        selectedProviderIds={selectedProviderIds}
        onToggleProvider={handleToggleProvider}
        onClearFilter={() => setSelectedProviderIds([])}
      />
    </div>
  );
}