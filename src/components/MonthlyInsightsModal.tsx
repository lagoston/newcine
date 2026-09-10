import React, { useState, useEffect } from 'react';
import { X, Loader2, Star, Film } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useProfileData } from '../hooks/useProfileData';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import ArchetypeSymbol from './ArchetypeSymbol';
import OptimizedPoster from './OptimizedPoster';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface MonthlyData {
  year: number;
  month: number;
  movies_rated_count: number;
  episodes_watched_count: number;
  total_movies_rated_alltime: number;
  total_hours_watched: number;
  top_movies: { movie_id: number; media_type: string; title: string; poster_path: string; rating: number }[];
  other_movie_titles: string[];
  top_genres: { name: string; count: number }[];
}

interface ProfileInfo {
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  plan_type: string;
}

// Versão funcional/básica — o design "cartão de visita" rico (estilo
// Spotify Wrapped) e a geração de imagem 9:16 pro Instagram ficam pra
// uma próxima etapa, combinada explicitamente com o usuário. Por
// enquanto, reaproveita useProfileData (mesmo hook de Profile.tsx) pros
// dados TOTAIS/personalidade — evita criar uma segunda função só pra
// isso — e chama get_monthly_insights só para os números específicos
// do mês passado, que esse hook não calcula.
const MonthlyInsightsModal: React.FC<Props> = ({ isOpen, onClose, userId }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const { ratedMoviesCount, essencePersonality, loading: profileLoading } = useProfileData(userId, i18n.language);

  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = lastMonthDate.getFullYear();
  const month = lastMonthDate.getMonth() + 1;
  const monthName = lastMonthDate.toLocaleDateString(isPt ? 'pt-BR' : 'en-US', { month: 'long' });

  useEffect(() => {
    if (!isOpen || !userId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [{ data: profile }, { data: insights, error }] = await Promise.all([
          supabase.from('profiles').select('username, avatar_url, avatar_frame, plan_type').eq('id', userId).maybeSingle(),
          supabase.rpc('get_monthly_insights', { p_user_id: userId, p_year: year, p_month: month }),
        ]);

        if (error) throw error;
        setProfileInfo(profile);
        setMonthlyData(insights as MonthlyData);
      } catch (err) {
        console.error('Error fetching monthly insights:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, userId, year, month]);

  if (!isOpen) return null;

  const archetypeId = essencePersonality?.personalidade_completa?.slice(0, 2);
  const subcategoryId = essencePersonality?.personalidade_completa?.slice(2, 3);
  const isLoading = loading || profileLoading;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-800 shadow-2xl"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
              {t('home.panels.monthlyInsights', { defaultValue: 'Insights Mensais' })} — {monthName}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
              </div>
            ) : (
              <>
                {/* Topo — avatar com frame, nome, total histórico,
                    personalidade cinematográfica (letras + símbolo) */}
                <div className="flex items-center gap-3">
                  {profileInfo && (
                    frameUsesComponent(profileInfo.avatar_frame || undefined, profileInfo.plan_type === 'premium') === 'GhostRiderFrame' && profileInfo.avatar_url ? (
                      <GhostRiderFrame src={profileInfo.avatar_url} alt={profileInfo.username} size={48} />
                    ) : (
                      <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 ${getFrameClass(profileInfo.avatar_frame || undefined, profileInfo.plan_type === 'premium')}`}>
                        {profileInfo.avatar_url ? (
                          <img src={profileInfo.avatar_url} alt={profileInfo.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
                            {profileInfo.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    )
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-white truncate">@{profileInfo?.username}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('home.panels.moviesRatedTotal', { count: ratedMoviesCount, defaultValue: `${ratedMoviesCount} filmes avaliados` })}
                    </p>
                  </div>
                  {archetypeId && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <ArchetypeSymbol archetypeId={archetypeId} subcategoryId={subcategoryId || null} size={28} animated={false} />
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                        {essencePersonality?.personalidade_completa}
                      </span>
                    </div>
                  )}
                </div>

                <div className="h-px bg-gray-200 dark:bg-gray-700" />

                {/* Números do mês passado */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-2xl bg-violet-500/10">
                    <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{monthlyData?.movies_rated_count ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('home.panels.moviesThisMonth', { defaultValue: 'Filmes no mês' })}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-fuchsia-500/10">
                    <p className="text-2xl font-bold text-fuchsia-600 dark:text-fuchsia-400">{monthlyData?.episodes_watched_count ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('home.panels.episodesThisMonth', { defaultValue: 'Episódios' })}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-500/10">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{monthlyData?.total_hours_watched ?? 0}h</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('home.panels.hoursThisMonth', { defaultValue: 'Horas assistidas' })}</p>
                  </div>
                </div>

                {/* Top 3 filmes do mês, com nota */}
                {monthlyData && monthlyData.top_movies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                      {t('home.panels.topMoviesThisMonth', { defaultValue: 'Melhores do mês' })}
                    </h3>
                    <div className="flex gap-3">
                      {monthlyData.top_movies.map((m) => (
                        <div key={m.movie_id} className="flex-1 min-w-0">
                          <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-md mb-1">
                            <OptimizedPoster
                              src={`https://image.tmdb.org/t/p/w300${m.poster_path}`}
                              alt={m.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{m.title}</p>
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{m.rating}/10</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gêneros mais assistidos no mês */}
                {monthlyData && monthlyData.top_genres.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                      {t('home.panels.topGenresThisMonth', { defaultValue: 'Gêneros do mês' })}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {monthlyData.top_genres.map((g) => (
                        <span key={g.name} className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200">
                          {g.name} ({g.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nomes dos demais filmes avaliados fora do top 3 */}
                {monthlyData && monthlyData.other_movie_titles.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">
                      {t('home.panels.otherMoviesThisMonth', { defaultValue: 'Também avaliou' })}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      {monthlyData.other_movie_titles.join(' · ')}
                    </p>
                  </div>
                )}

                {monthlyData && monthlyData.movies_rated_count === 0 && monthlyData.episodes_watched_count === 0 && (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                    <Film className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">{t('home.panels.noInsightsThisMonth', { defaultValue: 'Nenhuma atividade registrada nesse mês.' })}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MonthlyInsightsModal;