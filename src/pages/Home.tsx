import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { Movie, getTrending, getMovieDetails, getComingSoon, getBestOfYear } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import MovieDetailsModal from '../components/MovieDetailsModal';
import AllMoviesModal from '../components/AllMoviesModal';
import OptimizedPoster from '../components/OptimizedPoster';
import FloatingFriendBubbles, { FriendBubbleData } from '../components/FloatingFriendBubbles';
import HomeUserPanels from '../components/HomeUserPanels';
import GlassLoader from '../components/GlassLoader';
import GuestLanding from '../components/GuestLanding';
import { requestSeasonalRefresh } from '../contexts/SeasonalEventContext';
import { VELVET, PAPER, MIST, PIXEL, POSTER_TITLE, ORACLE_BY_ID } from '../lib/oracleTheme';
import { MOOD_BY_KEY } from '../lib/moods';
import { EMPTY_FOR_YOU, ForYouInfo, ForYouShelf, getForYouShelf } from '../lib/forYou';

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

// rank: posição no canto do pôster; release: data de estreia; score: nota
// do público; year: ano; forYou: posição + nota prevista e de qual oráculo e
// prateleira o título veio.
type ShelfMeta = 'rank' | 'release' | 'score' | 'year' | 'forYou';

interface ShelfProps {
  title: string;
  subtitle?: string;
  movies: Movie[];
  meta: ShelfMeta;
  friendActivity: Record<string, FriendBubbleData[]>;
  onMovieClick: (movie: Movie) => void;
  onViewAll: () => void;
  emptyState?: React.ReactNode;
  // meta 'forYou': nota prevista, oráculo e prateleira de cada título
  forYouInfo?: Record<string, ForYouInfo>;
}

const Shelf: React.FC<ShelfProps> = ({ title, subtitle, movies, meta, friendActivity, onMovieClick, onViewAll, emptyState, forYouInfo }) => {
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
    if (meta === 'forYou') {
      const info = forYouInfo?.[movieKey(movie)];
      const oracle = info ? ORACLE_BY_ID[info.oracle] : undefined;
      const mood = info ? MOOD_BY_KEY[info.moodKey] : undefined;
      if (!oracle || !mood) return movie.release_date?.slice(0, 4) ?? null;
      const moodLabel = t(mood.labelKey);
      return (
        <span className="flex items-center gap-1.5 min-w-0" title={`${oracle.name} · ${moodLabel}`}>
          <img src={oracle.avatar} alt="" className="w-4 h-4 shrink-0 rounded-full object-cover ring-1" style={{ ['--tw-ring-color' as string]: oracle.color } as React.CSSProperties} loading="lazy" />
          <span className="truncate" style={{ color: mood.color }}>{moodLabel}</span>
          <span className="sr-only">{`(${oracle.name})`}</span>
        </span>
      );
    }
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
    <section className="border-t border-white/[0.07] pt-6 pb-4 sm:pt-8 sm:pb-6">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm leading-snug" style={{ color: MIST }}>{subtitle}</p>}
        </div>
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
          className="mt-1 pt-3 overflow-x-auto cursor-grab select-none"
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
                    {(meta === 'rank' || meta === 'forYou') && (
                      <span
                        style={{ ...PIXEL, background: 'rgba(18,13,34,0.82)', color: PAPER }}
                        className="absolute bottom-2 left-2 min-w-[1.9rem] text-center px-1.5 py-0.5 rounded-md text-sm ring-1 ring-white/15"
                      >
                        {index + 1}
                      </span>
                    )}
                    {meta === 'forYou' && typeof forYouInfo?.[movieKey(movie)]?.predicted === 'number' && (
                      <span
                        className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20"
                        title={t('home.desk.predictedForYou')}
                      >
                        <Wand2 className="w-3 h-3" aria-hidden />
                        <span className="sr-only">{t('home.desk.predictedForYou')}:</span>
                        <span style={PIXEL} className="text-sm leading-none">{forYouInfo?.[movieKey(movie)]?.predicted}</span>
                      </span>
                    )}
                    <FloatingFriendBubbles
                      movieId={movie.id}
                      mediaType={movie.media_type || 'movie'}
                      friends={friendActivity[movieKey(movie)] ?? []}
                    />
                  </div>
                  <p className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                    {movie.title}
                  </p>
                  <div className="mt-0.5 text-xs" style={{ color: MIST }}>{metaLine(movie)}</div>
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
}

const EMPTY_SHELVES: ShelfData = { trending: [], comingSoon: [], bestOfYear: [] };

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
  // Filmes e Séries Para Você: chegam depois, sem segurar a página (o banco
  // guarda o resultado; o primeiro cálculo do dia pode levar ~1s).
  const [forYouMovies, setForYouMovies] = useState<ForYouShelf>(EMPTY_FOR_YOU);
  const [forYouSeries, setForYouSeries] = useState<ForYouShelf>(EMPTY_FOR_YOU);

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

  const fetchShelves = async () => {
    setShelvesLoading(true);
    const [trending, comingSoon, bestOfYear] = await Promise.allSettled([
      getTrending(),
      getComingSoon(),
      getBestOfYear(),
    ]);
    const value = (result: PromiseSettledResult<Movie[]>) => (result.status === 'fulfilled' ? result.value : []);
    setShelves({
      trending: value(trending),
      comingSoon: value(comingSoon),
      bestOfYear: value(bestOfYear),
    });
    setShelvesLoading(false);
  };

  useEffect(() => {
    if (userId) {
      fetchUsername(userId);
      fetchShelves();
    } else {
      fetchGuestTrending();
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setForYouMovies(EMPTY_FOR_YOU);
      setForYouSeries(EMPTY_FOR_YOU);
      return;
    }
    let cancelled = false;
    const load = (mediaType: 'movie' | 'tv', set: (shelf: ForYouShelf) => void) =>
      getForYouShelf(mediaType)
        .then((shelf) => {
          if (!cancelled) set(shelf);
        })
        .catch((error) => console.error(`Home: for-you ${mediaType} error`, error));
    load('movie', setForYouMovies);
    load('tv', setForYouSeries);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const allShelfMovies = useMemo(
    () => [...forYouMovies.movies, ...forYouSeries.movies, ...shelves.trending, ...shelves.comingSoon, ...shelves.bestOfYear],
    [shelves, forYouMovies, forYouSeries]
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

        {/* Para você: some quando não há nada (ninguém avaliado ainda, ou
            tudo das prateleiras favoritas já está na biblioteca). A
            explicação aparece só na primeira das duas listas. */}
        <Shelf
          title={t('home.forYouMovies')}
          subtitle={t('home.forYouSubtitle')}
          movies={forYouMovies.movies}
          meta="forYou"
          forYouInfo={forYouMovies.info}
          friendActivity={friendActivity}
          onMovieClick={handleMovieClick}
          onViewAll={() => openAll(t('home.forYouMovies'), forYouMovies.movies)}
        />
        <Shelf
          title={t('home.forYouSeries')}
          subtitle={forYouMovies.movies.length === 0 ? t('home.forYouSubtitle') : undefined}
          movies={forYouSeries.movies}
          meta="forYou"
          forYouInfo={forYouSeries.info}
          friendActivity={friendActivity}
          onMovieClick={handleMovieClick}
          onViewAll={() => openAll(t('home.forYouSeries'), forYouSeries.movies)}
        />
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
      </div>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => {
            setSelectedMovie(null);
            // a nota pode ter avançado o evento sazonal (tags, progresso)
            requestSeasonalRefresh();
          }}
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