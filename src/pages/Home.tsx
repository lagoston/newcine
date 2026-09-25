import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Movie, getTrending, getMovieDetails, getComingSoon, getBestOfYear, getFriendsBestMovies } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import MovieDetailsModal from '../components/MovieDetailsModal';
import AllMoviesModal from '../components/AllMoviesModal';
import OptimizedPoster from '../components/OptimizedPoster';
import FloatingFriendBubbles from '../components/FloatingFriendBubbles';
import HomeUserPanels from '../components/HomeUserPanels';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import GlassLoader from '../components/GlassLoader';
import GuestLanding from '../components/GuestLanding';

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

interface MovieCarouselProps {
 title: string | JSX.Element;
 movies: Movie[];
 loading: boolean;
 onViewAll: () => void;
 onMovieClick: (movie: Movie) => void;
 viewAllLabel: string;
 // Tema opcional do "vidro" por trás do carrossel — extensão do Chroma
 // Box (que já colore as rating boxes da Biblioteca) pras seções da
 // Home. Sem tema, mantém o azul/ciano padrão de sempre.
 theme?: 'gold' | 'purple';
 // Conteúdo alternativo pra quando a lista vem vazia (não carregando) —
 // ex: "Melhores dos Amigos" sem seguir ninguém ainda. Sem isso, o
 // carrossel mostra a área vazia normalmente.
 emptyState?: React.ReactNode;
 // Mostra as bolhas flutuantes de amigos (versão fechada, sem balão de
 // diálogo) em cada pôster — só usado no "Popular Agora", não nos
 // outros carrosséis que reaproveitam esse mesmo componente genérico.
 showFriendBubbles?: boolean;
}

const getCarouselThemeClasses = (theme?: 'gold' | 'purple') => {
 if (theme === 'gold') {
 return {
 panel: 'bg-amber-500/5 backdrop-blur-2xl border border-amber-400/20 shadow-2xl shadow-amber-900/10',
 glowTopRight: 'bg-gradient-to-br from-amber-500/10 to-yellow-400/5',
 glowBottomLeft: 'bg-gradient-to-tr from-yellow-500/8 to-amber-400/5',
 bar: 'bg-gradient-to-b from-amber-400 via-yellow-400 to-amber-500',
 titleText: 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400',
 button: 'bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-600 hover:shadow-amber-500/25',
 };
 }
 if (theme === 'purple') {
 return {
 panel: 'bg-purple-500/5 backdrop-blur-2xl border border-purple-400/20 shadow-2xl shadow-purple-900/10',
 glowTopRight: 'bg-gradient-to-br from-purple-500/10 to-fuchsia-400/5',
 glowBottomLeft: 'bg-gradient-to-tr from-fuchsia-500/8 to-purple-400/5',
 bar: 'bg-gradient-to-b from-purple-400 via-fuchsia-400 to-purple-500',
 titleText: 'bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-400',
 button: 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 hover:shadow-purple-500/25',
 };
 }
 return {
 panel: 'bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl',
 glowTopRight: 'bg-gradient-to-br from-blue-500/10 to-cyan-400/5',
 glowBottomLeft: 'bg-gradient-to-tr from-pink-500/8 to-blue-400/5',
 bar: 'bg-gradient-to-b from-blue-400 via-cyan-400 to-blue-500',
 titleText: 'bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400',
 button: 'bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:shadow-blue-500/25',
 };
};

const MovieCarousel: React.FC<MovieCarouselProps> = ({ title, movies, loading, onViewAll, onMovieClick, viewAllLabel, theme, emptyState, showFriendBubbles }) => {
 const themeClasses = getCarouselThemeClasses(theme);
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
 <div className={`relative mb-10 p-6 sm:p-8 rounded-3xl overflow-hidden ${themeClasses.panel}`}>
 <div className="flex justify-center py-8">
 <GlassLoader size="md" />
 </div>
 </div>
 );
 }

 return (
 <motion.div
 className={`relative mb-10 p-6 sm:p-8 rounded-3xl overflow-hidden ${themeClasses.panel}`}
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.5 }}
 >
 <div className="absolute inset-0 pointer-events-none">
 <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl ${themeClasses.glowTopRight}`}></div>
 <div className={`absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl ${themeClasses.glowBottomLeft}`}></div>
 </div>
 <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
 backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
 backgroundSize: '24px 24px'
 }}></div>
 <div className="relative z-10 flex items-center justify-between mb-6 gap-4">
 <div className="flex items-center gap-3">
 <div className={`h-10 w-1 rounded-full ${themeClasses.bar}`}></div>
 <h2 className={`text-xl sm:text-2xl font-bold text-transparent bg-clip-text leading-relaxed ${themeClasses.titleText}`}>
 {title}
 </h2>
 </div>
 {!(emptyState && movies.length === 0) && (
 <button
 onClick={onViewAll}
 className={`flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:shadow-lg rounded-xl transition-all duration-300 whitespace-nowrap flex-shrink-0 overflow-hidden relative group ${themeClasses.button}`}
 >
 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
 <span className="relative z-10 hidden sm:inline">{viewAllLabel}</span>
 <span className="relative z-10 sm:hidden">Ver</span>
 <ArrowRight className="relative z-10 w-3.5 h-3.5 sm:w-4 sm:h-4" />
 </button>
 )}
 </div>
 {emptyState && movies.length === 0 ? (
 <div className="relative z-10">{emptyState}</div>
 ) : (
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
 {showFriendBubbles && (
 <FloatingFriendBubbles movieId={movie.id} mediaType={movie.media_type || 'movie'} />
 )}
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
 )}
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

 if (session?.user && loading.trending) {
 return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
 }

 if (!session) {
 return (
 <>
 <GuestLanding
 movies={guestTrendingMovies}
 loading={guestLoadingTrending}
 onMovieClick={handleMovieClick}
 onMovieHover={(movie) => prefetchMovie(movie.id, movie.media_type || 'movie')}
 onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('guestHome.trendingTitle'), movies: guestTrendingMovies })}
 />

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
 </>
 );
 }

 return (
 <div className="min-h-[calc(100vh-4rem)] py-8 px-4 relative overflow-hidden">

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
 showFriendBubbles
 />
 <MovieCarousel
 title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>🎬</span> {t('home.comingSoon')}</span>}
 movies={comingSoonMovies}
 loading={loading.comingSoon}
 onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('home.comingSoon'), movies: comingSoonMovies })}
 onMovieClick={handleMovieClick}
 viewAllLabel={t('common.view_all')}
 showFriendBubbles
 />
 <MovieCarousel
 title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>🏆</span> {t('home.bestOfYear')}</span>}
 movies={bestOfYearMovies}
 loading={loading.bestOfYear}
 onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('home.bestOfYear'), movies: bestOfYearMovies, theme: 'gold' })}
 onMovieClick={handleMovieClick}
 viewAllLabel={t('common.view_all')}
 theme="gold"
 showFriendBubbles
 />
 <MovieCarousel
 title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>👥</span> {t('home.friendsBest')}</span>}
 movies={friendsBestMovies}
 loading={loading.friendsBest}
 onViewAll={() => setAllMoviesModal({ isOpen: true, title: t('home.friendsBest'), movies: friendsBestMovies, theme: 'purple' })}
 onMovieClick={handleMovieClick}
 viewAllLabel={t('common.view_all')}
 theme="purple"
 showFriendBubbles
 emptyState={
 <div className="flex flex-col sm:flex-row items-center gap-5 py-6 px-2">
 <div className="relative flex-shrink-0">
 <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/15 to-purple-500/15 dark:from-violet-500/20 dark:to-purple-500/20 flex items-center justify-center rotate-3">
 <Users className="w-9 h-9 text-violet-500" />
 </div>
 <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white dark:bg-gray-800 border-2 border-violet-300/50 dark:border-violet-600/50 flex items-center justify-center shadow-sm">
 <span className="text-xs">👋</span>
 </div>
 </div>
 <div className="flex-1 text-center sm:text-left">
 <h3 className="text-base font-bold text-gray-800 dark:text-white mb-1">
 {t('profile.noFriendsActivityTitle')}
 </h3>
 <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
 {t('profile.noFriendsActivityDescription')}
 </p>
 </div>
 </div>
 }
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