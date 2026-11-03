import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trash2, Tv, Trophy, MessageCircle, UserPlus, Heart, Play, Repeat2, LayoutGrid } from 'lucide-react';
import { ChipFace } from './posterJackpot/Chips';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useWhispers } from '../contexts/WhispersContext';
import { Movie, getMovieDetails, getMovieDetailsFromDB } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';
import OptimizedPoster from './OptimizedPoster';
import OracleSheet, { SheetFade } from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';
import { fetchStory, markStoryViewed, storyPoster, storyTitle, type FeedStory } from '../lib/friendsFeed';
import StoryViewer from './feed/StoryViewer';
import JackpotInviteCard from './posterJackpot/JackpotInviteCard';
import PokerInviteActions from './poker/friends/PokerInviteActions';
import { StatusPill, TradeCard } from './posterJackpot/PosterTradesPanel';
import { getMyTrades, respondTrade, tradeErrorCode, type PosterTrade } from '../lib/posterTrades';

interface WhispersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  // Chamado quando um pedido de amizade é aceito daqui — a página que abriu
  // o modal (Profile.tsx) recarrega a contagem de amigos sem reload.
  onFriendAccepted?: () => void;
}

// Cada tipo novo de notificação entra neste union e ganha um bloco no
// render — o resto (filtros, seções, apagar) já funciona para ele.
interface Whisper {
  id: string;
  from_user_id: string | null;
  // story_*: curtidas, comentários e respostas no Feed dos Amigos;
  // whisper_like: alguém curtiu uma indicação sua
  // jackpot_invite: o convite do lançamento do Poster Jackpot (sistema);
  // poster_trade / poster_trade_result: proposta de troca de pôsteres e a
  // resposta a ela (trade_id aponta para poster_trades)
  // poker_invite (03/11/2026, fase 3 do Pôster Poker): convite para uma mesa com amigos;
  // poker_room_id aponta para a sala e message leva o código dela
  type: 'movie' | 'friend_request' | 'new_episode' | 'tag_unlocked' | 'story_like' | 'story_comment' | 'story_reply' | 'whisper_like'
    | 'jackpot_invite' | 'poster_trade' | 'poster_trade_result' | 'poker_invite';
  trade_id?: number | null;
  poker_room_id?: string | null;
  movie_id?: number;
  movie_title?: string;
  movie_poster?: string;
  message?: string;
  read: boolean;
  // indicação recebida: quando a pessoa curtiu (null = não curtiu)
  liked_at?: string | null;
  created_at: string;
  // 'achievement': curtida/comentário num story de conquista (tag ou evento)
  media_type?: 'movie' | 'tv' | 'achievement';
  season_number?: number;
  episode_number?: number;
  episode_name?: string;
  tag_name?: string;
  tag_emoji?: string;
  tag_category?: string;
  from_user: { username: string; avatar_url: string | null } | null;
}

type Filter = 'all' | 'friend_request' | 'movie' | 'new_episode' | 'tag_unlocked' | 'story' | 'jackpot';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'indications.filterAll',
  friend_request: 'indications.filterFriends',
  movie: 'indications.filterRecs',
  new_episode: 'indications.filterEpisodes',
  tag_unlocked: 'indications.filterTags',
  story: 'indications.filterFeed',
  jackpot: 'indications.filterJackpot',
};

const isStoryWhisper = (type: Whisper['type']) => type === 'story_like' || type === 'story_comment' || type === 'story_reply';
// as três notificações do feed dividem um filtro só; a curtida numa
// indicação fica junto das indicações
// 03/11/2026: o convite do Pôster Poker entra no mesmo filtro dos jogos (Jackpot).
const isJackpotWhisper = (type: Whisper['type']) =>
  type === 'jackpot_invite' || type === 'poster_trade' || type === 'poster_trade_result' || type === 'poker_invite';
const filterOf = (type: Whisper['type']): Filter =>
  isStoryWhisper(type) ? 'story' : isJackpotWhisper(type) ? 'jackpot' : type === 'whisper_like' ? 'movie' : (type as Filter);

const STORY_VERB: Record<'story_like' | 'story_comment' | 'story_reply', string> = {
  story_like: 'indications.storyLiked',
  story_comment: 'indications.storyCommented',
  story_reply: 'indications.storyReplied',
};

function relativeTime(iso: string, lang: string): string {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / (7 * 86400)), 'week');
  if (abs < 365 * 86400) return rtf.format(Math.round(diffSec / (30 * 86400)), 'month');
  return rtf.format(Math.round(diffSec / (365 * 86400)), 'year');
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300';
const ghostButton = `inline-flex items-center gap-1.5 px-3.5 rounded-lg text-sm font-medium border border-white/15 hover:border-white/35 hover:bg-white/5 transition disabled:opacity-50 ${focusRing}`;
const primaryButton = `inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition disabled:opacity-50 ${focusRing}`;

export default function WhispersModal({ isOpen, onClose, onFriendAccepted }: WhispersModalProps) {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { refetchUnreadCount } = useWhispers();

  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  // story aberto a partir de uma curtida/comentário
  const [openStory, setOpenStory] = useState<FeedStory | null>(null);
  // As trocas de pôsteres citadas nos sussurros (por id).
  const [trades, setTrades] = useState<Map<number, PosterTrade>>(new Map());

  // Guardados em ref: as funções do contexto/i18n podem mudar de identidade
  // a cada render e não devem disparar uma nova busca.
  const refetchRef = useRef(refetchUnreadCount);
  refetchRef.current = refetchUnreadCount;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setFilter('all');
        setConfirmDeleteId(null);
        const { data, error } = await supabase
          .from('friend_indications')
          .select(`
            *,
            from_user:profiles!from_user_id (
              username,
              avatar_url
            )
          `)
          .eq('to_user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const list: Whisper[] = (data || []).map((row: Whisper) => ({ ...row, from_user: row.from_user || null }));
        const unread = list.filter((w) => !w.read).map((w) => w.id);
        const tradeIds = Array.from(new Set(list.map((w) => w.trade_id).filter((id): id is number => typeof id === 'number')));
        if (tradeIds.length > 0) {
          try {
            const found = await getMyTrades(tradeIds);
            if (!cancelled) setTrades(new Map(found.map((trade) => [trade.id, trade])));
          } catch (tradeError) {
            console.error('Error fetching poster trades:', tradeError);
          }
        }
        setWhispers(list);
        // "Novos" = o que estava sem ler quando o modal abriu; continua
        // destacado durante esta visita mesmo depois de marcado como lido.
        setFreshIds(new Set(unread));

        if (unread.length > 0) {
          await supabase.from('friend_indications').update({ read: true }).in('id', unread);
          refetchRef.current();
        }
      } catch (error) {
        console.error('Error fetching whispers:', error);
        toast.error(tRef.current('indications.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, session?.user?.id]);

  const presentTypes = useMemo(() => Array.from(new Set(whispers.map((w) => filterOf(w.type)))), [whispers]);
  const filters: Filter[] = presentTypes.length > 1 ? ['all', ...presentTypes] : [];
  const visible = filter === 'all' ? whispers : whispers.filter((w) => filterOf(w.type) === filter);
  const fresh = visible.filter((w) => freshIds.has(w.id));
  const earlier = visible.filter((w) => !freshIds.has(w.id));

  const handleDelete = async (whisper: Whisper) => {
    if (!session?.user?.id) return;
    setBusyId(whisper.id);
    try {
      const { error } = await supabase
        .from('friend_indications')
        .delete()
        .match({ id: whisper.id, to_user_id: session.user.id });
      if (error) throw error;
      setWhispers((prev) => prev.filter((w) => w.id !== whisper.id));
      toast.success(t('indications.deleted'));
    } catch (error) {
      console.error('Error deleting whisper:', error);
      toast.error(t('indications.deleteError'));
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  };

  // Recusar não deixa rastro (respond_to_friend_request apaga a linha de
  // friendships); em qualquer resposta o sussurro some, já que foi resolvido.
  const handleRespond = async (whisper: Whisper, accept: boolean) => {
    if (!session?.user?.id || !whisper.from_user_id) return;
    setBusyId(whisper.id);
    try {
      const { data, error } = await supabase.rpc('respond_to_friend_request', {
        p_addressee_id: session.user.id,
        p_requester_id: whisper.from_user_id,
        p_accept: accept,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'respond_failed');

      await supabase.from('friend_indications').delete().match({ id: whisper.id, to_user_id: session.user.id });
      setWhispers((prev) => prev.filter((w) => w.id !== whisper.id));
      refetchUnreadCount();
      if (accept) onFriendAccepted?.();

      toast.success(
        accept
          ? t('indications.friendRequestAccepted', { username: whisper.from_user?.username })
          : t('indications.friendRequestDeclined')
      );
    } catch (error) {
      console.error('Error responding to friend request:', error);
      toast.error(t('indications.respondError'));
    } finally {
      setBusyId(null);
    }
  };

  // Curtir a indicação recebida (30/10/2026). Muda na hora; a primeira
  // curtida avisa quem indicou (toggle_whisper_like).
  const [likingId, setLikingId] = useState<string | null>(null);
  const toggleLike = async (whisper: Whisper) => {
    if (likingId) return;
    const wasLiked = !!whisper.liked_at;
    const setLiked = (liked: boolean) =>
      setWhispers((prev) => prev.map((w) => (w.id === whisper.id ? { ...w, liked_at: liked ? new Date().toISOString() : null } : w)));
    setLikingId(whisper.id);
    setLiked(!wasLiked);
    try {
      const { data, error } = await supabase.rpc('toggle_whisper_like', { p_id: whisper.id });
      if (error) throw error;
      if (typeof data?.liked === 'boolean' && data.liked === wasLiked) setLiked(data.liked);
    } catch (error) {
      console.error('Error liking whisper:', error);
      setLiked(wasLiked);
      toast.error(t('indications.likeError'));
    } finally {
      setLikingId(null);
    }
  };

  const openMovie = async (whisper: Whisper, mediaType?: 'movie' | 'tv') => {
    if (!whisper.movie_id) return;
    setBusyId(whisper.id);
    try {
      const movie = mediaType
        ? await getMovieDetails(whisper.movie_id, mediaType)
        : await getMovieDetailsFromDB(whisper.movie_id);
      setSelectedMovie(movie);
    } catch (error) {
      console.error('Error loading movie:', error);
      toast.error(t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  // O story de uma curtida/comentário é o seu (o dono é você); o de uma
  // resposta é de quem respondeu.
  const viewStory = async (whisper: Whisper) => {
    if (!session?.user?.id || !whisper.movie_id) return;
    const ownerId = whisper.type === 'story_reply' ? whisper.from_user_id : session.user.id;
    if (!ownerId) return;
    setBusyId(whisper.id);
    try {
      const story = await fetchStory(ownerId, whisper.movie_id, whisper.media_type ?? 'movie');
      if (!story) {
        toast(t('feed.unavailable'));
        return;
      }
      setOpenStory(story);
    } catch (error) {
      console.error('Error loading story:', error);
      toast.error(t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  const goTo = (path: string, state?: unknown) => {
    onClose();
    navigate(path, state ? { state } : undefined);
  };

  // Responder a uma proposta de troca direto do sussurro.
  const respondToTrade = async (whisper: Whisper, trade: PosterTrade, accept: boolean) => {
    setBusyId(whisper.id);
    try {
      const status = await respondTrade(trade.id, accept);
      setTrades((prev) => new Map(prev).set(trade.id, { ...trade, status }));
      if (status === 'accepted') toast.success(t('trades.acceptedToast'));
      else if (status === 'declined') toast(t('trades.declinedToast'));
      else toast.error(t('trades.voidToast'));
    } catch (error) {
      console.error('Error responding to trade:', error);
      const code = tradeErrorCode(error);
      toast.error(t(`trades.errors.${code}`, { name: trade.friend.username, defaultValue: t('trades.errors.error') }));
    } finally {
      setBusyId(null);
    }
  };

  const lang = i18n.language;

  const renderAvatar = (whisper: Whisper) => {
    if (whisper.from_user) {
      return whisper.from_user.avatar_url ? (
        <img src={whisper.from_user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-white/15" />
      ) : (
        <span className="w-10 h-10 rounded-full grid place-items-center ring-1 ring-white/15 text-lg" style={{ ...PIXEL, background: VELVET, color: PAPER }}>
          {whisper.from_user.username.charAt(0).toUpperCase()}
        </span>
      );
    }
    if (whisper.type === 'jackpot_invite') {
      return (
        <span className="w-10 h-10 rounded-full grid place-items-center" style={{ background: 'radial-gradient(circle at 50% 35%, #263080, #0b0f36 70%)', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.75)' }}>
          <ChipFace className="w-7 h-7" />
        </span>
      );
    }
    const Icon = whisper.type === 'tag_unlocked' ? Trophy : Tv;
    return (
      <span className="w-10 h-10 rounded-full grid place-items-center ring-1 ring-white/15 text-violet-200" style={{ background: VELVET }}>
        <Icon className="w-[18px] h-[18px]" aria-hidden />
      </span>
    );
  };

  const headline = (whisper: Whisper) => {
    if (whisper.from_user) {
      const verb = isStoryWhisper(whisper.type)
        ? t(STORY_VERB[whisper.type as keyof typeof STORY_VERB])
        : whisper.type === 'friend_request'
          ? t('indications.sentFriendRequest')
          : whisper.type === 'whisper_like'
            ? t('indications.whisperLiked')
            : whisper.type === 'poster_trade'
              ? t('trades.whisperProposed')
              : whisper.type === 'poker_invite'
                ? t('poker.friends.invite.whisper')
              : whisper.type === 'poster_trade_result'
                ? (() => {
                    const status = whisper.trade_id ? trades.get(whisper.trade_id)?.status : undefined;
                    return status === 'declined' ? t('trades.whisperDeclined') : status === 'accepted' ? t('trades.whisperAccepted') : t('trades.whisperAnswered');
                  })()
                : t('indications.recommended');
      return (
        <>
          <span className="font-semibold" style={{ color: PAPER }}>{whisper.from_user.username}</span> {verb}
        </>
      );
    }
    return (
      <span className="font-semibold" style={{ color: PAPER }}>
        {whisper.type === 'jackpot_invite'
          ? t('jackpot.launch.header')
          : whisper.type === 'tag_unlocked'
            ? t('indications.tagUnlockedHeader')
            : t('indications.newEpisodeLabel')}
      </span>
    );
  };

  // Story de conquista: o emoji no lugar da capa. Tag: o nome dela;
  // evento: "Missões de Halloween 2026" (tag_name = evento, movie_title = edição);
  // pôster lendário do Poster Jackpot (tag_category 'jackpot', 02/11/2026):
  // o pôster sorteado na moldura de ouro e "Pôster lendário · título".
  const achievementBlock = (whisper: Whisper, detail: React.ReactNode) => (
    <div className="mt-3 flex items-start gap-3.5">
      {whisper.tag_category === 'jackpot' && whisper.movie_poster ? (
        <span className="relative shrink-0 w-14 aspect-[2/3] rounded-lg overflow-hidden" style={{ background: VELVET, boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.85), 0 0 14px -4px rgba(255,200,61,0.6)' }} aria-hidden>
          <OptimizedPoster src={`https://image.tmdb.org/t/p/w185${whisper.movie_poster}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
        </span>
      ) : (
        <span className="w-14 h-14 shrink-0 rounded-xl grid place-items-center text-3xl ring-1 ring-white/10" style={{ background: VELVET }} aria-hidden>
          {whisper.tag_emoji || '🏅'}
        </span>
      )}
      <span className="min-w-0 pt-0.5">
        <span className="block font-semibold leading-snug" style={{ color: PAPER }}>
          {whisper.tag_category === 'event'
            ? t('feed.achievement.eventEyebrow', { event: t(`feed.event.${whisper.tag_name}`, { defaultValue: whisper.tag_name }), edition: whisper.movie_title })
            : whisper.tag_category === 'jackpot'
              ? `${t('feed.jackpot.label')} · ${whisper.movie_title ?? ''}`
              : whisper.tag_name || whisper.movie_title}
        </span>
        {detail}
      </span>
    </div>
  );

  const posterBlock = (whisper: Whisper, mediaType: 'movie' | 'tv' | 'achievement' | undefined, detail: React.ReactNode) =>
    mediaType === 'achievement' ? achievementBlock(whisper, detail) : (
    <button
      onClick={() => openMovie(whisper, mediaType as 'movie' | 'tv' | undefined)}
      disabled={busyId === whisper.id}
      className={`mt-3 w-full flex justify-start items-start gap-3.5 text-left rounded-xl group ${focusRing}`}
    >
      <span className="relative shrink-0 w-14 aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
        {whisper.movie_poster && (
          <OptimizedPoster
            src={`https://image.tmdb.org/t/p/w185${whisper.movie_poster}`}
            alt={whisper.movie_title || ''}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {busyId === whisper.id && (
          <span className="absolute inset-0 grid place-items-center bg-black/50">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          </span>
        )}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-4" style={{ color: PAPER }}>
          {whisper.movie_title}
        </span>
        {detail}
      </span>
    </button>
  );

  const renderBody = (whisper: Whisper) => {
    switch (whisper.type) {
      case 'movie':
        return posterBlock(
          whisper,
          whisper.media_type,
          whisper.message ? (
            <span className="mt-1.5 text-sm leading-relaxed line-clamp-3" style={{ color: MIST }}>“{whisper.message}”</span>
          ) : null
        );
      case 'new_episode':
        return posterBlock(
          whisper,
          'tv',
          <span className="mt-1 block text-sm" style={{ color: MIST }}>
            <span style={PIXEL} className="text-violet-200">S{whisper.season_number}E{whisper.episode_number}</span>
            {whisper.episode_name ? ` · ${whisper.episode_name}` : ''}
          </span>
        );
      case 'whisper_like':
        return posterBlock(
          whisper,
          whisper.media_type,
          <span className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: MIST }}>
            <Heart className="w-4 h-4 text-rose-400" fill="currentColor" aria-hidden />
            {t('indications.whisperLikedDetail')}
          </span>
        );
      case 'story_like':
        return posterBlock(
          whisper,
          whisper.media_type,
          <span className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: MIST }}>
            <Heart className="w-4 h-4 text-rose-400" fill="currentColor" aria-hidden />
            {t('indications.storyLikedDetail')}
          </span>
        );
      case 'story_comment':
      case 'story_reply':
        return posterBlock(
          whisper,
          whisper.media_type,
          whisper.message ? (
            <span className="mt-1.5 text-sm leading-relaxed line-clamp-3" style={{ color: MIST }}>“{whisper.message}”</span>
          ) : null
        );
      case 'jackpot_invite':
        return <JackpotInviteCard onPlay={() => goTo('/', { openJackpot: 'machine' })} />;
      case 'poster_trade':
      case 'poster_trade_result': {
        const trade = whisper.trade_id ? trades.get(whisper.trade_id) : undefined;
        if (!trade) {
          return (
            <p className="mt-2 text-sm" style={{ color: MIST }}>
              {t('trades.whisperUnavailable')}
            </p>
          );
        }
        return (
          <div className="mt-3">
            <TradeCard
              trade={trade}
              compact
              busy={busyId === whisper.id}
              onRespond={whisper.type === 'poster_trade' ? (tr, accept) => respondToTrade(whisper, tr, accept) : undefined}
            />
          </div>
        );
      }
      case 'tag_unlocked':
        return (
          <div className="mt-3 flex items-center gap-3.5">
            <span className="w-14 h-14 shrink-0 rounded-xl grid place-items-center text-3xl ring-1 ring-white/10" style={{ background: VELVET }} aria-hidden>
              {whisper.tag_emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-snug" style={{ color: PAPER }}>{whisper.tag_name}</span>
              <span className="block mt-0.5 text-sm" style={{ color: MIST }}>{t('indications.tagUnlockedLabel')}</span>
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  const renderActions = (whisper: Whisper) => {
    const busy = busyId === whisper.id;

    if (confirmDeleteId === whisper.id) {
      return (
        <>
          <span className="text-sm mr-1" style={{ color: PAPER }}>{t('indications.deleteAsk')}</span>
          <button onClick={() => handleDelete(whisper)} disabled={busy} className={`${ghostButton} text-rose-200 border-rose-300/30 hover:border-rose-300/60`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" aria-hidden />}
            {t('common.delete')}
          </button>
          <button onClick={() => setConfirmDeleteId(null)} className={ghostButton} style={{ color: PAPER }}>
            {t('common.cancel')}
          </button>
        </>
      );
    }

    if (whisper.type === 'friend_request') {
      return (
        <>
          <button onClick={() => handleRespond(whisper, true)} disabled={busy} className={primaryButton}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" aria-hidden />}
            {t('indications.acceptRequest')}
          </button>
          <button onClick={() => handleRespond(whisper, false)} disabled={busy} className={ghostButton} style={{ color: PAPER }}>
            {t('indications.declineRequest')}
          </button>
          <button onClick={() => goTo(`/profile/${whisper.from_user?.username}`)} className={`${ghostButton} border-transparent`} style={{ color: MIST }}>
            {t('indications.viewProfile')}
          </button>
        </>
      );
    }

    if (isStoryWhisper(whisper.type)) {
      return (
        <>
          <button onClick={() => viewStory(whisper)} disabled={busy} className={primaryButton}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" fill="currentColor" aria-hidden />}
            {t('indications.viewStory')}
          </button>
          {whisper.media_type !== 'achievement' && (
            <button onClick={() => openMovie(whisper, whisper.media_type as 'movie' | 'tv' | undefined)} disabled={busy} className={ghostButton} style={{ color: PAPER }}>
              {t('indications.viewMovie')}
            </button>
          )}
        </>
      );
    }

    if (whisper.type === 'jackpot_invite') return null;

    // Convite para a mesa com amigos: aposta da sala e Entrar/Recusar ali mesmo (03/11/2026).
    if (whisper.type === 'poker_invite') {
      return <PokerInviteActions roomId={whisper.poker_room_id} code={whisper.message} onOpen={onClose} />;
    }

    if (whisper.type === 'poster_trade' || whisper.type === 'poster_trade_result') {
      const trade = whisper.trade_id ? trades.get(whisper.trade_id) : undefined;
      const accepted = trade?.status === 'accepted';
      return (
        <>
          {trade && trade.status !== 'pending' && <StatusPill status={trade.status} />}
          <button
            onClick={() => goTo('/', { openJackpot: accepted ? 'collection' : 'trades' })}
            className={ghostButton}
            style={{ color: PAPER }}
          >
            {accepted ? <LayoutGrid className="w-4 h-4 text-amber-200" aria-hidden /> : <Repeat2 className="w-4 h-4 text-amber-200" aria-hidden />}
            {accepted ? t('trades.viewCollection') : t('trades.viewTrades')}
          </button>
        </>
      );
    }

    if (whisper.type === 'tag_unlocked') {
      return (
        <button onClick={() => goTo('/profile')} className={ghostButton} style={{ color: PAPER }}>
          <Trophy className="w-4 h-4 text-amber-300" aria-hidden />
          {t('indications.viewTags')}
        </button>
      );
    }

    const viewButton = (
      <button onClick={() => openMovie(whisper, whisper.type === 'new_episode' ? 'tv' : (whisper.media_type as 'movie' | 'tv' | undefined))} disabled={busy} className={ghostButton} style={{ color: PAPER }}>
        {whisper.type === 'new_episode' ? t('indications.viewEpisode') : t('indications.viewMovie')}
      </button>
    );

    // Indicação de um amigo: dá para curtir.
    if (whisper.type === 'movie' && whisper.from_user) {
      const liked = !!whisper.liked_at;
      const username = whisper.from_user.username;
      return (
        <>
          {viewButton}
          <button
            onClick={() => toggleLike(whisper)}
            disabled={likingId === whisper.id}
            aria-pressed={liked}
            aria-label={liked ? t('indications.unlikeAria', { username }) : t('indications.likeAria', { username })}
            className={`${ghostButton} ${liked ? 'border-rose-300/50 hover:border-rose-300/70 bg-rose-500/10' : ''}`}
            style={{ color: liked ? '#FDA4AF' : PAPER }}
          >
            <Heart className={`w-4 h-4 transition-transform ${liked ? 'scale-110' : ''}`} fill={liked ? 'currentColor' : 'none'} aria-hidden />
            {liked ? t('indications.liked') : t('indications.like')}
          </button>
        </>
      );
    }

    return viewButton;
  };

  const renderItem = (whisper: Whisper) => (
    <li key={whisper.id} className="relative flex gap-4 py-5 border-b border-white/[0.06] last:border-b-0">
      {freshIds.has(whisper.id) && (
        <span className="absolute -left-3 sm:-left-4 top-[2.1rem] w-1.5 h-1.5 rounded-full bg-fuchsia-400" aria-hidden />
      )}
      <div className="shrink-0">{renderAvatar(whisper)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-relaxed pt-2" style={{ color: MIST }}>
            {headline(whisper)}
            <span aria-hidden> · </span>
            <time dateTime={whisper.created_at} title={new Date(whisper.created_at).toLocaleString(lang)}>
              {relativeTime(whisper.created_at, lang)}
            </time>
          </p>
          {whisper.type !== 'friend_request' && confirmDeleteId !== whisper.id && (
            <button
              onClick={() => setConfirmDeleteId(whisper.id)}
              aria-label={t('common.delete')}
              title={t('common.delete')}
              className={`shrink-0 -mr-2 -mt-1 rounded-full hover:bg-white/10 transition ${focusRing}`}
              style={{ color: MIST }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {renderBody(whisper)}
        {(() => {
          const actions = renderActions(whisper);
          return actions ? <div className="mt-3.5 flex flex-wrap items-center gap-2">{actions}</div> : null;
        })()}
      </div>
    </li>
  );

  const freshCount = freshIds.size;

  return (
    <>
      <OracleSheet
        open={isOpen}
        onClose={onClose}
        title={t('profile.whispers')}
        subtitle={!loading ? (freshCount > 0 ? t('indications.subtitleNew', { count: freshCount }) : t('indications.subtitleNone')) : undefined}
        size="lg"
        escapeEnabled={!selectedMovie && !openStory}
        contentKey={filter}
      >
        {loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="w-7 h-7 animate-spin text-fuchsia-400" />
          </div>
        ) : whispers.length === 0 ? (
          <div className="py-12 text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl grid place-items-center ring-1 ring-white/10 text-violet-200" style={{ background: VELVET }}>
              <MessageCircle className="w-6 h-6" aria-hidden />
            </span>
            <p style={{ ...PIXEL, color: PAPER }} className="mt-5 text-2xl">{t('indications.empty')}</p>
            <p className="mt-2 text-sm leading-relaxed max-w-sm mx-auto" style={{ color: MIST }}>{t('indications.emptyHint')}</p>
          </div>
        ) : (
          <>
            {filters.length > 0 && (
              <div className="-mx-5 sm:mx-0 px-5 sm:px-0 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {filters.map((key) => {
                  const active = filter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      aria-pressed={active}
                      className={`shrink-0 px-3.5 rounded-full text-sm font-medium border transition ${focusRing} ${
                        active ? 'border-violet-300/60 bg-violet-500/20' : 'border-white/15 hover:border-white/30'
                      }`}
                      style={{ color: active ? PAPER : MIST }}
                    >
                      {t(FILTER_LABEL[key])}
                    </button>
                  );
                })}
              </div>
            )}

            <SheetFade id={filter}>
              {fresh.length > 0 && (
                <section className="mt-4">
                  <h3 className="text-sm font-semibold" style={{ color: PAPER }}>{t('indications.sectionNew')}</h3>
                  <ul>{fresh.map(renderItem)}</ul>
                </section>
              )}
              {earlier.length > 0 && (
                <section className={fresh.length > 0 ? 'mt-6' : 'mt-2'}>
                  {fresh.length > 0 && (
                    <h3 className="text-sm font-semibold" style={{ color: PAPER }}>{t('indications.sectionEarlier')}</h3>
                  )}
                  <ul>{earlier.map(renderItem)}</ul>
                </section>
              )}
            </SheetFade>
          </>
        )}
      </OracleSheet>

      {selectedMovie && (
        <MovieDetailsModal movie={selectedMovie} isOpen onClose={() => setSelectedMovie(null)} />
      )}

      {openStory && session?.user?.id && (
        <StoryViewer
          groups={[{ owner: openStory.owner, stories: [openStory], seen: openStory.seen, latestAt: openStory.activity_at }]}
          start={{ group: 0, story: 0 }}
          viewerId={session.user.id}
          onClose={() => setOpenStory(null)}
          onNavigate={(path, state) => {
            setOpenStory(null);
            goTo(path, state);
          }}
          onSeen={markStoryViewed}
          onOpenMovie={(story) => {
            setOpenStory(null);
            if (story.media_type === 'achievement') return;
            getMovieDetails(story.movie_id, story.media_type)
              .then(setSelectedMovie)
              .catch(() => setSelectedMovie({ id: story.movie_id, title: storyTitle(story, lang), poster_path: storyPoster(story, lang) ?? '', media_type: story.media_type } as Movie));
          }}
        />
      )}
    </>
  );
}