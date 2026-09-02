import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star, Library as LibraryIcon, Eye, Users, ArrowRight, Sparkles, Lock, Clock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Movie, getTrending, getMovieDetails, getComingSoon, getBestOfYear, getFriendsBestMovies } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';
import MovieDetailsModal from '../components/MovieDetailsModal';
import AllMoviesModal from '../components/AllMoviesModal';
import OptimizedPoster from '../components/OptimizedPoster';
import HomeUserPanels from '../components/HomeUserPanels';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import GlassLoader from '../components/GlassLoader';

const detailsCache = new Map<string, Promise<Movie>>();

function prefetchMovie(id: number, mediaType: 'movie' | 'tv' = 'movie') {
  const key = `${mediaType}:${id}`;
  if (!detailsCache.has(key)) {
    detailsCache.set(key, getMovieDetails(id, mediaType));
  }
}

async function getOrFetchDetails(id: number, mediaType: 'movie' | 'tv' = 'movie'): Promise<Movie> {
  const key = `${mediaType}:${id}`;
  const pending = detailsCache.get(key);
  if (pending) return pending;
  const promise = getMovieDetails(id, mediaType);
  detailsCache.set(key, promise);
  return promise;
}

function getBrasiliaCountdown(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(3, 0, 0, 0);
  if (now >= target) target.setUTCDate(target.getUTCDate() + 1);
  return Math.max(0, target.getTime() - now.getTime());
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

interface GuestMovieCarouselProps {
  title: JSX.Element;
  movies: Movie[];
  loading: boolean;
  onMovieClick: (movie: Movie) => void;
  onViewAll: () => void;
  viewAllLabel: string;
}

const GuestMovieCarousel: React.FC<GuestMovieCarouselProps> = ({ title, movies, loading, onMovieClick, onViewAll, viewAllLabel }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);

  const handleHover = useCallback((movie: Movie) => {
    prefetchMovie(movie.id, movie.media_type || 'movie');
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollStartRef.current = scrollRef.current.scrollLeft;
    dragDistanceRef.current = 0;
    scrollRef.current.style.cursor = 'grabbing';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    dragDistanceRef.current = Math.abs(x - startXRef.current);
    scrollRef.current.scrollLeft = scrollStartRef.current - (x - startXRef.current) * 2;
  };
  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  if (loading) {
    return (
      <motion.div
        className="relative p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
      >
        <div className="flex justify-center py-12">
          <GlassLoader size="md" />
        </div>
      </motion.div>
    );
  }

  if (movies.length === 0) return null;

  return (
    <motion.div
      className="relative p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8 }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/10 to-cyan-400/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-pink-500/8 to-blue-400/5 rounded-full blur-3xl" />
      </div>
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }} />

      <div className="relative z-10 flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1 bg-gradient-to-b from-blue-400 via-cyan-400 to-blue-500 rounded-full" />
          <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 leading-relaxed">
            {title}
          </h2>
        </div>
        <button
          onClick={onViewAll}
          className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:shadow-lg hover:shadow-blue-500/25 rounded-xl transition-all duration-300 whitespace-nowrap flex-shrink-0 overflow-hidden relative group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <span className="relative z-10 hidden sm:inline">{viewAllLabel}</span>
          <span className="relative z-10 sm:hidden">Ver</span>
          <ArrowRight className="relative z-10 w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="relative z-10 overflow-x-auto py-4 pb-2 cursor-grab select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div className="flex gap-4">
          {movies.map((movie, index) => (
            <motion.div
              key={movie.id}
              className="relative rounded-2xl overflow-hidden cursor-pointer group flex-shrink-0 shadow-xl border border-white/10"
              style={{ width: '160px', height: '240px', willChange: 'transform' }}
              onClick={() => { if (dragDistanceRef.current > 5) return; onMovieClick(movie); }}
              onMouseEnter={() => handleHover(movie)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.3 }}
              whileHover={{ scale: 1.05, y: -8 }}
              whileTap={{ scale: 0.97 }}
            >
              <div
                className="absolute top-2 left-2 bg-blue-500/80 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg border border-blue-400/30"
                style={{ zIndex: 30, transform: 'translateZ(0)' }}
              >
                #{index + 1}
              </div>
              <OptimizedPoster
                src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                alt={movie.title}
                className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out"
              />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out flex flex-col justify-end backdrop-blur-[2px] pointer-events-none">
                <div className="p-3">
                  <h3 className="text-white font-bold mb-1.5 line-clamp-2 text-sm drop-shadow-lg">{movie.title}</h3>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center bg-blue-500/20 backdrop-blur-md px-2 py-1 rounded-lg border border-blue-400/30">
                      <Star className="w-3 h-3 fill-blue-400 text-blue-400" />
                      <span className="ml-1 text-blue-100 font-bold text-xs">{movie.vote_average.toFixed(1)}</span>
                    </div>
                    <span className="text-gray-200 text-xs font-semibold bg-white/10 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/10">
                      {movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

interface GuestDailyBoxProps {
  onSignUp: () => void;
  countdown: number;
}

const GuestDailyRecommendationBox: React.FC<GuestDailyBoxProps> = ({ onSignUp, countdown }) => {
  const { t } = useTranslation();
  const dummyPosters = [
    '/t/p/w185/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
    '/t/p/w185/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg',
    '/t/p/w185/saHP97rTPS5eLmrLQEcANmKrsFl.jpg',
    '/t/p/w185/q719jXXEzOoYaps6babgKnONONX.jpg',
    '/t/p/w185/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    '/t/p/w185/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
    '/t/p/w185/krKnsfvSJM1PL40tLicRhVQ6kuG.jpg',
    '/t/p/w185/hek3koDUyRQk7FIhPXsa6mT2Zc3.jpg',
    '/t/p/w185/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
  ];

  return (
    <div className="relative rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-cyan-500/12 to-blue-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-44 h-44 bg-gradient-to-tr from-blue-500/10 to-cyan-400/5 rounded-full blur-3xl" />
      </div>
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }} />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-1 bg-gradient-to-b from-cyan-400 via-blue-400 to-cyan-500 rounded-full" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 leading-relaxed flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                {t('home.guestDailyTitle')}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{t('home.guestDailySubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <span className="text-xs font-mono text-gray-300">{formatCountdown(countdown)}</span>
          </div>
        </div>

        <div className="relative">
          <div className="flex gap-3 overflow-hidden" style={{ maskImage: 'linear-gradient(to right, black 60%, transparent 100%)' }}>
            {dummyPosters.map((poster, i) => (
              <div
                key={i}
                className="relative flex-shrink-0 rounded-xl overflow-hidden border border-white/10 shadow-xl"
                style={{ width: '120px', height: '180px' }}
              >
                <img
                  src={`https://image.tmdb.org${poster}`}
                  alt=""
                  className="w-full h-full object-cover opacity-40 blur-[1px]"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-slate-800/60" />
              </div>
            ))}
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4">
            <div className="flex items-center gap-2.5 bg-black/40 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3 text-center max-w-sm">
              <Lock className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <p className="text-sm text-gray-200 leading-snug">
                {t('home.guestDailyLockText')}
              </p>
            </div>
            <motion.button
              onClick={onSignUp}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-600 text-white text-sm font-bold rounded-xl shadow-lg hover:shadow-cyan-500/30 transition-all duration-300 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <Sparkles className="relative z-10 w-4 h-4" />
              <span className="relative z-10">{t('home.guestDailySignUpBtn')}</span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MovieCarouselProps {
  title: string | JSX.Element;
  movies: Movie[];
  loading: boolean;
  onViewAll: () => void;
  onMovieClick: (movie: Movie) => void;
  viewAllLabel: string;
}

const MovieCarousel: React.FC<MovieCarouselProps> = ({ title, movies, loading, onViewAll, onMovieClick, viewAllLabel }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);

  const handleHover = useCallback((movie: Movie) => {
    prefetchMovie(movie.id, movie.media_type || 'movie');
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollStartRef.current = scrollRef.current.scrollLeft;
    dragDistanceRef.current = 0;
    scrollRef.current.style.cursor = 'grabbing';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    dragDistanceRef.current = Math.abs(x - startXRef.current);
    scrollRef.current.scrollLeft = scrollStartRef.current - (x - startXRef.current) * 2;
  };
  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  if (loading) {
    return (
      <div className="relative mb-10 p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl">
        <div className="flex justify-center py-8">
          <GlassLoader size="md" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="relative mb-10 p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/10 to-cyan-400/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-pink-500/8 to-blue-400/5 rounded-full blur-3xl"></div>
      </div>
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}></div>
      <div className="relative z-10 flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1 bg-gradient-to-b from-blue-400 via-cyan-400 to-blue-500 rounded-full"></div>
          <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 leading-relaxed">
            {title}
          </h2>
        </div>
        <button
          onClick={onViewAll}
          className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:shadow-lg hover:shadow-blue-500/25 rounded-xl transition-all duration-300 whitespace-nowrap flex-shrink-0 overflow-hidden relative group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
          <span className="relative z-10 hidden sm:inline">{viewAllLabel}</span>
          <span className="relative z-10 sm:hidden">Ver</span>
          <ArrowRight className="relative z-10 w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="relative z-10 overflow-x-auto py-4 pb-2 cursor-grab select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div className="flex gap-4">
          {movies.map((movie, index) => (
            <motion.div
              key={movie.id}
              className="relative rounded-2xl overflow-hidden cursor-pointer group flex-shrink-0 shadow-xl border border-white/10"
              style={{ width: '160px', height: '240px', willChange: 'transform' }}
              onClick={() => { if (dragDistanceRef.current > 5) return; onMovieClick(movie); }}
              onMouseEnter={() => handleHover(movie)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              whileHover={{ scale: 1.05, y: -8 }}
              whileTap={{ scale: 0.97 }}
            >
              <div
                className="absolute top-2 left-2 bg-blue-500/80 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg border border-blue-400/30"
                style={{ zIndex: 30, transform: 'translateZ(0)' }}
              >
                #{index + 1}
              </div>
              <OptimizedPoster
                src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                alt={movie.title}
                className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out"
              />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out flex flex-col justify-end backdrop-blur-[2px] pointer-events-none">
                <div className="p-3">
                  <h3 className="text-white font-bold mb-1.5 line-clamp-2 text-sm drop-shadow-lg">{movie.title}</h3>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center bg-blue-500/20 backdrop-blur-md px-2 py-1 rounded-lg border border-blue-400/30">
                      <Star className="w-3 h-3 fill-blue-400 text-blue-400" />
                      <span className="ml-1 text-blue-100 font-bold text-xs">{movie.vote_average.toFixed(1)}</span>
                    </div>
                    <span className="text-gray-200 text-xs font-semibold bg-white/10 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/10">
                      {movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

const Home = () => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [trendingMovies, setTrendingMovies] = React.useState<Movie[]>([]);
  const [comingSoonMovies, setComingSoonMovies] = React.useState<Movie[]>([]);
  const [bestOfYearMovies, setBestOfYearMovies] = React.useState<Movie[]>([]);
  const [friendsBestMovies, setFriendsBestMovies] = React.useState<Movie[]>([]);
  const [guestTrendingMovies, setGuestTrendingMovies] = React.useState<Movie[]>([]);
  const [userPersonalidade, setUserPersonalidade] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState({ trending: false, comingSoon: false, bestOfYear: false, friendsBest: false });
  const [guestLoadingTrending, setGuestLoadingTrending] = React.useState(false);
  const [selectedMovie, setSelectedMovie] = React.useState<Movie | null>(null);
  const [username, setUsername] = React.useState('');
  const [allMoviesModal, setAllMoviesModal] = React.useState<{ isOpen: boolean; title: string; movies: Movie[]; theme?: 'gold' | 'purple' }>({ isOpen: false, title: '', movies: [] });
  const [countdown, setCountdown] = useState(getBrasiliaCountdown());

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getBrasiliaCountdown()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchUsername();
      fetchAllMovies();
      fetchUserEssence();
    } else {
      fetchGuestTrending();
    }
  }, [session?.user]);

  const fetchGuestTrending = async () => {
    try {
      setGuestLoadingTrending(true);
      const trending = await getTrending();
      setGuestTrendingMovies(trending);
      trending.slice(0, 5).forEach(m => prefetchMovie(m.id, 'movie'));
    } catch (err) {
      console.error('Error fetching guest trending:', err);
    } finally {
      setGuestLoadingTrending(false);
    }
  };

  const fetchUsername = async () => {
    try {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('username')
        .eq('id', session?.user?.id)
        .maybeSingle();
      if (error) throw error;
      setUsername(data?.username || '');
    } catch (error) {
      console.error('Error fetching username:', error);
    }
  };

  const fetchAllMovies = async () => {
    try {
      setLoading({ trending: true, comingSoon: true, bestOfYear: true, friendsBest: true });
      const [trending, comingSoon, bestOfYear, friendsBest] = await Promise.all([
        getTrending(),
        getComingSoon(),
        getBestOfYear(),
        session?.user?.id ? getFriendsBestMovies(session.user.id) : Promise.resolve([]),
      ]);
      setTrendingMovies(trending);
      setComingSoonMovies(comingSoon);
      setBestOfYearMovies(bestOfYear);
      setFriendsBestMovies(friendsBest);
    } catch (error) {
      console.error('Error fetching movies:', error);
    } finally {
      setLoading({ trending: false, comingSoon: false, bestOfYear: false, friendsBest: false });
    }
  };

  const fetchUserEssence = async () => {
    if (!session?.user?.id) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('personalidade_completa')
        .eq('id', session.user.id)
        .maybeSingle();
      setUserPersonalidade(data?.personalidade_completa ?? null);
    } catch {
      // ignore
    }
  };

  const handleMovieClick = async (movie: Movie) => {
    setSelectedMovie(movie);
    try {
      const details = await getOrFetchDetails(movie.id, movie.media_type || 'movie');
      setSelectedMovie(details);
    } catch (error) {
      console.error('Error fetching movie details:', error);
    }
  };

  const handleAddToLibrary = () => {};

  if (!session) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950/90 to-slate-900">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-500/15 to-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-80 h-80 bg-gradient-to-br from-violet-500/12 to-purple-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute bottom-40 left-1/3 w-72 h-72 bg-gradient-to-br from-cyan-500/10 to-blue-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-20 right-1/4 w-64 h-64 bg-gradient-to-br from-purple-400/10 to-violet-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }}></div>
        </div>

        <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 sm:py-12">

          {/* Hero: welcome left + features right */}
          <div className="w-full max-w-6xl mb-8 mt-8 sm:mt-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

              {/* Left: Welcome box */}
              <motion.div
                className="relative rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-500/15 to-cyan-400/10 rounded-full blur-3xl" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-violet-500/10 to-blue-400/10 rounded-full blur-3xl" />
                </div>
                <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
                  backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                  backgroundSize: '20px 20px'
                }}></div>
                <div className="relative z-10 p-8 sm:p-10 flex flex-col items-center text-center h-full justify-center">
                  <motion.div
                    className="mb-6"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                  >
                    <motion.div
                      className="relative"
                      animate={{
                        filter: [
                          'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
                          'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 14px rgba(59, 130, 246, 0.5)) drop-shadow(0 0 28px rgba(139, 92, 246, 0.4))',
                          'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
                        ]
                      }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Logo size="large" className="w-24 h-24 sm:w-28 sm:h-28" />
                    </motion.div>
                  </motion.div>
                  <motion.div
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                  >
                    <h1 className="text-3xl sm:text-4xl font-bold mb-3">
                      <span className="text-white">{t('home.welcomeTo')} </span>
                      <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                        CineOracle
                      </span>
                    </h1>
                  </motion.div>
                  <motion.p
                    className="text-gray-300/80 text-sm sm:text-base leading-relaxed max-w-md mb-8"
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                  >
                    {t('home.welcomeDesc')}
                  </motion.p>
                  <motion.div
                    className="w-full"
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                  >
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                      <Link
                        to="/auth?signup=true"
                        className="group relative flex items-center justify-center gap-3 w-full px-8 py-4 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 text-white text-base font-bold rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30"
                      >
                        <span className="relative z-10">{t('home.signUpButton')}</span>
                        <Logo className="relative z-10 w-5 h-5 transition-transform duration-300 group-hover:rotate-12" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                      </Link>
                    </motion.div>
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-4"></div>
                    <p className="text-gray-400 text-sm">
                      {t('home.alreadyHaveAccount')}{' '}
                      <Link to="/auth" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                        {t('home.signInLink')}
                      </Link>
                    </p>
                  </motion.div>
                </div>
              </motion.div>

              {/* Right: Feature cards 2x2 */}
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
              >
                {[
                  { icon: <Star className="w-7 h-7" />, titleKey: 'home.homeClassification', descriptionKey: 'home.homeClassificationDesc', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', border: 'hover:border-amber-500/30', glow: 'from-amber-500/8 to-orange-500/5' },
                  { icon: <LibraryIcon className="w-7 h-7" />, titleKey: 'home.homeLibrary', descriptionKey: 'home.homeLibraryDesc', iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400', border: 'hover:border-blue-500/30', glow: 'from-blue-500/8 to-cyan-500/5' },
                  { icon: <Eye className="w-7 h-7" />, titleKey: 'home.homeOracle', descriptionKey: 'home.homeOracleDesc', iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', border: 'hover:border-violet-500/30', glow: 'from-violet-500/8 to-purple-500/5' },
                  { icon: <Users className="w-7 h-7" />, titleKey: 'home.homeCommunity', descriptionKey: 'home.homeCommunityDesc', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', border: 'hover:border-emerald-500/30', glow: 'from-emerald-500/8 to-green-500/5' }
                ].map((feature, index) => (
                  <motion.div
                    key={index}
                    className="relative group"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.25 + (index * 0.08), duration: 0.4 }}
                    whileHover={{ y: -4, scale: 1.02 }}
                  >
                    <div className={`relative rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 ${feature.border} p-5 h-full transition-all duration-300 overflow-hidden flex flex-col justify-center`}>
                      <div className={`absolute inset-0 bg-gradient-to-br ${feature.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                      <div className="relative z-10 flex flex-row sm:flex-col items-center sm:items-center gap-3 sm:text-center text-left">
                        <div className={`flex-shrink-0 p-3 rounded-xl ${feature.iconBg} ${feature.iconColor}`}>
                          {feature.icon}
                        </div>
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-white mb-1.5 leading-tight">{t(feature.titleKey)}</h3>
                          <p className="text-gray-400 text-xs leading-relaxed">{t(feature.descriptionKey)}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>

          <div className="w-full max-w-6xl mb-8">
            <GuestMovieCarousel
              title={<span className="flex items-center gap-2.5"><span className="text-2xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>🔥</span> {t('home.popularNow')}</span>}
              movies={guestTrendingMovies}
              loading={guestLoadingTrending}
              onMovieClick={handleMovieClick}
              onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('home.popularNow'), movies: guestTrendingMovies })}
              viewAllLabel={t('common.view_all')}
            />
          </div>

          <motion.div
            className="w-full max-w-6xl mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <GuestDailyRecommendationBox onSignUp={() => navigate('/auth?signup=true')} countdown={countdown} />
          </motion.div>
        </div>

        {selectedMovie && (
          <MovieDetailsModal
            movie={selectedMovie}
            isOpen={true}
            onClose={() => setSelectedMovie(null)}
            isOtherUserProfile={true}
            onAddToLibrary={() => navigate('/auth')}
          />
        )}

        <AllMoviesModal
          isOpen={allMoviesModal.isOpen}
          onClose={() => setAllMoviesModal({ isOpen: false, title: '', movies: [] })}
          title={allMoviesModal.title}
          movies={allMoviesModal.movies}
          rating={null}
          onAddToLibrary={() => navigate('/auth')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 transition-all duration-500 py-8 px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>
      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }}></div>
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '30px 30px'
      }}></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-40 bg-gradient-to-b from-blue-500/5 to-transparent dark:from-blue-400/5 blur-2xl"></div>

      <div className="max-w-7xl mx-auto relative">
        {session?.user && (
          <HomeUserPanels userId={session.user.id} username={username} />
        )}
        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>🔥</span> {t('home.popularNow')}</span>}
          movies={trendingMovies}
          loading={loading.trending}
          onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('home.popularNow'), movies: trendingMovies })}
          onMovieClick={handleMovieClick}
          viewAllLabel={t('common.view_all')}
        />
        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>🎬</span> {t('home.comingSoon')}</span>}
          movies={comingSoonMovies}
          loading={loading.comingSoon}
          onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('home.comingSoon'), movies: comingSoonMovies })}
          onMovieClick={handleMovieClick}
          viewAllLabel={t('common.view_all')}
        />
        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>🏆</span> {t('home.bestOfYear')}</span>}
          movies={bestOfYearMovies}
          loading={loading.bestOfYear}
          onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('home.bestOfYear'), movies: bestOfYearMovies, theme: 'gold' })}
          onMovieClick={handleMovieClick}
          viewAllLabel={t('common.view_all')}
        />
        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>👥</span> {t('home.friendsBest')}</span>}
          movies={friendsBestMovies}
          loading={loading.friendsBest}
          onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('home.friendsBest'), movies: friendsBestMovies, theme: 'purple' })}
          onMovieClick={handleMovieClick}
          viewAllLabel={t('common.view_all')}
        />
      </div>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          isOtherUserProfile={false}
          onAddToLibrary={handleAddToLibrary}
        />
      )}
      <AllMoviesModal
        isOpen={allMoviesModal.isOpen}
        onClose={() => setAllMoviesModal({ isOpen: false, title: '', movies: [] })}
        title={allMoviesModal.title}
        movies={allMoviesModal.movies}
        theme={allMoviesModal.theme}
        rating={null}
        onAddToLibrary={handleAddToLibrary}
      />
    </div>
  );
};

export default Home;