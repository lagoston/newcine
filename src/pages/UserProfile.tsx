import { useState, useEffect, type CSSProperties } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ListPlus, MessageSquare, UserCheck, UserPlus, Clock, Sparkles, Wand2, Loader2, Film, UserX, LogIn, User } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Movie } from '../lib/tmdb';
import RatingBox from '../components/RatingBox';
import FollowersModal from '../components/FollowersModal';
import ConfirmationModal from '../components/ConfirmationModal';
import UserPinsCard from '../components/UserPinsCard';
import UserListsModal from '../components/UserListsModal';
import AllMoviesModal from '../components/AllMoviesModal';
import UserReviewsModal from '../components/UserReviewsModal';
import CompatibilityModal from '../components/CompatibilityModal';
import MatchMovieModal from '../components/MatchMovieModal';
import ProfileIdentityCard, { PROFILE_GHOST_BUTTON, PROFILE_PRIMARY_BUTTON, type ProfileActiveTag } from '../components/ProfileIdentityCard';
import { useTagDecoration } from '../contexts/SeasonalEventContext';
import { ProfileStatTiles, ProfileTasteGrid, ProfileSectionHeading, PROFILE_CARD } from '../components/ProfileTaste';
import { summarizeRatings } from '../lib/profileStats';
import ProfileEssence from '../components/ProfileEssence';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS } from '../lib/cache';
import { useProfileData, type MovieWithRating } from '../hooks/useProfileData';
import { VELVET, SURFACE, SURFACE_VAR, PAPER, MIST, NIGHT, FOCUS_RING, ORACLES } from '../lib/oracleTheme';
import { getBannerTone } from '../lib/banners';

// Perfil de outra pessoa (vindo da Comunidade, da atividade dos amigos,
// das resenhas...). Mesma "cara" do seu Perfil — cartão de identidade,
// números, essência — com o que é próprio de visitar alguém:
//   • amizade (adicionar, cancelar pedido, aceitar, desfazer)
//   • Compatibilidade e Match Movie com você
//   • listas e resenhas dela
//   • a coleção (prateleiras por nota) e o Info (personalidade, notas e o
//     retrato de gosto), em abas.
// Os blocos da página vestem o tom do banner da pessoa (--co-surface).

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  plan_type: string;
  is_premium?: boolean;
  avatar_frame: string;
  banner?: string;
  text_effect?: string;
  active_tag?: ProfileActiveTag;
}

type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';
type Tab = 'collection' | 'info';

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  // Perfil decorado de Halloween/Natal: o dono usando 🎃 Pumpkin Head ou 🎅 Ho Ho Ho.
  const seasonalDecoration = useTagDecoration(profile?.id, profile?.active_tag, Boolean(profile?.id) && profile?.id === session?.user?.id);
  // Contagem de resenhas REAIS do dono deste perfil (não do viewer) —
  // usada só pra decidir se os Text Effects dele estão desbloqueados,
  // mesma lógica de Profile.tsx (o próprio perfil).
  const [realReviewCount, setRealReviewCount] = useState(0);
  // Amizade é mútua — não existe mais "eu sigo mas ele não me segue".
  // 4 estados possíveis: sem relação, pedido enviado por mim, pedido
  // recebido dele (posso aceitar direto aqui), ou já somos amigos.
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>('none');
  const [loading, setLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);
  const [showUserListsModal, setShowUserListsModal] = useState(false);
  const [showUserReviewsModal, setShowUserReviewsModal] = useState(false);
  const [showCompatibilityModal, setShowCompatibilityModal] = useState(false);
  const [showMatchMovieModal, setShowMatchMovieModal] = useState(false);
  // A coleção abre primeiro (antes o retrato de gosto ficava recolhido
  // atrás de "Mostrar estatísticas").
  const [tab, setTab] = useState<Tab>('collection');

  const {
    movies,
    ratedMoviesCount,
    ratingDistribution,
    totalWatchTime,
    favoriteGenres,
    favoriteKeywords,
    favoriteDecade,
    topDirectors,
    leastKnownGem,
    friendsCount,
    persona,
    personaLoading,
    countryCounts,
    countryAvgRatings,
    refetch: refetchProfileData,
  } = useProfileData(profile?.id, i18n.language);

  const [countryMoviesModal, setCountryMoviesModal] = useState<{ isOpen: boolean; title: string; movies: MovieWithRating[] }>({
    isOpen: false,
    title: '',
    movies: [],
  });

  const handleViewCountryMovies = (countryCode: string, countryName: string) => {
    const filtered = (movies || []).filter((m) => m.origin_country?.[0] === countryCode && m.userRating !== null);
    setCountryMoviesModal({ isOpen: true, title: countryName, movies: filtered });
  };

  useEffect(() => {
    if (username) {
      setTab('collection');
      fetchProfileAndMovies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    const handleLanguageChange = () => {
      if (profile?.id) {
        cache.delete(CACHE_KEYS.USER_PROFILE(profile.id));
      }
      cache.invalidatePattern('movie:');
      if (username) {
        fetchProfileAndMovies();
      }
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n, username, profile?.id]);

  const fetchProfileAndMovies = async () => {
    if (!username) return;

    try {
      setLoading(true);

      // Passa pela mesma lógica de visibilidade de get_visible_profiles —
      // perfis "só amigos" não aparecem pra quem não é amigo, e as colunas
      // brutas (pontos E/I/C/S/R) nunca são expostas.
      const { data: profileRows, error: profileError } = await supabase.rpc('get_profile_by_username', {
        p_username: username,
        p_viewer_id: session?.user?.id || null,
      });

      if (profileError) throw profileError;

      const profileData = profileRows?.[0] || null;

      if (!profileData) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profileData.id)
        .eq('is_ai_generated', false)
        .then(({ count }) => setRealReviewCount(count || 0));

      if (session?.user?.id) {
        const { data: friendshipData } = await supabase
          .from('friendships')
          .select('status, requester_id')
          .or(
            `and(requester_id.eq.${session.user.id},addressee_id.eq.${profileData.id}),and(requester_id.eq.${profileData.id},addressee_id.eq.${session.user.id})`,
          )
          .maybeSingle();

        if (!friendshipData) {
          setFriendshipStatus('none');
        } else if (friendshipData.status === 'accepted') {
          setFriendshipStatus('friends');
        } else if (friendshipData.requester_id === session.user.id) {
          setFriendshipStatus('pending_sent');
        } else {
          setFriendshipStatus('pending_received');
        }
      }
    } catch (error) {
      console.error('Error fetching profile and movies:', error);
      toast.error(t('profile.toast.loadError'));
    } finally {
      setLoading(false);
    }
  };

  // Só "desfazer amizade" precisa de confirmação — é a única ação
  // destrutiva das quatro (enviar pedido, cancelar pedido enviado, e
  // aceitar pedido recebido não desfazem nada que já existia).
  const handleFriendAction = () => {
    if (friendshipStatus === 'friends') {
      setShowUnfriendConfirm(true);
      return;
    }
    performFriendAction();
  };

  const performFriendAction = async () => {
    if (!session) {
      navigate('/auth');
      return;
    }

    if (!profile?.id || isToggling) {
      return;
    }

    try {
      setIsToggling(true);

      if (friendshipStatus === 'none') {
        const { data, error } = await supabase.rpc('send_friend_request', {
          p_requester_id: session.user.id,
          p_addressee_id: profile.id,
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'request_failed');

        setFriendshipStatus('pending_sent');
        toast.success(t('profile.friendRequestSent', { username: profile.username }));

        // Um pedido de verdade, que aparece nos Sussurros com Aceitar/Recusar.
        await supabase.from('friend_indications').insert({
          from_user_id: session.user.id,
          to_user_id: profile.id,
          type: 'friend_request',
          read: false,
        });
      } else if (friendshipStatus === 'pending_sent') {
        const { error } = await supabase.rpc('remove_friendship', {
          p_user_id: session.user.id,
          p_other_user_id: profile.id,
        });

        if (error) throw error;
        setFriendshipStatus('none');
        refetchProfileData();
        toast.success(t('profile.friendRequestCancelled'));
      } else if (friendshipStatus === 'pending_received') {
        const { data, error } = await supabase.rpc('respond_to_friend_request', {
          p_addressee_id: session.user.id,
          p_requester_id: profile.id,
          p_accept: true,
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'accept_failed');

        setFriendshipStatus('friends');
        refetchProfileData();
        toast.success(t('profile.friendRequestAccepted', { username: profile.username }));
      } else {
        const { error } = await supabase.rpc('remove_friendship', {
          p_user_id: session.user.id,
          p_other_user_id: profile.id,
        });

        if (error) throw error;
        setFriendshipStatus('none');
        refetchProfileData();
        toast.success(t('profile.friendRemoved', { username: profile.username }));
      }
    } catch (error) {
      console.error('Error handling friend action:', error);
      toast.error(t('profile.friendActionError'));
    } finally {
      setIsToggling(false);
      setShowUnfriendConfirm(false);
    }
  };

  const goBack = () => {
    // Chegou direto pelo link (sem histórico no app): volta pra Comunidade.
    if (window.history.length > 1) navigate(-1);
    else navigate('/community');
  };

  const backButton = (
    <button
      onClick={goBack}
      className={`inline-flex items-center gap-2 h-11 px-3 -ml-3 rounded-xl text-sm font-medium hover:bg-white/5 transition ${FOCUS_RING}`}
      style={{ color: MIST }}
    >
      <ArrowLeft className="w-4 h-4" aria-hidden />
      {t('common.back')}
    </button>
  );

  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
  }

  if (!profile) {
    return (
      <div className="min-h-[calc(100vh-4rem)] mx-auto max-w-6xl px-5 sm:px-8 pt-4 sm:pt-8 pb-16">
        {backButton}
        <div className="mt-10 mx-auto max-w-md rounded-3xl ring-1 ring-white/10 p-8 text-center" style={{ background: VELVET }}>
          <span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <UserX className="w-8 h-8 text-violet-300" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-semibold" style={{ color: PAPER }}>
            {t('profile.notFound')}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed" style={{ color: MIST }}>
            {t('profile.notFoundOrPrivate', { username })}
          </p>
          <Link to="/community" className={`mt-7 w-full justify-center ${PROFILE_PRIMARY_BUTTON}`}>
            {t('profile.goToCommunity')}
          </Link>
        </div>
      </div>
    );
  }

  // ---- Valores derivados ----
  const isOwnerPremium = profile.is_premium ?? profile.plan_type === 'premium';
  const isSelf = session?.user?.id === profile.id;
  const { counts: ratingCounts, average } = summarizeRatings(ratingDistribution);

  // Prateleiras: uma por nota (10 → 0) e a Watchlist no fim.
  const buckets: Record<number, MovieWithRating[]> = {};
  const unrated: MovieWithRating[] = [];
  movies.forEach((movie) => {
    if (movie.userRating === null) unrated.push(movie);
    else (buckets[movie.userRating] ||= []).push(movie);
  });

  const jumpToRating = (rating: number) => {
    document.getElementById(`profile-rating-${rating}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Tocar numa nota em "Notas de @" (aba Info) abre a Coleção já na
  // prateleira daquela nota.
  const jumpFromInfo = (rating: number) => {
    setTab('collection');
    window.setTimeout(() => jumpToRating(rating), 80);
  };

  // Tom do banner da pessoa pros blocos da página (null = violeta padrão).
  const bannerTone = getBannerTone(profile.banner, isOwnerPremium);
  const pageStyle = bannerTone ? ({ [SURFACE_VAR]: bannerTone.surface } as CSSProperties) : undefined;

  // Botão de amizade — muda com o estado da relação.
  const friendButton = (() => {
    if (isToggling) {
      return (
        <button disabled className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }} aria-busy="true">
          <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden />
          {t('common.loading')}
        </button>
      );
    }
    switch (friendshipStatus) {
      case 'friends':
        return (
          <button onClick={handleFriendAction} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }} aria-label={t('profile.unfriendAria', { username: profile.username })}>
            <UserCheck className="w-[18px] h-[18px] text-emerald-300" aria-hidden />
            {t('profile.friendsButton')}
          </button>
        );
      case 'pending_sent':
        return (
          <button onClick={handleFriendAction} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }} title={t('profile.cancelRequest')}>
            <Clock className="w-[18px] h-[18px] text-amber-300" aria-hidden />
            {t('profile.requestSentButton')}
          </button>
        );
      case 'pending_received':
        return (
          <button
            onClick={handleFriendAction}
            className={`inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-900/30 transition ${FOCUS_RING}`}
          >
            <UserCheck className="w-[18px] h-[18px]" aria-hidden />
            {t('profile.acceptRequestButton')}
          </button>
        );
      default:
        return (
          <button onClick={handleFriendAction} className={PROFILE_PRIMARY_BUTTON}>
            <UserPlus className="w-[18px] h-[18px]" aria-hidden />
            {t('profile.addFriendButton')}
          </button>
        );
    }
  })();

  // No celular: amizade numa linha inteira e os atalhos em grade 2×2; a
  // partir do sm, tudo numa fileira só.
  const actions = isSelf ? (
    <Link to="/profile" className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
      <User className="w-[18px] h-[18px] text-violet-300" aria-hidden />
      {t('profile.openOwnProfile')}
    </Link>
  ) : (
    <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:flex-wrap gap-2">
      <div className="flex [&>*]:flex-1 sm:[&>*]:flex-none">
        {session ? (
          friendButton
        ) : (
          <Link to="/auth" className={PROFILE_PRIMARY_BUTTON}>
            <LogIn className="w-[18px] h-[18px]" aria-hidden />
            {t('profile.signInToAdd')}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        {session && (
          <>
            <button onClick={() => setShowCompatibilityModal(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
              <Sparkles className="w-[18px] h-[18px] text-pink-300" aria-hidden />
              {t('compatibility.buttonLabel')}
            </button>
            <button onClick={() => setShowMatchMovieModal(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
              <Wand2 className="w-[18px] h-[18px] text-fuchsia-300" aria-hidden />
              {t('matchMovie.buttonLabel')}
            </button>
          </>
        )}
        <button onClick={() => setShowUserListsModal(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
          <ListPlus className="w-[18px] h-[18px] text-violet-300" aria-hidden />
          {t('profile.listsShort')}
        </button>
        <button onClick={() => setShowUserReviewsModal(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
          <MessageSquare className="w-[18px] h-[18px] text-violet-300" aria-hidden />
          {t('profile.reviews')}
        </button>
      </div>
    </div>
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'collection', label: t('profile.collectionTab'), count: movies.length },
    { id: 'info', label: t('profile.infoTab') },
  ];

  return (
    <div className="min-h-screen pb-16" style={pageStyle}>
      {/* ---------- Cartão de identidade ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-3 sm:pt-6">
        {backButton}
        <div className="mt-2">
          <ProfileIdentityCard
            username={profile.username}
            avatarUrl={profile.avatar_url}
            avatarFrame={profile.avatar_frame}
            banner={profile.banner}
            textEffect={profile.text_effect}
            isPremium={isOwnerPremium}
            realReviewCount={realReviewCount}
            activeTag={profile.active_tag}
            bio={profile.bio}
            friendsCount={friendsCount}
            joinedAt={profile.created_at}
            onFriendsClick={() => setShowFriendsModal(true)}
            actions={actions}
            seasonalDecoration={seasonalDecoration}
          />
        </div>
      </section>

      {/* ---------- Números ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 mt-4">
        <ProfileStatTiles
          ratedCount={ratedMoviesCount}
          watchMinutes={totalWatchTime}
          label={t('profile.numbersOf', { username: profile.username })}
        />
      </section>

      {/* ---------- Coleção / Info ---------- */}
      <section className="mt-12 border-t border-white/[0.07] pt-10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div role="tablist" aria-label={profile.username} className="inline-flex p-1 rounded-full ring-1 ring-white/10" style={{ background: NIGHT }}>
            {tabs.map(({ id, label, count }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  id={`profile-tab-${id}`}
                  aria-selected={active}
                  aria-controls={`profile-panel-${id}`}
                  onClick={() => setTab(id)}
                  className={`gap-2 h-11 px-5 rounded-full text-sm font-semibold transition ${FOCUS_RING} ${active ? 'bg-violet-600 text-white shadow' : 'hover:bg-white/[0.06]'}`}
                  style={active ? undefined : { color: MIST }}
                >
                  {label}
                  {typeof count === 'number' && count > 0 && (
                    <span className={`text-xs tabular-nums ${active ? 'text-white/80' : ''}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'collection' ? (
          <div id="profile-panel-collection" role="tabpanel" aria-labelledby="profile-tab-collection">
            {movies.length === 0 ? (
              <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-6">
                <div className={`${PROFILE_CARD} flex items-center gap-5`} style={{ background: SURFACE }}>
                  <span className="grid place-items-center w-14 h-14 shrink-0 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
                    <Film className="w-7 h-7 text-violet-300" aria-hidden />
                  </span>
                  <p className="flex-1 min-w-0 text-[15px]" style={{ color: MIST }}>
                    {t('profile.collectionEmptyOther', { username: profile.username })}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-2">
                  {[...Array(11)].map((_, i) => {
                    const rating = 10 - i;
                    const shelf = buckets[rating] || [];
                    if (shelf.length === 0) return null;
                    return (
                      <RatingBox
                        key={rating}
                        anchorId={`profile-rating-${rating}`}
                        fullBleed
                        title={t('library.rating', { value: rating })}
                        movies={shelf as Movie[]}
                        rating={rating}
                        isOtherUserProfile
                        profileUserId={profile.id}
                        chromaBoxEnabled
                      />
                    );
                  })}
                  {unrated.length > 0 && (
                    <RatingBox
                      anchorId="profile-watchlist"
                      fullBleed
                      title={t('library.watchList')}
                      movies={unrated as Movie[]}
                      rating={null}
                      isOtherUserProfile
                      profileUserId={profile.id}
                      chromaBoxEnabled
                    />
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div id="profile-panel-info" role="tabpanel" aria-labelledby="profile-tab-info" className="mx-auto max-w-6xl px-5 sm:px-8 mt-8 space-y-12">
            {/* Personalidade de @ */}
            <div>
              <ProfileSectionHeading title={t('profile.essenceOf', { username: profile.username })} />
              <div className="mt-6">
                <ProfileEssence
                  loading={personaLoading}
                  persona={persona}
                  emptyState={
                    <div className={`${PROFILE_CARD} flex items-center gap-5`} style={{ background: SURFACE }}>
                      <div className="flex shrink-0" aria-hidden>
                        {ORACLES.map((oracle, i) => (
                          <img
                            key={oracle.id}
                            src={oracle.avatar}
                            alt=""
                            width={40}
                            height={40}
                            className={`w-10 h-10 rounded-full object-cover opacity-70 ${i > 0 ? '-ml-2' : ''}`}
                            style={{ boxShadow: `0 0 0 2px ${SURFACE}, 0 0 0 4px ${oracle.color}` }}
                          />
                        ))}
                      </div>
                      <p className="flex-1 min-w-0 text-sm" style={{ color: MIST }}>
                        {t('profile.essenceEmptyOther', { username: profile.username })}
                      </p>
                    </div>
                  }
                />
              </div>
            </div>

            {/* Notas de @ e o retrato de gosto */}
            <div>
              <ProfileSectionHeading title={t('profile.ratingsOf', { username: profile.username })} />
              <div className="mt-6">
                {ratedMoviesCount > 0 ? (
                  <ProfileTasteGrid
                    ratingCounts={ratingCounts}
                    average={average}
                    ratingTitle={t('profile.stats.ratingDistribution')}
                    onJumpToRating={jumpFromInfo}
                    favoriteGenres={favoriteGenres}
                    favoriteKeywords={favoriteKeywords}
                    favoriteDecade={favoriteDecade}
                    topDirectors={topDirectors}
                    leastKnownGem={leastKnownGem}
                    countryCounts={countryCounts}
                    countryAvgRatings={countryAvgRatings}
                    onViewCountryMovies={handleViewCountryMovies}
                    ownerRatingLabel={t('profile.ratingOf', { username: profile.username })}
                    extra={<UserPinsCard userId={profile.id} title={t('profile.pinsOf', { username: profile.username })} className="md:col-span-2 lg:col-span-3" />}
                  />
                ) : (
                  <div className={`${PROFILE_CARD} flex items-center gap-5`} style={{ background: SURFACE }}>
                    <span className="grid place-items-center w-14 h-14 shrink-0 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
                      <Film className="w-7 h-7 text-violet-300" aria-hidden />
                    </span>
                    <p className="flex-1 min-w-0 text-[15px]" style={{ color: MIST }}>
                      {t('profile.tasteEmptyOther', { username: profile.username })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {showFriendsModal && profile.id && (
        <FollowersModal isOpen={true} onClose={() => setShowFriendsModal(false)} userId={profile.id} onFollowChange={refetchProfileData} />
      )}

      <ConfirmationModal
        isOpen={showUnfriendConfirm}
        onClose={() => setShowUnfriendConfirm(false)}
        onConfirm={performFriendAction}
        title={t('profile.unfriendConfirmTitle')}
        message={t('profile.unfriendConfirmMessage', { username: profile.username })}
        confirmLabel={t('profile.unfriendConfirmButton')}
      />

      {showUserListsModal && profile.id && (
        <UserListsModal isOpen={true} onClose={() => setShowUserListsModal(false)} userId={profile.id} username={profile.username} />
      )}

      {showUserReviewsModal && profile.id && (
        <UserReviewsModal userId={profile.id} username={profile.username} onClose={() => setShowUserReviewsModal(false)} />
      )}

      {showCompatibilityModal && profile.id && session?.user?.id && (
        <CompatibilityModal
          isOpen={showCompatibilityModal}
          onClose={() => setShowCompatibilityModal(false)}
          myUserId={session.user.id}
          otherUserId={profile.id}
          otherUsername={profile.username}
        />
      )}

      {showMatchMovieModal && profile.id && session?.user?.id && (
        <MatchMovieModal
          isOpen={showMatchMovieModal}
          onClose={() => setShowMatchMovieModal(false)}
          otherUserId={profile.id}
          otherUsername={profile.username}
        />
      )}

      <AllMoviesModal
        isOpen={countryMoviesModal.isOpen}
        onClose={() => setCountryMoviesModal({ isOpen: false, title: '', movies: [] })}
        title={countryMoviesModal.title}
        movies={countryMoviesModal.movies}
        rating={null}
        isOtherUserProfile={true}
      />
    </div>
  );
}
