import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Film, Loader2, Shuffle, LibraryBig } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getOraclePoolMovies, Movie, getMovieDetails } from '../lib/tmdb';
import MovieDetailsModal from '../components/MovieDetailsModal';
import GlassLoader from '../components/GlassLoader';

type CardType = 'bogart' | 'fincher' | 'cypher';

// As 9 categorias temáticas reais dos pools — "random-surprise" existe
// como décimo mood_key no banco, mas é um modo coringa/fallback (quase
// 1000 filmes, muito maior que as outras), não uma categoria curada de
// verdade — por isso fica separado, como uma opção especial de "me
// surpreenda" em vez de entrar na grade das 9.
const MOOD_CATEGORIES: { key: string; labelKey: string; colors: { bg: string; border: string; text: string; glow: string } }[] = [
  { key: 'adventures', labelKey: 'oracle.moods.adventures', colors: { bg: 'bg-sky-500/15 dark:bg-sky-500/20', border: 'border-sky-400/40 dark:border-sky-500/40', text: 'text-sky-700 dark:text-sky-300', glow: 'from-sky-400/20 to-sky-500/10' } },
  { key: 'catharsis', labelKey: 'oracle.moods.catharsis', colors: { bg: 'bg-blue-500/15 dark:bg-blue-500/20', border: 'border-blue-400/40 dark:border-blue-500/40', text: 'text-blue-700 dark:text-blue-300', glow: 'from-blue-400/20 to-blue-500/10' } },
  { key: 'adrenaline', labelKey: 'oracle.moods.adrenaline', colors: { bg: 'bg-red-500/15 dark:bg-red-500/20', border: 'border-red-400/40 dark:border-red-500/40', text: 'text-red-700 dark:text-red-300', glow: 'from-red-400/20 to-red-500/10' } },
  { key: 'mind-blowing', labelKey: 'oracle.moods.mindBlowing', colors: { bg: 'bg-pink-500/15 dark:bg-pink-500/20', border: 'border-pink-400/40 dark:border-pink-500/40', text: 'text-pink-700 dark:text-pink-300', glow: 'from-pink-400/20 to-pink-500/10' } },
  { key: 'laugh-out-loud', labelKey: 'oracle.moods.laughOutLoud', colors: { bg: 'bg-green-500/15 dark:bg-green-500/20', border: 'border-green-400/40 dark:border-green-500/40', text: 'text-green-700 dark:text-green-300', glow: 'from-green-400/20 to-green-500/10' } },
  { key: 'drug-trip', labelKey: 'oracle.moods.drugTrip', colors: { bg: 'bg-emerald-500/15 dark:bg-emerald-500/20', border: 'border-emerald-400/40 dark:border-emerald-500/40', text: 'text-emerald-700 dark:text-emerald-300', glow: 'from-emerald-400/20 to-emerald-500/10' } },
  { key: 'romantic', labelKey: 'oracle.moods.romantic', colors: { bg: 'bg-orange-500/15 dark:bg-orange-500/20', border: 'border-orange-400/40 dark:border-orange-500/40', text: 'text-orange-700 dark:text-orange-300', glow: 'from-orange-400/20 to-orange-500/10' } },
  { key: 'dark-and-scary', labelKey: 'oracle.moods.darkScary', colors: { bg: 'bg-gray-500/15 dark:bg-gray-500/20', border: 'border-gray-400/40 dark:border-gray-500/40', text: 'text-gray-700 dark:text-gray-300', glow: 'from-gray-400/20 to-gray-500/10' } },
  { key: 'family-time', labelKey: 'oracle.moods.familyTime', colors: { bg: 'bg-yellow-500/15 dark:bg-yellow-500/20', border: 'border-yellow-400/40 dark:border-yellow-500/40', text: 'text-yellow-700 dark:text-yellow-300', glow: 'from-yellow-400/20 to-yellow-500/10' } },
];

const ORACLE_THEME: Record<CardType, { glow: string; border: string; text: string; button: string }> = {
  bogart: { glow: 'from-amber-500/20 to-orange-500/10', border: 'border-amber-400/40', text: 'text-amber-600 dark:text-amber-400', button: 'from-amber-600 to-orange-600' },
  fincher: { glow: 'from-slate-500/20 to-gray-600/10', border: 'border-slate-400/40', text: 'text-slate-600 dark:text-slate-300', button: 'from-slate-600 to-gray-700' },
  cypher: { glow: 'from-fuchsia-500/20 to-purple-600/10', border: 'border-fuchsia-400/40', text: 'text-fuchsia-600 dark:text-fuchsia-400', button: 'from-fuchsia-600 to-purple-600' },
};

const PAGE_SIZE = 24;

export default function OracleLibraries() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [selectedOracle, setSelectedOracle] = useState<CardType | null>(null);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const oracles: { id: CardType; image: string }[] = [
    { id: 'bogart', image: '/assets/BOGART.webp' },
    { id: 'fincher', image: '/assets/FINCHER.webp' },
    { id: 'cypher', image: '/assets/CYPHER.webp' },
  ];

  const loadMovies = useCallback(async (cardType: CardType, moodKey: string, offset: number) => {
    setLoadingMovies(true);
    try {
      const page = await getOraclePoolMovies(cardType, moodKey, PAGE_SIZE, offset);
      setMovies((prev) => (offset === 0 ? page.movies : [...prev, ...page.movies]));
      setTotalCount(page.totalCount);
    } catch (error) {
      console.error('Error loading oracle pool movies:', error);
    } finally {
      setLoadingMovies(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOracle && selectedMood) {
      setMovies([]);
      loadMovies(selectedOracle, selectedMood, 0);
    }
  }, [selectedOracle, selectedMood, loadMovies]);

  const handleMovieClick = async (movie: Movie) => {
    try {
      const details = await getMovieDetails(movie.id, movie.media_type || 'movie');
      setSelectedMovie(details);
    } catch {
      setSelectedMovie(movie);
    }
  };

  const handleBack = () => {
    if (selectedMood) {
      setSelectedMood(null);
    } else if (selectedOracle) {
      setSelectedOracle(null);
    } else {
      navigate('/oracle');
    }
  };

  const currentMoodInfo = MOOD_CATEGORIES.find((m) => m.key === selectedMood);
  const isRandomSurprise = selectedMood === 'random-surprise';

  return (
    <div className="min-h-screen pt-20 pb-24 px-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-amber-400/10 to-fuchsia-400/10 dark:from-amber-600/5 dark:to-fuchsia-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-slate-400/10 to-purple-400/10 dark:from-slate-600/5 dark:to-purple-600/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Cabeçalho — botão de voltar sempre volta um nível na navegação
            (filmes → categorias → oráculos → hub), nunca pula direto pro
            hub a menos que já esteja no primeiro nível. */}
        <div className="flex items-center gap-3 mb-8">
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

          {/* NÍVEL 2 — escolher a categoria daquele oráculo */}
          {selectedOracle && !selectedMood && (
            <motion.div
              key="moods"
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
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('oracle.libraries.chooseMood', { defaultValue: 'Escolha uma categoria pra explorar' })}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {MOOD_CATEGORIES.map((mood) => (
                  <motion.button
                    key={mood.key}
                    onClick={() => setSelectedMood(mood.key)}
                    whileHover={{ scale: 1.03, y: -3 }}
                    whileTap={{ scale: 0.97 }}
                    className={`relative rounded-2xl border-2 ${mood.colors.bg} ${mood.colors.border} p-4 text-center overflow-hidden group`}
                  >
                    <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${mood.colors.glow} rounded-full blur-2xl pointer-events-none`} />
                    <span className={`relative z-10 text-sm font-bold ${mood.colors.text}`}>
                      {t(mood.labelKey)}
                    </span>
                  </motion.button>
                ))}
              </div>

              {/* "Me surpreenda" — separado das 9 categorias curadas, já
                  que é o modo coringa (pool muito maior, sem tema
                  específico), não mais uma categoria temática igual às
                  outras. */}
              <motion.button
                onClick={() => setSelectedMood('random-surprise')}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-violet-400/40 dark:border-violet-500/40 bg-violet-500/15 dark:bg-violet-500/20 p-4 text-violet-700 dark:text-violet-300 font-bold text-sm"
              >
                <Shuffle className="w-4 h-4" />
                {t('oracle.moods.randomSurprise')}
              </motion.button>
            </motion.div>
          )}

          {/* NÍVEL 3 — explorar os filmes daquele pool */}
          {selectedOracle && selectedMood && (
            <motion.div
              key="movies"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                  <img src={oracles.find((o) => o.id === selectedOracle)!.image} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className={`text-base font-bold ${isRandomSurprise ? 'text-violet-600 dark:text-violet-400' : currentMoodInfo?.colors.text}`}>
                    {isRandomSurprise ? t('oracle.moods.randomSurprise') : t(currentMoodInfo?.labelKey || '')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <Film className="w-3 h-3" />
                    {totalCount} {totalCount === 1 ? t('community.film') : t('community.films')}
                  </p>
                </div>
              </div>

              {loadingMovies && movies.length === 0 ? (
                <div className="flex justify-center py-16">
                  <GlassLoader size="md" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
                    {movies.map((movie) => (
                      <motion.button
                        key={movie.id}
                        onClick={() => handleMovieClick(movie)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.97 }}
                        className="rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 aspect-[2/3] shadow-lg"
                      >
                        <img
                          src={movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : 'https://via.placeholder.com/342x513?text=No+Image'}
                          alt={movie.title}
                          className="w-full h-full object-cover"
                        />
                      </motion.button>
                    ))}
                  </div>

                  {movies.length < totalCount && (
                    <div className="flex justify-center mt-6">
                      <button
                        onClick={() => loadMovies(selectedOracle, selectedMood, movies.length)}
                        disabled={loadingMovies}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-60 font-semibold text-sm"
                      >
                        {loadingMovies ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {t('common.loadMore', { defaultValue: 'Carregar mais' })}
                      </button>
                    </div>
                  )}
                </>
              )}
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
    </div>
  );
}