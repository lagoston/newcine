import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { Movie, getTrending, getMovieDetails, getComingSoon, getBestOfYear, getFriendsBestMovies } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import MovieDetailsModal from '../components/MovieDetailsModal';
import AllMoviesModal from '../components/AllMoviesModal';
import OptimizedPoster from '../components/OptimizedPoster';
import FloatingFriendBubbles, { FriendBubbleData } from '../components/FloatingFriendBubbles';
import HomeUserPanels from '../components/HomeUserPanels';
import GlassLoader from '../components/GlassLoader';
import GuestLanding from '../components/GuestLanding';
import { VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

// ---------------------------------------------------------------------------
// Pré-carregamento dos detalhes (hover no pôster já adianta o modal)
// ---------------------------------------------------------------------------

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

const movieKey = (movie: Pick<Movie, 'id' | 'media_type'>) => `${movie.media_type || 'movie'}:${movie.id}`;

// "2026-10-12" vira 12/out no fuso do usuário (new Date("AAAA-MM-DD") seria
// meia-noite UTC e cairia no dia anterior no Brasil).
function parseLocalDate(value?: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------------------
// Atividade dos amigos em lote: uma consulta para TODOS os pôsteres da
// página, em vez de três consultas por pôster (antes eram ~240 requisições
// ao abrir a home).
// ---------------------------------------------------------------------------

function useFriendActivity(userId: string | undefined, movies: Movie[]) {
  const [activity, setActivity] = useState<Record<string, FriendBubbleData[]>>({});

  const idsKey = useMemo(
    () => Array.from(new Set(movies.map((movie) => movie.id))).sort((a, b) => a - b).join(','),
    [movies]
  );

  useEffect(() => {
    if (!userId || !idsKey) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: friendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

        const friendIds = (friendships ?? []).map((f: { requester_id: string; addressee_id: string }) =>
          f.requester_id === userId ? f.addressee_id : f.requester_id
        );
        if (friendIds.length === 0) {
          if (!cancelled) setActivity({});
          return;
        }

        const ids = idsKey.split(',').map(Number);
        const { data: entries } = await supabase
          .from('user_movies')
          .select('user_id, movie_id, media_type, rating')
          .in('movie_id', ids)
          .in('user_id', friendIds);

        if (!entries || entries.length === 0) {
          if (!cancelled) setActivity({});
          return;
        }

        const userIds = Array.from(new Set(entries.map((e: { user_id: string }) => e.user_id)));
        const { data: profiles } = await supabase
          .from('public_profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);

        const byId = new Map((profiles ?? []).map((p: { id: string; username: string; avatar_url: string | null }) => [p.id, p]));
        const grouped: Record<string, FriendBubbleData[]> = {};

        (entries as { user_id: string; movie_id: number; media_type: string | null; rating: number | null }[]).forEach((entry) => {
          const profile = byId.get(entry.user_id);
          if (!profile) return;
          const key = `${entry.media_type || 'movie'}:${entry.movie_id}`;
          (grouped[key] ||= []).push({
            user_id: entry.user_id,
            username: profile.username,
            avatar_url: profile.avatar_url,
            rating: entry.rating,
            is_watchlist_only: entry.rating === null,
          });
        });

        // Quem avaliou vem antes de quem só guardou na watchlist; notas maiores primeiro.
        Object.values(grouped).forEach((list) =>
          list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
        );

        if (!cancelled) setActivity(grouped);
      } catch (error) {
        console.error('Home: friend activity error', error);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, idsKey]);

  return activity;
}

// ---------------------------------------------------------------------------
// Prateleira horizontal
// ---------------------------------------------------------------------------

type ShelfMeta = 'rank' | 'release' | 'score' | 'year';

interface ShelfProps {
  title: string;
  movies: Movie[];
  meta: ShelfMeta;
  friendActivity: Record<string, FriendBubbleData[]>;
  onMovieClick: (movie: Movie) => void;
  onViewAll: () => void;
  emptyState?: React.ReactNode;
}

const Shelf: React.FC<ShelfProps> = ({ title, movies, meta, friendActivity, onMovieClick, onViewAll, emptyState }) => {
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);

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

  if (movies.length === 0 && !emptyState) return null;

  const metaLine = (movie: Movie) => {
    if (meta === 'release') {
      const date = parseLocalDate(movie.release_date);
      return date ? date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) : null;
    }
    if (meta === 'score' && movie.vote_average) {
      return (
        <span className="inline-flex items-center gap-1">
          <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
          {movie.vote_average.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        </span>
      );
    }
    return movie.release_date?.slice(0, 4) ?? null;
  };

  return (
    <section className="border-t border-white/[0.07] py-12 sm:py-14">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 flex items-end justify-between gap-4">
        <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">{title}</h2>
        {movies.length > 0 && (
          <button
            onClick={onViewAll}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium border border-white/15 hover:border-white/35 hover:bg-white/5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
            style={{ color: PAPER }}
          >
            {t('common.view_all')}
          </button>
        )}
      </div>

      {movies.length === 0 ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-6">{emptyState}</div>
      ) : (
        <div
          ref={scrollRef}
          className="mt-3 pt-3 overflow-x-auto cursor-grab select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {/* A faixa rola de ponta a ponta da tela; o recuo lateral acompanha
              a margem do conteúdo, então dá pra ver que tem mais. O pt-3 do
              container dá espaço pro pôster subir no hover/toque sem ser
              cortado (overflow-x:auto também recorta na vertical). */}
          <ol className="flex gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pb-2">
            {movies.map((movie, index) => (
              <li key={movieKey(movie)} className="shrink-0 w-[124px] sm:w-[148px]">
                <button
                  onClick={() => { if (dragDistanceRef.current > 5) return; onMovieClick(movie); }}
                  onMouseEnter={() => prefetchMovie(movie.id, movie.media_type || 'movie')}
                  className="group block w-full text-left rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
                >
                  <div
                    className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1"
                    style={{ background: VELVET }}
                  >
                    <OptimizedPoster
                      src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                      alt={movie.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {meta === 'rank' && (
                      <span
                        style={{ ...PIXEL, background: 'rgba(18,13,34,0.82)', color: PAPER }}
                        className="absolute bottom-2 left-2 min-w-[1.9rem] text-center px-1.5 py-0.5 rounded-md text-sm ring-1 ring-white/15"
                      >
                        {index + 1}
                      </span>
                    )}
                    <FloatingFriendBubbles
                      movieId={movie.id}
                      mediaType={movie.media_type || 'movie'}
                      friends={friendActivity[movieKey(movie)] ?? []}
                    />
                  </div>
                  <p className="mt-2.5 text-sm font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>
                    {movie.title}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: MIST }}>{metaLine(movie)}</p>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

interface ShelfData {
  trending: Movie[];
  comingSoon: Movie[];
  bestOfYear: Movie[];
  friendsBest: Movie[];
}

const EMPTY_SHELVES: ShelfData = { trending: [], comingSoon: [], bestOfYear: [], friendsBest: [] };

const Home = () => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = session?.user?.id;

  const [shelves, setShelves] = useState<ShelfData>(EMPTY_SHELVES);
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [panelsReady, setPanelsReady] = useState(false);
  const [readyTimeout, setReadyTimeout] = useState(false);
  const [guestTrendingMovies, setGuestTrendingMovies] = useState<Movie[]>([]);
  const [guestLoadingTrending, setGuestLoadingTrending] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [username, setUsername] = useState('');
  const [allMoviesModal, setAllMoviesModal] = useState<{ isOpen: boolean; title: string; movies: Movie[] }>({ isOpen: false, title: '', movies: [] });

  // Rede de segurança: se o topo demorar demais, a página abre mesmo assim
  // (cada bloco tem o próprio esqueleto de carregamento).
  useEffect(() => {
    if (!userId) return;
    const id = setTimeout(() => setReadyTimeout(true), 6000);
    return () => clearTimeout(id);
  }, [userId]);

  const fetchGuestTrending = async () => {
    try {
      setGuestLoadingTrending(true);
      const trending = await getTrending();
      setGuestTrendingMovies(trending);
      trending.slice(0, 5).forEach((m) => prefetchMovie(m.id, 'movie'));
    } catch (err) {
      console.error('Error fetching guest trending:', err);
    } finally {
      setGuestLoadingTrending(false);
    }
  };

  const fetchUsername = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('username')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      setUsername(data?.username || '');
    } catch (error) {
      console.error('Error fetching username:', error);
    }
  };

  const fetchShelves = async (id: string) => {
    setShelvesLoading(true);
    const [trending, comingSoon, bestOfYear, friendsBest] = await Promise.allSettled([
      getTrending(),
      getComingSoon(),
      getBestOfYear(),
      getFriendsBestMovies(id),
    ]);
    const value = (result: PromiseSettledResult<Movie[]>) => (result.status === 'fulfilled' ? result.value : []);
    setShelves({
      trending: value(trending),
      comingSoon: value(comingSoon),
      bestOfYear: value(bestOfYear),
      friendsBest: value(friendsBest),
    });
    setShelvesLoading(false);
  };

  useEffect(() => {
    if (userId) {
      fetchUsername(userId);
      fetchShelves(userId);
    } else {
      fetchGuestTrending();
    }
  }, [userId]);

  const allShelfMovies = useMemo(
    () => [...shelves.trending, ...shelves.comingSoon, ...shelves.bestOfYear, ...shelves.friendsBest],
    [shelves]
  );
  const friendActivity = useFriendActivity(userId, allShelfMovies);

  const handleMovieClick = useCallback(async (movie: Movie) => {
    setSelectedMovie(movie);
    try {
      const details = await getOrFetchDetails(movie.id, movie.media_type || 'movie');
      setSelectedMovie(details);
    } catch (error) {
      console.error('Error fetching movie details:', error);
    }
  }, []);

  const handlePanelsReady = useCallback(() => setPanelsReady(true), []);
  const handleAddToLibrary = () => {};

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

  const pageReady = !shelvesLoading && (panelsReady || readyTimeout);
  const openAll = (title: string, movies: Movie[]) => setAllMoviesModal({ isOpen: true, title, movies });

  return (
    <>
      {!pageReady && <GlassLoader fullPage size="lg" label={t('common.loading')} />}

      {/* O conteúdo já monta escondido pra buscar tudo em paralelo com o
          carregador; aparece inteiro de uma vez quando o topo está pronto. */}
      <div className={pageReady ? 'relative min-h-[calc(100vh-3.5rem)] overflow-x-hidden pb-6' : 'hidden'}>
        {userId && (
          <HomeUserPanels
            userId={userId}
            username={username}
            visible={pageReady}
            onReady={handlePanelsReady}
            onMovieClick={handleMovieClick}
          />
        )}

        <Shelf
          title={t('home.popularNow')}
          movies={shelves.trending}
          meta="rank"
          friendActivity={friendActivity}
          onMovieClick={handleMovieClick}
          onViewAll={() => openAll(t('home.popularNow'), shelves.trending)}
        />
        <Shelf
          title={t('home.comingSoon')}
          movies={shelves.comingSoon}
          meta="release"
          friendActivity={friendActivity}
          onMovieClick={handleMovieClick}
          onViewAll={() => openAll(t('home.comingSoon'), shelves.comingSoon)}
        />
        <Shelf
          title={t('home.bestOfYear')}
          movies={shelves.bestOfYear}
          meta="score"
          friendActivity={friendActivity}
          onMovieClick={handleMovieClick}
          onViewAll={() => openAll(t('home.bestOfYear'), shelves.bestOfYear)}
        />
        <Shelf
          title={t('home.friendsBest')}
          movies={shelves.friendsBest}
          meta="year"
          friendActivity={friendActivity}
          onMovieClick={handleMovieClick}
          onViewAll={() => openAll(t('home.friendsBest'), shelves.friendsBest)}
          emptyState={
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6 rounded-2xl ring-1 ring-white/10 p-6" style={{ background: VELVET }}>
              <span className="w-12 h-12 shrink-0 rounded-xl grid place-items-center ring-1 ring-violet-300/30 text-violet-200" style={{ background: 'rgba(255,255,255,0.03)' }} aria-hidden>
                <Users className="w-6 h-6" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold" style={{ color: PAPER }}>{t('profile.noFriendsActivityTitle')}</p>
                <p className="mt-1 text-sm leading-relaxed max-w-lg" style={{ color: MIST }}>{t('profile.noFriendsActivityDescription')}</p>
              </div>
              <Link
                to="/community"
                className="shrink-0 inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
              >
                {t('home.panels.openCommunity')}
              </Link>
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
        rating={null}
        onAddToLibrary={handleAddToLibrary}
      />
    </>
  );
};

export default Home;