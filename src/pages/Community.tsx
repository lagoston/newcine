import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, User, Users, Loader2, Crown, UserPlus, UserCheck, Clock, X, ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDebounce } from 'use-debounce';
import toast from 'react-hot-toast';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from '../components/GhostRiderFrame';
import { getBannerClass } from '../lib/banners';
import { getTextEffectNameClass, getTextEffectSecondaryClass } from '../lib/textEffects';
import { useTranslation } from 'react-i18next';
import MovieDetailsModal from '../components/MovieDetailsModal';
import FloatingFriendBubbles, { type FriendBubbleData } from '../components/FloatingFriendBubbles';
import OptimizedPoster from '../components/OptimizedPoster';
import { useAuth } from '../lib/auth';
import { getMovieDetailsFromDB, Movie, getTrending } from '../lib/tmdb';
import { cache } from '../lib/cache';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, tagCategoryStyle } from '../lib/oracleTheme';

// Comunidade — "a praça".
//   1. Cabeçalho: título e busca de membros.
//   2. Na watchlist dos amigos: faixa de pôsteres do que seus amigos
//      guardaram pra ver (sem amigos ainda: o que está em alta).
//   3. Membros: cartões com banner, moldura, efeito de texto e tag de cada
//      pessoa, e o botão de amizade; paginados de 12 em 12.

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  friends_count: number;
  mutual_friends_count?: number;
  plan_type: string;
  is_premium?: boolean;
  avatar_frame: string;
  banner: string;
  text_effect?: string;
  real_review_count?: number;
  active_tag?: {
    emoji: string;
    name: string;
    category: string;
  };
}

interface FriendWatchlistRow {
  movie_id: number;
  media_type?: string;
  title: string;
  friend_username: string;
  friend_id: string;
}

// Um pôster da faixa: o filme + os amigos que o guardaram.
interface WatchlistShelfItem {
  key: string;
  movieId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  movie?: Movie;
  friends: FriendBubbleData[];
}

type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

const USERS_PER_PAGE = 12;
const SHELF_LIMIT = 20;

export default function Community() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [shelf, setShelf] = useState<WatchlistShelfItem[]>([]);
  // A faixa mostra o que está em alta quando você ainda não tem amigos
  // (ou eles não guardaram nada).
  const [shelfIsFallback, setShelfIsFallback] = useState(false);
  const [loadingShelf, setLoadingShelf] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [friendshipStatuses, setFriendshipStatuses] = useState<Record<string, FriendshipStatus>>({});
  const [togglingFriendId, setTogglingFriendId] = useState<string | null>(null);

  const membersRef = useRef<HTMLElement>(null);
  const firstPageLoad = useRef(true);

  // Arrastar a faixa com o mouse (no celular é o toque nativo).
  const shelfScrollRef = useRef<HTMLDivElement>(null);
  const shelfDrag = useRef({ active: false, startX: 0, scrollStart: 0, distance: 0 });
  const handleShelfMouseDown = (e: React.MouseEvent) => {
    const el = shelfScrollRef.current;
    if (!el) return;
    shelfDrag.current = { active: true, startX: e.pageX, scrollStart: el.scrollLeft, distance: 0 };
  };
  const handleShelfMouseMove = (e: React.MouseEvent) => {
    const el = shelfScrollRef.current;
    if (!el || !shelfDrag.current.active) return;
    e.preventDefault();
    const dx = e.pageX - shelfDrag.current.startX;
    shelfDrag.current.distance = Math.abs(dx);
    el.scrollLeft = shelfDrag.current.scrollStart - dx;
  };
  const handleShelfMouseUp = () => {
    shelfDrag.current.active = false;
  };

  useEffect(() => {
    fetchProfiles();
    // Trocar de página leva de volta ao topo da lista de membros.
    if (firstPageLoad.current) {
      firstPageLoad.current = false;
    } else {
      membersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchFriendsWatchlist();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    const handleLanguageChange = () => {
      cache.invalidatePattern('movie:');
      fetchProfiles();
      if (session?.user?.id) {
        fetchFriendsWatchlist();
      }
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n, session?.user?.id]);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      searchProfiles();
    } else {
      setFilteredProfiles(profiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, profiles]);

  useEffect(() => {
    if (filteredProfiles.length > 0) {
      fetchFriendshipStatuses(filteredProfiles.map((p) => p.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProfiles]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);

      if (!session?.user?.id) {
        return;
      }

      const offset = (currentPage - 1) * USERS_PER_PAGE;

      const { data: totalCount } = await supabase.rpc('count_visible_profiles', { p_user_id: session.user.id });

      if (totalCount) {
        setTotalMembers(Number(totalCount));
        setTotalPages(Math.max(1, Math.ceil(Number(totalCount) / USERS_PER_PAGE)));
      }

      const { data: visibleProfiles, error: profilesError } = await supabase.rpc('get_visible_profiles', {
        p_user_id: session.user.id,
        p_limit: USERS_PER_PAGE,
        p_offset: offset,
      });

      if (profilesError) throw profilesError;

      setProfiles(visibleProfiles || []);
      setFilteredProfiles(visibleProfiles || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  // Busca o status de amizade com TODOS os perfis visíveis de uma vez —
  // uma query só, em vez de uma por cartão.
  const fetchFriendshipStatuses = async (profileIds: string[]) => {
    if (!session?.user?.id) return;

    const otherIds = profileIds.filter((id) => id !== session.user!.id);
    if (otherIds.length === 0) return;

    const { data, error } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(
        `and(requester_id.eq.${session.user.id},addressee_id.in.(${otherIds.join(',')})),and(addressee_id.eq.${session.user.id},requester_id.in.(${otherIds.join(',')}))`,
      );

    if (error) {
      console.error('Error fetching friendship statuses:', error);
      return;
    }

    const statusMap: Record<string, FriendshipStatus> = {};
    otherIds.forEach((id) => {
      statusMap[id] = 'none';
    });

    (data || []).forEach((f: any) => {
      const otherId = f.requester_id === session.user!.id ? f.addressee_id : f.requester_id;
      if (f.status === 'accepted') {
        statusMap[otherId] = 'friends';
      } else if (f.requester_id === session.user!.id) {
        statusMap[otherId] = 'pending_sent';
      } else {
        statusMap[otherId] = 'pending_received';
      }
    });

    setFriendshipStatuses((prev) => ({ ...prev, ...statusMap }));
  };

  // Mesma lógica de UserProfile.tsx (enviar pedido / cancelar pedido
  // enviado / aceitar pedido recebido), atualizando o status de UM perfil.
  // "Amigos" fica só como indicador aqui — desfazer amizade continua
  // exclusivo do perfil da pessoa, que pede confirmação.
  const handleFriendAction = async (profileId: string, username: string) => {
    if (!session?.user?.id || togglingFriendId) return;

    const currentStatus = friendshipStatuses[profileId] || 'none';
    if (currentStatus === 'friends') return;

    try {
      setTogglingFriendId(profileId);

      if (currentStatus === 'none') {
        const { data, error } = await supabase.rpc('send_friend_request', {
          p_requester_id: session.user.id,
          p_addressee_id: profileId,
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'request_failed');

        setFriendshipStatuses((prev) => ({ ...prev, [profileId]: 'pending_sent' }));
        toast.success(t('profile.friendRequestSent', { username }));

        await supabase.from('friend_indications').insert({
          from_user_id: session.user.id,
          to_user_id: profileId,
          type: 'friend_request',
          read: false,
        });
      } else if (currentStatus === 'pending_sent') {
        const { error } = await supabase.rpc('remove_friendship', {
          p_user_id: session.user.id,
          p_other_user_id: profileId,
        });
        if (error) throw error;
        setFriendshipStatuses((prev) => ({ ...prev, [profileId]: 'none' }));
        toast.success(t('profile.friendRequestCancelled'));
      } else if (currentStatus === 'pending_received') {
        const { data, error } = await supabase.rpc('respond_to_friend_request', {
          p_addressee_id: session.user.id,
          p_requester_id: profileId,
          p_accept: true,
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'accept_failed');

        setFriendshipStatuses((prev) => ({ ...prev, [profileId]: 'friends' }));
        toast.success(t('profile.friendRequestAccepted', { username }));
      }
    } catch (error) {
      console.error('Error handling friend action:', error);
      toast.error(t('common.error'));
    } finally {
      setTogglingFriendId(null);
    }
  };

  const searchProfiles = async () => {
    if (!session?.user?.id) return;

    try {
      setSearching(true);

      const { data: searchResults, error } = await supabase.rpc('search_visible_profiles', {
        p_user_id: session.user.id,
        p_search_query: debouncedQuery.trim(),
        p_limit: 50,
      });

      if (error) throw error;

      setFilteredProfiles(searchResults || []);
    } catch (error) {
      console.error('Error searching profiles:', error);
      toast.error(t('common.error'));
    } finally {
      setSearching(false);
    }
  };

  const loadTrendingFallback = async () => {
    try {
      const trendingMovies = await getTrending();
      setShelf(
        trendingMovies.slice(0, 12).map((movie) => ({
          key: `${movie.media_type || 'movie'}:${movie.id}`,
          movieId: movie.id,
          mediaType: (movie.media_type as 'movie' | 'tv') || 'movie',
          title: movie.title,
          movie,
          friends: [],
        })),
      );
      setShelfIsFallback(true);
    } catch {
      setShelf([]);
    }
  };

  const fetchFriendsWatchlist = async () => {
    if (!session?.user?.id) return;

    try {
      setLoadingShelf(true);
      const { data, error } = await supabase.rpc('get_friends_watchlist_movies', { user_id_param: session.user.id });

      if (error) throw error;

      const rows: FriendWatchlistRow[] = data || [];
      if (rows.length === 0) {
        await loadTrendingFallback();
        return;
      }

      // Uma linha por (filme, amigo) → um pôster por filme, com todos os
      // amigos que o guardaram. Antes o mesmo filme aparecia repetido, uma
      // vez por amigo, e cada pôster fazia as próprias consultas de bolhas.
      const grouped = new Map<string, WatchlistShelfItem>();
      rows.forEach((row) => {
        const mediaType = (row.media_type as 'movie' | 'tv') || 'movie';
        const key = `${mediaType}:${row.movie_id}`;
        if (!grouped.has(key)) {
          grouped.set(key, { key, movieId: row.movie_id, mediaType, title: row.title, friends: [] });
        }
        const item = grouped.get(key)!;
        if (row.friend_id && !item.friends.some((f) => f.user_id === row.friend_id)) {
          item.friends.push({ user_id: row.friend_id, username: row.friend_username, avatar_url: null, rating: null, is_watchlist_only: true });
        }
      });

      // Os mais desejados primeiro.
      const items = [...grouped.values()].sort((a, b) => b.friends.length - a.friends.length).slice(0, SHELF_LIMIT);

      // Avatares dos amigos numa consulta só.
      const friendIds = [...new Set(items.flatMap((i) => i.friends.map((f) => f.user_id)))];
      if (friendIds.length > 0) {
        const { data: friendProfiles } = await supabase.from('profiles').select('id, avatar_url').in('id', friendIds);
        const avatarById = new Map((friendProfiles || []).map((p: { id: string; avatar_url: string | null }) => [p.id, p.avatar_url]));
        items.forEach((item) => item.friends.forEach((f) => (f.avatar_url = avatarById.get(f.user_id) ?? null)));
      }

      const withDetails = await Promise.all(
        items.map(async (item) => {
          try {
            return { ...item, movie: await getMovieDetailsFromDB(item.movieId) };
          } catch {
            return item;
          }
        }),
      );
      setShelf(withDetails);
      setShelfIsFallback(false);
    } catch (error) {
      console.error('Error fetching friends watchlist:', error);
      await loadTrendingFallback();
    } finally {
      setLoadingShelf(false);
    }
  };

  const isSearching = debouncedQuery.trim().length > 0;
  const showShelf = currentPage === 1 && !searchQuery;

  // ---- Peças ----

  const friendButton = (profile: Profile) => {
    if (profile.id === session?.user?.id) {
      return (
        <span className="shrink-0 inline-flex items-center h-10 px-3.5 rounded-full text-sm font-medium bg-white/[0.06] ring-1 ring-white/10" style={{ color: MIST }}>
          {t('community.you')}
        </span>
      );
    }
    const status = friendshipStatuses[profile.id] || 'none';
    const busy = togglingFriendId === profile.id;
    const base = `relative z-10 shrink-0 gap-1.5 h-10 px-3.5 rounded-full text-sm font-semibold transition disabled:cursor-wait ${FOCUS_RING}`;

    if (status === 'friends') {
      return (
        <span className="relative z-10 shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-sm font-semibold bg-emerald-600 text-white shadow-lg shadow-emerald-900/30">
          <UserCheck className="w-4 h-4" aria-hidden />
          {t('profile.friendsButton')}
        </span>
      );
    }
    if (status === 'pending_sent') {
      return (
        <button
          onClick={() => handleFriendAction(profile.id, profile.username)}
          disabled={busy}
          title={t('profile.cancelRequest')}
          className={`${base} border border-white/15 hover:border-white/35 hover:bg-white/5 font-medium`}
          style={{ color: PAPER }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Clock className="w-4 h-4 text-amber-300" aria-hidden />}
          {t('community.requestSent')}
        </button>
      );
    }
    if (status === 'pending_received') {
      return (
        <button
          onClick={() => handleFriendAction(profile.id, profile.username)}
          disabled={busy}
          className={`${base} bg-emerald-600 hover:bg-emerald-500 text-white`}
          aria-label={t('community.acceptAria', { username: profile.username })}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserCheck className="w-4 h-4" aria-hidden />}
          {t('community.accept')}
        </button>
      );
    }
    return (
      <button
        onClick={() => handleFriendAction(profile.id, profile.username)}
        disabled={busy}
        className={`${base} bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-fuchsia-900/30`}
        aria-label={t('community.addAria', { username: profile.username })}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserPlus className="w-4 h-4" aria-hidden />}
        {t('community.add')}
      </button>
    );
  };

  const memberCard = (profile: Profile) => {
    const premium = profile.is_premium ?? profile.plan_type === 'premium';
    const reviews = profile.real_review_count || 0;
    const bannerClass = getBannerClass(profile.banner, premium);
    const nameClass = getTextEffectNameClass(profile.text_effect, premium, reviews);
    const secondaryClass = getTextEffectSecondaryClass(profile.text_effect, premium, reviews);
    const rawFrame = getFrameClass(profile.avatar_frame, premium);
    const frame = !rawFrame || rawFrame === 'ring-0' ? 'ring-2 ring-white/15' : rawFrame;

    return (
      <li key={profile.id} className="relative h-full flex flex-col rounded-2xl ring-1 ring-white/10 hover:ring-white/25 overflow-hidden transition" style={{ background: VELVET }}>
        {/* Faixa do banner da pessoa */}
        <div
          className={`relative h-20 ${bannerClass}`}
          style={bannerClass ? undefined : { background: `radial-gradient(ellipse 80% 120% at 100% 0%, rgba(139,92,246,0.35), transparent 70%), ${NIGHT}` }}
          aria-hidden
        />
        <div className="flex-1 flex flex-col px-5 pb-4" style={{ color: MIST }}>
          <div className="-mt-9 flex items-end justify-between gap-3">
            <span className="relative shrink-0 rounded-full" style={{ boxShadow: `0 0 0 4px ${VELVET}` }}>
              {frameUsesComponent(profile.avatar_frame, premium) === 'GhostRiderFrame' && profile.avatar_url ? (
                <GhostRiderFrame src={profile.avatar_url} alt="" size={72} />
              ) : (
                <span className={`block w-[72px] h-[72px] rounded-full overflow-hidden ${frame}`} style={{ background: NIGHT }}>
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <span className="w-full h-full grid place-items-center" style={{ color: MIST }}>
                      <User className="w-8 h-8" aria-hidden />
                    </span>
                  )}
                </span>
              )}
            </span>
            {session?.user?.id && <div className="pb-1">{friendButton(profile)}</div>}
          </div>

          <div className="mt-3 flex items-center gap-2 min-w-0" style={{ color: PAPER }}>
            <h3 className="min-w-0">
              {/* O link cobre o cartão inteiro (after:inset-0); o botão de
                  amizade fica por cima dele (z-10). */}
              <Link
                to={`/profile/${profile.username}`}
                className={`justify-start min-w-0 rounded-md text-xl leading-tight truncate after:absolute after:inset-0 after:z-[1] after:rounded-2xl hover:underline underline-offset-4 ${FOCUS_RING} ${nameClass}`}
                style={nameClass.includes('font-[') ? undefined : PIXEL}
              >
                <span className="truncate">@{profile.username}</span>
              </Link>
            </h3>
            {premium && <Crown className="w-5 h-5 shrink-0 text-amber-300" aria-label={t('settings.premium')} />}
          </div>

          {profile.active_tag && (
            <span className={`mt-2 self-start inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium max-w-full ${tagCategoryStyle(profile.active_tag.category).pill}`}>
              <span aria-hidden>{profile.active_tag.emoji}</span>
              <span className="truncate">{profile.active_tag.name}</span>
            </span>
          )}

          <p className={`mt-2.5 text-sm leading-relaxed line-clamp-2 flex-1 ${profile.bio ? secondaryClass : ''}`} style={profile.bio ? undefined : { opacity: 0.6 }}>
            {profile.bio || t('profile.bio')}
          </p>

          <p className="mt-3 pt-3 border-t border-white/[0.07] flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: MIST }}>
            <Users className="w-4 h-4 shrink-0" aria-hidden />
            <span>
              <span style={{ ...PIXEL, color: PAPER }} className="text-base">
                {profile.friends_count}
              </span>{' '}
              {t('profile.friendsLabel', { defaultValue: 'Amigos' })}
            </span>
            {!!profile.mutual_friends_count && profile.mutual_friends_count > 0 && (
              <span className="text-violet-200">· {t('community.mutualFriends', { count: profile.mutual_friends_count })}</span>
            )}
          </p>
        </div>
      </li>
    );
  };

  const pageNumbers = (() => {
    const count = Math.min(5, totalPages);
    let start = 1;
    if (totalPages > 5) start = Math.min(Math.max(1, currentPage - 2), totalPages - 4);
    return Array.from({ length: count }, (_, i) => start + i);
  })();

  const pagerButton = `gap-1.5 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${FOCUS_RING}`;

  return (
    <div className="min-h-screen pb-16">
      {/* ---------- Cabeçalho ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10">
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-12">
          <div className="min-w-0">
            <h1 style={{ ...PIXEL, color: PAPER }} className="text-[2.2rem] sm:text-5xl leading-none">
              {t('community.title')}
            </h1>
            <p className="mt-3 text-[15px] sm:text-base max-w-xl" style={{ color: MIST }}>
              {t('community.subtitle')}
            </p>
          </div>
          <label className="relative block mt-6 lg:mt-0 lg:w-[380px] shrink-0">
            <span className="sr-only">{t('community.searchMembers')}</span>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" style={{ color: MIST }} aria-hidden />
            <input
              type="search"
              placeholder={t('community.searchMembers')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full h-12 pl-12 pr-12 rounded-xl ring-1 ring-white/15 focus:ring-2 focus:ring-fuchsia-300/70 outline-none text-[15px] placeholder:text-[#BDB4D6]/70 [&::-webkit-search-cancel-button]:hidden"
              style={{ background: VELVET, color: PAPER }}
            />
            {searching ? (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-violet-300" aria-hidden />
            ) : (
              searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('community.clearSearch')}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-lg hover:bg-white/10 transition ${FOCUS_RING}`}
                  style={{ color: MIST, minWidth: 0, minHeight: 0 }}
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              )
            )}
          </label>
        </div>
      </section>

      {/* ---------- Na watchlist dos amigos ---------- */}
      {showShelf && (
        <section className="mt-10 border-t border-white/[0.07] pt-10">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">
              {shelfIsFallback ? t('community.trendingFallbackTitle') : t('community.friendsWatchlistTitle')}
            </h2>
            <p className="mt-1 text-sm" style={{ color: MIST }}>
              {shelfIsFallback ? t('community.trendingFallbackHint') : t('community.friendsWatchlistHint')}
            </p>
          </div>

          {loadingShelf ? (
            <div className="mt-5 flex gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] overflow-hidden" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="shrink-0 w-[124px] sm:w-[148px]">
                  <div className="aspect-[2/3] rounded-xl ring-1 ring-white/[0.07] animate-pulse" style={{ background: VELVET }} />
                  <div className="mt-2.5 h-3.5 w-24 rounded bg-white/10 animate-pulse" />
                </div>
              ))}
            </div>
          ) : shelf.length > 0 ? (
            <div
              ref={shelfScrollRef}
              className="mt-3 pt-3 overflow-x-auto cursor-grab select-none"
              onMouseDown={handleShelfMouseDown}
              onMouseMove={handleShelfMouseMove}
              onMouseUp={handleShelfMouseUp}
              onMouseLeave={handleShelfMouseUp}
              onClickCapture={(e) => {
                if (shelfDrag.current.distance > 5) {
                  e.preventDefault();
                  e.stopPropagation();
                  shelfDrag.current.distance = 0;
                }
              }}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              <ol className="flex gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pb-2">
                {shelf.map((item) => {
                  const title = item.movie?.title || item.title;
                  const firstFriend = item.friends[0];
                  return (
                    <li key={item.key} className="shrink-0 w-[124px] sm:w-[148px]">
                      <button
                        onClick={() => item.movie && setSelectedMovie(item.movie)}
                        disabled={!item.movie}
                        className={`group block w-full text-left rounded-xl disabled:cursor-default ${FOCUS_RING}`}
                      >
                        <div
                          className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1"
                          style={{ background: VELVET }}
                        >
                          {item.movie?.poster_path ? (
                            <OptimizedPoster src={`https://image.tmdb.org/t/p/w342${item.movie.poster_path}`} alt={title} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <span className="absolute inset-0 grid place-items-center p-3 text-center text-xs" style={{ color: MIST }}>
                              <Film className="w-8 h-8 opacity-50" aria-hidden />
                            </span>
                          )}
                          {item.friends.length > 0 && <FloatingFriendBubbles movieId={item.movieId} mediaType={item.mediaType} friends={item.friends} />}
                        </div>
                        <p className="mt-2.5 text-sm font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>
                          {title}
                        </p>
                        {firstFriend ? (
                          <p className="mt-0.5 text-xs truncate text-sky-300">
                            {item.friends.length > 1
                              ? t('community.wantedByMore', { username: firstFriend.username, count: item.friends.length - 1 })
                              : t('community.wantedBy', { username: firstFriend.username })}
                          </p>
                        ) : (
                          item.movie?.release_date && (
                            <p className="mt-0.5 text-xs" style={{ color: MIST }}>
                              {item.movie.release_date.slice(0, 4)}
                            </p>
                          )
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <p className="mx-auto max-w-6xl px-5 sm:px-8 mt-5 text-sm" style={{ color: MIST }}>
              {t('common.noMoviesFound')}
            </p>
          )}
        </section>
      )}

      {/* ---------- Membros ---------- */}
      <section ref={membersRef} className="mt-12 border-t border-white/[0.07] pt-10 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight break-words">
                {isSearching ? t('community.resultsFor', { query: debouncedQuery.trim() }) : t('community.membersTitle')}
              </h2>
              <p className="mt-1 text-sm" style={{ color: MIST }}>
                {isSearching
                  ? searching
                    ? t('common.loading')
                    : t('community.resultsCount', { count: filteredProfiles.length })
                  : totalMembers !== null
                    ? t('community.membersHint', { count: totalMembers })
                    : t('community.description')}
              </p>
            </div>
          </div>

          {loading && !isSearching ? (
            <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="h-[228px] rounded-2xl ring-1 ring-white/[0.07] animate-pulse" style={{ background: VELVET }} />
              ))}
            </ul>
          ) : filteredProfiles.length === 0 ? (
            <div className="mt-6 rounded-2xl ring-1 ring-white/10 p-8 text-center" style={{ background: VELVET }}>
              <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
                <Users className="w-7 h-7 text-violet-300" aria-hidden />
              </span>
              <p className="mt-4 font-semibold" style={{ color: PAPER }}>
                {t('community.noMembers')}
              </p>
              <p className="mt-1 text-sm max-w-md mx-auto" style={{ color: MIST }}>
                {isSearching ? t('community.noMembersMatch') : t('community.beFirst')}
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{filteredProfiles.map(memberCard)}</ul>
          )}

          {!searchQuery && filteredProfiles.length > 0 && totalPages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-2" aria-label={t('community.pagination')}>
              <button onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1 || loading} className={pagerButton} style={{ color: PAPER }}>
                <ChevronLeft className="w-4 h-4" aria-hidden />
                <span className="hidden sm:inline">{t('community.previous')}</span>
                <span className="sr-only sm:hidden">{t('community.previous')}</span>
              </button>

              <span className="sm:hidden px-3 text-sm tabular-nums" style={{ color: MIST }}>
                {t('community.pageOf', { page: currentPage, total: totalPages })}
              </span>
              <ol className="hidden sm:flex items-center gap-1.5">
                {pageNumbers.map((pageNum) => {
                  const current = currentPage === pageNum;
                  return (
                    <li key={pageNum}>
                      <button
                        onClick={() => setCurrentPage(pageNum)}
                        aria-current={current ? 'page' : undefined}
                        disabled={loading}
                        className={`w-11 h-11 rounded-xl text-base transition ${FOCUS_RING} ${current ? 'bg-violet-600 text-white shadow' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
                        style={current ? PIXEL : { ...PIXEL, color: MIST, background: VELVET }}
                      >
                        {pageNum}
                      </button>
                    </li>
                  );
                })}
              </ol>

              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || loading}
                className={pagerButton}
                style={{ color: PAPER }}
              >
                <span className="hidden sm:inline">{t('community.next')}</span>
                <span className="sr-only sm:hidden">{t('community.next')}</span>
                <ChevronRight className="w-4 h-4" aria-hidden />
              </button>
            </nav>
          )}
        </div>
      </section>

      {selectedMovie && <MovieDetailsModal movie={selectedMovie} isOpen={true} onClose={() => setSelectedMovie(null)} />}
    </div>
  );
}
