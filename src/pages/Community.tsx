import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, User, Users, Loader2, Crown, UserPlus, UserCheck, Clock, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDebounce } from 'use-debounce';
import toast from 'react-hot-toast';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from '../components/GhostRiderFrame';
import { getBannerClass, getBannerTone } from '../lib/banners';
import { getTextEffectNameClass, getTextEffectSecondaryClass } from '../lib/textEffects';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { cache } from '../lib/cache';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, tagCategoryStyle } from '../lib/oracleTheme';
import { useTagDecorations } from '../contexts/SeasonalEventContext';
import { AvatarSeasonalAccessory, CardSeasonalScene, SeasonalCountdownMini } from '../components/seasonal/SeasonalDecor';

// Comunidade — "a praça".
//   1. Cabeçalho: título e busca de membros.
//   2. Membros: cartões com banner, moldura, efeito de texto e tag de cada
//      pessoa, e o botão de amizade; paginados de 12 em 12.
// O que os amigos guardaram/avaliaram agora vive no Feed dos Amigos, na home.

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

type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

const USERS_PER_PAGE = 12;

export default function Community() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([]);
  // Mini perfis decorados de Halloween/Natal (dono usando 🎃 Headless
  // Horseman ou 🎅 Ho Ho Ho), conferidos numa consulta só.
  const cardDecorations = useTagDecorations(filteredProfiles);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [friendshipStatuses, setFriendshipStatuses] = useState<Record<string, FriendshipStatus>>({});
  const [togglingFriendId, setTogglingFriendId] = useState<string | null>(null);

  const membersRef = useRef<HTMLElement>(null);
  const firstPageLoad = useRef(true);

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
    const handleLanguageChange = () => {
      cache.invalidatePattern('movie:');
      fetchProfiles();
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

  const isSearching = debouncedQuery.trim().length > 0;

  // ---- Peças ----

  // Todos os estados com 44px de altura (o mínimo de toque dos botões), pra
  // o nome começar na mesma altura em todos os cartões.
  const friendButton = (profile: Profile) => {
    if (profile.id === session?.user?.id) {
      return (
        <span className="shrink-0 inline-flex items-center h-11 px-3.5 rounded-full text-sm font-medium bg-white/[0.06] ring-1 ring-white/10" style={{ color: MIST }}>
          {t('community.you')}
        </span>
      );
    }
    const status = friendshipStatuses[profile.id] || 'none';
    const busy = togglingFriendId === profile.id;
    const base = `relative z-10 shrink-0 gap-1.5 h-11 px-3.5 rounded-full text-sm font-semibold transition disabled:cursor-wait ${FOCUS_RING}`;

    if (status === 'friends') {
      return (
        <span className="relative z-10 shrink-0 inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full text-sm font-semibold bg-emerald-600 text-white shadow-lg shadow-emerald-900/30">
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
    const isMe = profile.id === session?.user?.id;
    // A parte de informações veste o tom do banner da pessoa (a cor do
    // contorno dele, escurecida até o limite que mantém o texto legível).
    const surface = getBannerTone(profile.banner, premium)?.surface ?? VELVET;
    const decoration = cardDecorations[profile.id] ?? null;

    return (
      <li key={profile.id} className="relative h-full flex flex-col rounded-2xl ring-1 ring-white/10 hover:ring-white/25 overflow-hidden transition" style={{ background: surface }}>
        {/* Faixa do banner da pessoa. Arredondada em cima como o cartão, pra
            o contorno do banner acompanhar a curva (antes sumia nos cantos). */}
        <div
          className={`relative h-20 rounded-t-2xl ${bannerClass}`}
          style={bannerClass ? undefined : { background: `radial-gradient(ellipse 80% 120% at 100% 0%, rgba(139,92,246,0.35), transparent 70%), ${NIGHT}` }}
          aria-hidden
        >
          {decoration && <CardSeasonalScene eventId={decoration} />}
        </div>
        {/* Contagem para o próximo 31/10 ou 25/12, no canto da faixa. */}
        {decoration && <SeasonalCountdownMini eventId={decoration} className="absolute right-3 z-[2]" style={{ top: 46 }} />}
        <div className="flex-1 flex flex-col px-5 pb-4" style={{ color: MIST }}>
          {/* O avatar sobe metade sobre o banner; o botão fica inteiro na
              parte de informações (mt-11 = 36px do avatar acima da linha do
              banner + 8px de folga). */}
          <div className="-mt-9 flex items-start justify-between gap-3">
            {/* Sem anel em volta: a moldura da pessoa já é o contorno do
                avatar (um anel na cor da info virava uma segunda borda). */}
            <span className="relative shrink-0 rounded-full">
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
              {decoration && <AvatarSeasonalAccessory eventId={decoration} size={72} />}
            </span>
            {session?.user?.id && <div className="mt-11">{friendButton(profile)}</div>}
          </div>

          {/* Com o botão, a linha do avatar já termina 12px abaixo dele. */}
          <div className={`${session?.user?.id ? 'mt-0' : 'mt-3'} flex items-center gap-2 min-w-0`} style={{ color: PAPER }}>
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
            {/* "amigos em comum" não faz sentido no seu próprio cartão */}
            {!isMe && !!profile.mutual_friends_count && profile.mutual_friends_count > 0 && (
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

    </div>
  );
}
