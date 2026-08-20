import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getEssenceLabel, getSubcategoryName } from '../lib/mood-genres';
import { Link, useNavigate } from 'react-router-dom';
import { Library as LibraryIcon, Lock, Star, Film, Clock, Sparkles, RefreshCw, X, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { getMovieDetails, Movie } from '../lib/tmdb';
import OptimizedPoster from './OptimizedPoster';
import MovieDetailsModal from './MovieDetailsModal';
import ArchetypeSymbol from './ArchetypeSymbol';
import PentagonGraph from './PentagonGraph';

interface LockedTag {
  name: string;
  emoji: string;
  hint: string;
  hintPt: string;
}

interface UserPersonality {
  subcategoria_id: string | null;
  personalidade_completa: string | null;
  arquetipo_primario: string | null;
  arquetipo_secundario: string | null;
}

interface ArchetypeInfo {
  archetype_name: string;
  subcategory_name: string;
  description: string;
  archetype_description: string;
  subcategory_description: string;
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
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(3, 0, 0, 0);
  if (now >= target) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return Math.max(0, target.getTime() - now.getTime());
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function getArchetypeColor(personalidade: string | null): string {
  if (!personalidade) return '#3b82f6';
  const third = personalidade.charAt(2);
  const map: Record<string, string> = {
    'A': '#fbbf24',
    'B': '#64748b',
    'K': '#ef4444',
    'X': '#3b82f6',
    'D': '#6b7280',
    'L': '#10b981',
  };
  return map[third] || '#3b82f6';
}

type OracleId = 'bogart' | 'fincher' | 'cypher';

interface DailyRec {
  oracle: OracleId;
  movie: Movie;
}

// Mesmas cores usadas no modal "Conheça os Oráculos" (OracleRecommend.tsx) —
// identidade visual consistente de cada oráculo em todo o site.
const ORACLE_SEAL: Record<OracleId, { emoji: string; bg: string; ring: string }> = {
  bogart: { emoji: '🐸', bg: 'bg-emerald-500', ring: 'ring-emerald-300' },
  fincher: { emoji: '🦊', bg: 'bg-red-500', ring: 'ring-red-300' },
  cypher: { emoji: '🐍', bg: 'bg-yellow-500', ring: 'ring-yellow-300' }
};

interface Props {
  userId: string;
  username: string;
}

const HomeUserPanels: React.FC<Props> = ({ userId, username }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isPt = i18n.language.startsWith('pt');
  const { session, isPremium } = useAuth();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [libraryCount, setLibraryCount] = useState<number>(0);
  const [nextTag, setNextTag] = useState<LockedTag | null>(null);
  const [dailyRecs, setDailyRecs] = useState<DailyRec[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselAutoPaused, setCarouselAutoPaused] = useState(false);
  const [loadingMovie, setLoadingMovie] = useState(true);
  const [countdown, setCountdown] = useState(getMidnightCountdown());
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const tagPickedRef = useRef(false);

  const [personality, setPersonality] = useState<UserPersonality | null>(null);
  const [archetypeInfo, setArchetypeInfo] = useState<ArchetypeInfo | null>(null);
  const [personalityLoading, setPersonalityLoading] = useState(true);
  const [showRevelationModal, setShowRevelationModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [spectrumPoints, setSpectrumPoints] = useState({ e: 0, i: 0, c: 0, s: 0, r: 0 });
  const [showRetakeQuizModal, setShowRetakeQuizModal] = useState(false);
  const [showPremiumRequiredModal, setShowPremiumRequiredModal] = useState(false);
  const [showOracleInfoModal, setShowOracleInfoModal] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getMidnightCountdown()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showRevelationModal || showInfoModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showRevelationModal, showInfoModal]);

  // Avança o carrossel sozinho a cada 6s, entre os 3 oráculos.
  useEffect(() => {
    if (dailyRecs.length > 1 && !carouselAutoPaused) {
      const interval = setInterval(() => {
        setCarouselIndex((prev) => (prev + 1) % dailyRecs.length);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [dailyRecs.length, carouselAutoPaused]);

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

  const fetchPersonality = useCallback(async () => {
    try {
      setPersonalityLoading(true);
      const { data: profileData } = await supabase
        .from('profiles')
        .select('subcategoria_id, personalidade_completa, arquetipo_primario, arquetipo_secundario, pontos_e, pontos_i, pontos_c, pontos_s, pontos_r')
        .eq('id', userId)
        .maybeSingle();

      if (!profileData?.personalidade_completa) {
        setPersonality(profileData ?? { subcategoria_id: null, personalidade_completa: null, arquetipo_primario: null, arquetipo_secundario: null });
        return;
      }
      setPersonality(profileData);
      if (profileData) {
        setSpectrumPoints({
          e: Number(profileData.pontos_e) || 0,
          i: Number(profileData.pontos_i) || 0,
          c: Number(profileData.pontos_c) || 0,
          s: Number(profileData.pontos_s) || 0,
          r: Number(profileData.pontos_r) || 0,
        });
      }

      const { data: archetypeData } = await supabase
        .rpc('get_user_complete_personality', { p_user_id: userId, p_language: i18n.language.startsWith('pt') ? 'pt' : 'en' })
        .maybeSingle();
      setArchetypeInfo(archetypeData ?? null);
    } catch (err) {
      console.error('HomeUserPanels: personality fetch error', err);
    } finally {
      setPersonalityLoading(false);
    }
  }, [userId, i18n.language]);

  // Busca as 3 recomendações do dia (uma por oráculo: Bogart, Fincher, Cypher),
  // cacheadas globalmente por dia via get_or_create_daily_oracle_recommendations.
  const fetchDailyRecommendation = useCallback(async () => {
    try {
      setLoadingMovie(true);
      const { data, error } = await supabase.rpc('get_or_create_daily_oracle_recommendations');
      if (error || !data || data.length === 0) return;

      const results = await Promise.all(
        data.map(async (row: any) => {
          try {
            const details = await getMovieDetails(row.out_movie_id, 'movie');
            return { oracle: row.out_card_type as OracleId, movie: details };
          } catch (err) {
            console.warn('Failed to load daily rec movie', row.out_movie_id, err);
            return null;
          }
        })
      );

      setDailyRecs(results.filter((r): r is DailyRec => r !== null));
      setCarouselIndex(0);
    } catch (err) {
      console.error('HomeUserPanels: daily rec fetch error', err);
    } finally {
      setLoadingMovie(false);
    }
  }, []);

  useEffect(() => {
    fetchUserStats();
    fetchPersonality();
    fetchDailyRecommendation();
  }, [fetchUserStats, fetchPersonality, fetchDailyRecommendation]);

  const panelBase = 'relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden';
  const tagHint = nextTag ? (isPt ? nextTag.hintPt : nextTag.hint) : '';
  const archetypeColor = getArchetypeColor(personality?.personalidade_completa ?? null);
  const archetypeId = personality?.personalidade_completa?.slice(0, 2);
  const subcategoryId = personality?.personalidade_completa?.slice(2, 3);

  const hasEssence = !personalityLoading && personality?.personalidade_completa && archetypeInfo;
  const currentRec = dailyRecs[carouselIndex];
  const dragOccurred = React.useRef(false);

  const handleCarouselDragEnd = (_e: any, info: { offset: { x: number } }) => {
    const threshold = 50;
    if (Math.abs(info.offset.x) > threshold && dailyRecs.length > 1) {
      setCarouselAutoPaused(true);
      setCarouselIndex((prev) =>
        info.offset.x < 0 ? (prev + 1) % dailyRecs.length : (prev - 1 + dailyRecs.length) % dailyRecs.length
      );
    }
    setTimeout(() => { dragOccurred.current = false; }, 50);
  };

  return (
    <>
      <div className="flex flex-col md:flex-row gap-5 mb-10 max-w-5xl mx-auto w-full md:items-stretch">
        {/* Panel 1 — Welcome + Stats + Essence */}
        <motion.div
          className={`${panelBase} md:flex-1`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/15 to-cyan-400/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-pink-500/10 to-blue-400/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 p-6">
            {/* Avatar + Welcome */}
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

            {/* Library count */}
            <div className="flex items-center justify-between mb-5">
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

            <div className="h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-600/60 to-transparent mb-5" />

            {/* Next Tag */}
            <div className="flex items-center gap-3 mb-5">
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

            <div className="h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-600/60 to-transparent mb-5" />

            {/* Cinematic Essence */}
            {!personalityLoading && (
              hasEssence ? (
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <ArchetypeSymbol
                      archetypeId={archetypeId || ''}
                      subcategoryId={subcategoryId || null}
                      size={48}
                      animated={false}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium mb-0.5" style={{ color: archetypeColor }}>
                      {t('oracle.cinematicEssenceLabel')}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold" style={{ color: archetypeColor }}>
                        {personality!.personalidade_completa}
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-semibold">
                        {archetypeInfo!.archetype_name} {archetypeInfo!.subcategory_name}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5 leading-relaxed">
                      {archetypeInfo!.description}
                    </p>
                  </div>
                  <div className="flex flex-row gap-2 flex-shrink-0">
                    <Link
                      to="/oracle"
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-500/10 hover:bg-violet-500/20 dark:bg-violet-500/15 dark:hover:bg-violet-500/25 text-violet-600 dark:text-violet-400 text-xs font-semibold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 border border-violet-400/20"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {i18n.language.startsWith('pt') ? 'Abrir' : 'Open'}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                      {t('oracle.cinematicEssenceLabel')}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">
                      {t('oracle.subcategoryExplain')}
                    </p>
                  </div>
                  <motion.button
                    onClick={() => navigate('/oracle')}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-shrink-0 px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-all duration-200 shadow-md shadow-violet-500/20 hover:shadow-violet-500/40 whitespace-nowrap border border-violet-500/30"
                  >
                    {t('oracle.discoverYourEssence')}
                  </motion.button>
                </div>
              )
            )}
          </div>
        </motion.div>

        {/* Panel 2 — Daily Recommendation (carrossel dos 3 oráculos) */}
        <motion.div
          className={`${panelBase} md:flex-1`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-52 h-52 bg-gradient-to-br from-rose-500/10 to-pink-400/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-0 w-40 h-40 bg-gradient-to-tl from-orange-400/10 to-rose-500/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 bg-gradient-to-b from-rose-500 to-pink-500 rounded-full" />
                <div className="flex items-center gap-1">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{t('home.panels.dailyRecommendation')}</h3>
                  <button onClick={() => setShowOracleInfoModal(true)} className="text-pink-500 hover:text-pink-400 transition-colors">
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 dark:bg-rose-500/15 rounded-xl border border-rose-400/20">
                <Clock className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatCountdown(countdown)}
                </span>
              </div>
            </div>

            <div className="flex-1">
            {loadingMovie ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-rose-500" />
              </div>
            ) : currentRec ? (
              <AnimatePresence mode="wait">
                <motion.button
                  key={currentRec.oracle}
                  onClick={() => { if (!dragOccurred.current) setSelectedMovie(currentRec.movie); }}
                  className="w-full text-left group mb-4 cursor-grab active:cursor-grabbing"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDrag={() => { dragOccurred.current = true; }}
                  onDragEnd={handleCarouselDragEnd}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="flex gap-4 items-start">
                    <div className="flex-shrink-0 relative w-[88px] h-[132px] rounded-2xl overflow-hidden shadow-xl border border-white/30 dark:border-gray-700/30 group-hover:shadow-2xl group-hover:scale-[1.03] transition-all duration-300">
                      <OptimizedPoster
                        src={`https://image.tmdb.org/t/p/w300${currentRec.movie.poster_path}`}
                        alt={currentRec.movie.title}
                        className="w-full h-full object-cover"
                      />
                      <div className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full ${ORACLE_SEAL[currentRec.oracle].bg} ring-2 ${ORACLE_SEAL[currentRec.oracle].ring} shadow-lg flex items-center justify-center text-xs`}>
                        {ORACLE_SEAL[currentRec.oracle].emoji}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <h4 className="text-base font-bold text-gray-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors duration-200 leading-snug mb-1.5 line-clamp-2">
                        {currentRec.movie.title}
                      </h4>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100/60 dark:bg-gray-700/60 px-2 py-0.5 rounded-full font-medium">
                          {currentRec.movie.release_date ? new Date(currentRec.movie.release_date).getFullYear() : ''}
                        </span>
                        <div className="flex items-center gap-1 bg-amber-500/10 dark:bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-400/20">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                            {currentRec.movie.vote_average?.toFixed(1) ?? '—'}
                          </span>
                        </div>
                      </div>
                      {currentRec.movie.overview && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">
                          {currentRec.movie.overview}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.button>
              </AnimatePresence>
            ) : (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500 mb-5">
                <Film className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t('home.panels.noRecommendationToday')}</p>
              </div>
            )}

            {dailyRecs.length > 1 && (
              <div className="flex items-center justify-center mb-1" style={{ gap: '6px' }}>
                {dailyRecs.map((rec, idx) => (
                  <button
                    key={rec.oracle}
                    onClick={() => { setCarouselAutoPaused(true); setCarouselIndex(idx); }}
                    aria-label={rec.oracle}
                    className={`rounded-full transition-all block appearance-none ${
                      idx === carouselIndex ? ORACLE_SEAL[rec.oracle].bg : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    style={{
                      display: 'block',
                      boxSizing: 'border-box',
                      padding: 0,
                      margin: 0,
                      border: 'none',
                      outline: 'none',
                      minWidth: 0,
                      minHeight: 0,
                      height: '12px',
                      width: idx === carouselIndex ? '22px' : '12px'
                    }}
                  />
                ))}
              </div>
            )}
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-600/60 to-transparent mb-4 mt-auto" />

            <Link
              to="/oracle/duel"
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

      <AnimatePresence>
        {showRetakeQuizModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setShowRetakeQuizModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-md w-full rounded-2xl bg-gray-900/95 backdrop-blur-xl shadow-2xl border border-gray-700/60 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white mb-4 text-center">
                {t('oracle.retakeQuizTitle')}
              </h3>
              <p className="text-gray-300 text-center mb-6">
                {t('oracle.retakeQuizConfirm')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRetakeQuizModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={async () => {
                    setShowRetakeQuizModal(false);
                    setShowInfoModal(false);
                    await supabase
                      .from('profiles')
                      .update({ subcategoria_id: null })
                      .eq('id', session?.user?.id);
                    await fetchPersonality();
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl transition-all font-medium"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPremiumRequiredModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setShowPremiumRequiredModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-md w-full rounded-2xl bg-gray-900/95 backdrop-blur-xl shadow-2xl border border-gray-700/60 p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-4xl mb-3">🔒</div>
              <h3 className="text-xl font-bold text-white mb-2">
                {t('oracle.premiumFeatureTitle')}
              </h3>
              <p className="text-gray-300 text-sm mb-6">
                {t('oracle.premiumFeatureRetake')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPremiumRequiredModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all font-medium"
                >
                  {t('common.close')}
                </button>
                <button
                  onClick={() => { setShowPremiumRequiredModal(false); navigate('/premium'); }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl transition-all font-medium"
                >
                  {t('oracle.viewPremium')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showOracleInfoModal && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowOracleInfoModal(false)}
          >
            <motion.div
              className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowOracleInfoModal(false)}
                className="absolute top-4 right-4 p-2.5 bg-gray-200/60 dark:bg-gray-700/60 hover:bg-gray-300/80 dark:hover:bg-gray-600/80 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500 mb-6 text-center pr-10">
                {t('oracle.cards.infoTitle')}
              </h2>

              <div className="space-y-4">
                <div className="rounded-xl p-5 border border-emerald-300/50 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 dark:bg-emerald-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🐸
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                        {t('oracle.cards.bogart')} - {t('oracle.cards.bogartSubtitle')}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.bogartDesc')}
                      </p>
                      <p className="text-emerald-600 dark:text-emerald-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.bogartRec')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-5 border border-red-300/50 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 dark:bg-red-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🦊
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
                        {t('oracle.cards.fincher')} - {t('oracle.cards.fincherSubtitle')}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.fincherDesc')}
                      </p>
                      <p className="text-red-600 dark:text-red-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.fincherRec')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-5 border border-yellow-300/50 dark:border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-yellow-500/20 dark:bg-yellow-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🐍
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-yellow-600 dark:text-yellow-400 mb-2">
                        {t('oracle.cards.cypher')} - {t('oracle.cards.cypherSubtitle')}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.cypherDesc')}
                      </p>
                      <p className="text-yellow-600 dark:text-yellow-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.cypherRec')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default HomeUserPanels;