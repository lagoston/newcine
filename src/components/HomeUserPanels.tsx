import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Library as LibraryIcon, Lock, Star, Film, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getMovieDetails, Movie } from '../lib/tmdb';
import OptimizedPoster from './OptimizedPoster';
import MovieDetailsModal from './MovieDetailsModal';

interface LockedTag {
  name: string;
  emoji: string;
  hint: string;
  hintPt: string;
}

const PROGRESSION_TIERS = [
  { name: 'Balcony Regular', emoji: '🎫', min: 1, hint: '1 movie in library', hintPt: '1 filme na biblioteca' },
  { name: 'Seat Warmer', emoji: '💺', min: 20, hint: '20 movies in library', hintPt: '20 filmes na biblioteca' },
  { name: 'Popcorn Pro', emoji: '🍿', min: 50, hint: '50 movies in library', hintPt: '50 filmes na biblioteca' },
  { name: 'Reel Addict', emoji: '📽', min: 100, hint: '100 movies in library', hintPt: '100 filmes na biblioteca' },
  { name: 'Cine Elite', emoji: '🎞', min: 200, hint: '200 movies in library', hintPt: '200 filmes na biblioteca' },
  { name: 'Projectionist Supreme', emoji: '🎬', min: 500, hint: '500 movies in library', hintPt: '500 filmes na biblioteca' },
  { name: 'Cinematic Guru', emoji: '🎭', min: 1000, hint: '1000 movies in library', hintPt: '1000 filmes na biblioteca' },
];

const ORACLE_PRED_TIERS = [
  { name: 'Curious Seeker', emoji: '🔍', min: 10, hint: '10 Oracle predictions', hintPt: '10 previsões no Oráculo' },
  { name: 'Pattern Hunter', emoji: '🧩', min: 25, hint: '25 Oracle predictions', hintPt: '25 previsões no Oráculo' },
  { name: 'Mind Decoder', emoji: '🧠', min: 50, hint: '50 Oracle predictions', hintPt: '50 previsões no Oráculo' },
  { name: 'Future Whisperer', emoji: '🌘', min: 100, hint: '100 Oracle predictions', hintPt: '100 previsões no Oráculo' },
  { name: "Oracle's Chosen", emoji: '🌑', min: 200, hint: '200 Oracle predictions', hintPt: '200 previsões no Oráculo' },
  { name: 'Fate Architect', emoji: '🜂', min: 500, hint: '500 Oracle predictions', hintPt: '500 previsões no Oráculo' },
  { name: 'Timeline Overlord', emoji: '⛓️', min: 1000, hint: '1000 Oracle predictions', hintPt: '1000 previsões no Oráculo' },
];

const ORACLE_REC_TIERS = [
  { name: 'Popcorn Taster', emoji: '🌽', min: 10, hint: '10 Oracle recommendations', hintPt: '10 recomendações do Oráculo' },
  { name: 'Hidden Gem Hunter', emoji: '🔶', min: 25, hint: '25 Oracle recommendations', hintPt: '25 recomendações do Oráculo' },
  { name: 'Genre Explorer', emoji: '🗺️', min: 50, hint: '50 Oracle recommendations', hintPt: '50 recomendações do Oráculo' },
  { name: 'Taste Alchemist', emoji: '🧪', min: 100, hint: '100 Oracle recommendations', hintPt: '100 recomendações do Oráculo' },
  { name: 'Recommendation Lord', emoji: '⚜️', min: 200, hint: '200 Oracle recommendations', hintPt: '200 recomendações do Oráculo' },
  { name: 'Galaxy Curator', emoji: '🧮', min: 500, hint: '500 Oracle recommendations', hintPt: '500 recomendações do Oráculo' },
  { name: 'Multiverse Sommelier', emoji: '🎎', min: 1000, hint: '1000 Oracle recommendations', hintPt: '1000 recomendações do Oráculo' },
];

const COMMUNITY_TIERS = [
  { name: 'Spotlight Spark', emoji: '✨', min: 1, hint: '1 follower', hintPt: '1 seguidor' },
  { name: 'Rising Star', emoji: '🌠', min: 10, hint: '10 followers', hintPt: '10 seguidores' },
  { name: 'Red-Carpet Regular', emoji: '👠', min: 25, hint: '25 followers', hintPt: '25 seguidores' },
  { name: 'Festival Favorite', emoji: '🏵️', min: 50, hint: '50 followers', hintPt: '50 seguidores' },
  { name: 'Blockbuster', emoji: '💥', min: 100, hint: '100 followers', hintPt: '100 seguidores' },
  { name: 'Cult Legend', emoji: '🌟', min: 200, hint: '200 followers', hintPt: '200 seguidores' },
];

const THEME_TAGS = [
  { name: 'Mockingjay Victor', emoji: '🏹', hint: 'All 5 Hunger Games films', hintPt: 'Todos os 5 Hunger Games', ids: [70160, 101299, 131631, 131634, 695721] },
  { name: 'Lucky Player', emoji: '🎲', hint: 'Jumanji (1995) & Zathura (2005)', hintPt: 'Jumanji (1995) e Zathura (2005)', ids: [8844, 6795] },
  { name: 'Death Dodger', emoji: '☠️', hint: 'All 5 Final Destination films', hintPt: 'Todos os 5 Premonição', ids: [9532, 9358, 9286, 19912, 55779] },
  { name: 'Hogwarts Graduate', emoji: '🧙', hint: 'All 8 Harry Potter films', hintPt: 'Todos os 8 Harry Potter', ids: [671, 672, 673, 674, 675, 767, 12444, 12445] },
  { name: 'Force Founder', emoji: '🌌', hint: 'Star Wars Original Trilogy (IV-V-VI)', hintPt: 'Trilogia Original Star Wars (IV-V-VI)', ids: [11, 1891, 1892] },
  { name: 'Don of Cinema', emoji: '🍷', hint: 'The Godfather Trilogy', hintPt: 'Trilogia O Poderoso Chefão', ids: [238, 240, 242] },
  { name: 'Trap Builder', emoji: '🪤', hint: 'Home Alone 1 & 2', hintPt: 'Esqueceram de Mim 1 & 2', ids: [771, 772] },
  { name: 'Red-Pill Adept', emoji: '💊', hint: 'The Matrix Trilogy', hintPt: 'Trilogia Matrix', ids: [603, 604, 605] },
  { name: 'Flux-Capacitor Fan', emoji: '⚡', hint: 'Back to the Future Trilogy', hintPt: 'Trilogia De Volta Para o Futuro', ids: [105, 165, 196] },
  { name: 'Ring Expert', emoji: '💍', hint: 'The Lord of the Rings Trilogy', hintPt: 'Trilogia O Senhor dos Anéis', ids: [120, 121, 122] },
  { name: 'Toy Collector', emoji: '🦖', hint: 'All 4 Toy Story films', hintPt: 'Todos os 4 Toy Story', ids: [862, 863, 10193, 301528] },
  { name: 'Whip-Crack Scholar', emoji: '🥾', hint: 'Indiana Jones Quadrilogy', hintPt: 'Quadrilogia Indiana Jones', ids: [85, 89, 90, 91] },
  { name: 'Sailor', emoji: '🏴‍☠️', hint: 'All 5 Pirates of the Caribbean films', hintPt: 'Todos os 5 Piratas do Caribe', ids: [22, 58, 285, 1865, 166426] },
  { name: 'Senior Mechanic', emoji: '🔧', hint: 'All 10 main Fast & Furious films', hintPt: 'Todos os 10 principais Velozes e Furiosos', ids: [9799, 584, 9615, 13804, 51497, 82992, 168259, 337339, 385128, 385687] },
  { name: 'Cybertron Sentinel', emoji: '🤖', hint: 'All 7 live-action Transformers', hintPt: 'Todos os 7 Transformers live-action', ids: [424783, 1858, 91314, 667538, 335988, 8373, 38356] },
  { name: 'Swamp Royalty', emoji: '🧅', hint: 'All 4 Shrek films', hintPt: 'Todos os 4 Shrek', ids: [808, 809, 810, 10192] },
  { name: 'Dino Tamer', emoji: '🦴', hint: 'All 6 Jurassic Park/World films', hintPt: 'Todos os 6 Jurassic Park/World', ids: [329, 330, 331, 135397, 351286, 507086] },
  { name: 'Banana Boss', emoji: '🍌', hint: 'All 5 Despicable Me/Minions films', hintPt: 'Todos os 5 Meu Malvado Favorito/Minions', ids: [39538, 93456, 324852, 211672, 438148] },
  { name: 'Baba Yaga', emoji: '🃏', hint: 'John Wick Saga (4 films)', hintPt: 'Saga John Wick (4 filmes)', ids: [245891, 324552, 458156, 603692] },
  { name: 'Casual Drinker', emoji: '🥃', hint: 'The Hangover Trilogy', hintPt: 'Trilogia Se Beber Não Case!', ids: [18785, 45243, 109439] },
  { name: 'Sweetie Pie', emoji: '🥧', hint: 'American Pie (original four)', hintPt: 'American Pie (quatro originais)', ids: [2105, 2770, 8273, 71552] },
  { name: 'Visceral Gamer', emoji: '♟️', hint: 'Saw Franchise (10 films)', hintPt: 'Franquia Jogos Mortais (10 filmes)', ids: [176, 215, 214, 663, 11917, 22804, 41439, 298250, 602734, 951491] },
  { name: 'Nuts', emoji: '🌰', hint: 'Ice Age Saga (6 films)', hintPt: 'Saga A Era do Gelo (6 filmes)', ids: [425, 950, 8355, 57800, 278154, 774825] },
  { name: 'Dark Spirit', emoji: '🦇', hint: 'The Dark Knight Trilogy', hintPt: 'Trilogia Batman — O Cavaleiro das Trevas', ids: [272, 155, 49026] },
  { name: 'Infinity Gauntlet', emoji: '♾️', hint: 'All 4 Avengers films (2012-2019)', hintPt: 'Todos os 4 Vingadores (2012-2019)', ids: [24428, 299536, 99861, 299534] },
  { name: 'Sharp Canine', emoji: '🦷', hint: 'Twilight Saga (5 films)', hintPt: 'Saga Crepúsculo (5 filmes)', ids: [122, 121, 240, 50619, 50620] },
  { name: 'Primal Essence', emoji: '🦍', hint: 'Planet of the Apes reboot (4 films)', hintPt: 'Planeta dos Macacos reboot (4 filmes)', ids: [61791, 119450, 281338, 653346] },
];

type Tier = { name: string; emoji: string; min: number; hint: string; hintPt: string };

function getNextTierTag(count: number, tiers: Tier[], isPt: boolean): LockedTag | null {
  const next = tiers.find(t => count < t.min);
  if (!next) return null;
  return { name: next.name, emoji: next.emoji, hint: next.hint, hintPt: next.hintPt };
}

function getLockedThemeTags(userMovieIds: Set<number>): LockedTag[] {
  return THEME_TAGS
    .filter(tag => !tag.ids.every(id => userMovieIds.has(id)))
    .map(tag => ({ name: tag.name, emoji: tag.emoji, hint: tag.hint, hintPt: tag.hintPt }));
}

function getMidnightCountdown(): number {
  const midnight = new Date();
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  midnight.setUTCHours(0, 0, 0, 0);
  return Math.max(0, midnight.getTime() - Date.now());
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

interface Props {
  userId: string;
  username: string;
}

const HomeUserPanels: React.FC<Props> = ({ userId, username }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [libraryCount, setLibraryCount] = useState<number>(0);
  const [nextTag, setNextTag] = useState<LockedTag | null>(null);
  const [dailyMovie, setDailyMovie] = useState<Movie | null>(null);
  const [loadingMovie, setLoadingMovie] = useState(true);
  const [countdown, setCountdown] = useState(getMidnightCountdown());
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const tagPickedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getMidnightCountdown()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchUserStats = useCallback(async () => {
    try {
      const [profileRes, moviesRes, followsRes, profileFull] = await Promise.all([
        supabase.from('public_profiles').select('avatar_url').eq('id', userId).maybeSingle(),
        supabase.from('user_movies').select('movie_id').eq('user_id', userId),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('profiles').select('oracle_predictions_count, oracle_recommendations_count').eq('id', userId).maybeSingle(),
      ]);

      setAvatarUrl(profileRes.data?.avatar_url ?? null);

      const movieIds: number[] = (moviesRes.data ?? []).map((m: { movie_id: number }) => m.movie_id);
      const movieCount = movieIds.length;
      setLibraryCount(movieCount);

      if (!tagPickedRef.current) {
        const predCount = profileFull.data?.oracle_predictions_count ?? 0;
        const recCount = profileFull.data?.oracle_recommendations_count ?? 0;
        const follCount = followsRes.count ?? 0;
        const userMovieSet = new Set(movieIds);

        const candidates: LockedTag[] = [
          getNextTierTag(movieCount, PROGRESSION_TIERS, isPt),
          getNextTierTag(follCount, COMMUNITY_TIERS, isPt),
          getNextTierTag(predCount, ORACLE_PRED_TIERS, isPt),
          getNextTierTag(recCount, ORACLE_REC_TIERS, isPt),
          ...getLockedThemeTags(userMovieSet),
        ].filter((tag): tag is LockedTag => tag !== null);

        if (candidates.length > 0) {
          setNextTag(candidates[Math.floor(Math.random() * candidates.length)]);
          tagPickedRef.current = true;
        }
      }
    } catch (err) {
      console.error('HomeUserPanels: stats fetch error', err);
    }
  }, [userId, isPt]);

  const fetchDailyRecommendation = useCallback(async () => {
    try {
      setLoadingMovie(true);
      const { data: movieId, error } = await supabase.rpc('get_or_create_daily_recommendation');
      if (error || !movieId) return;
      const details = await getMovieDetails(movieId);
      setDailyMovie(details);
    } catch (err) {
      console.error('HomeUserPanels: daily rec fetch error', err);
    } finally {
      setLoadingMovie(false);
    }
  }, []);

  useEffect(() => {
    fetchUserStats();
    fetchDailyRecommendation();
  }, [fetchUserStats, fetchDailyRecommendation]);

  const panelBase = 'relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden';
  const tagHint = nextTag ? (isPt ? nextTag.hintPt : nextTag.hint) : '';

  return (
    <>
      <div className="flex flex-col gap-5 mb-10 max-w-2xl mx-auto w-full">
        {/* Panel 1 — Welcome + Stats */}
        <motion.div
          className={panelBase}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/15 to-cyan-400/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-pink-500/10 to-blue-400/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 p-6">
            <Link to="/profile" className="flex items-center gap-4 group mb-5">
              <div className="relative flex-shrink-0">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/50 dark:border-gray-600/50 shadow-lg group-hover:border-blue-400/60 transition-all duration-300 group-hover:scale-105">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                      <span className="text-white font-bold text-xl select-none">
                        {username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 rounded-full border-2 border-white dark:border-gray-800" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide uppercase">{t('home.panels.welcomeBack')}</p>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 leading-tight">
                  {username}
                </h2>
              </div>
            </Link>

            <div className="h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-600/60 to-transparent mb-5" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 dark:bg-blue-500/15">
                  <Film className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('home.panels.yourLibrary')}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                    {libraryCount} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{libraryCount === 1 ? t('home.panels.film') : t('home.panels.films')}</span>
                  </p>
                </div>
              </div>
              <Link
                to="/library"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 dark:bg-blue-500/15 dark:hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 border border-blue-400/20"
              >
                <LibraryIcon className="w-3.5 h-3.5" />
                {t('home.panels.openLibrary')}
              </Link>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-600/60 to-transparent my-5" />

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15">
                <Lock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">{t('home.panels.nextTag')}</p>
                {nextTag ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base leading-none">{nextTag.emoji}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{nextTag.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100/60 dark:bg-gray-700/60 px-2 py-0.5 rounded-full shrink-0">
                      {tagHint}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">{t('home.panels.allTagsUnlocked')}</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Panel 2 — Daily Recommendation */}
        <motion.div
          className={panelBase}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-52 h-52 bg-gradient-to-br from-rose-500/10 to-pink-400/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-0 w-40 h-40 bg-gradient-to-tl from-orange-400/10 to-rose-500/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 bg-gradient-to-b from-rose-500 to-pink-500 rounded-full" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">{t('home.panels.dailyRecommendation')}</h3>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 dark:bg-rose-500/15 rounded-xl border border-rose-400/20">
                <Clock className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatCountdown(countdown)}
                </span>
              </div>
            </div>

            {loadingMovie ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-rose-500" />
              </div>
            ) : dailyMovie ? (
              <button
                onClick={() => setSelectedMovie(dailyMovie)}
                className="w-full text-left group mb-5"
              >
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-[88px] h-[132px] rounded-2xl overflow-hidden shadow-xl border border-white/30 dark:border-gray-700/30 group-hover:shadow-2xl group-hover:scale-[1.03] transition-all duration-300">
                    <OptimizedPoster
                      src={`https://image.tmdb.org/t/p/w300${dailyMovie.poster_path}`}
                      alt={dailyMovie.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <h4 className="text-base font-bold text-gray-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors duration-200 leading-snug mb-1.5 line-clamp-2">
                      {dailyMovie.title}
                    </h4>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100/60 dark:bg-gray-700/60 px-2 py-0.5 rounded-full font-medium">
                        {dailyMovie.release_date ? new Date(dailyMovie.release_date).getFullYear() : ''}
                      </span>
                      <div className="flex items-center gap-1 bg-amber-500/10 dark:bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-400/20">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                          {dailyMovie.vote_average?.toFixed(1) ?? '—'}
                        </span>
                      </div>
                    </div>
                    {dailyMovie.overview && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">
                        {dailyMovie.overview}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ) : (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500 mb-5">
                <Film className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t('home.panels.noRecommendationToday')}</p>
              </div>
            )}

            <div className="h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-600/60 to-transparent mb-4" />

            <Link
              to="/oracle/recommend"
              className="group flex items-center justify-center gap-2 w-full py-3 px-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white text-sm font-bold rounded-2xl shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>{t('home.panels.anotherRecommendation')}</span>
              <span className="group-hover:translate-x-0.5 transition-transform duration-200">→</span>
            </Link>
          </div>
        </motion.div>
      </div>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </>
  );
};

export default HomeUserPanels;
